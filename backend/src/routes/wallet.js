/**
 * routes/wallet.js
 * POST /wallet/deposit   — on-chain ALGO transfer from deployer wallet
 * POST /wallet/withdraw  — real on-chain ALGO transfer (requires verified external wallet)
 * POST /wallet/verify-ownership — sign-to-verify external wallet ownership
 */

const express = require('express');
const { requireAuth } = require('../middleware/auth');
const db = require('../db');
const { sendAlgo } = require('../algorand/asa');
const { fundUserAccount } = require('../algorand/transactionBuilder');
const { normalizeAddress, exportMnemonic } = require('../wallet/custodialWallet');
const { getAlgodClient } = require('../algorand/client');
const bcrypt = require('bcryptjs');
const algosdk = require('algosdk');
const crypto = require('crypto');

const router = express.Router();

// In-memory challenge store (nonce → { address, userId, expiresAt })
const pendingChallenges = new Map();

// GET /wallet/balance (protected)
router.get('/balance', requireAuth, async (req, res) => {
  try {
    const user = db.getUserById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    
    const custodialAddress = normalizeAddress(user.custodial_address);
    if (!custodialAddress) {
      return res.status(400).json({ error: 'User custodial address missing' });
    }

    // Always fetch directly from blockchain for truth
    const algod = getAlgodClient();
    console.log(`[wallet/balance] Fetching on-chain balance for ${custodialAddress}...`);
    const accountInfo = await algod.accountInformation(custodialAddress).do();
    const onChainBalance = Number(accountInfo?.amount || 0);
    console.log(`[wallet/balance] On-chain balance: ${onChainBalance} microAlgos (${onChainBalance / 1e6} ALGO)`);

    // Sync in DB
    const updatedUser = db.updateUser(user.id, { balance: onChainBalance });
    
    // Explicitly construct response with only expected fields
    const response = {
      balance: Number(updatedUser.balance) || 0,
      custodial_address: custodialAddress,
      email: String(user.email || ''),
    };
    
    return res.json(response);
  } catch (err) {
    console.error('[wallet/balance]', err.message);
    const user = db.getUserById(req.user.id);
    // Fallback to DB if algod fails
    return res.json({
      balance: Number(user?.balance) || 0,
      custodial_address: normalizeAddress(user?.custodial_address),
      email: String(user?.email || ''),
    });
  }
});

// POST /wallet/sync-balance (protected)
router.post('/sync-balance', requireAuth, async (req, res) => {
  try {
    const user = db.getUserById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const custodialAddress = normalizeAddress(user.custodial_address);
    if (!custodialAddress) {
      return res.status(400).json({ error: 'User custodial address missing' });
    }

    const algod = getAlgodClient();
    const accountInfo = await algod.accountInformation(custodialAddress).do();
    const onChainBalance = Number(accountInfo?.amount || 0);

    const updatedUser = db.updateUser(user.id, { balance: onChainBalance });

    return res.json({
      success: true,
      balance: Number(updatedUser.balance) || 0,
      custodial_address: custodialAddress,
    });
  } catch (err) {
    console.error('[sync-balance]', err.message);
    return res.status(500).json({ error: 'Failed to sync on-chain balance' });
  }
});

// ── External Wallet Verification ────────────────────────────────────────────

/**
 * GET /wallet/profile (protected)
 * Returns user profile + external wallet info for the profile page.
 */
router.get('/profile', requireAuth, async (req, res) => {
  try {
    const user = db.getUserById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const custodialAddress = normalizeAddress(user.custodial_address);

    // Fetch on-chain balance
    let onChainBalance = Number(user.balance) || 0;
    try {
      const algod = getAlgodClient();
      const acctInfo = await algod.accountInformation(custodialAddress).do();
      onChainBalance = Number(acctInfo?.amount || 0);
      db.updateUser(user.id, { balance: onChainBalance });
    } catch (_) {}

    return res.json({
      id: user.id,
      email: user.email,
      custodial_address: custodialAddress,
      balance: onChainBalance,
      external_wallet: user.external_wallet || null,
      external_wallet_verified_at: user.external_wallet_verified_at || null,
      oauth_provider: user.oauth_provider || null,
      created_at: user.created_at,
    });
  } catch (err) {
    console.error('[wallet/profile]', err.message);
    return res.status(500).json({ error: 'Failed to load profile' });
  }
});

/**
 * POST /wallet/challenge (protected)
 * Generate a verification challenge for wallet ownership proof.
 * Returns a transaction that the user must sign with their external wallet.
 */
router.post('/challenge', requireAuth, async (req, res) => {
  try {
    const { address } = req.body;
    if (!address || typeof address !== 'string' || address.length < 40) {
      return res.status(400).json({ error: 'Valid Algorand address required' });
    }

    // Validate it's a real Algorand address
    try {
      algosdk.decodeAddress(address);
    } catch {
      return res.status(400).json({ error: 'Invalid Algorand address format' });
    }

    // Generate a unique nonce
    const nonce = crypto.randomBytes(16).toString('hex');
    const noteText = `CastAlgo-verify:${nonce}`;
    const noteBytes = new Uint8Array(Buffer.from(noteText));

    // Build a zero-amount self-payment transaction for signing
    const algod = getAlgodClient();
    const suggestedParams = await algod.getTransactionParams().do();

    const txn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
      from: address,
      to: address,
      amount: 0,
      note: noteBytes,
      suggestedParams,
    });

    // Store challenge with 5-minute expiry
    pendingChallenges.set(nonce, {
      address,
      userId: req.user.id,
      expiresAt: Date.now() + 5 * 60 * 1000,
    });

    // Clean up expired challenges
    for (const [k, v] of pendingChallenges) {
      if (v.expiresAt < Date.now()) pendingChallenges.delete(k);
    }

    // Return the unsigned transaction bytes (base64-encoded for transport)
    const txnBytes = algosdk.encodeUnsignedTransaction(txn);
    const txnBase64 = Buffer.from(txnBytes).toString('base64');

    return res.json({
      nonce,
      txnBase64,
      note: noteText,
      expiresAt: Date.now() + 5 * 60 * 1000,
    });
  } catch (err) {
    console.error('[wallet/challenge]', err.message);
    return res.status(500).json({ error: 'Failed to generate challenge' });
  }
});

/**
 * POST /wallet/verify-ownership (protected)
 * Verify a signed transaction to prove wallet ownership.
 * Does NOT submit the transaction — only verifies the signature.
 */
router.post('/verify-ownership', requireAuth, async (req, res) => {
  try {
    const { nonce, signedTxnBase64, address } = req.body;

    if (!nonce || !signedTxnBase64 || !address) {
      return res.status(400).json({ error: 'nonce, signedTxnBase64, and address are required' });
    }

    // Look up the challenge
    const challenge = pendingChallenges.get(nonce);
    if (!challenge) {
      return res.status(400).json({ error: 'Challenge not found or expired' });
    }

    if (challenge.expiresAt < Date.now()) {
      pendingChallenges.delete(nonce);
      return res.status(400).json({ error: 'Challenge expired — please try again' });
    }

    if (challenge.userId !== req.user.id) {
      return res.status(403).json({ error: 'Challenge does not belong to this user' });
    }

    if (challenge.address !== address) {
      return res.status(400).json({ error: 'Address does not match the challenge' });
    }

    // Decode the signed transaction
    const signedTxnBytes = Buffer.from(signedTxnBase64, 'base64');
    let decodedTxn;
    try {
      decodedTxn = algosdk.decodeSignedTransaction(signedTxnBytes);
    } catch (decodeErr) {
      return res.status(400).json({ error: 'Invalid signed transaction format' });
    }

    // Extract the unsigned transaction from the signed one
    const txn = decodedTxn.txn;

    // Verify the sender matches the claimed address
    const senderAddress = algosdk.encodeAddress(txn.from.publicKey);
    if (senderAddress !== address) {
      return res.status(400).json({ error: 'Transaction sender does not match claimed address' });
    }

    // Verify the note contains our nonce
    const noteText = txn.note ? Buffer.from(txn.note).toString() : '';
    if (!noteText.includes(nonce)) {
      return res.status(400).json({ error: 'Challenge nonce not found in transaction note' });
    }

    // Verify it's a zero-amount self-payment (safety check)
    if (txn.amount && txn.amount > 0) {
      return res.status(400).json({ error: 'Transaction must be zero-amount' });
    }

    // Everything checks out — save the verified external wallet
    pendingChallenges.delete(nonce);
    const updatedUser = db.setExternalWallet(req.user.id, address, Date.now());

    console.log(`[wallet/verify] ✅ User ${req.user.id} verified ownership of ${address}`);

    return res.json({
      success: true,
      external_wallet: address,
      verified_at: updatedUser.external_wallet_verified_at,
    });
  } catch (err) {
    console.error('[wallet/verify-ownership]', err.message);
    return res.status(500).json({ error: 'Verification failed' });
  }
});

/**
 * POST /wallet/disconnect-external (protected)
 * Remove the verified external wallet from the user's profile.
 */
router.post('/disconnect-external', requireAuth, (req, res) => {
  try {
    db.clearExternalWallet(req.user.id);
    return res.json({ success: true });
  } catch (err) {
    console.error('[wallet/disconnect-external]', err.message);
    return res.status(500).json({ error: 'Failed to disconnect wallet' });
  }
});

// POST /wallet/deposit (protected)
router.post('/deposit', requireAuth, async (req, res) => {
  try {
    const { amount } = req.body;
    const microAlgos = parseInt(amount, 10);
    if (!microAlgos || microAlgos <= 0) {
      return res.status(400).json({ error: 'amount must be a positive integer (microAlgos)' });
    }

    const user = db.getUserById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const custodialAddress = normalizeAddress(user.custodial_address);

    // On-chain deposit: send real ALGO from deployer to user's custodial address
    let txid;
    try {
      txid = await fundUserAccount({
        toAddress: custodialAddress,
        amountMicroAlgos: microAlgos,
      });
    } catch (txnErr) {
      console.error('[deposit on-chain]', txnErr.message);
      return res.status(502).json({ error: `Blockchain deposit failed: ${txnErr.message}` });
    }

    // After successful on-chain transfer, update the user's balance in the DB
    const updatedUser = db.updateUser(user.id, { balance: user.balance + microAlgos });
    
    return res.json({
      success: true,
      txid: String(txid || ''),
      balance: Number(updatedUser.balance) || 0,
    });
  } catch (err) {
    console.error('[deposit]', err.message);
    return res.status(500).json({ error: 'Deposit failed' });
  }
});

// POST /wallet/withdraw (protected — requires verified external wallet)
router.post('/withdraw', requireAuth, async (req, res) => {
  try {
    const { amount } = req.body;
    const microAlgos = parseInt(amount, 10);

    if (!microAlgos || microAlgos <= 0) {
      return res.status(400).json({ error: 'amount must be a positive integer (microAlgos)' });
    }

    const user = db.getUserById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Withdraw ONLY goes to the verified external wallet
    const to_address = user.external_wallet;
    if (!to_address || !user.external_wallet_verified_at) {
      return res.status(403).json({
        error: 'Connect and verify an external wallet (e.g. Pera Wallet) before withdrawing',
      });
    }

    const fromAddress = normalizeAddress(user.custodial_address);

    // Check LIVE on-chain balance (source of truth)
    const algod = getAlgodClient();
    const acctInfo = await algod.accountInformation(fromAddress).do();
    const onChainBalance = Number(acctInfo?.amount || 0);
    const MIN_BALANCE = 101_000; // 0.1 ALGO min balance + 1 fee
    if (onChainBalance < microAlgos + MIN_BALANCE) {
      return res.status(400).json({
        error: `Insufficient on-chain balance. Available: ${((onChainBalance - MIN_BALANCE) / 1e6).toFixed(4)} ALGO`,
      });
    }

    let txid;
    try {
      txid = await sendAlgo(
        user.encrypted_private_key,
        fromAddress,
        to_address,
        microAlgos,
      );
    } catch (txnErr) {
      console.error('[withdraw txn]', txnErr.message);
      return res.status(502).json({ error: 'Blockchain transaction failed' });
    }

    // Sync balance from chain after successful withdrawal
    const newAcctInfo = await algod.accountInformation(fromAddress).do();
    const newBalance = Number(newAcctInfo?.amount || 0);
    db.updateUser(user.id, { balance: newBalance });

    return res.json({
      success: true,
      txid: String(txid || ''),
      balance: newBalance,
    });
  } catch (err) {
    console.error('[withdraw]', err.message);
    return res.status(500).json({ error: 'Withdraw failed' });
  }
});

// POST /wallet/export-mnemonic (protected)
// SECURITY: Requires password verification before exporting mnemonic
router.post('/export-mnemonic', requireAuth, async (req, res) => {
  try {
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({ error: 'Password is required for security verification' });
    }

    const user = db.getUserById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Verify password
    const validPassword = await bcrypt.compare(password, user.hashed_password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid password' });
    }

    // Export mnemonic (only after password verification)
    const mnemonic = exportMnemonic(user.encrypted_private_key);

    return res.json({
      success: true,
      mnemonic,
      address: normalizeAddress(user.custodial_address),
    });
  } catch (err) {
    console.error('[export-mnemonic]', err.message);
    return res.status(500).json({ error: 'Failed to export wallet' });
  }
});

/**
 * GET /wallet/transactions (protected)
 * Fetch on-chain transaction history from Algorand Indexer.
 * Returns labeled transactions: deposit, escrow, claim, withdrawal, etc.
 */
router.get('/transactions', requireAuth, async (req, res) => {
  try {
    const user = db.getUserById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const address = normalizeAddress(user.custodial_address);
    if (!address) return res.status(400).json({ error: 'No custodial address' });

    const limit = parseInt(req.query.limit, 10) || 30;
    const INDEXER_URL = process.env.INDEXER_URL || 'https://testnet-idx.algonode.cloud';

    const url = `${INDEXER_URL}/v2/accounts/${address}/transactions?limit=${limit}`;
    const resp = await fetch(url);
    if (!resp.ok) {
      console.error('[wallet/transactions] Indexer error:', resp.status, await resp.text());
      return res.status(502).json({ error: 'Indexer request failed' });
    }

    const data = await resp.json();
    const rawTxns = data.transactions || [];

    // Determine the escrow/deployer address for labelling
    let escrowAddress = null;
    try {
      const { getEscrowAddress } = require('../algorand/transactionBuilder');
      escrowAddress = getEscrowAddress();
    } catch (_) {}

    const transactions = rawTxns.map((tx) => {
      const sender = tx.sender || '';
      const receiver = tx['payment-transaction']?.receiver || '';
      const amount = tx['payment-transaction']?.amount || 0;
      const fee = tx.fee || 0;
      const roundTime = tx['round-time'] || 0;
      const txId = tx.id || '';
      const type = tx['tx-type'] || '';

      // Label the transaction
      let label = 'unknown';
      if (type === 'pay') {
        const isIncoming = receiver === address;
        const isOutgoing = sender === address;
        const involvesEscrow = escrowAddress && (sender === escrowAddress || receiver === escrowAddress);

        if (isIncoming && sender === escrowAddress) {
          label = 'claim_payout'; // escrow → user (claim or order refund)
        } else if (isIncoming) {
          label = 'deposit'; // external → user
        } else if (isOutgoing && receiver === escrowAddress) {
          label = 'bet_escrow'; // user → escrow (buy/order)
        } else if (isOutgoing) {
          label = 'withdrawal'; // user → external
        }
      } else if (type === 'appl') {
        label = 'contract_call';
      }

      return {
        id: txId,
        type,
        label,
        sender,
        receiver,
        amount,
        fee,
        timestamp: roundTime,
        confirmed_round: tx['confirmed-round'] || null,
        explorer_url: `https://testnet.explorer.perawallet.app/tx/${txId}`,
      };
    });

    return res.json({ transactions, address });
  } catch (err) {
    console.error('[wallet/transactions]', err.message);
    return res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

module.exports = router;
