/**
 * algorand/client.js
 * Initializes and exports the algod client for Algorand LocalNet or TestNet.
 *
 * algosdk v2.x: Algodv2(token, baseServer, port)
 *   - baseServer must NOT include port (e.g. "http://localhost")
 *   - port is passed as the 3rd argument (number or string)
 */

const algosdk = require('algosdk');

// Determine network from environment
const ALGORAND_NETWORK = (process.env.ALGORAND_NETWORK || 'testnet').toLowerCase();

let ALGOD_SERVER;
let ALGOD_TOKEN;
let ALGOD_PORT;

/**
 * Parse a URL into { server, port } for algosdk.Algodv2.
 * e.g. "http://localhost:4001" → { server: "http://localhost", port: 4001 }
 */
function parseAlgodUrl(urlStr) {
  try {
    const u = new URL(urlStr);
    const server = `${u.protocol}//${u.hostname}`;
    const port = u.port ? Number(u.port) : '';
    return { server, port };
  } catch {
    return { server: urlStr, port: '' };
  }
}

if (ALGORAND_NETWORK === 'local' || ALGORAND_NETWORK === 'localnet') {
  // LocalNet configuration
  const raw = process.env.ALGORAND_ALGOD_URL || 'http://localhost:4001';
  const parsed = parseAlgodUrl(raw);
  ALGOD_SERVER = parsed.server;
  ALGOD_PORT = parsed.port;
  ALGOD_TOKEN = process.env.ALGORAND_ALGOD_TOKEN || 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  console.log(`[algod] Using LocalNet: ${ALGOD_SERVER}:${ALGOD_PORT}`);
} else {
  // TestNet configuration (default)
  const raw = process.env.ALGORAND_ALGOD_URL || 'https://testnet-api.algonode.cloud';
  const parsed = parseAlgodUrl(raw);
  ALGOD_SERVER = parsed.server;
  ALGOD_PORT = parsed.port;
  ALGOD_TOKEN = process.env.ALGORAND_ALGOD_TOKEN || '';
  console.log(`[algod] Using TestNet: ${ALGOD_SERVER}${ALGOD_PORT ? ':' + ALGOD_PORT : ''}`);
}

let _client = null;

/**
 * Returns a singleton algod client.
 * @returns {algosdk.Algodv2}
 */
function getAlgodClient() {
  if (!_client) {
    _client = new algosdk.Algodv2(ALGOD_TOKEN, ALGOD_SERVER, ALGOD_PORT);
  }
  return _client;
}

module.exports = { getAlgodClient };
