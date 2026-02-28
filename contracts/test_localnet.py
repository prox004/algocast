"""
test_localnet.py — Test LocalNet connection and KMD wallet retrieval

Usage:
  # Set environment variable
  export ALGOD_NETWORK=local  # or set in .env
  python contracts/test_localnet.py
"""

import os
import sys

# Load .env
_here = os.path.dirname(os.path.abspath(__file__))
_env_path = os.path.join(_here, '..', 'backend', '.env')
try:
    from dotenv import load_dotenv
    load_dotenv(_env_path)
except ImportError:
    pass

sys.path.insert(0, os.path.dirname(__file__))

from algosdk.v2client import algod
from algosdk.kmd import KMDClient
from config import ALGOD_URL, ALGOD_TOKEN, ALGOD_NETWORK, KMD_URL, KMD_TOKEN, NETWORK

def test_connection():
    print(f"\n{'='*60}")
    print(f"🌐 Network: {NETWORK.upper()} ({ALGOD_NETWORK})")
    print(f"📡 Algod: {ALGOD_URL}")
    print(f"{'='*60}\n")
    
    # Test Algod connection
    print("[1] Testing Algod connection...")
    algod_client = algod.AlgodClient(ALGOD_TOKEN, ALGOD_URL)
    try:
        status = algod_client.status()
        print(f"✅ Connected to Algod")
        print(f"   Last round: {status['last-round']}")
        print(f"   Time since last round: {status.get('time-since-last-round', 0)}ms")
    except Exception as e:
        print(f"❌ Algod connection failed: {e}")
        return False
    
    # Test KMD if LocalNet
    if ALGOD_NETWORK == "local":
        print(f"\n[2] Testing KMD connection...")
        print(f"📡 KMD: {KMD_URL}")
        
        try:
            kmd = KMDClient(KMD_TOKEN, KMD_URL)
            wallets = kmd.list_wallets()
            print(f"✅ Connected to KMD")
            print(f"   Found {len(wallets)} wallet(s)")
            
            if wallets:
                wallet = wallets[0]
                print(f"\n[3] Retrieving dispenser account...")
                print(f"   Wallet: {wallet['name']}")
                
                # Get wallet handle
                wallet_handle = kmd.init_wallet_handle(wallet['id'], "")
                
                # Get keys
                keys = kmd.list_keys(wallet_handle)
                if keys:
                    address = keys[0]
                    print(f"   Address: {address}")
                    
                    # Check balance
                    account_info = algod_client.account_info(address)
                    balance = account_info.get("amount", 0) / 1_000_000
                    print(f"   Balance: {balance:.6f} ALGO")
                    
                    if balance > 0:
                        print(f"\n✅ LocalNet is ready for deployment!")
                    else:
                        print(f"\n⚠️  Account has no balance - fund it first")
                else:
                    print(f"❌ No keys found in wallet")
                
                kmd.release_wallet_handle(wallet_handle)
            else:
                print(f"❌ No wallets found in KMD")
                
        except Exception as e:
            print(f"❌ KMD connection failed: {e}")
            print(f"\n💡 Make sure AlgoKit LocalNet is running:")
            print(f"   algokit localnet start")
            return False
    else:
        print(f"\n[2] TestNet mode - KMD not used")
    
    print(f"\n{'='*60}")
    return True

if __name__ == "__main__":
    success = test_connection()
    sys.exit(0 if success else 1)
