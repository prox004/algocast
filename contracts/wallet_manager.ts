/**
 * wallet_manager.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * CastAlgo — Custodial Wallet Manager (Dev A)
 *
 * Responsibilities (per context.md):
 *  - Generate Algorand keypairs
 *  - AES-256-CBC encrypt / decrypt private keys
 *  - Build + sign atomic transaction groups:
 *      • buy_yes / buy_no  (payment + ABI app call)
 *      • claim             (ABI app call)
 *      • withdraw          (payment)
 *  - Broadcast signed transactions and wait for confirmation
 *
 * Security contract (context.md §Security Rules):
 *  - Encrypted key stored at rest; plain key ONLY lives inside sign functions
 *  - Never log secretKey or mnemonic
 *  - All amounts validated > 0 before signing
 *  - Balance check done by caller (routes/wallet.js) before invoking sign*
 *
 * Integration contract (context.md §Wallet Manager):
 *  import { generateWallet, encryptKey, decryptKey,
 *           signBuyGroup, signClaim, signWithdraw, broadcast } from './wallet_manager'
 */

import algosdk from 'algosdk';
import crypto from 'crypto';
import * as path from 'path';

let contractJson: algosdk.ABIContractParams;
try {
  contractJson = require('./build/contract.json');
} catch (err) {
  throw new Error('contract.json not found. Run app.py to generate it.');
}

// ── Config (read from process.env) ───────────────────────────────────────────

const ALGOD_URL   = process.env.ALGORAND_ALGOD_URL   ?? 'https://testnet-api.algonode.cloud';
const ALGOD_TOKEN = process.env.ALGORAND_ALGOD_TOKEN  ?? '';
const ALGOD_PORT  = '';

const ALGORITHM  = 'aes-256-cbc';
const IV_BYTES   = 16;
const CONFIRM_ROUNDS = 4;

// ── Derived AES key (singleton) ───────────────────────────────────────────────

function getDerivedKey(): Buffer {
  const secret = process.env.WALLET_ENCRYPTION_SECRET ?? '';
  if (secret.length < 32) {
    throw new Error('WALLET_ENCRYPTION_SECRET must be ≥ 32 characters');
  }
  return crypto.createHash('sha256').update(secret).digest();
}

// ── Algod client (singleton) ──────────────────────────────────────────────────

let _algod: algosdk.Algodv2 | null = null;

function getAlgod(): algosdk.Algodv2 {
  if (!_algod) _algod = new algosdk.Algodv2(ALGOD_TOKEN, ALGOD_URL, ALGOD_PORT);
  return _algod;
}

// ── ABI contract (singleton) ──────────────────────────────────────────────────

let _contract: algosdk.ABIContract | null = null;

function getContract(): algosdk.ABIContract {
  if (!_contract) _contract = new algosdk.ABIContract(contractJson as algosdk.ABIContractParams);
  return _contract;
}

function getMethod(name: string): algosdk.ABIMethod {
  const contract = getContract();
  const method = contract.methods.find((m) => m.name === name);
  if (!method) throw new Error(`ABI method "${name}" not found in contract.json`);
  return method;
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 1 — Key management
// ─────────────────────────────────────────────────────────────────────────────

export interface WalletInfo {
  address: string;
  encryptedKey: string;   // "<iv_hex>:<ciphertext_hex>"  — safe to store in DB
}

/**
 * Generate a new custodial Algorand wallet.
 * Returns the public address and the AES-encrypted private key.
 * The plain secret key is NEVER returned or stored.
 */
export function generateWallet(): WalletInfo {
  const acct = algosdk.generateAccount();
  const skHex = Buffer.from(acct.sk).toString('hex');
  return {
    address: acct.addr,
    encryptedKey: encryptKey(skHex),
  };
}

/**
 * Encrypt a private key hex string.
 * Storage format: "<iv_hex>:<ciphertext_hex>"
 */
export function encryptKey(privateKeyHex: string): string {
  const key = getDerivedKey();
  const iv  = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const ct = Buffer.concat([cipher.update(Buffer.from(privateKeyHex, 'utf8')), cipher.final()]);
  return `${iv.toString('hex')}:${ct.toString('hex')}`;
}

/**
 * Decrypt stored key back to a Uint8Array secretKey.
 * ONLY call this inside transaction-signing functions.
 * Do NOT log or expose the result.
 */
export function decryptKey(stored: string): Uint8Array {
  const [ivHex, ctHex] = stored.split(':');
  if (!ivHex || !ctHex) throw new Error('Invalid encrypted key format');
  const key      = getDerivedKey();
  const iv       = Buffer.from(ivHex, 'hex');
  const ct       = Buffer.from(ctHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  const plain    = Buffer.concat([decipher.update(ct), decipher.final()]);
  return Uint8Array.from(Buffer.from(plain.toString('utf8'), 'hex'));
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 2 — Transaction building + signing
// ─────────────────────────────────────────────────────────────────────────────

export interface BuyGroupParams {
  /** Buyer's custodial Algorand address */
  fromAddress: string;
  /** AES-encrypted private key of the buyer */
  encryptedKey: string;
  /** App ID of the deployed market contract */
  appId: number;
  /** Contract account address (= algosdk.getApplicationAddress(appId)) */
  appAddress: string;
  /** YES ASA ID (from market record) */
  yesAsaId: number;
  /** NO ASA ID (from market record) */
  noAsaId: number;
  /** microAlgos to spend */
  amountMicroAlgos: number;
  /** 'YES' or 'NO' */
  side: 'YES' | 'NO';
}

/**
 * Build, sign, and return a buy atomic group: [PaymentTxn, ApplicationCallTxn].
 * The payment goes to the contract; the app call triggers token issuance.
 *
 * Returns an array of Uint8Array (signed txns) ready for broadcast.
 */
export async function signBuyGroup(params: BuyGroupParams): Promise<Uint8Array[]> {
  const {
    fromAddress, encryptedKey, appId, appAddress,
    yesAsaId, noAsaId, amountMicroAlgos, side,
  } = params;

  if (amountMicroAlgos <= 0) throw new Error('amountMicroAlgos must be > 0');

  const algod  = getAlgod();
  const sp     = await algod.getTransactionParams().do();
  sp.fee       = 2000;   // covers outer txn + 1 inner (ASA send)
  sp.flatFee   = true;

  const methodName = side === 'YES' ? 'buy_yes' : 'buy_no';
  const asaId      = side === 'YES' ? yesAsaId  : noAsaId;

  // txn[0]: Payment — user → contract
  const payTxn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
    from:              fromAddress,
    to:                appAddress,
    amount:            amountMicroAlgos,
    suggestedParams:   { ...sp, fee: 1000 },
  });

  // txn[1]: Application call — buy_yes / buy_no
  const appCallTxn = algosdk.makeApplicationCallTxnFromObject({
    from:            fromAddress,
    appIndex:        appId,
    onComplete:      algosdk.OnApplicationComplete.NoOpOC,
    appArgs: [
      algosdk.encodeUint64(0),   // ABI method selector placeholder — overwritten below
    ],
    foreignAssets: [asaId],
    suggestedParams: { ...sp, fee: 2000 },
  });

  // Build ABI-encoded app call using AtomicTransactionComposer
  const atc    = new algosdk.AtomicTransactionComposer();
  const sk     = decryptKey(encryptedKey);
  const signer = makeBasicSigner(sk);

  atc.addTransaction({ txn: payTxn, signer });

  atc.addMethodCall({
    appID:       appId,
    method:      getMethod(methodName),
    methodArgs:  [{ txn: payTxn, signer }],   // pass pay txn as ABI arg
    sender:      fromAddress,
    suggestedParams: { ...sp, fee: 2000 },
    signer,
    appForeignAssets: [asaId],
  });

  const built = atc.buildGroup();
  // Note: buildGroup() already assigns group IDs — do NOT call assignGroupID again.
  const signed = built.map((b) => b.txn.signTxn(sk));

  // Wipe sk immediately
  sk.fill(0);

  return signed;
}


export interface ClaimParams {
  /** Claimant's custodial address */
  fromAddress: string;
  encryptedKey: string;
  appId: number;
  /** Winning ASA ID */
  winningAsaId: number;
}

/**
 * Build, sign, and return the claim application call.
 * The contract handles burning + payout internally via inner transactions.
 */
export async function signClaim(params: ClaimParams): Promise<Uint8Array[]> {
  const { fromAddress, encryptedKey, appId, winningAsaId } = params;

  const algod = getAlgod();
  const sp    = await algod.getTransactionParams().do();
  sp.fee      = 4000;   // outer + up to 3 inner txns (clawback + payment + possible overhead)
  sp.flatFee  = true;

  const sk     = decryptKey(encryptedKey);
  const signer = makeBasicSigner(sk);
  const atc    = new algosdk.AtomicTransactionComposer();

  atc.addMethodCall({
    appID:          appId,
    method:         getMethod('claim'),
    methodArgs:     [],
    sender:         fromAddress,
    suggestedParams: sp,
    signer,
    appForeignAssets:  [winningAsaId],
  });

  const built  = atc.buildGroup();
  const signed = built.map((b) => b.txn.signTxn(sk));

  sk.fill(0);
  return signed;
}


export interface WithdrawParams {
  /** Sender's custodial Algorand address */
  fromAddress: string;
  encryptedKey: string;
  /** External destination address */
  toAddress: string;
  amountMicroAlgos: number;
}

/**
 * Build, sign, and return a single payment transaction for withdrawal.
 * Caller MUST verify user.balance >= amountMicroAlgos BEFORE calling this.
 */
export async function signWithdraw(params: WithdrawParams): Promise<Uint8Array> {
  const { fromAddress, encryptedKey, toAddress, amountMicroAlgos } = params;

  if (amountMicroAlgos <= 0) throw new Error('amountMicroAlgos must be > 0');

  const algod = getAlgod();
  const sp    = await algod.getTransactionParams().do();
  sp.fee      = 1000;
  sp.flatFee  = true;

  const txn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
    from:            fromAddress,
    to:              toAddress,
    amount:          amountMicroAlgos,
    suggestedParams: sp,
  });

  const sk     = decryptKey(encryptedKey);
  const signed = txn.signTxn(sk);
  sk.fill(0);

  return signed;
}


/**
 * Build, sign, and return an opt-in transaction for an ASA.
 * Users must opt in before receiving YES/NO tokens on-chain.
 * In the custodial model the backend does this for users automatically.
 */
export async function signAsaOptIn(params: {
  fromAddress: string;
  encryptedKey: string;
  asaId: number;
}): Promise<Uint8Array> {
  const { fromAddress, encryptedKey, asaId } = params;

  const algod = getAlgod();
  const sp    = await algod.getTransactionParams().do();
  sp.fee      = 1000;
  sp.flatFee  = true;

  // Opt-in = AssetTransfer where sender == receiver, amount = 0
  const txn = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
    from:            fromAddress,
    to:              fromAddress,
    assetIndex:      asaId,
    amount:          0,
    suggestedParams: sp,
  });

  const sk     = decryptKey(encryptedKey);
  const signed = txn.signTxn(sk);
  sk.fill(0);

  return signed;
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 3 — Broadcast
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Broadcast one or more signed transactions and wait for confirmation.
 * For atomic groups, pass all signed txns in order.
 * Returns the confirmed txid.
 */
export async function broadcast(signedTxns: Uint8Array | Uint8Array[]): Promise<string> {
  const algod   = getAlgod();
  const payload = Array.isArray(signedTxns) ? signedTxns : [signedTxns];

  const { txId } = await algod.sendRawTransaction(payload).do();
  await algosdk.waitForConfirmation(algod, txId, CONFIRM_ROUNDS);
  return txId;
}

/**
 * Check the ALGO balance of an address on-chain.
 * Returns microAlgos or 0 if account not found.
 */
export async function getOnChainBalance(address: string): Promise<number> {
  const algod = getAlgod();
  try {
    const info = await algod.accountInformation(address).do();
    return info.amount as number;
  } catch {
    return 0;
  }
}

/**
 * Check the holding of a specific ASA for an address.
 * Returns { holds: boolean, balance: number }.
 */
export async function getAsaBalance(address: string, asaId: number): Promise<{ holds: boolean; balance: number }> {
  const algod = getAlgod();
  try {
    const info    = await algod.accountInformation(address).do();
    const holding = (info['assets'] as Array<{ 'asset-id': number; amount: number }>)
      ?.find((a) => a['asset-id'] === asaId);
    if (!holding) return { holds: false, balance: 0 };
    return { holds: true, balance: holding.amount };
  } catch {
    return { holds: false, balance: 0 };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeBasicSigner(sk: Uint8Array): algosdk.TransactionSigner {
  return async (txnGroup: algosdk.Transaction[], indices: number[]) => {
    return indices.map((i) => txnGroup[i].signTxn(sk));
  };
}
