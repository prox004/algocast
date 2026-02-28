/**
 * algorand/asa.js
 *
 * Handles Algorand Standard Asset operations for CastAlgo.
 *
 * ASA creation: MOCKED (returns fake IDs) unless a real app_id is available.
 * ALGO withdrawals: REAL on-chain transaction via transactionBuilder.
 * Buy / Claim:     Delegated to transactionBuilder (on-chain when app_id present).
 */

const { signWithdraw, broadcast, isContractReady } = require('./transactionBuilder');

/**
 * Mock ASA creation — returns fake ascending ASA IDs.
 * When a market is genuinely deployed on-chain (via deploy.py), the real
 * yes_asa_id / no_asa_id come back from the contract state and are stored in DB.
 *
 * @returns {{ yesAsaId: number, noAsaId: number }}
 */
let _asaCounter = 1_000_001;
function createMarketASAs() {
  const yesAsaId = _asaCounter++;
  const noAsaId  = _asaCounter++;
  return { yesAsaId, noAsaId };
}

/**
 * Send ALGO from a custodial wallet to an external address.
 * Real on-chain transaction — uses transactionBuilder for consistent signing.
 *
 * @param {string} encryptedKey     - AES-encrypted private key (from DB)
 * @param {string} fromAddress      - sender's custodial Algorand address
 * @param {string} toAddress        - recipient external address
 * @param {number} amountMicroAlgos
 * @returns {Promise<string>} confirmed txid
 */
async function sendAlgo(encryptedKey, fromAddress, toAddress, amountMicroAlgos) {
  const signed = await signWithdraw({ fromAddress, encryptedKey, toAddress, amountMicroAlgos });
  return broadcast(signed);
}

module.exports = { createMarketASAs, sendAlgo, isContractReady };
