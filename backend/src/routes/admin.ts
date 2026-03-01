/**
 * routes/admin.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Admin-only routes for market resolution governance.
 *
 * All routes require JWT + admin role (via requireAdmin middleware).
 *
 * Endpoints:
 *   POST /admin/propose-resolution   — Propose a market resolution
 *   POST /admin/sign-resolution      — Co-sign a pending resolution
 *   GET  /admin/pending-resolutions  — List pending resolution proposals
 *   GET  /admin/disputed-markets     — List markets with dispute flags
 *   GET  /admin/multisig-address     — Get the 2-of-3 multisig address
 *   GET  /admin/admins               — List all admin accounts (public info)
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
 */
router.post('/sign-resolution', async (req: Request, res: Response) => {
  try {
    const { proposal_id } = req.body;
    const admin_id = req.admin!.id;

    if (!proposal_id) {
      return res.status(400).json({ error: 'proposal_id is required' });
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

export default router;
