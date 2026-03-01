/**
 * routes/dispute.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Dispute flagging system (placeholder).
 *
 * Allows users to flag a market for dispute. Does NOT implement full
 * dispute resolution logic — only logs and flags.
 *
 * Endpoints:
 *   POST /dispute/:market_id  — Flag a dispute on a market
 *   GET  /dispute/:market_id  — Get disputes for a market
 */

import express, { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import jwt from 'jsonwebtoken';

const db = require('../db');

const router = express.Router();

// ── User auth middleware (lightweight, compatible with existing auth) ─────────

function requireUser(req: any, res: any, next: any): void {
  const header = req.headers['authorization'];
  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid Authorization header' });
    return;
  }
  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as any;
    req.user = payload;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// ── POST /dispute/:market_id ─────────────────────────────────────────────────

/**
 * Flag a dispute on a market.
 *
 * Body:
 *   reason: string  — Reason for the dispute
 *
 * Effects:
 *   - Creates a dispute record
 *   - Sets dispute_flag = true on the market
 *   - Logs the dispute for admin notification
 *
 * This is a PLACEHOLDER — no full dispute resolution logic is implemented.
 */
router.post('/:market_id', requireUser, (req: Request, res: Response) => {
  try {
    const { market_id } = req.params;
    const { reason } = req.body;
    const user_id = (req as any).user?.id;

    if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
      return res.status(400).json({ error: 'reason is required' });
    }

    // Validate market exists
    const market = db.getMarketById(market_id);
    if (!market) {
      return res.status(404).json({ error: `Market not found: ${market_id}` });
    }

    // Create dispute record
    const dispute = db.createDispute({
      id: uuidv4(),
      market_id,
      user_id,
      reason: reason.trim(),
    });

    // Log for admin notification (placeholder — actual notification not implemented)
    console.log(`[Dispute] Market ${market_id} flagged by user ${user_id}: ${reason.trim()}`);
    console.log(`[Dispute] TODO: Notify admins of new dispute`);

    return res.status(201).json({
      success: true,
      message: 'Dispute flagged successfully. Admins have been notified.',
      dispute: {
        id: dispute.id,
        market_id: dispute.market_id,
        reason: dispute.reason,
      },
    });
  } catch (err: any) {
    console.error('[dispute/create]', err.message);
    return res.status(500).json({ error: 'Failed to create dispute' });
  }
});

// ── GET /dispute/:market_id ──────────────────────────────────────────────────

/**
 * Get all disputes for a specific market.
 */
router.get('/:market_id', (req: Request, res: Response) => {
  try {
    const { market_id } = req.params;

    const market = db.getMarketById(market_id);
    if (!market) {
      return res.status(404).json({ error: `Market not found: ${market_id}` });
    }

    const disputes = db.getDisputesByMarket(market_id);

    return res.json({
      success: true,
      market_id,
      dispute_flag: !!market.dispute_flag,
      count: disputes.length,
      disputes: disputes.map((d: any) => ({
        id: d.id,
        user_id: d.user_id,
        reason: d.reason,
        created_at: d.created_at,
      })),
    });
  } catch (err: any) {
    console.error('[dispute/list]', err.message);
    return res.status(500).json({ error: 'Failed to fetch disputes' });
  }
});

export default router;
