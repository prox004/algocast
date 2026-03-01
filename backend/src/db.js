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

// Add txid to trades table for on-chain tracking
try {
  sqlite.prepare('SELECT txid FROM trades LIMIT 1').get();
} catch (err) {
  console.log('[SQLite] Migrating trades table: adding txid column');
  try { sqlite.exec('ALTER TABLE trades ADD COLUMN txid TEXT;'); } catch (e) {}
}

// Add txid to orders table for on-chain escrow tracking
try {
  sqlite.prepare('SELECT txid FROM orders LIMIT 1').get();
} catch (err) {
  console.log('[SQLite] Migrating orders table: adding txid column');
  try { sqlite.exec('ALTER TABLE orders ADD COLUMN txid TEXT;'); } catch (e) {}
}

// Add txid to claims table for on-chain payout tracking
try {
  sqlite.prepare('SELECT txid FROM claims LIMIT 1').get();
} catch (err) {
  console.log('[SQLite] Migrating claims table: adding txid column');
  try { sqlite.exec('ALTER TABLE claims ADD COLUMN txid TEXT;'); } catch (e) {}
}

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

// ── Resolution & Admin Governance Tables ────────────────────────────────────

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS admins (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    hashed_password TEXT NOT NULL,
    algorand_address TEXT UNIQUE NOT NULL,
    encrypted_private_key TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'admin',
    created_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_admins_email ON admins(email);

  CREATE TABLE IF NOT EXISTS resolution_proposals (
    id TEXT PRIMARY KEY,
    market_id TEXT NOT NULL,
    proposed_outcome INTEGER NOT NULL,
    proposer_admin_id TEXT NOT NULL,
    signatures_collected TEXT DEFAULT '[]',
    multisig_txn_blob TEXT,
    status TEXT NOT NULL DEFAULT 'PENDING_SIGNATURES',
    evidence TEXT,
    resolution_hash TEXT,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (market_id) REFERENCES markets(id),
    FOREIGN KEY (proposer_admin_id) REFERENCES admins(id)
  );

  CREATE INDEX IF NOT EXISTS idx_resolution_proposals_market ON resolution_proposals(market_id);
  CREATE INDEX IF NOT EXISTS idx_resolution_proposals_status ON resolution_proposals(status);

  CREATE TABLE IF NOT EXISTS disputes (
    id TEXT PRIMARY KEY,
    market_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    reason TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (market_id) REFERENCES markets(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE INDEX IF NOT EXISTS idx_disputes_market ON disputes(market_id);
`);

// Add resolution-related columns to markets table
try {
  sqlite.prepare('SELECT resolution_timestamp FROM markets LIMIT 1').get();
} catch (err) {
  console.log('[SQLite] Migrating markets table: adding resolution columns');
  try { sqlite.exec('ALTER TABLE markets ADD COLUMN resolution_timestamp INTEGER;'); } catch (e) {}
  try { sqlite.exec('ALTER TABLE markets ADD COLUMN resolution_evidence TEXT;'); } catch (e) {}
  try { sqlite.exec('ALTER TABLE markets ADD COLUMN dispute_flag INTEGER DEFAULT 0;'); } catch (e) {}
}

// ── UMA Protocol Tables ─────────────────────────────────────────────────────

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS uma_resolutions (
    id TEXT PRIMARY KEY,
    market_id TEXT NOT NULL UNIQUE,
    proposed_outcome INTEGER NOT NULL,
    proposed_by TEXT NOT NULL,
    evidence TEXT,
    status TEXT NOT NULL DEFAULT 'PROPOSED',
    proposed_at INTEGER NOT NULL,
    dispute_window_ends INTEGER NOT NULL,
    voting_ends INTEGER,
    locked_at INTEGER,
    final_outcome INTEGER,
    lock_hash TEXT,
    dispute_reason TEXT,
    disputed_by TEXT,
    disputed_at INTEGER,
    FOREIGN KEY (market_id) REFERENCES markets(id),
    FOREIGN KEY (proposed_by) REFERENCES admins(id)
  );

  CREATE INDEX IF NOT EXISTS idx_uma_resolutions_market ON uma_resolutions(market_id);
  CREATE INDEX IF NOT EXISTS idx_uma_resolutions_status ON uma_resolutions(status);

  CREATE TABLE IF NOT EXISTS uma_votes (
    id TEXT PRIMARY KEY,
    resolution_id TEXT NOT NULL,
    admin_id TEXT NOT NULL,
    vote INTEGER NOT NULL,
    voted_at INTEGER NOT NULL,
    FOREIGN KEY (resolution_id) REFERENCES uma_resolutions(id),
    FOREIGN KEY (admin_id) REFERENCES admins(id),
    UNIQUE(resolution_id, admin_id)
  );

  CREATE INDEX IF NOT EXISTS idx_uma_votes_resolution ON uma_votes(resolution_id);
`);

// Add uma_status column to markets table
try {
  sqlite.prepare('SELECT uma_status FROM markets LIMIT 1').get();
} catch (err) {
  console.log('[SQLite] Migrating markets table: adding uma_status column');
  try { sqlite.exec("ALTER TABLE markets ADD COLUMN uma_status TEXT DEFAULT NULL;"); } catch (e) {}
}

console.log('[SQLite] UMA Protocol tables initialized');

// ── Order Book Table ────────────────────────────────────────────────────────

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    market_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    side TEXT NOT NULL,
    price REAL NOT NULL,
    amount INTEGER NOT NULL,
    filled INTEGER DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'open',
    created_at INTEGER NOT NULL,
    FOREIGN KEY (market_id) REFERENCES markets(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE INDEX IF NOT EXISTS idx_orders_market ON orders(market_id);
  CREATE INDEX IF NOT EXISTS idx_orders_market_side ON orders(market_id, side, status);
  CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
`);

console.log('[SQLite] Admin, Resolution & Order Book tables initialized');

// ── External Wallet Columns ─────────────────────────────────────────────────

try {
  sqlite.prepare('SELECT external_wallet FROM users LIMIT 1').get();
} catch (err) {
  console.log('[SQLite] Migrating users table: adding external_wallet columns');
  try { sqlite.exec('ALTER TABLE users ADD COLUMN external_wallet TEXT;'); } catch (e) {}
  try { sqlite.exec('ALTER TABLE users ADD COLUMN external_wallet_verified_at INTEGER;'); } catch (e) {}
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
  updateExternalWallet: sqlite.prepare('UPDATE users SET external_wallet = ?, external_wallet_verified_at = ? WHERE id = ?'),

  // Markets
  insertMarket: sqlite.prepare(`
    INSERT INTO markets (id, question, expiry, data_source, ai_probability, market_probability, 
                         yes_reserve, no_reserve, yes_asa_id, no_asa_id, app_id, app_address, 
                         outcome, status, created_at, tweet_id, tweet_author, tweet_content, ticker, asset_type, category)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `),
  getMarketById: sqlite.prepare('SELECT * FROM markets WHERE id = ?'),
  getMarketByTweetId: sqlite.prepare('SELECT * FROM markets WHERE tweet_id = ? LIMIT 1'),
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
    INSERT INTO trades (id, user_id, market_id, side, amount, tokens, timestamp, txid)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `),
  getTradesByUser: sqlite.prepare('SELECT * FROM trades WHERE user_id = ? ORDER BY timestamp DESC'),
  getTradesByMarket: sqlite.prepare('SELECT * FROM trades WHERE market_id = ? ORDER BY timestamp DESC'),
  getUserTradesForMarket: sqlite.prepare('SELECT * FROM trades WHERE user_id = ? AND market_id = ?'),

  // Claims
  insertClaim: sqlite.prepare(`
    INSERT INTO claims (id, user_id, market_id, payout, timestamp, txid)
    VALUES (?, ?, ?, ?, ?, ?)
  `),
  findClaim: sqlite.prepare('SELECT * FROM claims WHERE user_id = ? AND market_id = ?'),
  getClaimsByUser: sqlite.prepare('SELECT * FROM claims WHERE user_id = ? ORDER BY timestamp DESC'),

  // Admins
  insertAdmin: sqlite.prepare(`
    INSERT INTO admins (id, email, hashed_password, algorand_address, encrypted_private_key, role, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `),
  getAdminById: sqlite.prepare('SELECT * FROM admins WHERE id = ?'),
  getAdminByEmail: sqlite.prepare('SELECT * FROM admins WHERE email = ?'),
  getAllAdmins: sqlite.prepare('SELECT id, email, algorand_address, role, created_at FROM admins'),

  // Resolution Proposals
  insertProposal: sqlite.prepare(`
    INSERT INTO resolution_proposals (id, market_id, proposed_outcome, proposer_admin_id, signatures_collected, multisig_txn_blob, status, evidence, resolution_hash, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `),
  getProposalById: sqlite.prepare('SELECT * FROM resolution_proposals WHERE id = ?'),
  getProposalsByMarket: sqlite.prepare('SELECT * FROM resolution_proposals WHERE market_id = ? ORDER BY created_at DESC'),
  getPendingProposals: sqlite.prepare("SELECT * FROM resolution_proposals WHERE status = 'PENDING_SIGNATURES' ORDER BY created_at DESC"),
  updateProposal: sqlite.prepare(`
    UPDATE resolution_proposals SET signatures_collected = ?, multisig_txn_blob = ?, status = ? WHERE id = ?
  `),

  // Disputes
  insertDispute: sqlite.prepare(`
    INSERT INTO disputes (id, market_id, user_id, reason, created_at)
    VALUES (?, ?, ?, ?, ?)
  `),
  getDisputesByMarket: sqlite.prepare('SELECT * FROM disputes WHERE market_id = ? ORDER BY created_at DESC'),
  getDisputedMarkets: sqlite.prepare(`
    SELECT DISTINCT m.* FROM markets m
    INNER JOIN disputes d ON m.id = d.market_id
    WHERE m.dispute_flag = 1
    ORDER BY m.created_at DESC
  `),

  // UMA Resolutions
  insertUmaResolution: sqlite.prepare(`
    INSERT INTO uma_resolutions (id, market_id, proposed_outcome, proposed_by, evidence, status, proposed_at, dispute_window_ends, voting_ends, locked_at, final_outcome, lock_hash, dispute_reason, disputed_by, disputed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `),
  getUmaResolutionById: sqlite.prepare('SELECT * FROM uma_resolutions WHERE id = ?'),
  getUmaResolutionByMarket: sqlite.prepare('SELECT * FROM uma_resolutions WHERE market_id = ? ORDER BY proposed_at DESC LIMIT 1'),
  getUmaResolutionsByStatus: sqlite.prepare('SELECT * FROM uma_resolutions WHERE status = ? ORDER BY proposed_at DESC'),
  updateUmaResolution: sqlite.prepare(`
    UPDATE uma_resolutions SET status = ?, voting_ends = ?, locked_at = ?, final_outcome = ?, lock_hash = ?, dispute_reason = ?, disputed_by = ?, disputed_at = ? WHERE id = ?
  `),
  getAllUmaResolutions: sqlite.prepare('SELECT * FROM uma_resolutions ORDER BY proposed_at DESC'),
  getExpiredDisputeWindows: sqlite.prepare(`
    SELECT * FROM uma_resolutions WHERE status = 'PROPOSED' AND dispute_window_ends <= ?
  `),
  getExpiredVotingWindows: sqlite.prepare(`
    SELECT * FROM uma_resolutions WHERE status = 'UMA_VOTING' AND voting_ends <= ?
  `),

  // UMA Votes
  insertUmaVote: sqlite.prepare(`
    INSERT INTO uma_votes (id, resolution_id, admin_id, vote, voted_at)
    VALUES (?, ?, ?, ?, ?)
  `),
  getUmaVotesByResolution: sqlite.prepare('SELECT * FROM uma_votes WHERE resolution_id = ? ORDER BY voted_at ASC'),
  getUmaVoteByAdmin: sqlite.prepare('SELECT * FROM uma_votes WHERE resolution_id = ? AND admin_id = ?'),

  // Market UMA status
  updateMarketUmaStatus: sqlite.prepare('UPDATE markets SET uma_status = ? WHERE id = ?'),

  // Orders (order book)
  insertOrder: sqlite.prepare(`
    INSERT INTO orders (id, market_id, user_id, side, price, amount, filled, status, created_at, txid)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `),
  getOrderById: sqlite.prepare('SELECT * FROM orders WHERE id = ?'),
  getOpenOrdersByMarket: sqlite.prepare("SELECT * FROM orders WHERE market_id = ? AND status = 'open' ORDER BY price DESC, created_at ASC"),
  getOpenOrdersByMarketSide: sqlite.prepare("SELECT * FROM orders WHERE market_id = ? AND side = ? AND status = 'open' ORDER BY CASE WHEN side = 'YES' THEN -price ELSE price END, created_at ASC"),
  updateOrderFilled: sqlite.prepare('UPDATE orders SET filled = ?, status = ? WHERE id = ?'),
  cancelOrder: sqlite.prepare("UPDATE orders SET status = 'cancelled' WHERE id = ? AND user_id = ? AND status = 'open'"),
  getOrdersByUser: sqlite.prepare('SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC'),

  // Market resolution queries
  getActiveMarkets: sqlite.prepare("SELECT * FROM markets WHERE status = 'active' ORDER BY created_at DESC"),
  getClosedMarkets: sqlite.prepare("SELECT * FROM markets WHERE status = 'CLOSED' ORDER BY created_at DESC"),
  updateMarketResolution: sqlite.prepare(`
    UPDATE markets SET status = ?, outcome = ?, resolution_timestamp = ?, resolution_evidence = ? WHERE id = ?
  `),
  updateMarketDisputeFlag: sqlite.prepare(`
    UPDATE markets SET dispute_flag = ? WHERE id = ?
  `),
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

  setExternalWallet(userId, address, verifiedAt) {
    statements.updateExternalWallet.run(address, verifiedAt, userId);
    return this.getUserById(userId);
  },

  clearExternalWallet(userId) {
    statements.updateExternalWallet.run(null, null, userId);
    return this.getUserById(userId);
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
        market.asset_type || null,
        market.category || null
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

  getMarketByTweetId(tweetId) {
    if (!tweetId) return null;
    return statements.getMarketByTweetId.get(tweetId) || null;
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
        trade.timestamp,
        trade.txid || null
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
        claim.timestamp,
        claim.txid || null
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

  getClaimsByUser(userId) {
    return statements.getClaimsByUser.all(userId);
  },

  // ── Admins ─────────────────────────────────────────────────────────────────

  createAdmin(admin) {
    try {
      statements.insertAdmin.run(
        admin.id,
        admin.email.toLowerCase(),
        admin.hashed_password,
        admin.algorand_address,
        admin.encrypted_private_key,
        admin.role || 'admin',
        Date.now()
      );
      return admin;
    } catch (err) {
      console.error('[db.createAdmin]', err.message);
      throw err;
    }
  },

  getAdminById(id) {
    return statements.getAdminById.get(id) || null;
  },

  getAdminByEmail(email) {
    return statements.getAdminByEmail.get(email.toLowerCase()) || null;
  },

  getAllAdmins() {
    return statements.getAllAdmins.all();
  },

  // ── Resolution Proposals ───────────────────────────────────────────────────

  createProposal(proposal) {
    try {
      statements.insertProposal.run(
        proposal.id,
        proposal.market_id,
        proposal.proposed_outcome,
        proposal.proposer_admin_id,
        JSON.stringify(proposal.signatures_collected || []),
        proposal.multisig_txn_blob || null,
        proposal.status || 'PENDING_SIGNATURES',
        proposal.evidence || null,
        proposal.resolution_hash || null,
        Date.now()
      );
      return proposal;
    } catch (err) {
      console.error('[db.createProposal]', err.message);
      throw err;
    }
  },

  getProposalById(id) {
    const row = statements.getProposalById.get(id);
    if (!row) return null;
    row.signatures_collected = JSON.parse(row.signatures_collected || '[]');
    return row;
  },

  getProposalsByMarket(marketId) {
    const rows = statements.getProposalsByMarket.all(marketId);
    return rows.map(r => {
      r.signatures_collected = JSON.parse(r.signatures_collected || '[]');
      return r;
    });
  },

  getPendingProposals() {
    const rows = statements.getPendingProposals.all();
    return rows.map(r => {
      r.signatures_collected = JSON.parse(r.signatures_collected || '[]');
      return r;
    });
  },

  updateProposal(id, updates) {
    statements.updateProposal.run(
      JSON.stringify(updates.signatures_collected || []),
      updates.multisig_txn_blob || null,
      updates.status,
      id
    );
    return this.getProposalById(id);
  },

  // ── Disputes ───────────────────────────────────────────────────────────────

  createDispute(dispute) {
    try {
      statements.insertDispute.run(
        dispute.id,
        dispute.market_id,
        dispute.user_id,
        dispute.reason,
        Date.now()
      );
      // Set dispute_flag on the market
      statements.updateMarketDisputeFlag.run(1, dispute.market_id);
      return dispute;
    } catch (err) {
      console.error('[db.createDispute]', err.message);
      throw err;
    }
  },

  getDisputesByMarket(marketId) {
    return statements.getDisputesByMarket.all(marketId);
  },

  getDisputedMarkets() {
    return statements.getDisputedMarkets.all();
  },

  // ── UMA Protocol ───────────────────────────────────────────────────────────

  createUmaResolution(resolution) {
    try {
      statements.insertUmaResolution.run(
        resolution.id,
        resolution.market_id,
        resolution.proposed_outcome,
        resolution.proposed_by,
        resolution.evidence || null,
        resolution.status || 'PROPOSED',
        resolution.proposed_at || Date.now(),
        resolution.dispute_window_ends,
        resolution.voting_ends || null,
        resolution.locked_at || null,
        resolution.final_outcome ?? null,
        resolution.lock_hash || null,
        resolution.dispute_reason || null,
        resolution.disputed_by || null,
        resolution.disputed_at || null
      );
      return resolution;
    } catch (err) {
      console.error('[db.createUmaResolution]', err.message);
      throw err;
    }
  },

  getUmaResolutionById(id) {
    return statements.getUmaResolutionById.get(id) || null;
  },

  getUmaResolutionByMarket(marketId) {
    return statements.getUmaResolutionByMarket.get(marketId) || null;
  },

  getUmaResolutionsByStatus(status) {
    return statements.getUmaResolutionsByStatus.all(status);
  },

  getAllUmaResolutions() {
    return statements.getAllUmaResolutions.all();
  },

  updateUmaResolution(id, updates) {
    const existing = this.getUmaResolutionById(id);
    if (!existing) return null;
    statements.updateUmaResolution.run(
      updates.status !== undefined ? updates.status : existing.status,
      updates.voting_ends !== undefined ? updates.voting_ends : existing.voting_ends,
      updates.locked_at !== undefined ? updates.locked_at : existing.locked_at,
      updates.final_outcome !== undefined ? updates.final_outcome : existing.final_outcome,
      updates.lock_hash !== undefined ? updates.lock_hash : existing.lock_hash,
      updates.dispute_reason !== undefined ? updates.dispute_reason : existing.dispute_reason,
      updates.disputed_by !== undefined ? updates.disputed_by : existing.disputed_by,
      updates.disputed_at !== undefined ? updates.disputed_at : existing.disputed_at,
      id
    );
    return this.getUmaResolutionById(id);
  },

  getExpiredDisputeWindows(now) {
    return statements.getExpiredDisputeWindows.all(now || Date.now());
  },

  getExpiredVotingWindows(now) {
    return statements.getExpiredVotingWindows.all(now || Date.now());
  },

  createUmaVote(vote) {
    try {
      statements.insertUmaVote.run(
        vote.id,
        vote.resolution_id,
        vote.admin_id,
        vote.vote,
        vote.voted_at || Date.now()
      );
      return vote;
    } catch (err) {
      console.error('[db.createUmaVote]', err.message);
      throw err;
    }
  },

  getUmaVotesByResolution(resolutionId) {
    return statements.getUmaVotesByResolution.all(resolutionId);
  },

  getUmaVoteByAdmin(resolutionId, adminId) {
    return statements.getUmaVoteByAdmin.get(resolutionId, adminId) || null;
  },

  updateMarketUmaStatus(marketId, umaStatus) {
    statements.updateMarketUmaStatus.run(umaStatus, marketId);
    return this.getMarketById(marketId);
  },

  // ── Market Resolution Helpers ──────────────────────────────────────────────

  resolveMarket(id, outcome, evidence) {
    statements.updateMarketResolution.run('RESOLVED', outcome, Date.now(), evidence || null, id);
    return this.getMarketById(id);
  },

  closeMarket(id) {
    statements.updateMarketResolution.run('CLOSED', null, null, null, id);
    return this.getMarketById(id);
  },

  getActiveMarketsOnly() {
    return statements.getActiveMarkets.all();
  },

  getClosedMarketsOnly() {
    return statements.getClosedMarkets.all();
  },

  // ── Orders (Order Book) ────────────────────────────────────────────────────

  createOrder(order) {
    try {
      statements.insertOrder.run(
        order.id,
        order.market_id,
        order.user_id,
        order.side,
        order.price,
        order.amount,
        order.filled || 0,
        order.status || 'open',
        Date.now(),
        order.txid || null
      );
      return order;
    } catch (err) {
      console.error('[db.createOrder]', err.message);
      throw err;
    }
  },

  getOrderById(id) {
    return statements.getOrderById.get(id) || null;
  },

  getOpenOrdersByMarket(marketId) {
    return statements.getOpenOrdersByMarket.all(marketId);
  },

  getOpenOrdersByMarketSide(marketId, side) {
    return statements.getOpenOrdersByMarketSide.all(marketId, side);
  },

  updateOrderFilled(id, filled, status) {
    statements.updateOrderFilled.run(filled, status, id);
    return this.getOrderById(id);
  },

  cancelOrder(id, userId) {
    statements.cancelOrder.run(id, userId);
    return this.getOrderById(id);
  },

  getOrdersByUser(userId) {
    return statements.getOrdersByUser.all(userId);
  },

  /**
   * Get aggregated order book for a market.
   * Returns YES bids and NO bids grouped by price level.
   */
  getOrderBook(marketId) {
    const orders = this.getOpenOrdersByMarket(marketId);
    const yesBids = {};
    const noBids = {};

    for (const order of orders) {
      const remaining = order.amount - order.filled;
      if (remaining <= 0) continue;

      const priceKey = order.price.toFixed(2);
      if (order.side === 'YES') {
        yesBids[priceKey] = (yesBids[priceKey] || 0) + remaining;
      } else {
        noBids[priceKey] = (noBids[priceKey] || 0) + remaining;
      }
    }

    // Sort YES bids descending (highest bid first), NO bids ascending
    const yesLevels = Object.entries(yesBids)
      .map(([price, amount]) => ({ price: parseFloat(price), amount }))
      .sort((a, b) => b.price - a.price);

    const noLevels = Object.entries(noBids)
      .map(([price, amount]) => ({ price: parseFloat(price), amount }))
      .sort((a, b) => a.price - b.price);

    return { yes: yesLevels, no: noLevels };
  },

  // ── Utility ────────────────────────────────────────────────────────────────

  close() {
    sqlite.close();
  },
};

module.exports = db;
