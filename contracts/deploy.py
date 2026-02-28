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

# Allow running from repo root or contracts/
sys.path.insert(0, os.path.dirname(__file__))

import algosdk
from algosdk.v2client import algod as algod_client
from algosdk import transaction, mnemonic, account

from app import compile_contract
from config import (
    ALGOD_URL,
    ALGOD_TOKEN,
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
      2. Deploy app (ApplicationCreate)
      3. Fund app with min-balance
      4. Call create_market() ABI method
    Returns: { app_id, app_address, yes_asa_id, no_asa_id }
    """
    if not DEPLOYER_MNEMONIC:
        raise ValueError("DEPLOYER_MNEMONIC not set in .env")

    algod = get_algod()
    sp    = algod.suggested_params()
    sp.fee = 1000
    sp.flat_fee = True

    # Recover deployer key
    deployer_pk  = mnemonic.to_private_key(DEPLOYER_MNEMONIC)
    deployer_addr = account.address_from_private_key(deployer_pk)
    print(f"[i] Deployer : {deployer_addr}")

    # ── Step 1: Compile ────────────────────────────────────────────────────────
    print("[1] Compiling contract…")
    compile_contract()

    with open(APPROVAL_TEAL) as f:
        approval_src = f.read()
    with open(CLEAR_TEAL) as f:
        clear_src = f.read()
    with open(ABI_JSON) as f:
        abi = json.load(f)

    approval_bytes = compile_teal(algod, approval_src)
    clear_bytes    = compile_teal(algod, clear_src)

    # ── Step 2: Create application ─────────────────────────────────────────────
    print("[2] Deploying application…")
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
        # NOTE: bare create (no ABI method call yet — state initialised below)
    )

    signed_create = create_txn.sign(deployer_pk)
    txid = algod.send_transaction(signed_create)
    print(f"    tx: {txid}")
    result      = wait_for_confirmation(algod, txid)
    app_id      = result["application-index"]
    app_address = algosdk.logic.get_application_address(app_id)
    print(f"[OK] App ID: {app_id}  Address: {app_address}")

    # ── Step 3: Fund contract min-balance ──────────────────────────────────────
    # Needs 0.1 ALGO base + 2 × 0.1 ASA holdings + fee buffer = 0.5 ALGO minimum
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
    print(f"[OK] Funded {MIN_BALANCE_BUFFER} microAlgos → {app_address}")

    # ── Step 4: Call create_market ABI method ──────────────────────────────────
    print("[4] Calling create_market()…")
    sp_inner = algod.suggested_params()
    sp_inner.fee = 3000   # cover 2 inner txns (YES + NO ASA creation) + outer
    sp_inner.flat_fee = True

    contract_abi = algosdk.abi.Contract.from_json(json.dumps(abi))
    create_method = next(m for m in contract_abi.methods if m.name == "create_market")

    atc = algosdk.atomic_transaction_composer.AtomicTransactionComposer()
    signer = algosdk.atomic_transaction_composer.AccountTransactionSigner(deployer_pk)

    atc.add_method_call(
        app_id=app_id,
        method=create_method,
        sender=deployer_addr,
        sp=sp_inner,
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

if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv(os.path.join(os.path.dirname(__file__), "..", "backend", ".env"))

    parser = argparse.ArgumentParser(description="Deploy a CastAlgo prediction market")
    parser.add_argument("--question",  required=True, help="YES/NO market question")
    parser.add_argument("--close-ts",  type=int,       help="Unix close timestamp (default: 24h from now)")
    args = parser.parse_args()

    close_ts = args.close_ts or int(time.time()) + 86_400  # 24 hours
    deploy_market(args.question, close_ts)
