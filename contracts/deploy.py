"""
deploy.py — CastAlgo market deployment script

Usage:
  python contracts/deploy.py --question "Will BTC exceed $100k in 2026?" --close-ts 1756684800

This script:
  1. Compiles the contract (approval + clear TEAL)
  2. Deploys a new application to Algorand TestNet
  3. Funds the contract with minimum balance
  4. Calls create_market() to initialize state + mint YES/NO ASAs
  5. Prints app_id, yes_asa_id, no_asa_id  → store these in your DB

Requirements:
  pip install pyteal==0.26.1 py-algorand-sdk
  Set DEPLOYER_MNEMONIC in your .env
"""

import argparse
import base64
import json
import time
import os
import sys

# ── Load .env BEFORE importing config (so os.getenv picks up values) ──────────
_here = os.path.dirname(os.path.abspath(__file__))
_env_path = os.path.join(_here, '..', 'backend', '.env')
try:
    from dotenv import load_dotenv
    load_dotenv(_env_path)
except ImportError:
    pass  # python-dotenv optional; env vars can be set manually

# Allow running from repo root or contracts/
sys.path.insert(0, os.path.dirname(__file__))

import algosdk
from algosdk.v2client import algod as algod_client
from algosdk.kmd import KMDClient
from algosdk import transaction, mnemonic, account

from app import compile_contract
from config import (
    ALGOD_URL,
    ALGOD_TOKEN,
    ALGOD_NETWORK,
    KMD_URL,
    KMD_TOKEN,
    NETWORK,
    DEPLOYER_MNEMONIC,
    MIN_BALANCE_BUFFER,
    APPROVAL_TEAL,
    CLEAR_TEAL,
    ABI_JSON,
    GLOBAL_BYTES,
    GLOBAL_INTS,
    LOCAL_BYTES,
    LOCAL_INTS,
)


# ── Helpers ────────────────────────────────────────────────────────────────────

def get_algod() -> algod_client.AlgodClient:
    return algod_client.AlgodClient(ALGOD_TOKEN, ALGOD_URL)


def get_localnet_account() -> tuple[str, str]:
    """
    Retrieve the funded LocalNet dispenser account from KMD.
    Returns: (private_key, address)
    """
    if not KMD_URL or not KMD_TOKEN:
        raise ValueError("KMD not configured - only available for LocalNet")
    
    kmd = KMDClient(KMD_TOKEN, KMD_URL)
    
    # Get first wallet
    wallets = kmd.list_wallets()
    if not wallets:
        raise ValueError("No wallets found in KMD")
    
    wallet_id = wallets[0]["id"]
    wallet_name = wallets[0]["name"]
    print(f"[i] Using KMD wallet: {wallet_name}")
    
    # Get wallet handle (use empty password for LocalNet default wallet)
    wallet_handle = kmd.init_wallet_handle(wallet_id, "")
    
    # Get first key from wallet
    keys = kmd.list_keys(wallet_handle)
    if not keys:
        raise ValueError("No keys found in wallet")
    
    address = keys[0]
    
    # Export private key
    private_key = kmd.export_key(wallet_handle, "", address)
    
    # Release wallet handle
    kmd.release_wallet_handle(wallet_handle)
    
    return private_key, address


def get_deployer_credentials() -> tuple[str, str]:
    """
    Get deployer private key and address based on network.
    Returns: (private_key, address)
    """
    if ALGOD_NETWORK == "local":
        print("[i] Using LocalNet - retrieving dispenser account from KMD...")
        return get_localnet_account()
    else:
        if not DEPLOYER_MNEMONIC:
            raise ValueError("DEPLOYER_MNEMONIC not set in .env for TestNet")
        private_key = mnemonic.to_private_key(DEPLOYER_MNEMONIC)
        address = account.address_from_private_key(private_key)
        return private_key, address


def check_balance(algod: algod_client.AlgodClient, address: str) -> int:
    """
    Check account balance and print in ALGO.
    Returns: balance in microAlgos
    """
    account_info = algod.account_info(address)
    balance_microalgos = account_info.get("amount", 0)
    balance_algos = balance_microalgos / 1_000_000
    print(f"[i] Balance: {balance_algos:.6f} ALGO ({balance_microalgos} microAlgos)")
    return balance_microalgos


def compile_teal(algod: algod_client.AlgodClient, teal_src: str) -> bytes:
    response = algod.compile(teal_src)
    return base64.b64decode(response["result"])


def wait_for_confirmation(algod: algod_client.AlgodClient, txid: str) -> dict:
    last_round = algod.status()["last-round"]
    while True:
        txn_info = algod.pending_transaction_info(txid)
        if txn_info.get("confirmed-round", 0) > 0:
            return txn_info
        if txn_info.get("pool-error"):
            raise Exception(f"Transaction rejected: {txn_info['pool-error']}")
        algod.status_after_block(last_round + 1)
        last_round += 1


# ── Deploy ─────────────────────────────────────────────────────────────────────

def deploy_market(question: str, close_ts: int) -> dict:
    """
    Full deployment flow:
      1. Compile contract
      2. Bare ApplicationCreate (no method call)
      3. Fund app with min-balance (so inner txns in step 4 can pay fees)
      4. Call create_market() as a regular NoOp ABI call
      5. Read YES/NO ASA IDs from global state
    Returns: { app_id, app_address, yes_asa_id, no_asa_id }
    """
    # ── Network & Account Setup ────────────────────────────────────────────────
    print(f"\n{'='*60}")
    print(f"🌐 Network: {NETWORK.upper()} ({ALGOD_NETWORK})")
    print(f"📡 Algod: {ALGOD_URL}")
    print(f"{'='*60}\n")
    
    algod = get_algod()
    
    # Get deployer credentials (KMD for LocalNet, mnemonic for TestNet)
    deployer_pk, deployer_addr = get_deployer_credentials()
    print(f"[i] Deployer: {deployer_addr}")
    
    # Check balance
    balance = check_balance(algod, deployer_addr)
    min_required = MIN_BALANCE_BUFFER + 10_000  # Buffer + fees
    if balance < min_required:
        raise ValueError(
            f"Insufficient balance: {balance / 1_000_000:.6f} ALGO\n"
            f"Required: {min_required / 1_000_000:.6f} ALGO\n"
            f"Please fund the account: {deployer_addr}"
        )
    
    print(f"\n✅ Connection confirmed - proceeding with deployment...\n")
    
    sp = algod.suggested_params()
    sp.fee = 1000
    sp.flat_fee = True

    # ── Step 1: Compile ────────────────────────────────────────────────────────
    print("[1] Compiling contract...")
    compile_contract()

    with open(APPROVAL_TEAL) as f:
        approval_src = f.read()
    with open(CLEAR_TEAL) as f:
        clear_src = f.read()
    with open(ABI_JSON) as f:
        abi = json.load(f)

    approval_bytes = compile_teal(algod, approval_src)
    clear_bytes    = compile_teal(algod, clear_src)

    # ── Step 2: Bare ApplicationCreate ────────────────────────────────────────
    # No ABI method in this txn; create_market called separately after funding.
    print("[2] Creating application (bare create)...")
    create_txn = transaction.ApplicationCreateTxn(
        sender=deployer_addr,
        sp=sp,
        on_complete=transaction.OnComplete.NoOpOC,
        approval_program=approval_bytes,
        clear_program=clear_bytes,
        global_schema=transaction.StateSchema(
            num_uints=GLOBAL_INTS,
            num_byte_slices=GLOBAL_BYTES,
        ),
        local_schema=transaction.StateSchema(
            num_uints=LOCAL_INTS,
            num_byte_slices=LOCAL_BYTES,
        ),
    )

    signed_create = create_txn.sign(deployer_pk)
    txid          = algod.send_transaction(signed_create)
    print(f"    tx: {txid}")
    result      = wait_for_confirmation(algod, txid)
    app_id      = result["application-index"]
    app_address = algosdk.logic.get_application_address(app_id)
    print(f"[OK] App ID: {app_id}  Address: {app_address}")

    # ── Step 3: Fund contract min-balance ──────────────────────────────────────
    # Must fund BEFORE create_market so inner txns (ASA creation) can pay fees.
    # 0.1 ALGO base + 2×0.1 ASA slots + 3×fee buffer = 0.5 ALGO minimum.
    print("[3] Funding contract min-balance…")
    fund_txn = transaction.PaymentTxn(
        sender=deployer_addr,
        sp=sp,
        receiver=app_address,
        amt=MIN_BALANCE_BUFFER,
    )
    signed_fund = fund_txn.sign(deployer_pk)
    fund_txid   = algod.send_transaction(signed_fund)
    wait_for_confirmation(algod, fund_txid)
    print(f"[OK] Funded {MIN_BALANCE_BUFFER} microAlgos -> {app_address}")

    # ── Step 4: Call create_market() ABI method ──────────────────────────────
    print("[4] Calling create_market()...")
    # Fee = 1 outer + 2 inner txns (YES ASA + NO ASA) = 3000 microAlgos
    sp_init = algod.suggested_params()
    sp_init.fee      = 3000
    sp_init.flat_fee = True

    contract_abi  = algosdk.abi.Contract.from_json(json.dumps(abi))
    create_method = next(m for m in contract_abi.methods if m.name == "create_market")
    signer        = algosdk.atomic_transaction_composer.AccountTransactionSigner(deployer_pk)

    atc = algosdk.atomic_transaction_composer.AtomicTransactionComposer()
    atc.add_method_call(
        app_id=app_id,
        method=create_method,
        sender=deployer_addr,
        sp=sp_init,
        signer=signer,
        method_args=[question, close_ts],
    )

    result_atc = atc.execute(algod, 4)
    print(f"[OK] create_market txid: {result_atc.tx_ids[0]}")

    # ── Step 5: Read state ─────────────────────────────────────────────────────
    state      = algod.application_info(app_id)["params"]["global-state"]
    state_dict = _decode_state(state)

    yes_asa_id = state_dict.get("yes_asa_id", 0)
    no_asa_id  = state_dict.get("no_asa_id", 0)
    print(f"[OK] YES ASA: {yes_asa_id}   NO ASA: {no_asa_id}")

    deployment = {
        "app_id":      app_id,
        "app_address": app_address,
        "yes_asa_id":  yes_asa_id,
        "no_asa_id":   no_asa_id,
        "question":    question,
        "close_ts":    close_ts,
    }
    print("\nDeployment summary:")
    print(json.dumps(deployment, indent=2))
    return deployment


# ── State decoder ──────────────────────────────────────────────────────────────

def _decode_state(state: list) -> dict:
    """Decode Algorand global state to a Python dict."""
    result = {}
    for item in state:
        key = base64.b64decode(item["key"]).decode("utf-8", errors="replace")
        val = item["value"]
        if val["type"] == 1:  # bytes
            result[key] = base64.b64decode(val["bytes"])
        else:                 # uint
            result[key] = val["uint"]
    return result


# ── CLI ────────────────────────────────────────────────────────────────────────

def register_market_with_backend(deployment: dict, backend_url: str, token: str) -> None:
    """
    POST the deployed market to the backend so it appears in the app.
    Requires a valid JWT (log in first: POST /auth/login).
    """
    import urllib.request
    import urllib.error

    payload = {
        "question":   deployment["question"],
        "expiry":     deployment["close_ts"],
        "app_id":     deployment["app_id"],
        "app_address": deployment["app_address"],
        "yes_asa_id": deployment["yes_asa_id"],
        "no_asa_id":  deployment["no_asa_id"],
    }
    data = json.dumps(payload).encode()
    req  = urllib.request.Request(
        f"{backend_url}/markets/generate",
        data=data,
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {token}"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            body = json.loads(resp.read())
            print(f"\n[OK] Market registered - backend id: {body['market']['id']}")
    except urllib.error.HTTPError as e:
        print(f"\n[WARN] Backend registration failed ({e.code}): {e.read().decode()}")
        print("       Register manually: POST /markets/generate with the deployment JSON above.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Deploy a CastAlgo prediction market")
    parser.add_argument("--question",     required=True,  help="YES/NO market question")
    parser.add_argument("--close-ts",     type=int,       help="Unix close timestamp (default: 30d from now)")
    parser.add_argument("--backend-url",  default="http://localhost:4000", help="Backend API URL")
    parser.add_argument("--token",        default="",     help="JWT token (optional — skips backend registration if omitted)")
    args = parser.parse_args()

    close_ts = args.close_ts or int(time.time()) + 30 * 86_400  # 30 days

    result = deploy_market(args.question, close_ts)

    if args.token:
        register_market_with_backend(result, args.backend_url, args.token)
    else:
        print("\n[i] Pass --token <JWT> to auto-register this market with the backend.")
        print("    Or POST to /markets/generate manually with the JSON above.")
