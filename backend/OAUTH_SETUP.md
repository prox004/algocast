# OAuth Setup Guide

This guide explains how to configure OAuth authentication for CastAlgo using Google and GitHub providers.

## Overview

OAuth allows users to sign in using their existing Google or GitHub accounts instead of creating a new password. The implementation:

- Uses Passport.js for OAuth strategies
- Automatically creates custodial wallets for new OAuth users
- Links OAuth accounts to existing email/password accounts
- Returns JWT tokens for session management

## Prerequisites

1. Install dependencies:
```bash
cd backend
npm install
```

2. Build TypeScript files:
```bash
npm run build
```

## Google OAuth Setup

### 1. Create Google OAuth Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Navigate to "APIs & Services" > "Credentials"
4. Click "Create Credentials" > "OAuth client ID"
5. Configure the OAuth consent screen if prompted
6. Select "Web application" as the application type
7. Add authorized redirect URIs:
   - Development: `http://localhost:4000/auth/google/callback`
   - Production: `https://your-domain.com/auth/google/callback`
8. Copy the Client ID and Client Secret

### 2. Configure Environment Variables

Add to your `backend/.env` file:

```env
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-client-secret
```

## GitHub OAuth Setup

### 1. Create GitHub OAuth App

1. Go to [GitHub Developer Settings](https://github.com/settings/developers)
2. Click "New OAuth App"
3. Fill in the application details:
   - Application name: CastAlgo
   - Homepage URL: `http://localhost:3000` (or your production URL)
   - Authorization callback URL: `http://localhost:4000/auth/github/callback`
4. Click "Register application"
5. Copy the Client ID
6. Generate a new Client Secret and copy it

### 2. Configure Environment Variables

Add to your `backend/.env` file:

```env
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret
```

## Required Environment Variables

Make sure these are set in `backend/.env`:

```env
# Server URLs
BACKEND_URL=http://localhost:4000
FRONTEND_URL=http://localhost:3000

# Security
JWT_SECRET=your_super_secret_jwt_key_change_this
SESSION_SECRET=your_session_secret_for_oauth_change_this

# OAuth Providers
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-client-secret
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret
```

## Testing OAuth Flow

### 1. Start the Backend

```bash
cd backend
npm run dev
```

You should see:
```
✅ Passport OAuth initialized
🚀 CastAlgo backend running on http://localhost:4000
```

### 2. Start the Frontend

```bash
cd frontend
npm run dev
```

### 3. Test OAuth Login

1. Navigate to `http://localhost:3000/login`
2. Click "Continue with Google" or "Continue with GitHub"
3. Authorize the application
4. You should be redirected back and logged in automatically

## How It Works

### OAuth Flow

1. User clicks "Continue with Google/GitHub"
2. Frontend redirects to `/auth/google` or `/auth/github`
3. Backend redirects to OAuth provider's authorization page
4. User authorizes the application
5. OAuth provider redirects to `/auth/google/callback` or `/auth/github/callback`
6. Backend:
   - Verifies the OAuth response
   - Creates a new user or links to existing account
   - Generates a JWT token
   - Redirects to frontend with token in URL
7. Frontend:
   - Extracts token from URL
   - Stores token in localStorage
   - Redirects to home page

### Database Changes

OAuth users have these additional fields:
- `oauth_provider`: 'google' or 'github'
- `oauth_id`: Provider's user ID
- `hashed_password`: null (OAuth users don't have passwords)

### Account Linking

If a user signs up with email/password and later uses OAuth with the same email:
- The OAuth provider is linked to the existing account
- User can sign in with either method

## Production Deployment

### Update OAuth Redirect URIs

1. Google: Add production callback URL in Google Cloud Console
   - `https://your-domain.com/auth/google/callback`

2. GitHub: Update callback URL in GitHub OAuth App settings
   - `https://your-domain.com/auth/github/callback`

### Update Environment Variables

```env
BACKEND_URL=https://api.your-domain.com
FRONTEND_URL=https://your-domain.com
NODE_ENV=production
```

## Troubleshooting

### "Passport not configured" Warning

This means OAuth credentials are not set. The app will still work with email/password authentication.

### OAuth Callback Errors

- Check that redirect URIs match exactly in OAuth provider settings
- Verify `BACKEND_URL` and `FRONTEND_URL` are correct
- Ensure OAuth credentials are valid

### "No email found" Error

- Google: Make sure email scope is requested
- GitHub: Ensure user has a public email or the app requests email scope

## Security Notes

1. Never commit OAuth credentials to git
2. Use strong, unique secrets for `JWT_SECRET` and `SESSION_SECRET`
3. Enable HTTPS in production
4. Set `cookie.secure: true` in production
5. Regularly rotate OAuth client secrets
6. Monitor OAuth provider dashboards for suspicious activity

## Optional: Additional OAuth Providers

To add more providers (Twitter, Facebook, etc.):

1. Install the passport strategy: `npm install passport-twitter`
2. Add configuration in `backend/src/config/passport.ts`
3. Add routes in `backend/src/routes/auth.js`
4. Add button in `frontend/app/login/page.tsx`
