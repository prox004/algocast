/**
 * db.js — In-memory database for CastAlgo (hackathon)
 *
 * Schema is defined in context.md §Database Schema
 */

const db = {
  /** @type {Map<string, import('./types').User>} */
  users: new Map(),     // keyed by id

  /** @type {Map<string, import('./types').User>} */
  usersByEmail: new Map(), // keyed by email (index)

  /** @type {Map<string, import('./types').Market>} */
  markets: new Map(),   // keyed by id

  /** @type {Map<string, import('./types').Trade>} */
  trades: new Map(),    // keyed by id

  /** @type {Map<string, import('./types').Claim>} */
  claims: new Map(),    // keyed by id

  // ── Users ──────────────────────────────────────────────────────────────────

  createUser(user) {
    this.users.set(user.id, user);
    this.usersByEmail.set(user.email.toLowerCase(), user);
    return user;
  },

  getUserById(id) {
    return this.users.get(id) || null;
  },

  getUserByEmail(email) {
    return this.usersByEmail.get(email.toLowerCase()) || null;
  },

  updateUser(id, updates) {
    const user = this.users.get(id);
    if (!user) return null;
    Object.assign(user, updates);
    return user;
  },

  updateUserOAuth(id, provider, oauthId) {
    const user = this.users.get(id);
    if (!user) return null;
    user.oauth_provider = provider;
    user.oauth_id = oauthId;
    return user;
  },

  getUserByOAuth(provider, oauthId) {
    return Array.from(this.users.values()).find(
      (u) => u.oauth_provider === provider && u.oauth_id === oauthId
    ) || null;
  },

  // ── Markets ────────────────────────────────────────────────────────────────

  createMarket(market) {
    this.markets.set(market.id, market);
    return market;
  },

  getMarketById(id) {
    return this.markets.get(id) || null;
  },

  getAllMarkets() {
    return Array.from(this.markets.values());
  },

  updateMarket(id, updates) {
    const market = this.markets.get(id);
    if (!market) return null;
    Object.assign(market, updates);
    return market;
  },

  // ── Trades ─────────────────────────────────────────────────────────────────

  createTrade(trade) {
    this.trades.set(trade.id, trade);
    return trade;
  },

  getTradesByUser(userId) {
    return Array.from(this.trades.values()).filter((t) => t.user_id === userId);
  },

  getTradesByMarket(marketId) {
    return Array.from(this.trades.values()).filter((t) => t.market_id === marketId);
  },

  getUserTradesForMarket(userId, marketId) {
    return Array.from(this.trades.values()).filter(
      (t) => t.user_id === userId && t.market_id === marketId,
    );
  },

  // ── Claims ─────────────────────────────────────────────────────────────────

  createClaim(claim) {
    this.claims.set(claim.id, claim);
    return claim;
  },

  findClaim(userId, marketId) {
    return (
      Array.from(this.claims.values()).find(
        (c) => c.user_id === userId && c.market_id === marketId,
      ) || null
    );
  },
};

module.exports = db;
