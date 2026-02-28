/**
 * algorand/client.js
 * Initializes and exports the algod client for Algorand LocalNet or TestNet.
 * - LocalNet: http://localhost:4001 (local development)
 * - TestNet: testnet-api.algonode.cloud (testing/staging)
 */

const algosdk = require('algosdk');

// Determine network from environment
const ALGORAND_NETWORK = (process.env.ALGORAND_NETWORK || 'testnet').toLowerCase();

let ALGOD_URL;
let ALGOD_TOKEN;
let ALGOD_PORT;

if (ALGORAND_NETWORK === 'local' || ALGORAND_NETWORK === 'localnet') {
  // LocalNet configuration
  ALGOD_URL = process.env.ALGORAND_ALGOD_URL || 'http://localhost:4001';
  ALGOD_TOKEN = process.env.ALGORAND_ALGOD_TOKEN || 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  ALGOD_PORT = '';
  console.log('[algod] Using LocalNet:', ALGOD_URL);
} else {
  // TestNet configuration (default)
  ALGOD_URL = process.env.ALGORAND_ALGOD_URL || 'https://testnet-api.algonode.cloud';
  ALGOD_TOKEN = process.env.ALGORAND_ALGOD_TOKEN || '';
  ALGOD_PORT = '';
  console.log('[algod] Using TestNet:', ALGOD_URL);
}

let _client = null;

/**
 * Returns a singleton algod client.
 * @returns {algosdk.Algodv2}
 */
function getAlgodClient() {
  if (!_client) {
    _client = new algosdk.Algodv2(ALGOD_TOKEN, ALGOD_URL, ALGOD_PORT);
  }
  return _client;
}

module.exports = { getAlgodClient };
