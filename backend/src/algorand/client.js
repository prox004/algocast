/**
 * algorand/client.js
 * Initializes and exports the algod client for Algorand TestNet.
 * Uses AlgoNode free public endpoint — no API token required.
 */

const algosdk = require('algosdk');

const ALGOD_URL = process.env.ALGORAND_ALGOD_URL || 'https://testnet-api.algonode.cloud';
const ALGOD_TOKEN = process.env.ALGORAND_ALGOD_TOKEN || '';
const ALGOD_PORT = '';

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
