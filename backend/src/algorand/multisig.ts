/**
 * algorand/multisig.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Algorand 2-of-3 Multisignature account setup and transaction utilities.
 *
 * Uses algosdk multisig primitives:
 *   - createMultisigTransaction
 *   - appendSignMultisigTransaction
 *   - mergeMultisigTransactions
 *
 * The multisig address is deterministic: given the same 3 admin addresses
 * (sorted), the same multisig address is always produced.
 */

import algosdk from 'algosdk';

// ── Constants ────────────────────────────────────────────────────────────────

/** Multisig version (always 1 for Algorand) */
export const MULTISIG_VERSION = 1;

/** Threshold: 2 of 3 admins required */
export const MULTISIG_THRESHOLD = 2;

/** Total number of admin signers */
export const MULTISIG_TOTAL = 3;

// ── Types ────────────────────────────────────────────────────────────────────

export interface MultisigParams {
  version: number;
  threshold: number;
  addrs: string[];
}

export interface MultisigSetupResult {
  multisigAddress: string;
  multisigParams: MultisigParams;
}

export interface SignedMultisigResult {
  signedBlob: Uint8Array;
  signerAddress: string;
}

// ── Multisig Account Setup ───────────────────────────────────────────────────

/**
 * Create a deterministic 2-of-3 multisig account from 3 admin Algorand addresses.
 *
 * @param adminAddresses - Array of exactly 3 Algorand public addresses
 * @returns MultisigSetupResult with the derived multisig address and params
 * @throws Error if not exactly 3 addresses provided
 */
export function createMultisigAccount(adminAddresses: string[]): MultisigSetupResult {
  if (adminAddresses.length !== MULTISIG_TOTAL) {
    throw new Error(`Exactly ${MULTISIG_TOTAL} admin addresses required, got ${adminAddresses.length}`);
  }

  // Validate all addresses
  for (const addr of adminAddresses) {
    if (!algosdk.isValidAddress(addr)) {
      throw new Error(`Invalid Algorand address: ${addr}`);
    }
  }

  const multisigParams: MultisigParams = {
    version: MULTISIG_VERSION,
    threshold: MULTISIG_THRESHOLD,
    addrs: adminAddresses,
  };

  const multisigAddress = algosdk.multisigAddress(multisigParams);

  return {
    multisigAddress,
    multisigParams,
  };
}

// ── Transaction Signing ──────────────────────────────────────────────────────

/**
 * Create and sign a multisig transaction with the first signer's key.
 * This is the initial signature step in a 2-of-3 flow.
 *
 * @param txn - The unsigned Algorand transaction
 * @param multisigParams - The multisig parameters (version, threshold, addrs)
 * @param signerSk - The secret key of the first signer (Uint8Array, 64 bytes)
 * @returns The partially-signed multisig transaction blob
 */
export function signMultisigTransaction(
  txn: algosdk.Transaction,
  multisigParams: MultisigParams,
  signerSk: Uint8Array
): Uint8Array {
  const { blob } = algosdk.signMultisigTransaction(txn, multisigParams, signerSk);
  return blob;
}

/**
 * Append a second (or third) signature to an existing partially-signed
 * multisig transaction blob.
 *
 * @param partialBlob - The partially-signed multisig transaction
 * @param multisigParams - The multisig parameters
 * @param signerSk - The secret key of the next signer
 * @returns The updated multisig transaction blob with the new signature
 */
export function appendMultisigSignature(
  partialBlob: Uint8Array,
  multisigParams: MultisigParams,
  signerSk: Uint8Array
): Uint8Array {
  const { blob } = algosdk.appendSignMultisigTransaction(partialBlob, multisigParams, signerSk);
  return blob;
}

/**
 * Merge multiple partially-signed multisig transaction blobs into one.
 * Useful when signatures are collected independently.
 *
 * @param blobs - Array of partially-signed multisig transaction blobs
 * @returns Merged multisig transaction blob
 */
export function mergeMultisigSignatures(blobs: Uint8Array[]): Uint8Array {
  return algosdk.mergeMultisigTransactions(blobs);
}

// ── Verification ─────────────────────────────────────────────────────────────

/**
 * Verify that an address is one of the multisig signers.
 *
 * @param address - Address to check
 * @param multisigParams - Multisig parameters
 * @returns true if the address is a valid signer
 */
export function isMultisigSigner(address: string, multisigParams: MultisigParams): boolean {
  return multisigParams.addrs.includes(address);
}

/**
 * Count the number of valid signatures collected so far.
 *
 * @param signatures - Array of signer addresses that have signed
 * @param multisigParams - Multisig parameters
 * @returns Number of valid unique signatures
 */
export function countValidSignatures(signatures: string[], multisigParams: MultisigParams): number {
  const unique = new Set(signatures.filter(s => multisigParams.addrs.includes(s)));
  return unique.size;
}

/**
 * Check if the threshold has been met (2 of 3).
 *
 * @param signatures - Array of signer addresses that have signed
 * @param multisigParams - Multisig parameters
 * @returns true if threshold is met
 */
export function hasReachedThreshold(signatures: string[], multisigParams: MultisigParams): boolean {
  return countValidSignatures(signatures, multisigParams) >= multisigParams.threshold;
}

// ── Build Resolution Transaction ─────────────────────────────────────────────

/**
 * Build an unsigned application call transaction to invoke resolve_market
 * on a deployed smart contract. The transaction sender is the multisig address.
 *
 * @param params.appId - The smart contract application ID
 * @param params.outcome - 0 (NO wins) or 1 (YES wins)
 * @param params.multisigAddress - The multisig sender address
 * @param params.suggestedParams - Algorand suggested transaction params
 * @returns Unsigned Transaction object ready for multisig signing
 */
export function buildResolutionTransaction(params: {
  appId: number;
  outcome: number;
  multisigAddress: string;
  suggestedParams: algosdk.SuggestedParams;
}): algosdk.Transaction {
  const { appId, outcome, multisigAddress, suggestedParams } = params;

  if (outcome !== 0 && outcome !== 1) {
    throw new Error('Outcome must be 0 (NO) or 1 (YES)');
  }

  // Build ABI method call for resolve_market(uint64)
  // Using a raw application call with ABI encoding
  const abiMethod = new algosdk.ABIMethod({
    name: 'resolve_market',
    args: [{ type: 'uint64', name: 'outcome' }],
    returns: { type: 'void' },
  });

  const encodedArgs = [
    abiMethod.getSelector(),
    algosdk.ABIType.from('uint64').encode(outcome),
  ];

  const txn = algosdk.makeApplicationNoOpTxnFromObject({
    from: multisigAddress,
    appIndex: appId,
    appArgs: encodedArgs,
    suggestedParams,
  });

  return txn;
}
