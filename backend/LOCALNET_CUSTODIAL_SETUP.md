# LocalNet Custodial Wallet Setup Guide

## Problem
The custodial wallet wasn't showing in LocalNet accounts because:
1. ❌ The backend was hardcoded to connect to **TestNet** instead of LocalNet
2. ❌ The wallet generation worked locally but couldn't be funded without LocalNet connection
3. ❌ No KMD support for fetching the LocalNet deployer account

## Solution Implemented
✅ Updated `algorand/client.js` to detect and connect to LocalNet  
✅ Updated `transactionBuilder.js` to use KMD for LocalNet funding  
✅ Improved error logging in registration flow  
✅ Updated `.env.example` with LocalNet instructions  

---

## Quick Start for LocalNet

### 1. Start AlgoKit LocalNet
```bash
algokit localnet start
```

This starts:
- **Algod** on `http://localhost:4001`
- **KMD** on `http://localhost:4002`
- **Indexer** on `http://localhost:8980`

### 2. Configure Backend (.env)
Create `backend/.env` (using `.env.example` as template):

```bash
# Network selection
ALGORAND_NETWORK=local

# LocalNet endpoints (these are defaults, but shown here for clarity)
ALGORAND_ALGOD_URL=http://localhost:4001
ALGORAND_ALGOD_TOKEN=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
KMD_URL=http://localhost:4002
KMD_TOKEN=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa

# Security (change these!)
JWT_SECRET=your_super_secret_jwt_key_change_this
WALLET_ENCRYPTION_SECRET=your_aes_encryption_secret_at_least_32_chars!!

# AI/API Keys (optional for testing)
OPENROUTER_API_KEY=sk-or-v1-...
```

### 3. Verify LocalNet Status
```bash
algokit localnet status

# Output should show:
# ✓ Algod: Running on http://localhost:4001
# ✓ KMD: Running on http://localhost:4002
# ✓ Indexer: Running on http://localhost:8980
```

### 4. Start Backend
```bash
cd backend
npm install
npm start
```

You should see:
```
[algod] Using LocalNet: http://localhost:4001
🚀 CastAlgo AI Backend running on port 4000
```

### 5. Test Custodial Wallet Creation
Register a new user:

```bash
curl -X POST http://localhost:4000/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123"
  }'
```

Expected response:
```json
{
  "token": "eyJhbGc...",
  "user": {
    "id": "uuid...",
    "email": "test@example.com",
    "custodial_address": "AAAA...AAAA",
    "balance": 100000000
  }
}
```

### 6. Verify Wallet on LocalNet
Check that the custodial wallet shows in LocalNet accounts:

```bash
algokit localnet console

# In the console:
goal account list

# Output should show:
# [1] test@example.com ...
#     Account AAAA...AAAA
#     Microalgos: 100000000
```

---

## How It Works Now

### LocalNet Flow (Automatic)
```
1. User registers via POST /auth/register
   ↓
2. Backend generates custodial wallet address
   ↓
3. Backend connects to LocalNet KMD
   ↓
4. Gets "unencrypted-default-wallet" from KMD
   ↓
5. Signs funding transaction with deployer account
   ↓
6. Broadcasts to LocalNet Algod
   ↓
7. User receives 100 ALGO in new custodial wallet
```

### TestNet Flow (Manual)
```
1. User registers via POST /auth/register
   ↓
2. Backend generates custodial wallet address
   ↓
3. Backend uses DEPLOYER_MNEMONIC from .env
   ↓
4. Signs funding transaction
   ↓
5. Broadcasts to TestNet
   ↓
6. User receives 100 ALGO
```

---

## Troubleshooting

### "unencrypted-default-wallet not found in KMD"
**Solution:** Restart LocalNet
```bash
algokit localnet stop
algokit localnet reset  # Clears all data
algokit localnet start
```

### "Failed to get account from KMD"
**Check:** LocalNet is running on port 4002
```bash
algokit localnet status
```

### "DEPLOYER_MNEMONIC not set in .env for TestNet"
**Solution:** For LocalNet, you don't need it. For TestNet:
```bash
# Get mnemonic from your Algorand wallet
goal account export -d ~/node/data

# Add to backend/.env
DEPLOYER_MNEMONIC=word1 word2 ... word25
```

### Custodial wallet created but balance is 0
**Check:**
1. LocalNet is running: `algokit localnet status`
2. Backend is using LocalNet: Check logs for `[algod] Using LocalNet:`
3. Restart and retry:
   ```bash
   algokit localnet reset
   algokit localnet start
   # Then register new user
   ```

### "Insufficient balance" on deposit
LocalNet accounts start with 1 billion ALGO. If you see this:
```bash
algokit localnet reset  # Restores all balances
```

---

## Environment Variables Reference

| Variable | LocalNet Default | TestNet | Purpose |
|----------|------------------|---------|---------|
| `ALGORAND_NETWORK` | `local` | `testnet` | Network selection |
| `ALGORAND_ALGOD_URL` | `http://localhost:4001` | `https://testnet-api.algonode.cloud` | Algod endpoint |
| `ALGORAND_ALGOD_TOKEN` | `aaaa...` | `` (empty) | Algod auth token |
| `KMD_URL` | `http://localhost:4002` | N/A | Key Management Daemon |
| `DEPLOYER_MNEMONIC` | Not needed | Required | Wallet for funding users |

---

## Next Steps

1. **Deploy Contract:** `python contracts/deploy.py --question "Test?" --close-ts ...`
2. **Create Frontend:** Connect to `http://localhost:4000` from frontend
3. **Test Trading:** Use custodial wallet to buy YES/NO tokens

---

## Additional Resources

- [AlgoKit LocalNet Docs](https://github.com/algorandfoundation/algokit-cli)
- [Algorand SDK Docs](https://github.com/algorand/js-algorand-sdk)
- [KMD API Reference](https://developer.algorand.org/docs/get-details/kmd/)
