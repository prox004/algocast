/**
 * routes/adminAuth.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Admin authentication routes.
 *
 * POST /admin/login  — authenticate admin and return JWT
 *
 * Admin accounts are pre-seeded; there is no public registration endpoint.
 */

import express, { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { signAdminToken, requireAdmin } from '../middleware/adminAuth';

const db = require('../db');

const router = express.Router();

/**
 * POST /admin/login
 *
 * Body: { email: string, password: string }
 * Returns: { token: string, admin: { id, email, role, algorand_address } }
 */
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const admin = db.getAdminByEmail(email);
    if (!admin) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const valid = await bcrypt.compare(password, admin.hashed_password);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = signAdminToken({
      id: admin.id,
      email: admin.email,
      role: admin.role,
      algorand_address: admin.algorand_address,
    });

    return res.json({
      token,
      admin: {
        id: admin.id,
        email: admin.email,
        role: admin.role,
        algorand_address: admin.algorand_address,
      },
    });
  } catch (err) {
    console.error('[admin/login]', err);
    return res.status(500).json({ error: 'Admin login failed' });
  }
});

/**
 * GET /admin/me
 *
 * Returns the currently authenticated admin profile.
 * Requires admin JWT.
 */
router.get('/me', requireAdmin, (req: Request, res: Response) => {
  const admin = db.getAdminById(req.admin!.id);
  if (!admin) {
    return res.status(404).json({ error: 'Admin not found' });
  }

  return res.json({
    admin: {
      id: admin.id,
      email: admin.email,
      role: admin.role,
      algorand_address: admin.algorand_address,
      created_at: admin.created_at,
    },
  });
});

export default router;
