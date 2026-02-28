/**
 * routes/markets.js
 *
 * GET  /markets              — list all markets
 * POST /markets/generate     — create a new market
 * POST /markets/buy-yes      — buy YES tokens
 * POST /markets/buy-no       — buy NO tokens
 * POST /markets/claim        — claim winnings
 * POST /markets/resolve      — resolve market (open for hackathon)
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { requireAuth } = require('../middleware/auth');
const db = require('../db');
const { createMarketASAs } = require('../algorand/asa');

const router = express.Router();

/** Compute market probability from reserves */
function marketProbability(market) {
  const total = market.yes_reserve + market.no_reserve;
  if (total === 0) return 0.5;
  return market.yes_reserve / total;
}

/** Enrich a market object with computed probability */
function enrichMarket(market) {
  return { ...market, market_probability: marketProbability(market) };
}

// GET /markets
router.get('/', (_req, res) => {
  const markets = db.getAllMarkets().map(enrichMarket);
  return res.json(markets);
});

// GET /markets/:id
router.get('/:id', (req, res) => {
  const market = db.getMarketById(req.params.id);
  if (!market) return res.status(404).json({ error: 'Market not found' });
  return res.json(enrichMarket(market));
});

// POST /markets/generate (protected)
router.post('/generate', requireAuth, (req, res) => {
  try {
    const { question, expiry } = req.body;
    if (!question || typeof question !== 'string' || question.trim() === '') {
      return res.status(400).json({ error: 'question is required' });
    }
    const expiryTs = parseInt(expiry, 10);
    if (!expiryTs || expiryTs <= Math.floor(Date.now() / 1000)) {
      return res.status(400).json({ error: 'expiry must be a future unix timestamp' });
    }

    const { yesAsaId, noAsaId } = createMarketASAs();
    const market = db.createMarket({
      id: uuidv4(),
      question: question.trim(),
      expiry: expiryTs,
      ai_probability: 0.5,  // updated by AI route later
      yes_asa_id: yesAsaId,
      no_asa_id: noAsaId,
      yes_reserve: 0,
      no_reserve: 0,
      resolved: false,
      outcome: null,
    });

    return res.status(201).json({ market: enrichMarket(market) });
  } catch (err) {
    console.error('[generate-market]', err.message);
    return res.status(500).json({ error: 'Market creation failed' });
  }
});

// ── Buy helpers ────────────────────────────────────────────────────────────

function buyTokens(side) {
  return (req, res) => {
    try {
      const { market_id, amount } = req.body;
      const microAlgos = parseInt(amount, 10);

      if (!market_id) return res.status(400).json({ error: 'market_id is required' });
      if (!microAlgos || microAlgos <= 0) {
        return res.status(400).json({ error: 'amount must be a positive integer' });
      }

      const market = db.getMarketById(market_id);
      if (!market) return res.status(404).json({ error: 'Market not found' });
      if (market.resolved) return res.status(400).json({ error: 'Market already resolved' });
      if (market.expiry < Math.floor(Date.now() / 1000)) {
        return res.status(400).json({ error: 'Market has expired' });
      }

      const user = db.getUserById(req.user.id);
      if (!user) return res.status(404).json({ error: 'User not found' });
      if (user.balance < microAlgos) {
        return res.status(400).json({ error: 'Insufficient balance' });
      }

      // Deduct balance
      db.updateUser(user.id, { balance: user.balance - microAlgos });

      // 1:1 token issuance (hackathon simplification per context.md)
      const tokens = microAlgos;

      // Update reserves
      if (side === 'YES') {
        db.updateMarket(market.id, { yes_reserve: market.yes_reserve + microAlgos });
      } else {
        db.updateMarket(market.id, { no_reserve: market.no_reserve + microAlgos });
      }

      const trade = db.createTrade({
        id: uuidv4(),
        user_id: user.id,
        market_id: market.id,
        side,
        amount: microAlgos,
        tokens,
        timestamp: Math.floor(Date.now() / 1000),
      });

      return res.json({ success: true, tokens, trade });
    } catch (err) {
      console.error(`[buy-${side.toLowerCase()}]`, err.message);
      return res.status(500).json({ error: 'Buy failed' });
    }
  };
}

// POST /markets/buy-yes (protected)
router.post('/buy-yes', requireAuth, buyTokens('YES'));

// POST /markets/buy-no (protected)
router.post('/buy-no', requireAuth, buyTokens('NO'));

// ── Claim ──────────────────────────────────────────────────────────────────

// POST /markets/claim (protected)
router.post('/claim', requireAuth, (req, res) => {
  try {
    const { market_id } = req.body;
    if (!market_id) return res.status(400).json({ error: 'market_id is required' });

    const market = db.getMarketById(market_id);
    if (!market) return res.status(404).json({ error: 'Market not found' });
    if (!market.resolved) return res.status(400).json({ error: 'Market not yet resolved' });

    // Prevent double claim
    if (db.findClaim(req.user.id, market_id)) {
      return res.status(400).json({ error: 'Already claimed for this market' });
    }

    const winningSide = market.outcome === 1 ? 'YES' : 'NO';
    const userTrades = db.getUserTradesForMarket(req.user.id, market_id);
    const winningTrades = userTrades.filter((t) => t.side === winningSide);
    const totalWinningTokens = winningTrades.reduce((sum, t) => sum + t.tokens, 0);

    if (totalWinningTokens === 0) {
      return res.status(400).json({ error: 'No winning tokens to claim' });
    }

    // Payout = winning tokens (1:1 hackathon model)
    const payout = totalWinningTokens;
    const user = db.getUserById(req.user.id);
    db.updateUser(user.id, { balance: user.balance + payout });

    db.createClaim({
      id: uuidv4(),
      user_id: req.user.id,
      market_id,
      claimed_at: Math.floor(Date.now() / 1000),
    });

    return res.json({ success: true, payout });
  } catch (err) {
    console.error('[claim]', err.message);
    return res.status(500).json({ error: 'Claim failed' });
  }
});

// ── Resolve ────────────────────────────────────────────────────────────────

// POST /markets/resolve (open for hackathon demo)
router.post('/resolve', requireAuth, (req, res) => {
  try {
    const { market_id, outcome } = req.body;
    if (!market_id) return res.status(400).json({ error: 'market_id is required' });
    if (outcome !== 0 && outcome !== 1) {
      return res.status(400).json({ error: 'outcome must be 0 (NO) or 1 (YES)' });
    }

    const market = db.getMarketById(market_id);
    if (!market) return res.status(404).json({ error: 'Market not found' });
    if (market.resolved) return res.status(400).json({ error: 'Market already resolved' });

    db.updateMarket(market_id, { resolved: true, outcome });
    return res.json({ success: true });
  } catch (err) {
    console.error('[resolve]', err.message);
    return res.status(500).json({ error: 'Resolve failed' });
  }
});

module.exports = router;
