/**
 * routes/wallet.js
 * POST /wallet/deposit   — on-chain ALGO transfer from deployer wallet
 * POST /wallet/withdraw  — real on-chain ALGO transfer
 */

const express = require('express');
const { requireAuth } = require('../middleware/auth');
const db = require('../db');
const { sendAlgo } = require('../algorand/asa');
const { fundUserAccount } = require('../algorand/transactionBuilder');
const { normalizeAddress, exportMnemonic } = require('../wallet/custodialWallet');
const { getAlgodClient } = require('../algorand/client');
const bcrypt = require('bcryptjs');

const router = express.Router();

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

// POST /wallet/withdraw (protected)
router.post('/withdraw', requireAuth, async (req, res) => {
  try {
    const { to_address, amount } = req.body;
    const microAlgos = parseInt(amount, 10);

    if (!to_address) return res.status(400).json({ error: 'to_address is required' });
    if (!microAlgos || microAlgos <= 0) {
      return res.status(400).json({ error: 'amount must be a positive integer (microAlgos)' });
    }

    const user = db.getUserById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const fromAddress = normalizeAddress(user.custodial_address);
    if (user.balance < microAlgos) {
      return res.status(400).json({ error: 'Insufficient balance' });
    }

    // Deduct BEFORE broadcasting (prevent double-spend)
    db.updateUser(user.id, { balance: user.balance - microAlgos });

    let txid;
    try {
      txid = await sendAlgo(
        user.encrypted_private_key,
        fromAddress,
        to_address,
        microAlgos,
      );
    } catch (txnErr) {
      // Rollback balance on txn failure
      db.updateUser(user.id, { balance: user.balance }); // restore is fine since reference not re-fetched
      console.error('[withdraw txn]', txnErr.message);
      return res.status(502).json({ error: 'Blockchain transaction failed, balance restored' });
    }

    const updatedUser = db.getUserById(user.id);
    return res.json({
      success: true,
      txid: String(txid || ''),
      balance: Number(updatedUser.balance) || 0,
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

module.exports = router;
