/**
 * routes/wallet.js
 * POST /wallet/deposit   — credit balance (mock deposit for hackathon)
 * POST /wallet/withdraw  — real on-chain ALGO transfer
 */

const express = require('express');
const { requireAuth } = require('../middleware/auth');
const db = require('../db');
const { sendAlgo } = require('../algorand/asa');

const router = express.Router();

// POST /wallet/deposit (protected)
router.post('/deposit', requireAuth, (req, res) => {
  try {
    const { amount } = req.body;
    const microAlgos = parseInt(amount, 10);
    if (!microAlgos || microAlgos <= 0) {
      return res.status(400).json({ error: 'amount must be a positive integer (microAlgos)' });
    }

    const user = db.getUserById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Hackathon: direct balance credit (no real on-chain deposit required)
    const updatedUser = db.updateUser(user.id, { balance: user.balance + microAlgos });
    return res.json({ success: true, balance: updatedUser.balance });
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
    if (user.balance < microAlgos) {
      return res.status(400).json({ error: 'Insufficient balance' });
    }

    // Deduct BEFORE broadcasting (prevent double-spend)
    db.updateUser(user.id, { balance: user.balance - microAlgos });

    let txid;
    try {
      txid = await sendAlgo(
        user.encrypted_private_key,
        user.custodial_address,
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
    return res.json({ success: true, txid, balance: updatedUser.balance });
  } catch (err) {
    console.error('[withdraw]', err.message);
    return res.status(500).json({ error: 'Withdraw failed' });
  }
});

module.exports = router;
