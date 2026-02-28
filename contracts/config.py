"""
config.py — CastAlgo contract configuration
Reads from environment variables or falls back to TestNet defaults.
"""

import os

# ── Network ────────────────────────────────────────────────────────────────────

ALGOD_URL   = os.getenv("ALGORAND_ALGOD_URL",    "https://testnet-api.algonode.cloud")
ALGOD_TOKEN = os.getenv("ALGORAND_ALGOD_TOKEN",  "")
ALGOD_PORT  = os.getenv("ALGORAND_ALGOD_PORT",   "")

INDEXER_URL   = os.getenv("ALGORAND_INDEXER_URL",  "https://testnet-idx.algonode.cloud")
INDEXER_TOKEN = os.getenv("ALGORAND_INDEXER_TOKEN", "")

NETWORK = os.getenv("ALGORAND_NETWORK", "testnet")

# ── Deployer account ───────────────────────────────────────────────────────────
# Mnemonic of the account that deploys contracts and controls the creator seat.
# In production this is the server wallet (funded on TestNet).

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
GLOBAL_BYTES   = 2   # question, creator
GLOBAL_INTS    = 7   # close_ts, yes_asa_id, no_asa_id, yes_reserve, no_reserve, resolved, outcome

# Local state (per-user opt-in) — not used in custodial model, keep minimal
LOCAL_BYTES = 0
LOCAL_INTS  = 0

# Approval / clear TEAL files output by compiler
APPROVAL_TEAL = "contracts/build/approval.teal"
CLEAR_TEAL    = "contracts/build/clear.teal"
ABI_JSON      = "contracts/build/contract.json"
