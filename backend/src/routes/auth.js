/**
 * routes/auth.js
 * POST /auth/register  — create account + custodial wallet
 * POST /auth/login     — authenticate and return JWT
 */

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { generateCustodialWallet } = require('../wallet/custodialWallet');
const { normalizeAddress } = require('../wallet/custodialWallet');

const router = express.Router();

function signToken(user) {
  return jwt.sign({ id: user.id, email: user.email }, process.env.JWT_SECRET, {
    expiresIn: '7d',
  });
}

function publicUser(user) {
  return {
    id: String(user.id || ''),
    email: String(user.email || ''),
    custodial_address: normalizeAddress(user.custodial_address),
    balance: Number(user.balance) || 0,
  };
}

// POST /auth/register
router.post('/register', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required' });
    }
    if (db.getUserByEmail(email)) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const hashed_password = await bcrypt.hash(password, 12);
    const { address, encryptedKey } = generateCustodialWallet();

    const user = db.createUser({
      id: uuidv4(),
      email: email.toLowerCase(),
      hashed_password,
      custodial_address: address,
      encrypted_private_key: encryptedKey, // NEVER sent to frontend
      balance: 0,
    });

    const token = signToken(user);
    return res.status(201).json({
      token: String(token || ''),
      user: publicUser(user),
    });
  } catch (err) {
    console.error('[register]', err.message);
    return res.status(500).json({ error: 'Registration failed' });
  }
});

// GET /auth/me (protected)
router.get('/me', (req, res) => {
  const header = req.headers['authorization'];
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }
  const token = header.slice(7);
  try {
    const jwt = require('jsonwebtoken');
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = db.getUserById(payload.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    return res.json(publicUser(user));
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
});

// POST /auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required' });
    }

    const user = db.getUserByEmail(email);
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const valid = await bcrypt.compare(password, user.hashed_password);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = signToken(user);
    return res.json({
      token: String(token || ''),
      user: publicUser(user),
    });
  } catch (err) {
    console.error('[login]', err.message);
    return res.status(500).json({ error: 'Login failed' });
  }
});

module.exports = router;
