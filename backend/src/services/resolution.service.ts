/**
 * services/resolution.service.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Core resolution logic for the 2-of-3 multisig market resolution flow.
 *
 * This service:
 *   1. Creates resolution proposals
 *   2. Collects admin signatures
 *   3. Builds and broadcasts multisig transactions
 *   4. Updates market status (RESOLVED → CLOSED)
 *
 * No frontend logic. All outputs are deterministic.
 */

import crypto from 'crypto';
import algosdk from 'algosdk';
import { v4 as uuidv4 } from 'uuid';
import {
  createMultisigAccount,
  signMultisigTransaction,
  appendMultisigSignature,
  buildResolutionTransaction,
  hasReachedThreshold,
  isMultisigSigner,
  MultisigParams,
} from '../algorand/multisig';

const db = require('../db');
const { getAlgodClient } = require('../algorand/client');
const { decryptPrivateKey } = require('../wallet/custodialWallet');

// ── Types ────────────────────────────────────────────────────────────────────

export interface ProposeResolutionInput {
  market_id: string;
  outcome: number;        // 0 = NO, 1 = YES
  evidence: string;
  admin_id: string;
}

export interface SignResolutionInput {
  proposal_id: string;
  admin_id: string;
}

export interface ResolutionProposal {
  id: string;
  market_id: string;
  proposed_outcome: number;
  proposer_admin_id: string;
  signatures_collected: string[];
  multisig_txn_blob: string | null;
  status: string;
  evidence: string;
  resolution_hash: string;
  created_at: number;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Generate a deterministic resolution hash from market_id + outcome + evidence.
 * Used to ensure proposal integrity.
 */
function generateResolutionHash(marketId: string, outcome: number, evidence: string): string {
  const data = `${marketId}:${outcome}:${evidence}`;
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Get the multisig params from the 3 admin accounts stored in DB.
 */
function getMultisigParamsFromDB(): { multisigParams: MultisigParams; multisigAddress: string } {
  const admins = db.getAllAdmins();
  if (admins.length < 3) {
    throw new Error(`Need 3 admin accounts, found ${admins.length}. Run seed-admins first.`);
  }

  // Use the first 3 admins (sorted by id for determinism)
  const sorted = admins.sort((a: any, b: any) => a.id.localeCompare(b.id));
  const addresses = sorted.slice(0, 3).map((a: any) => a.algorand_address);

  return createMultisigAccount(addresses);
}

// ── Service Functions ────────────────────────────────────────────────────────

/**
 * Propose a market resolution.
 *
 * Steps:
 *   1. Validate market exists and is active/expired
 *   2. Validate admin exists
 *   3. Prevent duplicate proposals for same market
 *   4. Build the initial multisig transaction (first signature)
 *   5. Store proposal in DB with status PENDING_SIGNATURES
 *
 * @param input - ProposeResolutionInput
 * @returns The created proposal
 */
export async function proposeResolution(input: ProposeResolutionInput): Promise<ResolutionProposal> {
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
  if (market.status === 'RESOLVED' || market.status === 'CLOSED') {
    throw new Error(`Market already ${market.status}: ${market_id}`);
  }

  // Validate market has expired (cannot resolve before expiry)
  const now = Date.now();
  const expiryMs = typeof market.expiry === 'string' ? new Date(market.expiry).getTime() : market.expiry;
  if (now < expiryMs) {
    throw new Error(`Market has not expired yet. Expiry: ${new Date(expiryMs).toISOString()}`);
  }

  // Validate admin
  const admin = db.getAdminById(admin_id);
  if (!admin) {
    throw new Error(`Admin not found: ${admin_id}`);
  }

  // Check for existing pending proposal for this market
  const existingProposals = db.getProposalsByMarket(market_id);
  const pendingProposal = existingProposals.find((p: any) => p.status === 'PENDING_SIGNATURES');
  if (pendingProposal) {
    throw new Error(`A pending resolution proposal already exists for market ${market_id} (proposal: ${pendingProposal.id})`);
  }

  // Generate resolution hash
  const resolution_hash = generateResolutionHash(market_id, outcome, evidence);

  // Get multisig params
  const { multisigParams, multisigAddress } = getMultisigParamsFromDB();

  // Build the resolution transaction
  let multisigTxnBlob: string | null = null;

  if (market.app_id) {
    // Real on-chain contract: build application call
    const algod = getAlgodClient();
    const suggestedParams = await algod.getTransactionParams().do();

    const txn = buildResolutionTransaction({
      appId: market.app_id,
      outcome,
      multisigAddress,
      suggestedParams,
    });

    // Sign with proposer's key (first signature)
    const adminSk = decryptPrivateKey(admin.encrypted_private_key);
    const signedBlob = signMultisigTransaction(txn, multisigParams, adminSk);

    // Clear key from memory
    adminSk.fill(0);

    // Store as base64
    multisigTxnBlob = Buffer.from(signedBlob).toString('base64');
  }

  // Create proposal in DB
  const proposal = {
    id: uuidv4(),
    market_id,
    proposed_outcome: outcome,
    proposer_admin_id: admin_id,
    signatures_collected: [admin.algorand_address],
    multisig_txn_blob: multisigTxnBlob,
    status: 'PENDING_SIGNATURES',
    evidence,
    resolution_hash,
  };

  db.createProposal(proposal);

  // Update market status to PENDING_RESOLUTION
  db.updateMarket(market_id, { status: 'PENDING_RESOLUTION' });

  console.log(`[Resolution] Proposal ${proposal.id} created for market ${market_id} by admin ${admin_id}`);

  return db.getProposalById(proposal.id);
}

/**
 * Add a second admin signature to a pending resolution proposal.
 *
 * Steps:
 *   1. Validate proposal exists and is pending
 *   2. Validate admin exists and hasn't already signed
 *   3. Append signature to multisig transaction
 *   4. If threshold met: broadcast transaction + resolve market
 *
 * @param input - SignResolutionInput
 * @returns Updated proposal (and market status if resolved)
 */
export async function signResolution(input: SignResolutionInput): Promise<{
  proposal: ResolutionProposal;
  resolved: boolean;
  txId?: string;
}> {
  const { proposal_id, admin_id } = input;

  // Validate proposal
  const proposal = db.getProposalById(proposal_id);
  if (!proposal) {
    throw new Error(`Proposal not found: ${proposal_id}`);
  }
  if (proposal.status !== 'PENDING_SIGNATURES') {
    throw new Error(`Proposal is not pending: status = ${proposal.status}`);
  }

  // Validate admin
  const admin = db.getAdminById(admin_id);
  if (!admin) {
    throw new Error(`Admin not found: ${admin_id}`);
  }

  // Prevent duplicate signatures
  if (proposal.signatures_collected.includes(admin.algorand_address)) {
    throw new Error(`Admin ${admin_id} has already signed this proposal`);
  }

  // Get multisig params
  const { multisigParams, multisigAddress } = getMultisigParamsFromDB();

  // Validate admin is a multisig signer
  if (!isMultisigSigner(admin.algorand_address, multisigParams)) {
    throw new Error(`Admin ${admin_id} is not a multisig signer`);
  }

  // Add signature
  const updatedSignatures = [...proposal.signatures_collected, admin.algorand_address];
  let updatedTxnBlob = proposal.multisig_txn_blob;
  let resolved = false;
  let txId: string | undefined;

  if (proposal.multisig_txn_blob) {
    // Append signature to multisig transaction
    const partialBlob = Uint8Array.from(Buffer.from(proposal.multisig_txn_blob, 'base64'));
    const adminSk = decryptPrivateKey(admin.encrypted_private_key);
    const newBlob = appendMultisigSignature(partialBlob, multisigParams, adminSk);

    // Clear key from memory
    adminSk.fill(0);

    updatedTxnBlob = Buffer.from(newBlob).toString('base64');
  }

  // Check if threshold is met
  if (hasReachedThreshold(updatedSignatures, multisigParams)) {
    // Threshold met — broadcast and resolve
    if (updatedTxnBlob) {
      try {
        const algod = getAlgodClient();
        const signedBytes = Uint8Array.from(Buffer.from(updatedTxnBlob, 'base64'));
        const result = await algod.sendRawTransaction(signedBytes).do();
        txId = result.txId as string;
        await algosdk.waitForConfirmation(algod, txId!, 4);
        console.log(`[Resolution] Multisig transaction confirmed: ${txId}`);
      } catch (broadcastErr: any) {
        console.error('[Resolution] Broadcast failed:', broadcastErr.message);
        // Continue with off-chain resolution for mock mode
      }
    }

    // Resolve the market in DB
    const market = db.getMarketById(proposal.market_id);
    if (market) {
      db.resolveMarket(proposal.market_id, proposal.proposed_outcome, proposal.evidence);
      console.log(`[Resolution] Market ${proposal.market_id} RESOLVED with outcome ${proposal.proposed_outcome}`);

      // Immediately move to CLOSED
      db.closeMarket(proposal.market_id);
      console.log(`[Resolution] Market ${proposal.market_id} moved to CLOSED`);
    }

    // Update proposal status
    db.updateProposal(proposal_id, {
      signatures_collected: updatedSignatures,
      multisig_txn_blob: updatedTxnBlob,
      status: 'EXECUTED',
    });

    resolved = true;
  } else {
    // Not yet at threshold — just update signatures
    db.updateProposal(proposal_id, {
      signatures_collected: updatedSignatures,
      multisig_txn_blob: updatedTxnBlob,
      status: 'PENDING_SIGNATURES',
    });
  }

  const updatedProposal = db.getProposalById(proposal_id);

  return { proposal: updatedProposal, resolved, txId };
}

/**
 * Get all pending resolution proposals.
 */
export function getPendingProposals(): ResolutionProposal[] {
  return db.getPendingProposals();
}

/**
 * Get proposals for a specific market.
 */
export function getProposalsByMarket(marketId: string): ResolutionProposal[] {
  return db.getProposalsByMarket(marketId);
}

/**
 * Get the multisig address derived from the 3 admin accounts.
 */
export function getMultisigAddress(): string {
  const { multisigAddress } = getMultisigParamsFromDB();
  return multisigAddress;
}
