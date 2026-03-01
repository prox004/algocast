/**
 * config/auth0.ts
 * Auth0 configuration and middleware
 */

import { auth, requiresAuth } from 'express-openid-connect';
import { ManagementClient } from 'auth0';
import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';

const db = require('../db');
const { generateCustodialWallet } = require('../wallet/custodialWallet');

// Auth0 configuration
export const auth0Config = {
  authRequired: false,
  auth0Logout: true,
  secret: process.env.AUTH0_SECRET,
  baseURL: process.env.AUTH0_BASE_URL || 'http://localhost:4000',
  clientID: process.env.AUTH0_CLIENT_ID,
  issuerBaseURL: process.env.AUTH0_ISSUER_BASE_URL,
  clientSecret: process.env.AUTH0_CLIENT_SECRET,
  audience: process.env.AUTH0_AUDIENCE,
  scope: 'openid profile email',
  routes: {
    login: '/auth/login',
    logout: '/auth/logout',
    callback: '/auth/callback',
    postLogoutRedirect: process.env.FRONTEND_URL || 'http://localhost:3000'
  },
  afterCallback: async (req: any, res: any, session: any) => {
    // Create or update user in our database after Auth0 authentication
    try {
      const { user } = session;
      if (!user || !user.email) {
        throw new Error('No user email found in Auth0 session');
      }

      // Check if user exists in our database
      let dbUser = db.getUserByEmail(user.email.toLowerCase());

      if (!dbUser) {
        // Create new user with custodial wallet
        const { address, encryptedKey } = generateCustodialWallet();
        
        dbUser = db.createUser({
          id: user.sub, // Use Auth0 user ID
          email: user.email.toLowerCase(),
          hashed_password: null, // Auth0 users don't need passwords
          custodial_address: address,
          encrypted_private_key: encryptedKey,
          balance: 0,
          oauth_provider: 'auth0',
          oauth_id: user.sub,
          name: user.name || user.nickname || user.email.split('@')[0],
          picture: user.picture || null,
        });

        console.log(`[Auth0] Created new user: ${user.email}`);
      } else {
        // Update existing user with Auth0 info if needed
        if (!dbUser.oauth_provider || dbUser.oauth_provider !== 'auth0') {
          db.updateUserOAuth(dbUser.id, 'auth0', user.sub);
          console.log(`[Auth0] Linked existing user to Auth0: ${user.email}`);
        }
      }

      // Add our database user to the session
      session.dbUser = dbUser;
      return session;
    } catch (error) {
      console.error('[Auth0] Error in afterCallback:', error);
      throw error;
    }
  }
};

// Auth0 Management Client for advanced operations
export const managementClient = new ManagementClient({
  domain: process.env.AUTH0_ISSUER_BASE_URL?.replace('https://', '') || '',
  clientId: process.env.AUTH0_CLIENT_ID || '',
  clientSecret: process.env.AUTH0_CLIENT_SECRET || '',
  scope: 'read:users update:users'
});

// Middleware to extract user from Auth0 session and add to request
export const auth0UserMiddleware = (req: any, res: Response, next: NextFunction) => {
  if (req.oidc?.user) {
    // User is authenticated via Auth0
    const auth0User = req.oidc.user;
    
    // Get our database user
    const dbUser = db.getUserByEmail(auth0User.email?.toLowerCase());
    
    if (dbUser) {
      req.user = dbUser;
      req.auth0User = auth0User;
    } else {
      console.warn(`[Auth0] Database user not found for Auth0 user: ${auth0User.email}`);
    }
  }
  
  next();
};

// Middleware that requires Auth0 authentication
export const requireAuth0 = (req: any, res: Response, next: NextFunction) => {
  if (!req.oidc?.isAuthenticated()) {
    return res.status(401).json({
      error: 'Authentication required',
      loginUrl: '/auth/login'
    });
  }
  
  if (!req.user) {
    return res.status(401).json({
      error: 'User not found in database',
      message: 'Please contact support'
    });
  }
  
  next();
};

// JWT middleware for API routes (alternative to session-based auth)
export const requireJWT = (req: any, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'Missing or invalid Authorization header',
      expected: 'Bearer <token>'
    });
  }
  
  const token = authHeader.substring(7);
  
  try {
    // Verify JWT token (can be Auth0 token or our custom token)
    const decoded = jwt.verify(token, process.env.JWT_SECRET || process.env.AUTH0_SECRET || '');
    
    // Get user from database
    let user;
    if (typeof decoded === 'object' && decoded.sub) {
      // Auth0 token
      user = db.getUserByAuth0Id(decoded.sub);
    } else if (typeof decoded === 'object' && decoded.id) {
      // Our custom token
      user = db.getUserById(decoded.id);
    }
    
    if (!user) {
      return res.status(401).json({
        error: 'User not found'
      });
    }
    
    req.user = user;
    req.tokenPayload = decoded;
    next();
  } catch (error) {
    return res.status(401).json({
      error: 'Invalid token',
      message: error instanceof Error ? error.message : 'Token verification failed'
    });
  }
};

// Helper function to generate JWT for API access
export const generateJWT = (user: any): string => {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      sub: user.oauth_id || user.id, // Auth0 compatibility
    },
    process.env.JWT_SECRET || process.env.AUTH0_SECRET || '',
    { expiresIn: '7d' }
  );
};

// Check if Auth0 is properly configured
export const isAuth0Configured = (): boolean => {
  return !!(
    process.env.AUTH0_SECRET &&
    process.env.AUTH0_CLIENT_ID &&
    process.env.AUTH0_ISSUER_BASE_URL &&
    process.env.AUTH0_CLIENT_SECRET
  );
};

export default auth0Config;