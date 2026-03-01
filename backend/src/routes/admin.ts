/**
 * routes/admin.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Admin-only routes for market resolution governance + UMA Protocol.
 *
 * All routes require JWT + admin role (via requireAdmin middleware).
 *
 * Endpoints:
 *   POST /admin/propose-resolution   — Propose a market resolution (legacy multisig)
 *   POST /admin/sign-resolution      — Co-sign a pending resolution (legacy multisig)
 *   GET  /admin/pending-resolutions  — List pending resolution proposals
 *   GET  /admin/disputed-markets     — List markets with dispute flags
 *   GET  /admin/multisig-address     — Get the 2-of-3 multisig address
 *   GET  /admin/admins               — List all admin accounts (public info)
 *
 *   ── UMA Protocol ──
 *   POST /admin/uma/propose          — Propose resolution via UMA (10-min dispute window)
 *   POST /admin/uma/vote             — Cast vote on disputed resolution
 *   GET  /admin/uma/resolutions      — List all UMA resolutions
 *   GET  /admin/uma/active           — List active (non-locked) UMA resolutions
 *   GET  /admin/uma/resolution/:id   — Get specific UMA resolution with votes
 */

import express, { Request, Response } from 'express';
import { requireAdmin } from '../middleware/adminAuth';
import {
  proposeResolution,
  signResolution,
  getPendingProposals,
  getProposalsByMarket,
  getMultisigAddress,
} from '../services/resolution.service';
import {
  proposeUmaResolution,
  castUmaVote,
  getUmaResolution,
  getUmaVotes,
  getAllUmaResolutions,
  getUmaResolutionsByStatus,
  getDisputeTimeRemaining,
  getVotingTimeRemaining,
  isMarketLocked,
  UmaStatus,
} from '../services/uma.service';

const db = require('../db');

const router = express.Router();

// All admin routes require authentication
router.use(requireAdmin);

// ── POST /admin/propose-resolution ───────────────────────────────────────────

/**
 * Propose a market resolution.
 *
 * Body:
 *   market_id: string     — ID of the market to resolve
 *   outcome: number       — 0 (NO wins) or 1 (YES wins)
 *   evidence: string      — Description + data source for resolution
 *
 * The proposing admin's signature is automatically recorded.
 *
 * NOTE: This is the legacy multisig flow. For UMA Protocol, use /admin/uma/propose.
 */
router.post('/propose-resolution', async (req: Request, res: Response) => {
  try {
    const { market_id, outcome, evidence } = req.body;
    const admin_id = req.admin!.id;

    if (!market_id || outcome === undefined || !evidence) {
      return res.status(400).json({
        error: 'market_id, outcome (0 or 1), and evidence are required',
      });
    }

    // UMA LOCK CHECK: Prevent modification of locked markets
    if (isMarketLocked(market_id)) {
      return res.status(403).json({
        error: 'Market is permanently locked by UMA Protocol. No modifications allowed — not even by admins.',
      });
    }

    const proposal = await proposeResolution({
      market_id,
      outcome: Number(outcome),
      evidence,
      admin_id,
    });

    return res.status(201).json({
      success: true,
      message: 'Resolution proposed. Awaiting second admin signature.',
      proposal: {
        id: proposal.id,
        market_id: proposal.market_id,
        proposed_outcome: proposal.proposed_outcome,
        signatures_collected: proposal.signatures_collected,
        status: proposal.status,
        evidence: proposal.evidence,
        resolution_hash: proposal.resolution_hash,
        created_at: proposal.created_at,
      },
    });
  } catch (err: any) {
    console.error('[admin/propose-resolution]', err.message);
    return res.status(400).json({ error: err.message });
  }
});

// ── POST /admin/sign-resolution ──────────────────────────────────────────────

/**
 * Co-sign a pending resolution proposal.
 *
 * Body:
 *   proposal_id: string   — ID of the pending proposal
 *
 * If this is the 2nd signature (threshold met), the multisig transaction
 * is broadcast and the market is immediately resolved then closed.
 *
 * NOTE: Blocked if market is UMA-locked.
 */
router.post('/sign-resolution', async (req: Request, res: Response) => {
  try {
    const { proposal_id } = req.body;
    const admin_id = req.admin!.id;

    if (!proposal_id) {
      return res.status(400).json({ error: 'proposal_id is required' });
    }

    // Check if the proposal's market is UMA-locked
    const proposal = db.getProposalById ? db.getProposalById(proposal_id) : null;
    if (proposal && isMarketLocked(proposal.market_id)) {
      return res.status(403).json({
        error: 'Market is permanently locked by UMA Protocol. No modifications allowed.',
      });
    }

    const result = await signResolution({ proposal_id, admin_id });

    return res.json({
      success: true,
      resolved: result.resolved,
      txId: result.txId || null,
      message: result.resolved
        ? 'Resolution complete. Market resolved and closed.'
        : 'Signature added. Awaiting additional signatures.',
      proposal: {
        id: result.proposal.id,
        market_id: result.proposal.market_id,
        proposed_outcome: result.proposal.proposed_outcome,
        signatures_collected: result.proposal.signatures_collected,
        status: result.proposal.status,
      },
    });
  } catch (err: any) {
    console.error('[admin/sign-resolution]', err.message);
    return res.status(400).json({ error: err.message });
  }
});

// ── GET /admin/pending-resolutions ───────────────────────────────────────────

/**
 * List all pending resolution proposals across all markets.
 */
router.get('/pending-resolutions', (req: Request, res: Response) => {
  try {
    const proposals = getPendingProposals();
    return res.json({
      success: true,
      count: proposals.length,
      proposals,
    });
  } catch (err: any) {
    console.error('[admin/pending-resolutions]', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ── GET /admin/disputed-markets ──────────────────────────────────────────────

/**
 * List all markets that have been flagged with disputes.
 */
router.get('/disputed-markets', (req: Request, res: Response) => {
  try {
    const markets = db.getDisputedMarkets();
    return res.json({
      success: true,
      count: markets.length,
      markets,
    });
  } catch (err: any) {
    console.error('[admin/disputed-markets]', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ── GET /admin/multisig-address ──────────────────────────────────────────────

/**
 * Get the 2-of-3 multisig address derived from admin accounts.
 */
router.get('/multisig-address', (req: Request, res: Response) => {
  try {
    const address = getMultisigAddress();
    return res.json({
      success: true,
      multisig_address: address,
      threshold: '2-of-3',
    });
  } catch (err: any) {
    console.error('[admin/multisig-address]', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ── GET /admin/admins ────────────────────────────────────────────────────────

/**
 * List all admin accounts (public info only — no keys).
 */
router.get('/admins', (req: Request, res: Response) => {
  try {
    const admins = db.getAllAdmins();
    return res.json({
      success: true,
      count: admins.length,
      admins,
    });
  } catch (err: any) {
    console.error('[admin/admins]', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ── GET /admin/proposals/:market_id ──────────────────────────────────────────

/**
 * Get resolution proposals for a specific market.
 */
router.get('/proposals/:market_id', (req: Request, res: Response) => {
  try {
    const proposals = getProposalsByMarket(req.params.market_id);
    return res.json({
      success: true,
      count: proposals.length,
      proposals,
    });
  } catch (err: any) {
    console.error('[admin/proposals]', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// ██ UMA PROTOCOL ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

// ── POST /admin/uma/propose ──────────────────────────────────────────────────

/**
 * Propose a market resolution via UMA Protocol.
 *
 * Body:
 *   market_id: string     — ID of the market to resolve
 *   outcome: number       — 0 (NO wins) or 1 (YES wins)
 *   evidence: string      — Description + data source for resolution
 *
 * Creates a resolution with a 10-minute dispute window.
 * If no user disputes within 10 minutes, the outcome is auto-locked.
 * No bond required (testnet mode).
 */
router.post('/uma/propose', async (req: Request, res: Response) => {
  try {
    const { market_id, outcome, evidence } = req.body;
    const admin_id = req.admin!.id;

    if (!market_id || outcome === undefined || !evidence) {
      return res.status(400).json({
        error: 'market_id, outcome (0 or 1), and evidence are required',
      });
    }

    // Check if market is permanently locked
    if (isMarketLocked(market_id)) {
      return res.status(403).json({
        error: 'Market is permanently locked by UMA Protocol. No modifications allowed.',
      });
    }

    const resolution = await proposeUmaResolution({
      market_id,
      outcome: Number(outcome),
      evidence,
      admin_id,
    });

    return res.status(201).json({
      success: true,
      message: 'UMA resolution proposed. 10-minute dispute window has started.',
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
      },
      rules: {
        dispute_window: '10 minutes',
        voting_period: '10 minutes (if disputed)',
        bond_required: false,
        reward: 'none (testnet)',
        finality: 'Once locked, outcome is immutable — even admins cannot change it.',
      },
    });
  } catch (err: any) {
    console.error('[admin/uma/propose]', err.message);
    return res.status(400).json({ error: err.message });
  }
});

// ── POST /admin/uma/vote ─────────────────────────────────────────────────────

/**
 * Cast a vote on a disputed UMA resolution (admin only).
 *
 * Body:
 *   resolution_id: string  — ID of the UMA resolution
 *   vote: number           — 0 (NO) or 1 (YES)
 *
 * Each admin gets exactly one vote per resolution.
 * When all admins have voted, the resolution auto-finalizes.
 * After the 10-minute voting period, the scheduler auto-finalizes.
 */
router.post('/uma/vote', async (req: Request, res: Response) => {
  try {
    const { resolution_id, vote } = req.body;
    const admin_id = req.admin!.id;

    if (!resolution_id || vote === undefined) {
      return res.status(400).json({
        error: 'resolution_id and vote (0 or 1) are required',
      });
    }

    const result = await castUmaVote({
      resolution_id,
      admin_id,
      vote: Number(vote),
    });

    return res.json({
      success: true,
      message: `Vote recorded: ${vote === 1 ? 'YES' : 'NO'}`,
      vote: {
        id: result.vote.id,
        resolution_id: result.vote.resolution_id,
        admin_id: result.vote.admin_id,
        vote: result.vote.vote,
      },
      tally: result.tally,
      resolution: {
        id: result.resolution.id,
        market_id: result.resolution.market_id,
        status: result.resolution.status,
        final_outcome: result.resolution.final_outcome,
        is_locked: result.resolution.status === UmaStatus.UMA_LOCKED,
      },
    });
  } catch (err: any) {
    console.error('[admin/uma/vote]', err.message);
    return res.status(400).json({ error: err.message });
  }
});

// ── GET /admin/uma/resolutions ───────────────────────────────────────────────

/**
 * List all UMA resolutions across all markets.
 */
router.get('/uma/resolutions', (req: Request, res: Response) => {
  try {
    const status = req.query.status as string | undefined;
    const resolutions = status
      ? getUmaResolutionsByStatus(status)
      : getAllUmaResolutions();

    return res.json({
      success: true,
      count: resolutions.length,
      resolutions: resolutions.map((r: any) => ({
        ...r,
        dispute_time_remaining_ms: getDisputeTimeRemaining(r.market_id),
        voting_time_remaining_ms: getVotingTimeRemaining(r.market_id),
        is_locked: r.status === UmaStatus.UMA_LOCKED || r.status === UmaStatus.EXPIRED_NO_DISPUTE,
      })),
    });
  } catch (err: any) {
    console.error('[admin/uma/resolutions]', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ── GET /admin/uma/active ────────────────────────────────────────────────────

/**
 * List active (non-locked) UMA resolutions that need attention.
 */
router.get('/uma/active', (req: Request, res: Response) => {
  try {
    const proposed = getUmaResolutionsByStatus(UmaStatus.PROPOSED);
    const voting = getUmaResolutionsByStatus(UmaStatus.UMA_VOTING);
    const active = [...proposed, ...voting];

    return res.json({
      success: true,
      count: active.length,
      resolutions: active.map((r: any) => ({
        ...r,
        dispute_time_remaining_ms: getDisputeTimeRemaining(r.market_id),
        voting_time_remaining_ms: getVotingTimeRemaining(r.market_id),
      })),
    });
  } catch (err: any) {
    console.error('[admin/uma/active]', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ── GET /admin/uma/resolution/:id ────────────────────────────────────────────

/**
 * Get a specific UMA resolution with full vote details.
 */
router.get('/uma/resolution/:id', (req: Request, res: Response) => {
  try {
    const resolution = db.getUmaResolutionById(req.params.id);
    if (!resolution) {
      return res.status(404).json({ error: 'UMA resolution not found' });
    }

    const votes = getUmaVotes(resolution.id);
    const yesVotes = votes.filter((v: any) => v.vote === 1).length;
    const noVotes = votes.filter((v: any) => v.vote === 0).length;

    return res.json({
      success: true,
      resolution: {
        ...resolution,
        dispute_time_remaining_ms: getDisputeTimeRemaining(resolution.market_id),
        voting_time_remaining_ms: getVotingTimeRemaining(resolution.market_id),
        is_locked: resolution.status === UmaStatus.UMA_LOCKED || resolution.status === UmaStatus.EXPIRED_NO_DISPUTE,
        is_immutable: resolution.status === UmaStatus.UMA_LOCKED || resolution.status === UmaStatus.EXPIRED_NO_DISPUTE,
      },
      votes: {
        total: votes.length,
        yes: yesVotes,
        no: noVotes,
        details: votes,
      },
    });
  } catch (err: any) {
    console.error('[admin/uma/resolution]', err.message);
    return res.status(500).json({ error: err.message });
  }
});

export default router;
