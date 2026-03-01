/**
 * routes/auth0.ts
 * Auth0 authentication routes and API endpoints
 */

import express from 'express';
import { 
  requireAuth0, 
  requireJWT, 
  generateJWT, 
  auth0UserMiddleware,
  isAuth0Configured 
} from '../config/auth0';

const db = require('../db');
const router = express.Router();

// Check if Auth0 is configured
if (!isAuth0Configured()) {
  console.warn('[Auth0] Not configured - routes disabled');
  
  // Return empty router if not configured
  router.get('*', (req, res) => {
    res.status(503).json({
      error: 'Auth0 not configured',
      message: 'Please configure Auth0 environment variables'
    });
  });
} else {
  // Apply Auth0 user middleware to all routes
  router.use(auth0UserMiddleware);

  // GET /auth0/profile - Get current user profile (session-based)
  router.get('/profile', requireAuth0, (req: any, res) => {
    try {
      const user = req.user;
      const auth0User = req.auth0User;
      
      res.json({
        success: true,
        user: {
          id: user.id,
          email: user.email,
          name: user.name || auth0User.name,
          picture: user.picture || auth0User.picture,
          custodial_address: user.custodial_address,
          balance: user.balance,
          external_wallet: user.external_wallet,
          external_wallet_verified_at: user.external_wallet_verified_at,
          oauth_provider: user.oauth_provider,
          created_at: user.created_at,
        },
        auth0: {
          sub: auth0User.sub,
          email_verified: auth0User.email_verified,
          updated_at: auth0User.updated_at,
        }
      });
    } catch (error) {
      console.error('[Auth0] Profile error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get profile'
      });
    }
  });

  // POST /auth0/token - Generate JWT token for API access
  router.post('/token', requireAuth0, (req: any, res) => {
    try {
      const user = req.user;
      const token = generateJWT(user);
      
      res.json({
        success: true,
        token,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
        }
      });
    } catch (error) {
      console.error('[Auth0] Token generation error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to generate token'
      });
    }
  });

  // GET /auth0/me - Get user info via JWT token (for API access)
  router.get('/me', requireJWT, (req: any, res) => {
    try {
      const user = req.user;
      
      res.json({
        success: true,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          picture: user.picture,
          custodial_address: user.custodial_address,
          balance: user.balance,
          external_wallet: user.external_wallet,
          oauth_provider: user.oauth_provider,
        }
      });
    } catch (error) {
      console.error('[Auth0] JWT profile error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get user info'
      });
    }
  });

  // GET /auth0/status - Check authentication status
  router.get('/status', (req: any, res) => {
    const isAuthenticated = req.oidc?.isAuthenticated() || false;
    const hasUser = !!req.user;
    
    res.json({
      success: true,
      authenticated: isAuthenticated,
      hasUser,
      user: hasUser ? {
        id: req.user.id,
        email: req.user.email,
        name: req.user.name,
      } : null,
      loginUrl: '/auth/login',
      logoutUrl: '/auth/logout'
    });
  });

  // POST /auth0/link-wallet - Link external wallet to Auth0 user
  router.post('/link-wallet', requireAuth0, async (req: any, res) => {
    try {
      const { address, signature, nonce } = req.body;
      const user = req.user;
      
      if (!address || !signature || !nonce) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: address, signature, nonce'
        });
      }
      
      // TODO: Verify wallet signature
      // For now, just link the wallet
      
      const updatedUser = db.setExternalWallet(user.id, address, Date.now());
      
      res.json({
        success: true,
        message: 'Wallet linked successfully',
        user: {
          id: updatedUser.id,
          email: updatedUser.email,
          external_wallet: updatedUser.external_wallet,
          external_wallet_verified_at: updatedUser.external_wallet_verified_at,
        }
      });
    } catch (error) {
      console.error('[Auth0] Link wallet error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to link wallet'
      });
    }
  });

  // DELETE /auth0/unlink-wallet - Unlink external wallet
  router.delete('/unlink-wallet', requireAuth0, (req: any, res) => {
    try {
      const user = req.user;
      const updatedUser = db.clearExternalWallet(user.id);
      
      return res.json({
        success: true,
        message: 'Wallet unlinked successfully',
        user: {
          id: updatedUser.id,
          email: updatedUser.email,
          external_wallet: updatedUser.external_wallet,
        }
      });
    } catch (error) {
      console.error('[Auth0] Unlink wallet error:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to unlink wallet'
      });
    }
  });
}

export default router;