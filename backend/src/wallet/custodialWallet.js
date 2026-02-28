/**
 * custodialWallet.js
 *
 * Responsible for:
 *  - Generating Algorand keypairs
 *  - Encrypting / decrypting private keys (AES-256-CBC)
 *
 * Security contract (from context.md):
 *  - Encrypted key is stored in DB, plain key NEVER persisted
 *  - Decryption only happens inside transaction execution
 *  - Stored format: "<iv_hex>:<ciphertext_hex>"
 */

const algosdk = require('algosdk');
const crypto = require('crypto');

const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16; // bytes

function normalizeAddress(addressLike) {
  if (!addressLike) return '';
  if (typeof addressLike === 'string') return addressLike;

  if (addressLike.addr) {
    return normalizeAddress(addressLike.addr);
  }

  if (addressLike.publicKey instanceof Uint8Array) {
    return algosdk.encodeAddress(addressLike.publicKey);
  }

  if (typeof addressLike.toString === 'function') {
    const value = addressLike.toString();
    if (value && value !== '[object Object]') return value;
  }

  throw new Error('Invalid Algorand address value');
}

/**
 * Derive a 32-byte key from the env secret.
 */
function getDerivedKey() {
  const secret = process.env.WALLET_ENCRYPTION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('WALLET_ENCRYPTION_SECRET must be at least 32 characters');
  }
  return crypto.createHash('sha256').update(secret).digest(); // 32 bytes
}

/**
 * Generate a new Algorand keypair.
 * Returns the public address and the AES-encrypted private key (never plain key).
 *
 * @returns {{ address: string, encryptedKey: string }}
 */
function generateCustodialWallet() {
  const account = algosdk.generateAccount();
  const privateKeyHex = Buffer.from(account.sk).toString('hex');
  const encryptedKey = encryptPrivateKey(privateKeyHex);
  return {
    address: normalizeAddress(account.addr),
    encryptedKey,
  };
}

/**
 * Encrypt a private key hex string.
 * @param {string} privateKeyHex
 * @returns {string} "<iv_hex>:<ciphertext_hex>"
 */
function encryptPrivateKey(privateKeyHex) {
  const key = getDerivedKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(Buffer.from(privateKeyHex, 'utf8')),
    cipher.final(),
  ]);
  return `${iv.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Decrypt a stored encrypted key back to the private key hex.
 * ONLY call this inside a transaction-signing context.
 *
 * @param {string} encryptedKey "<iv_hex>:<ciphertext_hex>"
 * @returns {Uint8Array} secretKey (64 bytes) ready for algosdk
 */
function decryptPrivateKey(encryptedKey) {
  const key = getDerivedKey();
  const [ivHex, ciphertextHex] = encryptedKey.split(':');
  if (!ivHex || !ciphertextHex) throw new Error('Invalid encrypted key format');

  const iv = Buffer.from(ivHex, 'hex');
  const ciphertext = Buffer.from(ciphertextHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  const privateKeyHex = decrypted.toString('utf8');
  return Uint8Array.from(Buffer.from(privateKeyHex, 'hex'));
}

module.exports = {
  generateCustodialWallet,
  encryptPrivateKey,
  decryptPrivateKey,
  normalizeAddress,
};
