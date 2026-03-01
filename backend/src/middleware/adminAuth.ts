/**
 * middleware/adminAuth.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * JWT-based admin authentication middleware.
 * Separate from user auth — uses admin-specific JWT claims.
 *
 * Attaches decoded admin payload to req.admin
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

// Extend Express Request to include admin payload
declare global {
  namespace Express {
    interface Request {
      admin?: {
        id: string;
        email: string;
        role: string;
        algorand_address: string;
      };
    }
  }
}

/**
 * Get the admin JWT secret. Separate from user JWT secret for isolation.
 * Falls back to JWT_SECRET with a prefix if ADMIN_JWT_SECRET is not set.
 */
function getAdminJwtSecret(): string {
  const secret = process.env.ADMIN_JWT_SECRET || (process.env.JWT_SECRET ? `admin_${process.env.JWT_SECRET}` : '');
  if (!secret) {
    throw new Error('ADMIN_JWT_SECRET or JWT_SECRET must be set');
  }
  return secret;
}

/**
 * Sign an admin JWT token.
 *
 * @param admin - Admin record with id, email, role, algorand_address
 * @returns JWT string valid for 24 hours
 */
export function signAdminToken(admin: {
  id: string;
  email: string;
  role: string;
  algorand_address: string;
}): string {
  return jwt.sign(
    {
      id: admin.id,
      email: admin.email,
      role: admin.role,
      algorand_address: admin.algorand_address,
      isAdmin: true,
    },
    getAdminJwtSecret(),
    { expiresIn: '24h' }
  );
}

/**
 * Middleware: require a valid admin JWT.
 * Rejects requests without valid admin authorization.
 *
 * Usage:
 *   router.post('/admin/action', requireAdmin, handler);
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers['authorization'];
  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid Authorization header' });
    return;
  }

  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, getAdminJwtSecret()) as any;

    // Verify this is an admin token (not a user token)
    if (!payload.isAdmin || !payload.role) {
      res.status(403).json({ error: 'Not an admin token' });
      return;
    }

    req.admin = {
      id: payload.id,
      email: payload.email,
      role: payload.role,
      algorand_address: payload.algorand_address,
    };

    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid or expired admin token' });
    return;
  }
}

export default { requireAdmin, signAdminToken };
