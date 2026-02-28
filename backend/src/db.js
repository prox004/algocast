/**
 * db.js — SQLite database for CastAlgo
 *
 * Schema is defined in context.md §Database Schema
 * Persists user wallets, markets, trades, and claims
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Ensure data directory exists
const DATA_DIR = path.join(__dirname, '../../data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'castalgo.db');
const sqlite = new Database(DB_PATH);

// Enable foreign keys and WAL mode for better concurrency
sqlite.pragma('foreign_keys = ON');
sqlite.pragma('journal_mode = WAL');

console.log(`[SQLite] Database initialized at: ${DB_PATH}`);

// ── Schema Creation ─────────────────────────────────────────────────────────

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    hashed_password TEXT,
    custodial_address TEXT UNIQUE NOT NULL,
    encrypted_private_key TEXT NOT NULL,
    balance INTEGER DEFAULT 0,
    oauth_provider TEXT,
    oauth_id TEXT,
    created_at INTEGER NOT NULL,
    UNIQUE(oauth_provider, oauth_id)
  );

  CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
  CREATE INDEX IF NOT EXISTS idx_users_oauth ON users(oauth_provider, oauth_id);

  CREATE TABLE IF NOT EXISTS markets (
    id TEXT PRIMARY KEY,
    question TEXT NOT NULL,
    expiry INTEGER NOT NULL,
    data_source TEXT,
    ai_probability REAL,
    market_probability REAL,
    yes_reserve INTEGER DEFAULT 0,
    no_reserve INTEGER DEFAULT 0,
    yes_asa_id INTEGER,
    no_asa_id INTEGER,
    app_id INTEGER,
    app_address TEXT,
    outcome INTEGER,
    status TEXT DEFAULT 'active',
    created_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_markets_status ON markets(status);
  CREATE INDEX IF NOT EXISTS idx_markets_expiry ON markets(expiry);

  CREATE TABLE IF NOT EXISTS trades (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    market_id TEXT NOT NULL,
    side TEXT NOT NULL,
    amount INTEGER NOT NULL,
    tokens REAL NOT NULL,
    timestamp INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (market_id) REFERENCES markets(id)
  );

  CREATE INDEX IF NOT EXISTS idx_trades_user ON trades(user_id);
  CREATE INDEX IF NOT EXISTS idx_trades_market ON trades(market_id);
  CREATE INDEX IF NOT EXISTS idx_trades_user_market ON trades(user_id, market_id);

  CREATE TABLE IF NOT EXISTS claims (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    market_id TEXT NOT NULL,
    payout INTEGER NOT NULL,
    timestamp INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (market_id) REFERENCES markets(id),
    UNIQUE(user_id, market_id)
  );

  CREATE INDEX IF NOT EXISTS idx_claims_user ON claims(user_id);
  CREATE INDEX IF NOT EXISTS idx_claims_market ON claims(market_id);
`);

// ── Database Migrations ─────────────────────────────────────────────────────

// Add tweet-related columns if they don't exist
try {
  sqlite.prepare('SELECT tweet_id FROM markets LIMIT 1').get();
} catch (err) {
  console.log('[SQLite] Migrating markets table: adding tweet_id column');
  try {
    sqlite.exec('ALTER TABLE markets ADD COLUMN tweet_id TEXT;');
  } catch (migErr) {
    // Column might already exist
  }
}

try {
  sqlite.prepare('SELECT tweet_author FROM markets LIMIT 1').get();
} catch (err) {
  console.log('[SQLite] Migrating markets table: adding tweet_author column');
  try {
    sqlite.exec('ALTER TABLE markets ADD COLUMN tweet_author TEXT;');
  } catch (migErr) {
    // Column might already exist
  }
}

try {
  sqlite.prepare('SELECT tweet_content FROM markets LIMIT 1').get();
} catch (err) {
  console.log('[SQLite] Migrating markets table: adding tweet_content column');
  try {
    sqlite.exec('ALTER TABLE markets ADD COLUMN tweet_content TEXT;');
  } catch (migErr) {
    // Column might already exist
  }
}

try {
  sqlite.prepare('SELECT ticker FROM markets LIMIT 1').get();
} catch (err) {
  console.log('[SQLite] Migrating markets table: adding ticker column');
  try {
    sqlite.exec('ALTER TABLE markets ADD COLUMN ticker TEXT;');
  } catch (migErr) {
    // Column might already exist
  }
}

try {
  sqlite.prepare('SELECT asset_type FROM markets LIMIT 1').get();
} catch (err) {
  console.log('[SQLite] Migrating markets table: adding asset_type column');
  try {
    sqlite.exec('ALTER TABLE markets ADD COLUMN asset_type TEXT;');
  } catch (migErr) {
    // Column might already exist
  }
}

// Add columns needed by DatabaseService (so both systems share one table)
try {
  sqlite.prepare('SELECT confidence FROM markets LIMIT 1').get();
} catch (err) {
  console.log('[SQLite] Migrating markets table: adding confidence column');
  try { sqlite.exec('ALTER TABLE markets ADD COLUMN confidence TEXT;'); } catch (e) {}
}

try {
  sqlite.prepare('SELECT reasoning FROM markets LIMIT 1').get();
} catch (err) {
  console.log('[SQLite] Migrating markets table: adding reasoning column');
  try { sqlite.exec('ALTER TABLE markets ADD COLUMN reasoning TEXT;'); } catch (e) {}
}

try {
  sqlite.prepare('SELECT suggested_action FROM markets LIMIT 1').get();
} catch (err) {
  console.log('[SQLite] Migrating markets table: adding suggested_action column');
  try { sqlite.exec('ALTER TABLE markets ADD COLUMN suggested_action TEXT;'); } catch (e) {}
}

try {
  sqlite.prepare('SELECT result FROM markets LIMIT 1').get();
} catch (err) {
  console.log('[SQLite] Migrating markets table: adding result column');
  try { sqlite.exec('ALTER TABLE markets ADD COLUMN result TEXT;'); } catch (e) {}
}

try {
  sqlite.prepare('SELECT closed_at FROM markets LIMIT 1').get();
} catch (err) {
  console.log('[SQLite] Migrating markets table: adding closed_at column');
  try { sqlite.exec('ALTER TABLE markets ADD COLUMN closed_at TEXT;'); } catch (e) {}
}

try {
  sqlite.prepare('SELECT category FROM markets LIMIT 1').get();
} catch (err) {
  console.log('[SQLite] Migrating markets table: adding category column');
  try { sqlite.exec('ALTER TABLE markets ADD COLUMN category TEXT;'); } catch (e) {}
}

try {
  sqlite.prepare('SELECT volume FROM markets LIMIT 1').get();
} catch (err) {
  console.log('[SQLite] Migrating markets table: adding volume column');
  try { sqlite.exec('ALTER TABLE markets ADD COLUMN volume INTEGER DEFAULT 0;'); } catch (e) {}
}

// ── Prepared Statements ─────────────────────────────────────────────────────

const statements = {
  // Users
  insertUser: sqlite.prepare(`
    INSERT INTO users (id, email, hashed_password, custodial_address, encrypted_private_key, balance, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `),
  getUserById: sqlite.prepare('SELECT * FROM users WHERE id = ?'),
  getUserByEmail: sqlite.prepare('SELECT * FROM users WHERE email = ?'),
  updateUser: sqlite.prepare(`
    UPDATE users SET balance = ?, hashed_password = ? WHERE id = ?
  `),
  updateUserOAuth: sqlite.prepare(`
    UPDATE users SET oauth_provider = ?, oauth_id = ? WHERE id = ?
  `),
  getUserByOAuth: sqlite.prepare('SELECT * FROM users WHERE oauth_provider = ? AND oauth_id = ?'),

  // Markets
  insertMarket: sqlite.prepare(`
    INSERT INTO markets (id, question, expiry, data_source, ai_probability, market_probability, 
                         yes_reserve, no_reserve, yes_asa_id, no_asa_id, app_id, app_address, 
                         outcome, status, created_at, tweet_id, tweet_author, tweet_content, ticker, asset_type)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `),
  getMarketById: sqlite.prepare('SELECT * FROM markets WHERE id = ?'),
  getAllMarkets: sqlite.prepare('SELECT * FROM markets ORDER BY created_at DESC'),
  updateMarket: sqlite.prepare(`
    UPDATE markets SET 
      yes_reserve = ?, no_reserve = ?, market_probability = ?, 
      outcome = ?, status = ?, yes_asa_id = ?, no_asa_id = ?, 
      app_id = ?, app_address = ?
    WHERE id = ?
  `),

  // Trades
  insertTrade: sqlite.prepare(`
    INSERT INTO trades (id, user_id, market_id, side, amount, tokens, timestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `),
  getTradesByUser: sqlite.prepare('SELECT * FROM trades WHERE user_id = ? ORDER BY timestamp DESC'),
  getTradesByMarket: sqlite.prepare('SELECT * FROM trades WHERE market_id = ? ORDER BY timestamp DESC'),
  getUserTradesForMarket: sqlite.prepare('SELECT * FROM trades WHERE user_id = ? AND market_id = ?'),

  // Claims
  insertClaim: sqlite.prepare(`
    INSERT INTO claims (id, user_id, market_id, payout, timestamp)
    VALUES (?, ?, ?, ?, ?)
  `),
  findClaim: sqlite.prepare('SELECT * FROM claims WHERE user_id = ? AND market_id = ?'),
};

// ── Database Interface ──────────────────────────────────────────────────────

const db = {
  // ── Users ──────────────────────────────────────────────────────────────────

  createUser(user) {
    try {
      statements.insertUser.run(
        user.id,
        user.email.toLowerCase(),
        user.hashed_password || null,
        user.custodial_address,
        user.encrypted_private_key,
        user.balance || 0,
        Date.now()
      );
      return user;
    } catch (err) {
      console.error('[db.createUser]', err.message);
      throw err;
    }
  },

  getUserById(id) {
    return statements.getUserById.get(id) || null;
  },

  getUserByEmail(email) {
    return statements.getUserByEmail.get(email.toLowerCase()) || null;
  },

  updateUser(id, updates) {
    const user = this.getUserById(id);
    if (!user) return null;
    
    // Update balance and/or password
    const newBalance = updates.balance !== undefined ? updates.balance : user.balance;
    const newPassword = updates.hashed_password !== undefined ? updates.hashed_password : user.hashed_password;
    
    statements.updateUser.run(newBalance, newPassword, id);
    return this.getUserById(id);
  },

  updateUserOAuth(id, provider, oauthId) {
    statements.updateUserOAuth.run(provider, oauthId, id);
    return this.getUserById(id);
  },

  getUserByOAuth(provider, oauthId) {
    return statements.getUserByOAuth.get(provider, oauthId) || null;
  },

  // ── Markets ────────────────────────────────────────────────────────────────

  createMarket(market) {
    try {
      statements.insertMarket.run(
        market.id,
        market.question,
        market.expiry,
        market.data_source || null,
        market.ai_probability || null,
        market.market_probability || 0.5,
        market.yes_reserve || 0,
        market.no_reserve || 0,
        market.yes_asa_id || null,
        market.no_asa_id || null,
        market.app_id || null,
        market.app_address || null,
        market.outcome || null,
        market.status || 'active',
        Date.now(),
        market.tweet_id || null,
        market.tweet_author || null,
        market.tweet_content || null,
        market.ticker || null,
        market.asset_type || null
      );
      return market;
    } catch (err) {
      console.error('[db.createMarket]', err.message);
      throw err;
    }
  },

  getMarketById(id) {
    return statements.getMarketById.get(id) || null;
  },

  getAllMarkets() {
    return statements.getAllMarkets.all();
  },

  updateMarket(id, updates) {
    const market = this.getMarketById(id);
    if (!market) return null;

    statements.updateMarket.run(
      updates.yes_reserve !== undefined ? updates.yes_reserve : market.yes_reserve,
      updates.no_reserve !== undefined ? updates.no_reserve : market.no_reserve,
      updates.market_probability !== undefined ? updates.market_probability : market.market_probability,
      updates.outcome !== undefined ? updates.outcome : market.outcome,
      updates.status !== undefined ? updates.status : market.status,
      updates.yes_asa_id !== undefined ? updates.yes_asa_id : market.yes_asa_id,
      updates.no_asa_id !== undefined ? updates.no_asa_id : market.no_asa_id,
      updates.app_id !== undefined ? updates.app_id : market.app_id,
      updates.app_address !== undefined ? updates.app_address : market.app_address,
      id
    );
    return this.getMarketById(id);
  },

  // ── Trades ─────────────────────────────────────────────────────────────────

  createTrade(trade) {
    try {
      statements.insertTrade.run(
        trade.id,
        trade.user_id,
        trade.market_id,
        trade.side,
        trade.amount,
        trade.tokens,
        trade.timestamp
      );
      return trade;
    } catch (err) {
      console.error('[db.createTrade]', err.message);
      throw err;
    }
  },

  getTradesByUser(userId) {
    return statements.getTradesByUser.all(userId);
  },

  getTradesByMarket(marketId) {
    return statements.getTradesByMarket.all(marketId);
  },

  getUserTradesForMarket(userId, marketId) {
    return statements.getUserTradesForMarket.all(userId, marketId);
  },

  // ── Claims ─────────────────────────────────────────────────────────────────

  createClaim(claim) {
    try {
      statements.insertClaim.run(
        claim.id,
        claim.user_id,
        claim.market_id,
        claim.payout,
        claim.timestamp
      );
      return claim;
    } catch (err) {
      console.error('[db.createClaim]', err.message);
      throw err;
    }
  },

  findClaim(userId, marketId) {
    return statements.findClaim.get(userId, marketId) || null;
  },

  // ── Utility ────────────────────────────────────────────────────────────────

  close() {
    sqlite.close();
  },
};

module.exports = db;
