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
 *   yesAsaId: number,
 *   noAsaId: number,
 *   amountMicroAlgos: number,
 * }} params
 * @returns {Promise<Uint8Array[]>} signed txn bytes (pair)
 */
async function signBuyGroup(side, params) {
  const { fromAddress, encryptedKey, appId, appAddress, asaId, yesAsaId, noAsaId, amountMicroAlgos } = params;
  if (amountMicroAlgos <= 0) throw new Error('amountMicroAlgos must be > 0');
  if (!asaId || asaId <= 0) throw new Error(`Invalid asaId for ${side} buy: ${asaId}. Market may have null yes_asa_id/no_asa_id — sync from chain first.`);

  const allAsaIds = [...new Set([asaId, yesAsaId, noAsaId].filter((id) => id != null && id > 0))];

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
    // Both ASAs must be declared so the contract can reference YES and NO in global state.
    // The AVM requires any asset referenced via app_global_get + itxn_field to be in foreignAssets.
    // Filter out null/0/duplicates to prevent algosdk from producing invalid references.
    appForeignAssets: allAsaIds,
    appAccounts:      [fromAddress],  // buyer account must be accessible for inner ASA transfer
  });

  const built = atc.buildGroup();
  // Note: buildGroup() already assigns group IDs — do NOT call assignGroupID again.
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
    appForeignAssets: [winningAsaId],
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
 * Supports both LocalNet (via KMD) and TestNet (via mnemonic).
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

  const network = (process.env.ALGORAND_NETWORK || 'testnet').toLowerCase();
  const algod = getAlgodClient();
  
  let account;
  
  if (network === 'local' || network === 'localnet') {
    // LocalNet: Get account from KMD (default funded account)
    console.log('[fundUserAccount] Using LocalNet KMD...');
    const KMD_URL = process.env.KMD_URL || 'http://localhost:4002';
    const KMD_TOKEN = process.env.KMD_TOKEN || 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    
    try {
      // Parse KMD URL into server + port for algosdk.Kmd
      let kmdServer, kmdPort;
      try {
        const u = new URL(KMD_URL);
        kmdServer = `${u.protocol}//${u.hostname}`;
        kmdPort = u.port ? Number(u.port) : '';
      } catch {
        kmdServer = KMD_URL;
        kmdPort = '';
      }
      
      const kmd = new algosdk.Kmd(KMD_TOKEN, kmdServer, kmdPort);
      
      // List wallets
      const wallets = await kmd.listWallets();
      const defaultWallet = wallets.wallets.find((w) => w.name === 'unencrypted-default-wallet');
      if (!defaultWallet) {
        throw new Error('unencrypted-default-wallet not found in KMD. Run: algokit localnet start');
      }
      
      // Get wallet handle (no password needed for default wallet)
      const { wallet_handle_token } = await kmd.initWalletHandle(defaultWallet.id, '');
      
      // Get first address in wallet
      const { addresses } = await kmd.listKeys(wallet_handle_token);
      if (!addresses || addresses.length === 0) {
        throw new Error('No accounts found in KMD wallet');
      }
      
      const deployerAddress = addresses[0];
      console.log(`[fundUserAccount] Using KMD account: ${deployerAddress}`);
      
      // Export private key
      const { private_key } = await kmd.exportKey(wallet_handle_token, '', deployerAddress);
      const sk = Buffer.from(private_key, 'base64');
      account = { sk, addr: deployerAddress };
      
      // Release wallet handle
      await kmd.releaseWalletHandle(wallet_handle_token);
    } catch (err) {
      console.error('[fundUserAccount] KMD error:', err.message);
      throw new Error(`Failed to get account from KMD: ${err.message}`);
    }
  } else {
    // TestNet: Get account from mnemonic
    const mnemonic = process.env.DEPLOYER_MNEMONIC;
    if (!mnemonic) {
      throw new Error('DEPLOYER_MNEMONIC not set in .env for TestNet');
    }
    console.log('[fundUserAccount] Using TestNet mnemonic...');
    account = algosdk.mnemonicToSecretKey(mnemonic);
  }

  const fromAddress = normalizeAddress(account.addr);
  const recipientAddress = normalizeAddress(toAddress);

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
  console.log(`[fundUserAccount] ✅ Funded ${recipientAddress} with ${amountMicroAlgos / 1e6} ALGO. TxID: ${txid}`);
  return txid;
}

// ── Escrow address (platform pool) ─────────────────────────────────────────────

let _cachedEscrowAddress = null;

/**
 * Returns the deployer/escrow address used as the platform's pool.
 * All bets flow through this address; payouts come from it.
 * Async because it may need to query KMD on localnet.
 * @returns {Promise<string>} Algorand address
 */
async function getEscrowAddress() {
  if (_cachedEscrowAddress) return _cachedEscrowAddress;

  const network = (process.env.ALGORAND_NETWORK || 'testnet').toLowerCase();

  if (network === 'local' || network === 'localnet') {
    // If ESCROW_ADDRESS is set in env, use it directly
    if (process.env.ESCROW_ADDRESS) {
      _cachedEscrowAddress = process.env.ESCROW_ADDRESS;
      return _cachedEscrowAddress;
    }

    // Auto-discover from KMD (same as fundUserAccount)
    const KMD_URL   = process.env.KMD_URL   || 'http://localhost:4002';
    const KMD_TOKEN = process.env.KMD_TOKEN  || 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

    try {
      let kmdServer, kmdPort;
      try {
        const u = new URL(KMD_URL);
        kmdServer = `${u.protocol}//${u.hostname}`;
        kmdPort   = u.port ? Number(u.port) : '';
      } catch {
        kmdServer = KMD_URL;
        kmdPort   = '';
      }

      const kmd     = new algosdk.Kmd(KMD_TOKEN, kmdServer, kmdPort);
      const wallets = await kmd.listWallets();
      const defWallet = wallets.wallets.find((w) => w.name === 'unencrypted-default-wallet');
      if (!defWallet) throw new Error('KMD default wallet not found');

      const { wallet_handle_token } = await kmd.initWalletHandle(defWallet.id, '');
      const { addresses }           = await kmd.listKeys(wallet_handle_token);
      await kmd.releaseWalletHandle(wallet_handle_token);

      if (!addresses || addresses.length === 0) throw new Error('No KMD accounts');

      _cachedEscrowAddress = addresses[0];
      console.log(`[getEscrowAddress] Resolved from KMD: ${_cachedEscrowAddress}`);
      return _cachedEscrowAddress;
    } catch (err) {
      console.error('[getEscrowAddress] KMD auto-discovery failed:', err.message);
      throw new Error('ESCROW_ADDRESS not set and KMD auto-discovery failed');
    }
  }

  // TestNet: derive from deployer mnemonic
  const mnemonic = process.env.DEPLOYER_MNEMONIC;
  if (!mnemonic) throw new Error('DEPLOYER_MNEMONIC not set in .env');
  const account = algosdk.mnemonicToSecretKey(mnemonic);
  _cachedEscrowAddress = normalizeAddress(account.addr);
  return _cachedEscrowAddress;
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
  getEscrowAddress,
};
