# Google OAuth Setup - Step by Step

Follow these exact steps to enable "Sign in with Google" for CastAlgo.

## Step 1: Create OAuth Credentials in Google Cloud Console

### A. Configure OAuth Consent Screen (First Time Only)

1. Go to https://console.cloud.google.com/apis/credentials
2. If prompted, click **"CONFIGURE CONSENT SCREEN"**
3. Choose **"External"** → Click **"CREATE"**
4. Fill in the form:
   - **App name**: `CastAlgo`
   - **User support email**: Your email address
   - **Developer contact information**: Your email address
5. Click **"SAVE AND CONTINUE"**
6. On "Scopes" page: Click **"SAVE AND CONTINUE"** (skip this)
7. On "Test users" page: Click **"SAVE AND CONTINUE"** (skip this)
8. Review and click **"BACK TO DASHBOARD"**

### B. Create OAuth Client ID

1. Click **"Credentials"** in the left sidebar
2. Click **"+ CREATE CREDENTIALS"** at the top
3. Select **"OAuth client ID"**
4. Configure:
   - **Application type**: `Web application`
   - **Name**: `CastAlgo Backend`
   - **Authorized redirect URIs**: Click **"+ ADD URI"** and enter:
     ```
     http://localhost:4000/auth/google/callback
     ```
5. Click **"CREATE"**

### C. Copy Your Credentials

A popup appears with:
- **Your Client ID**: Looks like `123456789-abc.apps.googleusercontent.com`
- **Your Client Secret**: A random string like `GOCSPX-abc123...`

**Keep this popup open** or click "DOWNLOAD JSON" to save them.

## Step 2: Update Your Environment File

Open `backend/.env` and replace these lines:

```env
SESSION_SECRET=your-session-secret-for-oauth-change-this
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-client-secret
```

With your actual values:

```env
SESSION_SECRET=some-random-secret-string-make-it-long
GOOGLE_CLIENT_ID=123456789-abc.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-abc123xyz...
```

**Tip**: For `SESSION_SECRET`, use any random string (at least 32 characters). Example:
```env
SESSION_SECRET=my-super-secret-session-key-2024-castalgo-oauth
```

## Step 3: Test It!

1. **Start the backend**:
   ```bash
   cd backend
   npm run dev
   ```

2. **Look for this message**:
   ```
   ✅ Passport OAuth initialized
   🚀 CastAlgo backend running on http://localhost:4000
   ```

3. **Start the frontend** (in a new terminal):
   ```bash
   cd frontend
   npm run dev
   ```

4. **Test the login**:
   - Open http://localhost:3000/login
   - Click **"Continue with Google"**
   - Sign in with your Google account
   - You should be redirected back and logged in!

## Troubleshooting

### "Passport not configured" warning
- Check that `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set correctly in `.env`
- Make sure there are no extra spaces or quotes around the values
- Restart the backend server after changing `.env`

### "redirect_uri_mismatch" error
- The redirect URI in Google Console must exactly match: `http://localhost:4000/auth/google/callback`
- Check for trailing slashes or typos
- Make sure `BACKEND_URL=http://localhost:4000` in your `.env`

### OAuth works but can't see the button
- Make sure frontend is running on http://localhost:3000
- Clear browser cache and reload
- Check browser console for errors

## Production Setup (Later)

When deploying to production:

1. Go back to Google Cloud Console → Credentials
2. Edit your OAuth Client ID
3. Add production redirect URI:
   ```
   https://your-domain.com/auth/google/callback
   ```
4. Update `.env` for production:
   ```env
   BACKEND_URL=https://api.your-domain.com
   FRONTEND_URL=https://your-domain.com
   NODE_ENV=production
   ```

## What Happens When Users Sign In?

1. User clicks "Continue with Google"
2. Redirected to Google to authorize
3. Google redirects back to your app
4. Backend creates a user account (if new) with:
   - Email from Google
   - Automatic Algorand wallet
   - No password needed
5. User is logged in with JWT token

## Security Notes

- Never commit your `.env` file to git (it's already in `.gitignore`)
- Keep your `GOOGLE_CLIENT_SECRET` private
- Use a strong `SESSION_SECRET` in production
- Enable HTTPS in production

---

That's it! You now have Google OAuth login working. 🎉
