/**
 * routes/markets.js
 *
 * GET  /markets                    — list all markets
 * GET  /markets/user-orders/me     — current user's orders
 * GET  /markets/user-trades/me     — current user's trades
 * GET  /markets/:id                — get single market
 * GET  /markets/:id/orderbook      — aggregated order book
 * POST /markets/generate           — create a new market (auto-seeds liquidity)
 * POST /markets/buy-yes            — buy YES tokens (market order)
 * POST /markets/buy-no             — buy NO tokens  (market order)
 * POST /markets/place-order        — place limit order on order book
 * DELETE /markets/cancel-order/:id — cancel open limit order
 * POST /markets/claim              — claim winnings on resolved market
 *
 * Resolution: admin-only via /admin/resolve (2-of-3 multisig).
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { requireAuth } = require('../middleware/auth');
const db = require('../db');
const { createMarketASAs } = require('../algorand/asa');
const { sendAlgo } = require('../algorand/asa');
const {
  signBuyGroup,
  signClaim,
  broadcast,
  isContractReady,
  fundUserAccount,
  getEscrowAddress,
} = require('../algorand/transactionBuilder');
const { getAlgodClient } = require('../algorand/client');
const { normalizeAddress } = require('../wallet/custodialWallet');

const router = express.Router();

/** Compute market probability from reserves */
function marketProbability(market) {
  const total = market.yes_reserve + market.no_reserve;
  if (total === 0) return 0.5;
  return market.yes_reserve / total;
}

/** Derive whether market is resolved from status/outcome */
function isMarketResolved(market) {
  return market.status === 'RESOLVED' || market.status === 'CLOSED' || market.outcome !== null;
}

/** Enrich a market object with computed probability + derived resolved flag */
function enrichMarket(market) {
  return {
    ...market,
    market_probability: marketProbability(market),
    resolved: isMarketResolved(market),
  };
}

// GET /markets
router.get('/', (_req, res) => {
  const markets = db.getAllMarkets().map(enrichMarket);
  return res.json({ markets });
});

// GET /markets/user-orders/me (protected) — MUST be before /:id
router.get('/user-orders/me', requireAuth, (req, res) => {
  try {
    const orders = db.getOrdersByUser(req.user.id);
    return res.json({ orders });
  } catch (err) {
    console.error('[user-orders]', err.message);
    return res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

// GET /markets/user-trades/me (protected) — get current user's trades
router.get('/user-trades/me', requireAuth, (req, res) => {
  try {
    const trades = db.getTradesByUser(req.user.id);

    // Enrich trades with market information
    const enrichedTrades = trades.map(trade => {
      const market = db.getMarketById(trade.market_id);
      return {
        ...trade,
        market_question: market ? market.question : 'Unknown Market',
        category: market ? market.category : null,
        market_expiry: market ? market.expiry : null,
        market_resolved: market ? (market.outcome !== null) : false,
        market_outcome: market ? market.outcome : null,
        // Calculate profit/loss if market is resolved
        profit_loss: market && market.outcome !== null ?
          calculateTradeProfit(trade, market) : null,
        is_winner: market && market.outcome !== null ?
          isTradeWinner(trade, market) : null
      };
    });

    return res.json({ trades: enrichedTrades });
  } catch (err) {
    console.error('[user-trades]', err.message);
    return res.status(500).json({ error: 'Failed to fetch trades' });
  }
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
    const { question, expiry, app_id, app_address } = req.body;
    if (!question || typeof question !== 'string' || question.trim() === '') {
      return res.status(400).json({ error: 'question is required' });
    }
    const expiryTs = parseInt(expiry, 10);
    if (!expiryTs || expiryTs <= Math.floor(Date.now() / 1000)) {
      return res.status(400).json({ error: 'expiry must be a future unix timestamp' });
    }

    // If no on-chain app_id provided, use mocked ASA IDs (hackathon default)
    let yesAsaId, noAsaId;
    if (app_id && app_address) {
      // Real deployment: caller (deploy.py) provides app_id + yes/no ASA IDs
      yesAsaId = parseInt(req.body.yes_asa_id, 10) || null;
      noAsaId  = parseInt(req.body.no_asa_id,  10) || null;
    } else {
      const mocked = createMarketASAs();
      yesAsaId = mocked.yesAsaId;
      noAsaId  = mocked.noAsaId;
    }

    // Auto-liquidity: seed both sides so the market has depth & 50 / 50 start
    const INITIAL_LIQUIDITY = parseInt(process.env.INITIAL_LIQUIDITY_MICRO || '10000000', 10); // 10 ALGO default

    const market = db.createMarket({
      id: uuidv4(),
      question: question.trim(),
      expiry: expiryTs,
      ai_probability: 0.5,    // updated by AI route later
      yes_asa_id: yesAsaId,
      no_asa_id: noAsaId,
      yes_reserve: INITIAL_LIQUIDITY,
      no_reserve:  INITIAL_LIQUIDITY,
      resolved: false,
      outcome: null,
      app_id:      app_id     ? parseInt(app_id, 10)     : null,
      app_address: app_address || null,
    });

    console.log(`[generate-market] Auto-seeded ${INITIAL_LIQUIDITY / 1e6} ALGO per side for market ${market.id}`);
    return res.status(201).json({ market: enrichMarket(market) });
  } catch (err) {
    console.error('[generate-market]', err.message);
    return res.status(500).json({ error: 'Market creation failed' });
  }
});

// ── Buy helpers ────────────────────────────────────────────────────────────

/**
 * buyTokens — async handler factory for buy-yes / buy-no.
 * Behaviour:
 *   On-chain mode (market.app_id set + contract compiled):
 *     Builds atomic [PaymentTxn + ABI app-call], broadcasts to TestNet.
 *   Mock mode (market.app_id is null OR contract not compiled):
 *     In-memory accounting only (hackathon default).
 */
function buyTokens(side) {
  return async (req, res) => {
    try {
      const { market_id, amount } = req.body;
      const microAlgos = parseInt(amount, 10);

      if (!market_id) return res.status(400).json({ error: 'market_id is required' });
      if (!microAlgos || microAlgos <= 0) {
        return res.status(400).json({ error: 'amount must be a positive integer' });
      }

      const market = db.getMarketById(market_id);
      if (!market) return res.status(404).json({ error: 'Market not found' });
      if (isMarketResolved(market)) {
        return res.status(400).json({ error: 'Market already resolved' });
      }
      if (market.expiry < Math.floor(Date.now() / 1000)) {
        return res.status(400).json({ error: 'Market has expired' });
      }

      const user = db.getUserById(req.user.id);
      if (!user) return res.status(404).json({ error: 'User not found' });
      if (user.balance < microAlgos) {
        return res.status(400).json({ error: 'Insufficient balance' });
      }

      // Deduct balance BEFORE any async operation
      db.updateUser(user.id, { balance: user.balance - microAlgos });

      let txid = null;

      // ── On-chain mode ────────────────────────────────────────────────────
      if (market.app_id && market.app_address && isContractReady()) {
        const asaId = side === 'YES' ? market.yes_asa_id : market.no_asa_id;
        try {
          const signed = await signBuyGroup(side, {
            fromAddress:      user.custodial_address,
            encryptedKey:     user.encrypted_private_key,
            appId:            market.app_id,
            appAddress:       market.app_address,
            asaId,
            amountMicroAlgos: microAlgos,
          });
          txid = await broadcast(signed);
        } catch (txnErr) {
          // Rollback balance on txn failure
          db.updateUser(user.id, { balance: user.balance }); // re-fetch restores
          console.error(`[buy-${side.toLowerCase()} txn]`, txnErr.message);
          return res.status(502).json({ error: 'On-chain transaction failed, balance restored' });
        }
      }

      // ── Odds-based token pricing (Polymarket-style) ───────────────────────
      //
      //   share_price  = probability of chosen side  (0.01 – 0.99)
      //   tokens       = µALGO_spent / share_price   (number of shares)
      //   Each winning share redeems for 1 µALGO on claim.
      //
      //   Example: buy YES at 60% → price = 0.60 → 1 ALGO buys 1.667 shares
      //            If YES wins → payout = 1.667 ALGO → profit = 0.667 ALGO
      //
      const currentProb = marketProbability(market);
      const sharePrice = side === 'YES'
        ? Math.max(currentProb, 0.01)
        : Math.max(1 - currentProb, 0.01);
      const tokens = Math.floor(microAlgos / sharePrice);

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

      // Auto-update probability from reserves
      const updated = db.getMarketById(market.id);
      const newProb = marketProbability(updated);
      db.updateMarket(market.id, { market_probability: newProb });

      // Try to fill any matching limit orders after the price move
      const fills = matchOrders(updated);

      return res.json({
        success: true,
        tokens,
        trade,
        txid,
        probability: newProb,
        fills,
        share_price: sharePrice,
        potential_payout: tokens, // each winning token = 1 µALGO
      });
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
router.post('/claim', requireAuth, async (req, res) => {
  try {
    const { market_id } = req.body;
    if (!market_id) return res.status(400).json({ error: 'market_id is required' });

    const market = db.getMarketById(market_id);
    if (!market) return res.status(404).json({ error: 'Market not found' });
    if (!isMarketResolved(market)) return res.status(400).json({ error: 'Market not yet resolved' });

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

    const payout = totalWinningTokens; // 1:1 model
    const user   = db.getUserById(req.user.id);
    let txid     = null;

    // ── On-chain claim (smart contract) ─────────────────────────────────────
    if (market.app_id && isContractReady()) {
      const winningAsaId = market.outcome === 1 ? market.yes_asa_id : market.no_asa_id;
      try {
        const signed = await signClaim({
          fromAddress:  normalizeAddress(user.custodial_address),
          encryptedKey: user.encrypted_private_key,
          appId:        market.app_id,
          winningAsaId,
        });
        txid = await broadcast(signed);
      } catch (txnErr) {
        console.error('[claim contract-txn]', txnErr.message);
        return res.status(502).json({ error: 'On-chain claim failed' });
      }
    } else {
      // ── Escrow mode: send ALGO from platform escrow → user on-chain ──────
      try {
        txid = await fundUserAccount({
          toAddress: normalizeAddress(user.custodial_address),
          amountMicroAlgos: payout,
        });
        console.log(`[claim] On-chain payout ${payout / 1e6} ALGO to ${normalizeAddress(user.custodial_address)}. Tx: ${txid}`);
      } catch (txnErr) {
        console.error('[claim escrow-txn]', txnErr.message);
        return res.status(502).json({ error: 'On-chain payout failed' });
      }
    }

    // Sync user balance from chain
    const newBalance = await getOnChainBalance(normalizeAddress(user.custodial_address));
    db.updateUser(user.id, { balance: newBalance });

    db.createClaim({
      id: uuidv4(),
      user_id: req.user.id,
      market_id,
      payout,
      timestamp: Math.floor(Date.now() / 1000),
      txid,
    });

    return res.json({ success: true, payout, txid });
  } catch (err) {
    console.error('[claim]', err.message);
    return res.status(500).json({ error: 'Claim failed' });
  }
});

// ── Resolve ────────────────────────────────────────────────────────────────
// Resolution is now admin-only via /admin/resolve (2-of-3 multisig).
// The old user-facing resolve endpoint has been removed.

// ── Order Book ─────────────────────────────────────────────────────────────

/**
 * GET /markets/:id/orderbook
 * Returns aggregated YES and NO order depth for a market.
 */
router.get('/:id/orderbook', (req, res) => {
  try {
    const market = db.getMarketById(req.params.id);
    if (!market) return res.status(404).json({ error: 'Market not found' });

    const orderBook = db.getOrderBook(market.id);
    return res.json({
      market_id: market.id,
      probability: marketProbability(market),
      ...orderBook,
    });
  } catch (err) {
    console.error('[orderbook]', err.message);
    return res.status(500).json({ error: 'Failed to fetch order book' });
  }
});

/**
 * POST /markets/place-order (protected)
 * Place a limit order on the order book.
 * On-chain escrow: ALGO transferred to platform escrow address.
 * Body: { market_id, side: "YES"|"NO", price: 0.01-0.99, amount: microAlgos }
 */
router.post('/place-order', requireAuth, async (req, res) => {
  try {
    const { market_id, side, price, amount } = req.body;
    const microAlgos = parseInt(amount, 10);
    const orderPrice = parseFloat(price);

    if (!market_id) return res.status(400).json({ error: 'market_id is required' });
    if (side !== 'YES' && side !== 'NO') {
      return res.status(400).json({ error: 'side must be YES or NO' });
    }
    if (!orderPrice || orderPrice <= 0 || orderPrice >= 1) {
      return res.status(400).json({ error: 'price must be between 0.01 and 0.99 (probability)' });
    }
    if (!microAlgos || microAlgos <= 0) {
      return res.status(400).json({ error: 'amount must be a positive integer (microAlgos)' });
    }

    const market = db.getMarketById(market_id);
    if (!market) return res.status(404).json({ error: 'Market not found' });
    if (isMarketResolved(market)) {
      return res.status(400).json({ error: 'Market already resolved' });
    }
    if (market.expiry < Math.floor(Date.now() / 1000)) {
      return res.status(400).json({ error: 'Market has expired' });
    }

    const user = db.getUserById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Check on-chain balance
    const fromAddress = normalizeAddress(user.custodial_address);
    const onChainBalance = await getOnChainBalance(fromAddress);
    if (onChainBalance < microAlgos + MIN_BALANCE) {
      return res.status(400).json({ error: 'Insufficient on-chain balance' });
    }

    // On-chain escrow: send ALGO to platform escrow
    let txid = null;
    try {
      const escrowAddress = getEscrowAddress();
      txid = await sendAlgo(
        user.encrypted_private_key,
        fromAddress,
        escrowAddress,
        microAlgos,
      );
      console.log(`[place-order] On-chain escrow tx: ${txid}`);
    } catch (txnErr) {
      console.error('[place-order escrow-txn]', txnErr.message);
      return res.status(502).json({ error: 'On-chain escrow transaction failed' });
    }

    // Sync balance
    const newBalance = await getOnChainBalance(fromAddress);
    db.updateUser(user.id, { balance: newBalance });

    const order = db.createOrder({
      id: uuidv4(),
      market_id,
      user_id: req.user.id,
      side,
      price: orderPrice,
      amount: microAlgos,
      filled: 0,
      status: 'open',
      txid,
    });

    // Try to match the order immediately
    const fills = matchOrders(market);

    return res.json({ success: true, order, fills, txid });
  } catch (err) {
    console.error('[place-order]', err.message);
    return res.status(500).json({ error: 'Order placement failed' });
  }
});

/**
 * DELETE /markets/cancel-order/:orderId (protected)
 * Cancel an open order and refund the remaining amount on-chain.
 */
router.delete('/cancel-order/:orderId', requireAuth, async (req, res) => {
  try {
    const order = db.getOrderById(req.params.orderId);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Not your order' });
    }
    if (order.status !== 'open') {
      return res.status(400).json({ error: 'Order is not open' });
    }

    // Refund remaining (amount - filled) on-chain
    const remaining = order.amount - order.filled;
    const user = db.getUserById(req.user.id);
    let txid = null;

    if (remaining > 0) {
      try {
        txid = await fundUserAccount({
          toAddress: normalizeAddress(user.custodial_address),
          amountMicroAlgos: remaining,
        });
        console.log(`[cancel-order] On-chain refund ${remaining / 1e6} ALGO. Tx: ${txid}`);
      } catch (txnErr) {
        console.error('[cancel-order refund-txn]', txnErr.message);
        return res.status(502).json({ error: 'On-chain refund failed' });
      }

      // Sync balance
      const newBalance = await getOnChainBalance(normalizeAddress(user.custodial_address));
      db.updateUser(user.id, { balance: newBalance });
    }

    db.cancelOrder(order.id, req.user.id);
    return res.json({ success: true, refunded: remaining, txid });
  } catch (err) {
    console.error('[cancel-order]', err.message);
    return res.status(500).json({ error: 'Cancel failed' });
  }
});

// ── Order Matching Engine ──────────────────────────────────────────────────

/**
 * Match YES and NO limit orders that cross:
 *   A YES bid at price p can match a NO bid at price (1-p).
 *   When YES_order.price >= (1 - NO_order.price), they overlap.
 *
 * After each fill, reserves and probability are recalculated.
 */
function matchOrders(marketInput) {
  const market = db.getMarketById(marketInput.id);
  const yesBids = db.getOpenOrdersByMarketSide(market.id, 'YES');  // sorted by highest price first
  const noBids  = db.getOpenOrdersByMarketSide(market.id, 'NO');   // sorted by lowest price first

  const fills = [];
  let yesIdx = 0;
  let noIdx  = 0;

  while (yesIdx < yesBids.length && noIdx < noBids.length) {
    const yesOrder = yesBids[yesIdx];
    const noOrder  = noBids[noIdx];

    const yesRemaining = yesOrder.amount - yesOrder.filled;
    const noRemaining  = noOrder.amount  - noOrder.filled;

    // YES bid at yesOrder.price, NO bid at noOrder.price
    // They match if yesOrder.price + noOrder.price >= 1
    if (yesOrder.price + noOrder.price < 1) break;

    // Fill amount = min of remaining on both sides
    const fillAmount = Math.min(yesRemaining, noRemaining);
    if (fillAmount <= 0) break;

    // Update YES order
    const newYesFilled = yesOrder.filled + fillAmount;
    const yesStatus = newYesFilled >= yesOrder.amount ? 'filled' : 'open';
    db.updateOrderFilled(yesOrder.id, newYesFilled, yesStatus);
    yesOrder.filled = newYesFilled;

    // Update NO order
    const newNoFilled = noOrder.filled + fillAmount;
    const noStatus = newNoFilled >= noOrder.amount ? 'filled' : 'open';
    db.updateOrderFilled(noOrder.id, newNoFilled, noStatus);
    noOrder.filled = newNoFilled;

    // Update reserves — fill goes into both YES and NO pools
    const fresh = db.getMarketById(market.id);
    const yesContrib = Math.round(fillAmount * yesOrder.price);
    const noContrib  = Math.round(fillAmount * noOrder.price);
    db.updateMarket(market.id, {
      yes_reserve: fresh.yes_reserve + yesContrib,
      no_reserve:  fresh.no_reserve  + noContrib,
    });

    fills.push({
      yes_order_id: yesOrder.id,
      no_order_id:  noOrder.id,
      amount: fillAmount,
      price_yes: yesOrder.price,
      price_no:  noOrder.price,
    });

    // Record trades for both users
    db.createTrade({
      id: uuidv4(), user_id: yesOrder.user_id, market_id: market.id,
      side: 'YES', amount: yesContrib, tokens: fillAmount,
      timestamp: Math.floor(Date.now() / 1000),
    });
    db.createTrade({
      id: uuidv4(), user_id: noOrder.user_id, market_id: market.id,
      side: 'NO', amount: noContrib, tokens: fillAmount,
      timestamp: Math.floor(Date.now() / 1000),
    });

    if (yesStatus === 'filled') yesIdx++;
    if (noStatus  === 'filled') noIdx++;
  }

  // Auto-update probability after matching
  if (fills.length > 0) {
    const updated = db.getMarketById(market.id);
    const newProb = marketProbability(updated);
    db.updateMarket(market.id, { market_probability: newProb });
    console.log(`[match-engine] ${fills.length} fills, new probability: ${(newProb * 100).toFixed(1)}%`);
  }

  return fills;
}

/**
 * Calculate trade profit/loss in µALGO.
 * Each winning share (token) redeems for 1 µALGO.
 *   profit = tokens − amount  (positive for winners)
 *   loss   = −amount          (losers lose their stake)
 */
function calculateTradeProfit(trade, market) {
  if (market.outcome === null) return null;

  const isWinner = (trade.side === 'YES' && market.outcome === 1) ||
                   (trade.side === 'NO'  && market.outcome === 0);

  if (isWinner) {
    return trade.tokens - trade.amount; // net profit in µALGO
  } else {
    return -trade.amount; // loss in µALGO
  }
}

// Helper function to determine if trade is a winner
function isTradeWinner(trade, market) {
  if (market.outcome === null) return null;
  return (trade.side === 'YES' && market.outcome === 1) ||
         (trade.side === 'NO'  && market.outcome === 0);
}

module.exports = router;
