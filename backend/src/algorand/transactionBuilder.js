/**
 * algorand/transactionBuilder.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Backend transaction builder for CastAlgo custodial operations.
 * CommonJS counterpart to contracts/wallet_manager.ts.
 *
 * This module builds, signs, and (optionally) broadcasts:
 *   • buyGroup(side, params)   → signed atomic [pay + app-call]
 *   • claimTxn(params)         → signed app-call (claim winnings)
 *   • withdrawTxn(params)      → signed payment txn
 *   • optInAsaTxn(params)      → signed ASA opt-in
 *   • broadcast(signedTxns)    → txid after confirmation
 *
 * Contract state: when a market is deployed on-chain (app_id in DB),
 * these functions build real ARC-4 calls.  When app_id is null (hackathon
 * mock mode), the routes fall back to in-memory accounting.
 *
 * Depends on: custodialWallet.js (decrypt), algorand/client.js (algod)
 */

const algosdk = require('algosdk');
const path = require('path');
const { decryptPrivateKey } = require('../wallet/custodialWallet');
const { normalizeAddress } = require('../wallet/custodialWallet');
const { getAlgodClient } = require('./client');

// ── ABI contract (lazy-loaded from compiled JSON) ──────────────────────────────

let _contract = null;

function getAbiContract() {
  if (_contract) return _contract;
  try {
    const jsonPath = path.resolve(__dirname, '../../../contracts/build/contract.json');
    const json = require(jsonPath);
    _contract = new algosdk.ABIContract(json);
    return _contract;
  } catch {
    // Contract not yet compiled — build will succeed; routes fall back to mock mode
    return null;
  }
}

function getMethod(name) {
  const contract = getAbiContract();
  if (!contract) throw new Error('ABI contract not compiled. Run: python contracts/app.py');
  const method = contract.methods.find((m) => m.name === name);
  if (!method) throw new Error(`ABI method "${name}" not found`);
  return method;
}

// ── Signer helper ──────────────────────────────────────────────────────────────

function makeSigner(sk) {
  return async (txnGroup, indices) =>
    indices.map((i) => txnGroup[i].signTxn(sk));
}

// ── Broadcast ──────────────────────────────────────────────────────────────────

/**
 * Send one or more signed transactions and wait for confirmation.
 * @param {Uint8Array | Uint8Array[]} signedTxns
 * @returns {Promise<string>} confirmed txid
 */
async function broadcast(signedTxns) {
  const algod   = getAlgodClient();
  const payload = Array.isArray(signedTxns) ? signedTxns : [signedTxns];
  const { txId } = await algod.sendRawTransaction(payload).do();
  await algosdk.waitForConfirmation(algod, txId, 4);
  return txId;
}

// ── Buy group ──────────────────────────────────────────────────────────────────

/**
 * Build + sign an atomic buy group: [PaymentTxn → contract] + [ABI app-call].
 *
 * @param {'YES'|'NO'} side
 * @param {{
 *   fromAddress: string,
 *   encryptedKey: string,
 *   appId: number,
 *   appAddress: string,
 *   asaId: number,
 *   amountMicroAlgos: number,
 * }} params
 * @returns {Promise<Uint8Array[]>} signed txn bytes (pair)
 */
async function signBuyGroup(side, params) {
  const { fromAddress, encryptedKey, appId, appAddress, asaId, amountMicroAlgos } = params;
  if (amountMicroAlgos <= 0) throw new Error('amountMicroAlgos must be > 0');

  const algod      = getAlgodClient();
  const sp         = await algod.getTransactionParams().do();
  const methodName = side === 'YES' ? 'buy_yes' : 'buy_no';

  const sk     = decryptPrivateKey(encryptedKey);
  const signer = makeSigner(sk);

  // txn[0]: Payment — user → contract
  const payTxn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
    from:            fromAddress,
    to:              appAddress,
    amount:          amountMicroAlgos,
    suggestedParams: { ...sp, fee: 1000, flatFee: true },
  });

  // txn[1]: ABI method call — buy_yes / buy_no (payment txn passed as arg)
  const atc = new algosdk.AtomicTransactionComposer();

  atc.addMethodCall({
    appID:           appId,
    method:          getMethod(methodName),
    methodArgs:      [{ txn: payTxn, signer }],
    sender:          fromAddress,
    suggestedParams: { ...sp, fee: 2000, flatFee: true },
    signer,
    foreignAssets:   [asaId],
  });

  const built = atc.buildGroup();
  algosdk.assignGroupID(built.map((b) => b.txn));
  const signed = built.map((b) => b.txn.signTxn(sk));

  // Wipe secret key immediately after signing
  sk.fill(0);
  return signed;
}

// ── Claim ──────────────────────────────────────────────────────────────────────

/**
 * Build + sign a claim() ABI call.
 * The contract burns winning tokens and pays ALGO via inner transactions.
 *
 * @param {{
 *   fromAddress: string,
 *   encryptedKey: string,
 *   appId: number,
 *   winningAsaId: number,
 * }} params
 * @returns {Promise<Uint8Array[]>}
 */
async function signClaim(params) {
  const { fromAddress, encryptedKey, appId, winningAsaId } = params;

  const algod = getAlgodClient();
  const sp    = await algod.getTransactionParams().do();

  const sk     = decryptPrivateKey(encryptedKey);
  const signer = makeSigner(sk);
  const atc    = new algosdk.AtomicTransactionComposer();

  atc.addMethodCall({
    appID:           appId,
    method:          getMethod('claim'),
    methodArgs:      [],
    sender:          fromAddress,
    suggestedParams: { ...sp, fee: 4000, flatFee: true },
    signer,
    foreignAssets:   [winningAsaId],
  });

  const built  = atc.buildGroup();
  const signed = built.map((b) => b.txn.signTxn(sk));
  sk.fill(0);
  return signed;
}

// ── Withdraw ───────────────────────────────────────────────────────────────────

/**
 * Build + sign a simple payment transaction for ALGO withdrawal.
 * Caller MUST validate user.balance ≥ amountMicroAlgos before calling.
 *
 * @param {{
 *   fromAddress: string,
 *   encryptedKey: string,
 *   toAddress: string,
 *   amountMicroAlgos: number,
 * }} params
 * @returns {Promise<Uint8Array>}
 */
async function signWithdraw(params) {
  const { fromAddress, encryptedKey, toAddress, amountMicroAlgos } = params;
  if (amountMicroAlgos <= 0) throw new Error('amountMicroAlgos must be > 0');

  const algod = getAlgodClient();
  const sp    = await algod.getTransactionParams().do();
  sp.fee      = 1000;
  sp.flatFee  = true;

  const txn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
    from:            fromAddress,
    to:              toAddress,
    amount:          amountMicroAlgos,
    suggestedParams: sp,
  });

  const sk     = decryptPrivateKey(encryptedKey);
  const signed = txn.signTxn(sk);
  sk.fill(0);
  return signed;
}

// ── ASA Opt-in ─────────────────────────────────────────────────────────────────

/**
 * Build + sign an ASA opt-in transaction.
 * Must be done before user can receive YES/NO tokens on-chain.
 *
 * @param {{
 *   fromAddress: string,
 *   encryptedKey: string,
 *   asaId: number,
 * }} params
 * @returns {Promise<Uint8Array>}
 */
async function signAsaOptIn(params) {
  const { fromAddress, encryptedKey, asaId } = params;

  const algod = getAlgodClient();
  const sp    = await algod.getTransactionParams().do();
  sp.fee      = 1000;
  sp.flatFee  = true;

  // Opt-in = AssetTransfer to self with amount 0
  const txn = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
    from:            fromAddress,
    to:              fromAddress,
    assetIndex:      asaId,
    amount:          0,
    suggestedParams: sp,
  });

  const sk     = decryptPrivateKey(encryptedKey);
  const signed = txn.signTxn(sk);
  sk.fill(0);
  return signed;
}

// ── On-chain helpers ───────────────────────────────────────────────────────────

/**
 * Read the global state of a deployed market application.
 * @param {number} appId
 * @returns {Promise<object>} decoded state dict
 */
async function readMarketState(appId) {
  const algod = getAlgodClient();
  const info  = await algod.applicationInfo(appId).do();
  const raw   = info.params['global-state'] || [];
  const state = {};
  for (const item of raw) {
    const key = Buffer.from(item.key, 'base64').toString('utf8');
    const val = item.value;
    state[key] = val.type === 1
      ? Buffer.from(val.bytes, 'base64')
      : val.uint;
  }
  return state;
}

/**
 * Check whether a contract ABI is available (i.e., contract has been compiled).
 */
function isContractReady() {
  return getAbiContract() !== null;
}

// ── Deposit (Fund User Account) ────────────────────────────────────────────────

/**
 * Fund a user's custodial address using the backend's deployer wallet.
 * This is the on-chain deposit mechanism.
 *
 * @param {{
 *   toAddress: string,
 *   amountMicroAlgos: number,
 * }} params
 * @returns {Promise<string>} confirmed txid
 */
async function fundUserAccount(params) {
  const { toAddress, amountMicroAlgos } = params;
  if (amountMicroAlgos <= 0) throw new Error('amountMicroAlgos must be > 0');
  if (!toAddress) throw new Error('toAddress is required');

  const mnemonic = process.env.DEPLOYER_MNEMONIC;
  if (!mnemonic) throw new Error('DEPLOYER_MNEMONIC not set in .env');

  // Recover deployer account from mnemonic
  const account = algosdk.mnemonicToSecretKey(mnemonic);
  const fromAddress = normalizeAddress(account.addr);
  const recipientAddress = normalizeAddress(toAddress);

  const algod = getAlgodClient();
  const sp    = await algod.getTransactionParams().do();
  sp.fee      = 1000;
  sp.flatFee  = true;

  const txn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
    from:            fromAddress,
    to:              recipientAddress,
    amount:          amountMicroAlgos,
    suggestedParams: sp,
  });

  const signed = txn.signTxn(account.sk);
  // Clear the secret key from memory
  const sk = new Uint8Array(account.sk);
  sk.fill(0);

  // Broadcast and wait for confirmation
  const txid = await broadcast(signed);
  return txid;
}

module.exports = {
  broadcast,
  signBuyGroup,
  signClaim,
  signWithdraw,
  signAsaOptIn,
  readMarketState,
  isContractReady,
  fundUserAccount,
};
