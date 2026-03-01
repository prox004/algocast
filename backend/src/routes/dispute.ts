/**
 * routes/dispute.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * UMA Protocol Dispute System
 *
 * Allows users to:
 *   - Raise UMA disputes against proposed resolutions (within 10-min window)
 *   - View UMA resolution status for a market
 *   - View dispute/voting time remaining
 *
 * Endpoints:
 *   POST /dispute/:market_id          — Raise a UMA dispute
 *   GET  /dispute/:market_id          — Get disputes for a market
 *   GET  /dispute/:market_id/uma      — Get UMA resolution status
 *   GET  /dispute/:market_id/time     — Get time remaining in current window
 */

import express, { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import {
  raiseUmaDispute,
  getUmaResolution,
  getUmaVotes,
  getDisputeTimeRemaining,
  getVotingTimeRemaining,
  UmaStatus,
} from '../services/uma.service';

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
 * Raise a UMA dispute on a market's proposed resolution.
 *
 * Body:
 *   reason: string  — Reason for the dispute
 *
 * Rules:
 *   - Market must have a PROPOSED UMA resolution
 *   - Must be within the 10-minute dispute window
 *   - No bond required (testnet mode)
 *   - Transitions resolution to UMA_VOTING state
 */
router.post('/:market_id', requireUser, async (req: Request, res: Response) => {
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

    // Raise the UMA dispute
    const resolution = await raiseUmaDispute({
      market_id,
      user_id,
      reason: reason.trim(),
    });

    console.log(`[UMA Dispute] Market ${market_id} disputed by user ${user_id}: ${reason.trim()}`);

    return res.status(201).json({
      success: true,
      message: 'UMA dispute raised. Admin voting period has started (10 minutes).',
      uma_resolution: {
        id: resolution.id,
        market_id: resolution.market_id,
        proposed_outcome: resolution.proposed_outcome,
        status: resolution.status,
        dispute_reason: resolution.dispute_reason,
        disputed_by: resolution.disputed_by,
        voting_ends: resolution.voting_ends,
        voting_time_remaining_ms: resolution.voting_ends ? resolution.voting_ends - Date.now() : 0,
      },
    });
  } catch (err: any) {
    console.error('[dispute/create]', err.message);
    const statusCode = err.message.includes('not found') ? 404 :
                       err.message.includes('expired') ? 410 :
                       err.message.includes('Cannot dispute') ? 409 : 400;
    return res.status(statusCode).json({ error: err.message });
  }
});

// ── GET /dispute/:market_id ──────────────────────────────────────────────────

/**
 * Get all disputes for a specific market (legacy + UMA).
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

// ── GET /dispute/:market_id/uma ──────────────────────────────────────────────

/**
 * Get UMA resolution status for a market.
 * Includes full resolution details, votes, and time windows.
 */
router.get('/:market_id/uma', (req: Request, res: Response) => {
  try {
    const { market_id } = req.params;

    const market = db.getMarketById(market_id);
    if (!market) {
      return res.status(404).json({ error: `Market not found: ${market_id}` });
    }

    const resolution = getUmaResolution(market_id);
    if (!resolution) {
      return res.json({
        success: true,
        market_id,
        uma_active: false,
        uma_resolution: null,
      });
    }

    // Get votes if in voting state or locked
    const votes = resolution.status === UmaStatus.UMA_VOTING || 
                  resolution.status === UmaStatus.UMA_LOCKED
      ? getUmaVotes(resolution.id)
      : [];

    const yesVotes = votes.filter((v: any) => v.vote === 1).length;
    const noVotes = votes.filter((v: any) => v.vote === 0).length;

    return res.json({
      success: true,
      market_id,
      uma_active: true,
      uma_resolution: {
        id: resolution.id,
        market_id: resolution.market_id,
        proposed_outcome: resolution.proposed_outcome,
        proposed_by: resolution.proposed_by,
        evidence: resolution.evidence,
        status: resolution.status,
        proposed_at: resolution.proposed_at,
        dispute_window_ends: resolution.dispute_window_ends,
        dispute_time_remaining_ms: getDisputeTimeRemaining(market_id),
        voting_ends: resolution.voting_ends,
        voting_time_remaining_ms: getVotingTimeRemaining(market_id),
        locked_at: resolution.locked_at,
        final_outcome: resolution.final_outcome,
        lock_hash: resolution.lock_hash,
        dispute_reason: resolution.dispute_reason,
        disputed_by: resolution.disputed_by,
        disputed_at: resolution.disputed_at,
        votes: {
          total: votes.length,
          yes: yesVotes,
          no: noVotes,
          details: votes.map((v: any) => ({
            admin_id: v.admin_id,
            vote: v.vote,
            voted_at: v.voted_at,
          })),
        },
        is_locked: resolution.status === UmaStatus.UMA_LOCKED || 
                   resolution.status === UmaStatus.EXPIRED_NO_DISPUTE,
        is_immutable: resolution.status === UmaStatus.UMA_LOCKED || 
                      resolution.status === UmaStatus.EXPIRED_NO_DISPUTE,
      },
    });
  } catch (err: any) {
    console.error('[dispute/uma]', err.message);
    return res.status(500).json({ error: 'Failed to fetch UMA status' });
  }
});

// ── GET /dispute/:market_id/time ─────────────────────────────────────────────

/**
 * Get time remaining for the current UMA window.
 * Returns dispute window time if in PROPOSED state, voting time if in UMA_VOTING.
 */
router.get('/:market_id/time', (req: Request, res: Response) => {
  try {
    const { market_id } = req.params;

    const resolution = getUmaResolution(market_id);
    if (!resolution) {
      return res.json({
        success: true,
        market_id,
        phase: null,
        time_remaining_ms: 0,
      });
    }

    let phase: string;
    let timeRemainingMs: number;

    if (resolution.status === UmaStatus.PROPOSED) {
      phase = 'DISPUTE_WINDOW';
      timeRemainingMs = getDisputeTimeRemaining(market_id);
    } else if (resolution.status === UmaStatus.UMA_VOTING) {
      phase = 'VOTING';
      timeRemainingMs = getVotingTimeRemaining(market_id);
    } else {
      phase = 'LOCKED';
      timeRemainingMs = 0;
    }

    return res.json({
      success: true,
      market_id,
      phase,
      time_remaining_ms: timeRemainingMs,
      time_remaining_formatted: formatDuration(timeRemainingMs),
      status: resolution.status,
    });
  } catch (err: any) {
    console.error('[dispute/time]', err.message);
    return res.status(500).json({ error: 'Failed to fetch time remaining' });
  }
});

function formatDuration(ms: number): string {
  if (ms <= 0) return '0:00';
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export default router;
