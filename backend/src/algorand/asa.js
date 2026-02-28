/**
 * algorand/asa.js
 *
 * Handles Algorand Standard Asset operations for CastAlgo.
 * For the hackathon, ASA creation is MOCKED (returns fake IDs).
 * Real on-chain txns are used only for ALGO withdrawals.
 */

const algosdk = require('algosdk');
const { getAlgodClient } = require('./client');
const { decryptPrivateKey } = require('../wallet/custodialWallet');

/**
 * Mock ASA creation — returns fake ascending ASA IDs.
 * Replace with real algosdk txn in production.
 *
 * @returns {{ yesAsaId: number, noAsaId: number }}
 */
let _asaCounter = 1000001;
function createMarketASAs() {
  const yesAsaId = _asaCounter++;
  const noAsaId = _asaCounter++;
  return { yesAsaId, noAsaId };
}

/**
 * Send ALGO from a custodial wallet to an external address.
 * This is a REAL on-chain transaction.
 *
 * @param {string} encryptedKey  - stored encrypted private key of sender
 * @param {string} fromAddress   - sender's Algorand address
 * @param {string} toAddress     - recipient's Algorand address
 * @param {number} amountMicroAlgos
 * @returns {Promise<string>} txid
 */
async function sendAlgo(encryptedKey, fromAddress, toAddress, amountMicroAlgos) {
  const algod = getAlgodClient();
  const params = await algod.getTransactionParams().do();

  const txn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
    from: fromAddress,
    to: toAddress,
    amount: amountMicroAlgos,
    suggestedParams: params,
  });

  const secretKey = decryptPrivateKey(encryptedKey);
  const signedTxn = txn.signTxn(secretKey);

  const { txId } = await algod.sendRawTransaction(signedTxn).do();
  // Wait for confirmation
  await algosdk.waitForConfirmation(algod, txId, 4);
  return txId;
}

module.exports = { createMarketASAs, sendAlgo };
