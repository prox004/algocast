/**
 * config/passport.ts
 * OAuth configuration using Passport.js
 * Supports Google and GitHub OAuth providers
 */

import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as GitHubStrategy } from 'passport-github2';
import { v4 as uuidv4 } from 'uuid';
const db = require('../db');
const { generateCustodialWallet } = require('../wallet/custodialWallet');

// Serialize user for session (not used with JWT, but required by passport)
passport.serializeUser((user: any, done) => {
  done(null, user.id);
});

passport.deserializeUser((id: string, done) => {
  const user = db.getUserById(id);
  done(null, user);
});

// Google OAuth Strategy
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: `${process.env.BACKEND_URL || 'http://localhost:4000'}/auth/google/callback`,
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          const email = profile.emails?.[0]?.value;
          if (!email) {
            return done(new Error('No email found in Google profile'));
          }

          // Check if user exists
          let user = db.getUserByEmail(email.toLowerCase());

          if (!user) {
            // Create new user with OAuth
            const { address, encryptedKey } = generateCustodialWallet();
            user = db.createUser({
              id: uuidv4(),
              email: email.toLowerCase(),
              hashed_password: null, // OAuth users don't have passwords
              custodial_address: address,
              encrypted_private_key: encryptedKey,
              balance: 0,
              oauth_provider: 'google',
              oauth_id: profile.id,
            });
          } else if (!user.oauth_provider) {
            // Link OAuth to existing email/password account
            db.updateUserOAuth(user.id, 'google', profile.id);
          }

          return done(null, user);
        } catch (error) {
          return done(error);
        }
      }
    )
  );
}

// GitHub OAuth Strategy
if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
  passport.use(
    new GitHubStrategy(
      {
        clientID: process.env.GITHUB_CLIENT_ID,
        clientSecret: process.env.GITHUB_CLIENT_SECRET,
        callbackURL: `${process.env.BACKEND_URL || 'http://localhost:4000'}/auth/github/callback`,
        scope: ['user:email'],
      },
      async (accessToken: string, refreshToken: string, profile: any, done: any) => {
        try {
          const email = profile.emails?.[0]?.value;
          if (!email) {
            return done(new Error('No email found in GitHub profile'));
          }

          // Check if user exists
          let user = db.getUserByEmail(email.toLowerCase());

          if (!user) {
            // Create new user with OAuth
            const { address, encryptedKey } = generateCustodialWallet();
            user = db.createUser({
              id: uuidv4(),
              email: email.toLowerCase(),
              hashed_password: null,
              custodial_address: address,
              encrypted_private_key: encryptedKey,
              balance: 0,
              oauth_provider: 'github',
              oauth_id: profile.id,
            });
          } else if (!user.oauth_provider) {
            // Link OAuth to existing email/password account
            db.updateUserOAuth(user.id, 'github', profile.id);
          }

          return done(null, user);
        } catch (error) {
          return done(error);
        }
      }
    )
  );
}

export default passport;
