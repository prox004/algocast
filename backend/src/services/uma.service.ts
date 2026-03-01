/**
 * services/uma.service.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * UMA (Universal Market Access) Protocol — Dispute Resolution Service
 *
 * Implements an optimistic oracle pattern inspired by UMA Protocol:
 *
 *   1. PROPOSED       — Admin proposes a resolution. 10-min dispute window opens.
 *   2. DISPUTE_WINDOW — Users can raise a dispute within 10 minutes.
 *   3. UMA_VOTING     — If disputed, admin panel votes for 10 minutes.
 *   4. UMA_LOCKED     — Final verdict is permanently locked. Immutable.
 *
 * Rules:
 *   - Testnet mode: No bonds, no rewards
 *   - Dispute must be raised within 10 minutes of proposal
 *   - Voting period is exactly 10 minutes
 *   - Once UMA_LOCKED, nobody (not even admins) can change the outcome
 *   - Admin votes are tallied by simple majority
 *
 * This is the CORE service — routes call into this.
 */

import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';

const db = require('../db');

// ── Constants ────────────────────────────────────────────────────────────────

/** Dispute window duration: 10 minutes in milliseconds */
export const DISPUTE_WINDOW_MS = 10 * 60 * 1000;

/** Voting period duration: 10 minutes in milliseconds */
export const VOTING_PERIOD_MS = 10 * 60 * 1000;

/** UMA Resolution statuses */
export enum UmaStatus {
  PROPOSED = 'PROPOSED',           // Admin proposed, dispute window open
  UMA_VOTING = 'UMA_VOTING',      // Disputed, admin panel voting
  UMA_LOCKED = 'UMA_LOCKED',      // Final verdict locked permanently
  EXPIRED_NO_DISPUTE = 'EXPIRED_NO_DISPUTE', // Dispute window passed, auto-locked
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface UmaResolution {
  id: string;
  market_id: string;
  proposed_outcome: number;       // 0 = NO, 1 = YES
  proposed_by: string;            // admin_id
  evidence: string | null;
  status: string;
  proposed_at: number;
  dispute_window_ends: number;
  voting_ends: number | null;
  locked_at: number | null;
  final_outcome: number | null;
  lock_hash: string | null;
  dispute_reason: string | null;
  disputed_by: string | null;     // user_id
  disputed_at: number | null;
}

export interface UmaVote {
  id: string;
  resolution_id: string;
  admin_id: string;
  vote: number;                   // 0 = NO, 1 = YES
  voted_at: number;
}

export interface ProposeInput {
  market_id: string;
  outcome: number;
  evidence: string;
  admin_id: string;
}

export interface DisputeInput {
  market_id: string;
  user_id: string;
  reason: string;
}

export interface VoteInput {
  resolution_id: string;
  admin_id: string;
  vote: number;                   // 0 = NO, 1 = YES
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Generate a deterministic lock hash for the final verdict.
 * This hash proves the outcome was locked at a specific time and cannot be altered.
 */
function generateLockHash(
  resolutionId: string,
  marketId: string,
  outcome: number,
  lockedAt: number,
): string {
  const data = `UMA_LOCK:${resolutionId}:${marketId}:${outcome}:${lockedAt}`;
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Check if a market's resolution is permanently locked.
 */
export function isMarketLocked(marketId: string): boolean {
  const resolution = db.getUmaResolutionByMarket(marketId);
  return resolution?.status === UmaStatus.UMA_LOCKED ||
         resolution?.status === UmaStatus.EXPIRED_NO_DISPUTE;
}

// ── Core Service Functions ───────────────────────────────────────────────────

/**
 * Propose a market resolution (admin only).
 *
 * Creates a UMA resolution with a 10-minute dispute window.
 * If no one disputes within the window, the resolution auto-finalizes.
 *
 * @param input - ProposeInput
 * @returns The created UMA resolution
 */
export async function proposeUmaResolution(input: ProposeInput): Promise<UmaResolution> {
  const { market_id, outcome, evidence, admin_id } = input;

  // Validate outcome
  if (outcome !== 0 && outcome !== 1) {
    throw new Error('Outcome must be 0 (NO) or 1 (YES)');
  }

  // Validate market
  const market = db.getMarketById(market_id);
  if (!market) {
    throw new Error(`Market not found: ${market_id}`);
  }

  // Check if market is already UMA_LOCKED
  if (market.uma_status === UmaStatus.UMA_LOCKED || market.uma_status === UmaStatus.EXPIRED_NO_DISPUTE) {
    throw new Error(`Market ${market_id} is permanently locked. Cannot modify.`);
  }

  // Check if already has a pending UMA resolution
  const existing = db.getUmaResolutionByMarket(market_id);
  if (existing && (existing.status === UmaStatus.PROPOSED || existing.status === UmaStatus.UMA_VOTING)) {
    throw new Error(`Market ${market_id} already has an active UMA resolution (${existing.id})`);
  }

  // Validate admin
  const admin = db.getAdminById(admin_id);
  if (!admin) {
    throw new Error(`Admin not found: ${admin_id}`);
  }

  const now = Date.now();
  const disputeWindowEnds = now + DISPUTE_WINDOW_MS;

  const resolution: UmaResolution = {
    id: uuidv4(),
    market_id,
    proposed_outcome: outcome,
    proposed_by: admin_id,
    evidence: evidence || null,
    status: UmaStatus.PROPOSED,
    proposed_at: now,
    dispute_window_ends: disputeWindowEnds,
    voting_ends: null,
    locked_at: null,
    final_outcome: null,
    lock_hash: null,
    dispute_reason: null,
    disputed_by: null,
    disputed_at: null,
  };

  db.createUmaResolution(resolution);

  // Update market UMA status
  db.updateMarketUmaStatus(market_id, UmaStatus.PROPOSED);

  console.log(`[UMA] Resolution ${resolution.id} proposed for market ${market_id}`);
  console.log(`[UMA]   Outcome: ${outcome === 1 ? 'YES' : 'NO'}`);
  console.log(`[UMA]   Dispute window ends: ${new Date(disputeWindowEnds).toISOString()}`);

  return db.getUmaResolutionById(resolution.id);
}

/**
 * Raise a dispute against a proposed resolution (any authenticated user).
 *
 * Must be raised within the 10-minute dispute window.
 * Transitions the resolution to UMA_VOTING state with a 10-minute voting period.
 *
 * @param input - DisputeInput
 * @returns Updated UMA resolution
 */
export async function raiseUmaDispute(input: DisputeInput): Promise<UmaResolution> {
  const { market_id, user_id, reason } = input;

  if (!reason || reason.trim().length === 0) {
    throw new Error('Dispute reason is required');
  }

  // Find the active UMA resolution for this market
  const resolution = db.getUmaResolutionByMarket(market_id);
  if (!resolution) {
    throw new Error(`No UMA resolution found for market ${market_id}`);
  }

  // Must be in PROPOSED status
  if (resolution.status !== UmaStatus.PROPOSED) {
    throw new Error(`Cannot dispute: resolution is in ${resolution.status} state`);
  }

  // Check dispute window
  const now = Date.now();
  if (now > resolution.dispute_window_ends) {
    throw new Error('Dispute window has expired. The resolution will be auto-finalized.');
  }

  // Set voting period
  const votingEnds = now + VOTING_PERIOD_MS;

  // Update resolution to UMA_VOTING
  db.updateUmaResolution(resolution.id, {
    status: UmaStatus.UMA_VOTING,
    voting_ends: votingEnds,
    dispute_reason: reason.trim(),
    disputed_by: user_id,
    disputed_at: now,
  });

  // Also create a dispute record in the disputes table for compatibility
  db.createDispute({
    id: uuidv4(),
    market_id,
    user_id,
    reason: `[UMA DISPUTE] ${reason.trim()}`,
  });

  // Update market UMA status
  db.updateMarketUmaStatus(market_id, UmaStatus.UMA_VOTING);

  console.log(`[UMA] Dispute raised on resolution ${resolution.id} by user ${user_id}`);
  console.log(`[UMA]   Reason: ${reason.trim()}`);
  console.log(`[UMA]   Voting ends: ${new Date(votingEnds).toISOString()}`);

  return db.getUmaResolutionById(resolution.id);
}

/**
 * Cast a vote on a disputed resolution (admin only).
 *
 * Each admin gets exactly one vote. Vote is 0 (NO) or 1 (YES).
 *
 * @param input - VoteInput
 * @returns The vote record + current tally
 */
export async function castUmaVote(input: VoteInput): Promise<{
  vote: UmaVote;
  tally: { yes_votes: number; no_votes: number; total_votes: number };
  resolution: UmaResolution;
}> {
  const { resolution_id, admin_id, vote } = input;

  if (vote !== 0 && vote !== 1) {
    throw new Error('Vote must be 0 (NO) or 1 (YES)');
  }

  // Validate resolution
  const resolution = db.getUmaResolutionById(resolution_id);
  if (!resolution) {
    throw new Error(`Resolution not found: ${resolution_id}`);
  }

  // Must be in UMA_VOTING status
  if (resolution.status !== UmaStatus.UMA_VOTING) {
    throw new Error(`Cannot vote: resolution is in ${resolution.status} state`);
  }

  // Check voting window
  const now = Date.now();
  if (resolution.voting_ends && now > resolution.voting_ends) {
    throw new Error('Voting period has ended. The resolution will be auto-finalized.');
  }

  // Validate admin
  const admin = db.getAdminById(admin_id);
  if (!admin) {
    throw new Error(`Admin not found: ${admin_id}`);
  }

  // Check for duplicate vote
  const existingVote = db.getUmaVoteByAdmin(resolution_id, admin_id);
  if (existingVote) {
    throw new Error(`Admin ${admin_id} has already voted on this resolution`);
  }

  // Record vote
  const voteRecord: UmaVote = {
    id: uuidv4(),
    resolution_id,
    admin_id,
    vote,
    voted_at: now,
  };

  db.createUmaVote(voteRecord);

  // Get current tally
  const allVotes = db.getUmaVotesByResolution(resolution_id);
  const yesVotes = allVotes.filter((v: UmaVote) => v.vote === 1).length;
  const noVotes = allVotes.filter((v: UmaVote) => v.vote === 0).length;

  console.log(`[UMA] Vote cast by admin ${admin_id} on resolution ${resolution_id}: ${vote === 1 ? 'YES' : 'NO'}`);
  console.log(`[UMA]   Tally: YES=${yesVotes}, NO=${noVotes}`);

  // Check if all admins have voted → auto-finalize early
  const totalAdmins = db.getAllAdmins().length;
  if (allVotes.length >= totalAdmins) {
    console.log(`[UMA] All ${totalAdmins} admins have voted. Auto-finalizing...`);
    await finalizeVoting(resolution_id);
  }

  return {
    vote: voteRecord,
    tally: { yes_votes: yesVotes, no_votes: noVotes, total_votes: allVotes.length },
    resolution: db.getUmaResolutionById(resolution_id),
  };
}

/**
 * Finalize a UMA resolution after voting period ends.
 *
 * Tallies votes → majority wins → outcome is LOCKED permanently.
 * If tied, the original proposal stands.
 *
 * @param resolutionId - ID of the resolution to finalize
 * @returns The locked resolution
 */
export async function finalizeVoting(resolutionId: string): Promise<UmaResolution> {
  const resolution = db.getUmaResolutionById(resolutionId);
  if (!resolution) {
    throw new Error(`Resolution not found: ${resolutionId}`);
  }

  if (resolution.status === UmaStatus.UMA_LOCKED || resolution.status === UmaStatus.EXPIRED_NO_DISPUTE) {
    throw new Error(`Resolution ${resolutionId} is already locked`);
  }

  const allVotes = db.getUmaVotesByResolution(resolutionId);
  const yesVotes = allVotes.filter((v: UmaVote) => v.vote === 1).length;
  const noVotes = allVotes.filter((v: UmaVote) => v.vote === 0).length;

  // Determine final outcome: majority wins. Tie → original proposal stands.
  let finalOutcome: number;
  if (yesVotes > noVotes) {
    finalOutcome = 1;
  } else if (noVotes > yesVotes) {
    finalOutcome = 0;
  } else {
    // Tie: original proposal stands
    finalOutcome = resolution.proposed_outcome;
  }

  const now = Date.now();
  const lockHash = generateLockHash(resolutionId, resolution.market_id, finalOutcome, now);

  // Lock the resolution permanently
  db.updateUmaResolution(resolutionId, {
    status: UmaStatus.UMA_LOCKED,
    final_outcome: finalOutcome,
    locked_at: now,
    lock_hash: lockHash,
  });

  // Resolve the market with the locked outcome
  db.resolveMarket(resolution.market_id, finalOutcome, resolution.evidence || 'UMA vote resolution');
  db.updateMarketUmaStatus(resolution.market_id, UmaStatus.UMA_LOCKED);

  console.log(`[UMA] Resolution ${resolutionId} LOCKED`);
  console.log(`[UMA]   Final outcome: ${finalOutcome === 1 ? 'YES' : 'NO'}`);
  console.log(`[UMA]   Votes: YES=${yesVotes}, NO=${noVotes}`);
  console.log(`[UMA]   Lock hash: ${lockHash}`);

  return db.getUmaResolutionById(resolutionId);
}

/**
 * Auto-finalize a resolution that had no disputes during the 10-min window.
 *
 * Called by the scheduler when the dispute window expires with no dispute.
 *
 * @param resolutionId - ID of the resolution to auto-lock
 * @returns The locked resolution
 */
export async function autoFinalizeNoDispute(resolutionId: string): Promise<UmaResolution> {
  const resolution = db.getUmaResolutionById(resolutionId);
  if (!resolution) {
    throw new Error(`Resolution not found: ${resolutionId}`);
  }

  if (resolution.status !== UmaStatus.PROPOSED) {
    throw new Error(`Cannot auto-finalize: resolution is in ${resolution.status} state`);
  }

  const now = Date.now();
  const lockHash = generateLockHash(resolutionId, resolution.market_id, resolution.proposed_outcome, now);

  // Lock with proposed outcome (no dispute was raised)
  db.updateUmaResolution(resolutionId, {
    status: UmaStatus.EXPIRED_NO_DISPUTE,
    final_outcome: resolution.proposed_outcome,
    locked_at: now,
    lock_hash: lockHash,
  });

  // Resolve the market
  db.resolveMarket(resolution.market_id, resolution.proposed_outcome, resolution.evidence || 'Auto-finalized (no dispute)');
  db.updateMarketUmaStatus(resolution.market_id, UmaStatus.EXPIRED_NO_DISPUTE);

  console.log(`[UMA] Resolution ${resolutionId} auto-finalized (no dispute)`);
  console.log(`[UMA]   Outcome: ${resolution.proposed_outcome === 1 ? 'YES' : 'NO'}`);
  console.log(`[UMA]   Lock hash: ${lockHash}`);

  return db.getUmaResolutionById(resolutionId);
}

// ── Query Functions ──────────────────────────────────────────────────────────

/**
 * Get the UMA resolution status for a market.
 */
export function getUmaResolution(marketId: string): UmaResolution | null {
  return db.getUmaResolutionByMarket(marketId);
}

/**
 * Get all UMA resolutions by status.
 */
export function getUmaResolutionsByStatus(status: string): UmaResolution[] {
  return db.getUmaResolutionsByStatus(status);
}

/**
 * Get all UMA resolutions.
 */
export function getAllUmaResolutions(): UmaResolution[] {
  return db.getAllUmaResolutions();
}

/**
 * Get votes for a resolution.
 */
export function getUmaVotes(resolutionId: string): UmaVote[] {
  return db.getUmaVotesByResolution(resolutionId);
}

/**
 * Get the time remaining in the dispute window (ms).
 * Returns 0 if expired.
 */
export function getDisputeTimeRemaining(marketId: string): number {
  const resolution = db.getUmaResolutionByMarket(marketId);
  if (!resolution || resolution.status !== UmaStatus.PROPOSED) return 0;
  const remaining = resolution.dispute_window_ends - Date.now();
  return Math.max(0, remaining);
}

/**
 * Get the time remaining in the voting period (ms).
 * Returns 0 if expired or not in voting state.
 */
export function getVotingTimeRemaining(marketId: string): number {
  const resolution = db.getUmaResolutionByMarket(marketId);
  if (!resolution || resolution.status !== UmaStatus.UMA_VOTING || !resolution.voting_ends) return 0;
  const remaining = resolution.voting_ends - Date.now();
  return Math.max(0, remaining);
}

// ── Scheduler: Process Expired Windows ───────────────────────────────────────

/**
 * Process all expired dispute windows and voting periods.
 * Should be called periodically (e.g., every 30 seconds).
 */
export async function processExpiredUmaWindows(): Promise<{
  autoFinalized: number;
  votingFinalized: number;
}> {
  const now = Date.now();
  let autoFinalized = 0;
  let votingFinalized = 0;

  // 1. Auto-finalize resolutions where dispute window expired with no dispute
  const expiredDisputeWindows = db.getExpiredDisputeWindows(now);
  for (const resolution of expiredDisputeWindows) {
    try {
      await autoFinalizeNoDispute(resolution.id);
      autoFinalized++;
    } catch (err: any) {
      console.error(`[UMA Scheduler] Failed to auto-finalize ${resolution.id}:`, err.message);
    }
  }

  // 2. Finalize voting periods that have ended
  const expiredVotingWindows = db.getExpiredVotingWindows(now);
  for (const resolution of expiredVotingWindows) {
    try {
      await finalizeVoting(resolution.id);
      votingFinalized++;
    } catch (err: any) {
      console.error(`[UMA Scheduler] Failed to finalize voting ${resolution.id}:`, err.message);
    }
  }

  if (autoFinalized > 0 || votingFinalized > 0) {
    console.log(`[UMA Scheduler] Processed: ${autoFinalized} auto-finalized, ${votingFinalized} voting finalized`);
  }

  return { autoFinalized, votingFinalized };
}

// ── Scheduler Interval ───────────────────────────────────────────────────────

let schedulerInterval: NodeJS.Timeout | null = null;

/**
 * Start the UMA scheduler that processes expired windows every 30 seconds.
 */
export function startUmaScheduler(): void {
  if (schedulerInterval) {
    console.log('[UMA Scheduler] Already running');
    return;
  }

  console.log('[UMA Scheduler] Starting (interval: 30s)');
  schedulerInterval = setInterval(async () => {
    try {
      await processExpiredUmaWindows();
    } catch (err: any) {
      console.error('[UMA Scheduler] Error:', err.message);
    }
  }, 30_000); // Every 30 seconds
}

/**
 * Stop the UMA scheduler.
 */
export function stopUmaScheduler(): void {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    console.log('[UMA Scheduler] Stopped');
  }
}
