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
const { normalizeAddress } = require('../wallet/custodialWallet');
const { getAlgodClient } = require('../algorand/client');

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
    const accountInfo = await algod.accountInformation(custodialAddress).do();
    const onChainBalance = Number(accountInfo?.amount || 0);

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

module.exports = router;
