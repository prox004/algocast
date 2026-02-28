# AlgoKit LocalNet Setup for CastAlgo

## Overview

Your deployment script now supports both **TestNet** and **AlgoKit LocalNet**. LocalNet provides:
- Instant transactions (no waiting)
- Unlimited free ALGO
- No faucet needed
- Perfect for development and testing

## Prerequisites

1. **Install AlgoKit**
   ```bash
   # macOS/Linux
   brew install algorandfoundation/tap/algokit
   
   # Windows
   winget install algorandfoundation.algokit
   
   # Or use pip
   pip install algokit
   ```

2. **Install Python dependencies**
   ```bash
   cd contracts
   pip install py-algorand-sdk python-dotenv pyteal
   ```

## Quick Start

### 1. Start LocalNet

```bash
algokit localnet start
```

This starts:
- Algod node on `http://localhost:4001`
- KMD (Key Management Daemon) on `http://localhost:4002`
- Indexer on `http://localhost:8980`

### 2. Test Connection

```bash
# Set network to local
export ALGOD_NETWORK=local

# Or add to backend/.env:
# ALGOD_NETWORK=local

# Test the connection
python contracts/test_localnet.py
```

Expected output:
```
============================================================
🌐 Network: LOCALNET (local)
📡 Algod: http://localhost:4001
============================================================

[1] Testing Algod connection...
✅ Connected to Algod
   Last round: 123
   Time since last round: 0ms

[2] Testing KMD connection...
📡 KMD: http://localhost:4002
✅ Connected to KMD
   Found 1 wallet(s)

[3] Retrieving dispenser account...
   Wallet: unencrypted-default-wallet
   Address: AAAA...AAAA
   Balance: 1000000000.000000 ALGO

✅ LocalNet is ready for deployment!
```

### 3. Deploy Contract

```bash
# Deploy to LocalNet
export ALGOD_NETWORK=local
python contracts/deploy.py --question "Will BTC hit $100k?" --close-ts 1756684800

# Deploy to TestNet (default)
export ALGOD_NETWORK=testnet
python contracts/deploy.py --question "Will BTC hit $100k?" --close-ts 1756684800
```

## Network Switching

The deployment script automatically detects the network based on `ALGOD_NETWORK` environment variable:

| Environment Variable | Network | Algod URL | Wallet Source |
|---------------------|---------|-----------|---------------|
| `ALGOD_NETWORK=local` | LocalNet | `http://localhost:4001` | KMD (auto-funded) |
| `ALGOD_NETWORK=testnet` | TestNet | `https://testnet-api.algonode.cloud` | `DEPLOYER_MNEMONIC` from .env |

## Configuration

### LocalNet (Automatic)
No configuration needed! The script automatically:
1. Connects to KMD
2. Retrieves the first wallet
3. Gets the first funded account
4. Uses it as the deployer

### TestNet (Manual)
Set in `backend/.env`:
```bash
ALGOD_NETWORK=testnet
DEPLOYER_MNEMONIC=your 25 word mnemonic here
```

## Deployment Output

```
============================================================
🌐 Network: LOCALNET (local)
📡 Algod: http://localhost:4001
============================================================

[i] Using LocalNet - retrieving dispenser account from KMD...
[i] Using KMD wallet: unencrypted-default-wallet
[i] Deployer: AAAA...AAAA
[i] Balance: 1000000000.000000 ALGO (1000000000000000 microAlgos)

✅ Connection confirmed - proceeding with deployment...

[1] Compiling contract...
[2] Creating application (bare create)...
    tx: TXID...
[OK] App ID: 1001  Address: APPADDR...
[3] Funding contract min-balance…
[OK] Funded 500000 microAlgos -> APPADDR...
[4] Calling create_market()...
[OK] create_market txid: TXID...
[OK] YES ASA: 1002   NO ASA: 1003

Deployment summary:
{
  "app_id": 1001,
  "app_address": "APPADDR...",
  "yes_asa_id": 1002,
  "no_asa_id": 1003,
  "question": "Will BTC hit $100k?",
  "close_ts": 1756684800
}
```

## Troubleshooting

### "Unable to connect to Algod"
```bash
# Check if LocalNet is running
algokit localnet status

# Start if not running
algokit localnet start
```

### "No wallets found in KMD"
```bash
# Reset LocalNet
algokit localnet reset

# This recreates the default wallet with funded accounts
```

### "Insufficient balance"
LocalNet accounts start with 1 billion ALGO. If you see this error:
```bash
# Reset LocalNet to restore balances
algokit localnet reset
```

### Switch back to TestNet
```bash
export ALGOD_NETWORK=testnet
# or remove ALGOD_NETWORK from .env
```

## Commands Reference

```bash
# LocalNet management
algokit localnet start          # Start LocalNet
algokit localnet stop           # Stop LocalNet
algokit localnet reset          # Reset (clears all data)
algokit localnet status         # Check status

# Deployment
export ALGOD_NETWORK=local      # Use LocalNet
export ALGOD_NETWORK=testnet    # Use TestNet
python contracts/deploy.py --question "..." --close-ts 123456789

# Testing
python contracts/test_localnet.py
```

## Benefits of LocalNet

✅ **Instant transactions** - No waiting for block confirmation  
✅ **Unlimited ALGO** - No faucet limits  
✅ **Fast iteration** - Deploy, test, reset, repeat  
✅ **Offline development** - No internet required  
✅ **Clean state** - Reset anytime with `algokit localnet reset`  

## Next Steps

1. Start LocalNet: `algokit localnet start`
2. Test connection: `python contracts/test_localnet.py`
3. Deploy your first market: `python contracts/deploy.py --question "Test market?" --close-ts $(date -d '+30 days' +%s)`
4. Integrate with your backend at `http://localhost:4000`

Happy building! 🚀
