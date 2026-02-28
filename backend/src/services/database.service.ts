import Database from 'better-sqlite3';
import path from 'path';

export interface StoredMarket {
  id: string;
  question: string;
  data_source: string;
  expiry: string;
  ai_probability: number;
  confidence: string;
  reasoning: string;
  suggested_action: string;
  status: 'active' | 'closed' | 'resolved';
  result?: 'yes' | 'no' | null;
  created_at: string;
  closed_at?: string;
  tweet_id?: string;
  tweet_author?: string;
  tweet_content?: string;
  category: string;
  volume: number;
  ticker?: string | null;
  asset_type?: 'stock' | 'crypto' | null;
}

export interface MarketFilter {
  status?: 'active' | 'closed' | 'resolved';
  category?: string;
  tweet_author?: string;
  search?: string;
}

export class DatabaseService {
  private db: Database.Database;

  constructor(dbPath?: string) {
    const finalPath = dbPath || path.join(process.cwd(), 'markets.db');
    this.db = new Database(finalPath);
    this.initializeSchema();
  }

  private initializeSchema(): void {
    // Create markets table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS markets (
        id TEXT PRIMARY KEY,
        question TEXT NOT NULL,
        data_source TEXT NOT NULL,
        expiry TEXT NOT NULL,
        ai_probability REAL NOT NULL,
        confidence TEXT NOT NULL,
        reasoning TEXT,
        suggested_action TEXT,
        status TEXT NOT NULL DEFAULT 'active',
        result TEXT,
        created_at TEXT NOT NULL,
        closed_at TEXT,
        tweet_id TEXT,
        tweet_author TEXT,
        tweet_content TEXT,
        category TEXT NOT NULL,
        volume INTEGER NOT NULL,
        ticker TEXT,
        asset_type TEXT
      )
    `);

    // Migrate existing table if needed
    try {
      this.db.prepare('SELECT ticker FROM markets LIMIT 1').get();
    } catch (err) {
      console.log('[DatabaseService] Migrating markets table: adding ticker and asset_type columns');
      try {
        this.db.exec(`
          ALTER TABLE markets ADD COLUMN ticker TEXT;
          ALTER TABLE markets ADD COLUMN asset_type TEXT;
        `);
      } catch (migErr) {
        // Columns might already exist
        console.log('[DatabaseService] Columns may already exist, skipping ALTER');
      }
    }

    // Create indexes for common queries
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_markets_status ON markets(status);
      CREATE INDEX IF NOT EXISTS idx_markets_expiry ON markets(expiry);
      CREATE INDEX IF NOT EXISTS idx_markets_tweet_author ON markets(tweet_author);
      CREATE INDEX IF NOT EXISTS idx_markets_category ON markets(category);
      CREATE INDEX IF NOT EXISTS idx_markets_created_at ON markets(created_at);
      CREATE INDEX IF NOT EXISTS idx_markets_ticker ON markets(ticker);
    `);

    // Create full-text search virtual table for questions
    this.db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS markets_fts USING fts5(
        id UNINDEXED,
        question,
        tweet_content,
        category
      );
    `);

    console.log('[DatabaseService] Schema initialized');
  }

  /**
   * Save a new market to the database
   */
  saveMarket(market: StoredMarket): void {
    const stmt = this.db.prepare(`
      INSERT INTO markets (
        id, question, data_source, expiry, ai_probability, confidence,
        reasoning, suggested_action, status, result, created_at, closed_at,
        tweet_id, tweet_author, tweet_content, category, volume, ticker, asset_type
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      market.id,
      market.question,
      market.data_source,
      market.expiry,
      market.ai_probability,
      market.confidence,
      market.reasoning,
      market.suggested_action,
      market.status,
      market.result || null,
      market.created_at,
      market.closed_at || null,
      market.tweet_id || null,
      market.tweet_author || null,
      market.tweet_content || null,
      market.category,
      market.volume,
      market.ticker || null,
      market.asset_type || null
    );

    // Add to FTS index
    const ftsStmt = this.db.prepare(`
      INSERT INTO markets_fts (id, question, tweet_content, category)
      VALUES (?, ?, ?, ?)
    `);
    ftsStmt.run(
      market.id,
      market.question,
      market.tweet_content || '',
      market.category
    );

    console.log(`[DatabaseService] Saved market: ${market.id} - "${market.question}"`);
  }

  /**
   * Get a market by ID
   */
  getMarketById(id: string): StoredMarket | null {
    const stmt = this.db.prepare('SELECT * FROM markets WHERE id = ?');
    const row = stmt.get(id) as any;
    return row ? this.mapRowToMarket(row) : null;
  }

  /**
   * Get all markets with optional filtering
   */
  getMarkets(filter?: MarketFilter, limit: number = 100): StoredMarket[] {
    let query = 'SELECT * FROM markets WHERE 1=1';
    const params: any[] = [];

    if (filter?.status) {
      query += ' AND status = ?';
      params.push(filter.status);
    }

    if (filter?.category) {
      query += ' AND category = ?';
      params.push(filter.category);
    }

    if (filter?.tweet_author) {
      query += ' AND tweet_author = ?';
      params.push(filter.tweet_author);
    }

    if (filter?.search) {
      // Use FTS for text search
      query = `
        SELECT m.* FROM markets m
        INNER JOIN markets_fts fts ON m.id = fts.id
        WHERE markets_fts MATCH ?
      `;
      params.length = 0; // Clear other params
      params.push(filter.search);
    }

    query += ' ORDER BY created_at DESC LIMIT ?';
    params.push(limit);

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...params) as any[];
    return rows.map(row => this.mapRowToMarket(row));
  }

  /**
   * Get active markets (not expired and not resolved)
   */
  getActiveMarkets(): StoredMarket[] {
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      SELECT * FROM markets 
      WHERE status = 'active' AND expiry > ?
      ORDER BY created_at DESC
    `);
    const rows = stmt.all(now) as any[];
    return rows.map(row => this.mapRowToMarket(row));
  }

  /**
   * Get expired markets that need to be closed
   */
  getExpiredMarkets(): StoredMarket[] {
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      SELECT * FROM markets 
      WHERE status = 'active' AND expiry <= ?
      ORDER BY expiry ASC
    `);
    const rows = stmt.all(now) as any[];
    return rows.map(row => this.mapRowToMarket(row));
  }

  /**
   * Update market status
   */
  updateMarketStatus(
    id: string, 
    status: 'active' | 'closed' | 'resolved', 
    result?: 'yes' | 'no'
  ): void {
    const updates: string[] = ['status = ?'];
    const params: any[] = [status];

    if (status === 'closed' || status === 'resolved') {
      updates.push('closed_at = ?');
      params.push(new Date().toISOString());
    }

    if (result) {
      updates.push('result = ?');
      params.push(result);
    }

    params.push(id);

    const stmt = this.db.prepare(`
      UPDATE markets SET ${updates.join(', ')} WHERE id = ?
    `);
    stmt.run(...params);

    console.log(`[DatabaseService] Updated market ${id} status to ${status}`);
  }

  /**
   * Search markets by text (uses FTS)
   */
  searchMarkets(searchTerm: string, limit: number = 50): StoredMarket[] {
    const stmt = this.db.prepare(`
      SELECT m.* FROM markets m
      INNER JOIN markets_fts fts ON m.id = fts.id
      WHERE markets_fts MATCH ?
      ORDER BY m.created_at DESC
      LIMIT ?
    `);
    const rows = stmt.all(searchTerm, limit) as any[];
    return rows.map(row => this.mapRowToMarket(row));
  }

  /**
   * Get market statistics
   */
  getStats(): {
    total: number;
    active: number;
    closed: number;
    resolved: number;
    byCategory: Record<string, number>;
  } {
    const total = this.db.prepare('SELECT COUNT(*) as count FROM markets').get() as any;
    const active = this.db.prepare("SELECT COUNT(*) as count FROM markets WHERE status = 'active'").get() as any;
    const closed = this.db.prepare("SELECT COUNT(*) as count FROM markets WHERE status = 'closed'").get() as any;
    const resolved = this.db.prepare("SELECT COUNT(*) as count FROM markets WHERE status = 'resolved'").get() as any;
    
    const categoryStats = this.db.prepare(`
      SELECT category, COUNT(*) as count 
      FROM markets 
      GROUP BY category
    `).all() as any[];

    const byCategory: Record<string, number> = {};
    categoryStats.forEach(row => {
      byCategory[row.category] = row.count;
    });

    return {
      total: total.count,
      active: active.count,
      closed: closed.count,
      resolved: resolved.count,
      byCategory
    };
  }

  /**
   * Check if a market exists for a specific tweet
   */
  marketExistsForTweet(tweetId: string): boolean {
    const stmt = this.db.prepare('SELECT id FROM markets WHERE tweet_id = ? LIMIT 1');
    const row = stmt.get(tweetId);
    return !!row;
  }

  /**
   * Auto-close expired markets
   */
  autoCloseExpiredMarkets(): number {
    const expired = this.getExpiredMarkets();
    expired.forEach(market => {
      this.updateMarketStatus(market.id, 'closed');
    });
    return expired.length;
  }

  /**
   * Helper to map database row to StoredMarket object
   */
  private mapRowToMarket(row: any): StoredMarket {
    return {
      id: row.id,
      question: row.question,
      data_source: row.data_source,
      expiry: row.expiry,
      ai_probability: row.ai_probability,
      confidence: row.confidence,
      reasoning: row.reasoning,
      suggested_action: row.suggested_action,
      status: row.status,
      result: row.result,
      created_at: row.created_at,
      closed_at: row.closed_at,
      tweet_id: row.tweet_id,
      tweet_author: row.tweet_author,
      tweet_content: row.tweet_content,
      category: row.category,
      volume: row.volume
    };
  }

  /**
   * Close database connection
   */
  close(): void {
    this.db.close();
  }
}

// Singleton instance
let dbInstance: DatabaseService | null = null;

export function getDatabase(): DatabaseService {
  if (!dbInstance) {
    dbInstance = new DatabaseService();
  }
  return dbInstance;
}
