# OAuth Quick Start

Enable Google and GitHub login in 5 minutes.

## 1. Install Dependencies

```bash
cd backend
npm install
```

## 2. Get OAuth Credentials

### Google
1. Visit [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Create OAuth Client ID (Web application)
3. Add redirect URI: `http://localhost:4000/auth/google/callback`
4. Copy Client ID and Secret

### GitHub
1. Visit [GitHub OAuth Apps](https://github.com/settings/developers)
2. Create New OAuth App
3. Set callback URL: `http://localhost:4000/auth/github/callback`
4. Copy Client ID and Secret

## 3. Configure Environment

Add to `backend/.env`:

```env
# Required
BACKEND_URL=http://localhost:4000
FRONTEND_URL=http://localhost:3000
SESSION_SECRET=your-random-secret-here

# Google OAuth
GOOGLE_CLIENT_ID=your-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-secret

# GitHub OAuth
GITHUB_CLIENT_ID=your-github-id
GITHUB_CLIENT_SECRET=your-github-secret
```

## 4. Build & Run

```bash
npm run build
npm run dev
```

Look for: `✅ Passport OAuth initialized`

## 5. Test

1. Open `http://localhost:3000/login`
2. Click "Continue with Google" or "Continue with GitHub"
3. Authorize and you're in!

## Features

- Automatic wallet creation for OAuth users
- Links OAuth to existing email accounts
- Works alongside email/password login
- Secure JWT token authentication

See [OAUTH_SETUP.md](./OAUTH_SETUP.md) for detailed configuration and production deployment.
