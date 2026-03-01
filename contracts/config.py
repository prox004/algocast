"""
config.py — CastAlgo contract configuration
Reads from environment variables or falls back to TestNet defaults.
"""

import os

# ── Network Selection ──────────────────────────────────────────────────────────

ALGOD_NETWORK = os.getenv("ALGOD_NETWORK", "local")  # "local" or "testnet"

# LocalNet (AlgoKit) configuration
if ALGOD_NETWORK == "local":
    ALGOD_URL   = "http://localhost:4001"
    ALGOD_TOKEN = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    KMD_URL     = "http://localhost:4002"
    KMD_TOKEN   = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    NETWORK     = "localnet"
else:
    # TestNet configuration
    ALGOD_URL   = os.getenv("ALGORAND_ALGOD_URL", "https://testnet-api.algonode.cloud")
    ALGOD_TOKEN = os.getenv("ALGORAND_ALGOD_TOKEN", "")
    KMD_URL     = None
    KMD_TOKEN   = None
    NETWORK     = "testnet"

ALGOD_PORT = os.getenv("ALGORAND_ALGOD_PORT", "")

INDEXER_URL   = os.getenv("ALGORAND_INDEXER_URL", "https://testnet-idx.algonode.cloud")
INDEXER_TOKEN = os.getenv("ALGORAND_INDEXER_TOKEN", "")

# ── Deployer account ───────────────────────────────────────────────────────────
# Mnemonic of the account that deploys contracts and controls the creator seat.
# In production this is the server wallet (funded on TestNet).
# For LocalNet, this will be retrieved from KMD automatically.

DEPLOYER_MNEMONIC = os.getenv("DEPLOYER_MNEMONIC", "")

# ── Contract constants ─────────────────────────────────────────────────────────

# Minimum balance buffer kept in each contract account (microAlgos).
# 0.1 ALGO base + 0.1 per ASA held = 0.3 ALGO for 2 ASAs + buffer
MIN_BALANCE_BUFFER = 500_000   # 0.5 ALGO

# YES / NO ASA total supply minted on market creation
ASA_TOTAL_SUPPLY = 1_000_000_000  # 1 billion smallest units

# ASA decimals — 0 means 1 token = 1 unit (no fractional tokens)
ASA_DECIMALS = 0

# Global state byte-slices used by the contract (schema declaration)
GLOBAL_BYTES   = 3   # question, creator, multisig
GLOBAL_INTS    = 7   # close_ts, yes_asa_id, no_asa_id, yes_reserve, no_reserve, resolved, outcome

# Local state (per-user opt-in) — not used in custodial model, keep minimal
LOCAL_BYTES = 0
LOCAL_INTS  = 0

# Approval / clear TEAL files output by compiler
APPROVAL_TEAL = "contracts/build/approval.teal"
CLEAR_TEAL    = "contracts/build/clear.teal"
ABI_JSON      = "contracts/build/contract.json"
