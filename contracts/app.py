"""
app.py — CastAlgo Market Smart Contract (ARC-4 ABI via PyTeal Router)

One application instance is deployed per prediction market.
The deployer (backend server wallet) is the market creator.

Global State (9 slots: 2 bytes + 7 ints):
  question    → bytes  : market question text
  creator     → bytes  : deployer address (admin)
  close_ts    → uint64 : unix timestamp after which trading stops
  yes_asa_id  → uint64 : YES token ASA ID
  no_asa_id   → uint64 : NO token ASA ID
  yes_reserve → uint64 : total microAlgos deposited to buy YES
  no_reserve  → uint64 : total microAlgos deposited to buy NO
  resolved    → uint64 : 0 = open, 1 = resolved
  outcome     → uint64 : 0 = NO wins, 1 = YES wins (valid only when resolved=1)

ABI Methods:
  create_market(question: string, close_ts: uint64) → void
  buy_yes(payment: pay) → uint64          (returns tokens issued)
  buy_no(payment: pay)  → uint64
  resolve_market(outcome: uint64) → void
  claim() → uint64                        (returns payout in microAlgos)

Compile with:
  python app.py
Outputs:
  contracts/build/approval.teal
  contracts/build/clear.teal
  contracts/build/contract.json
"""

import json
import os
import pyteal as pt

from config import (
    ASA_TOTAL_SUPPLY,
    ASA_DECIMALS,
    GLOBAL_BYTES,
    GLOBAL_INTS,
    LOCAL_BYTES,
    LOCAL_INTS,
    APPROVAL_TEAL,
    CLEAR_TEAL,
    ABI_JSON,
)
from market_logic import (
    KEY_QUESTION,
    KEY_CLOSE_TS,
    KEY_YES_ASA,
    KEY_NO_ASA,
    KEY_YES_RESERVE,
    KEY_NO_RESERVE,
    KEY_RESOLVED,
    KEY_OUTCOME,
    KEY_CREATOR,
    KEY_MULTISIG,
    handle_buy_yes,
    handle_buy_no,
    handle_resolve,
    handle_claim,
)
from asa_utils import create_asa

# ── ABI Router ────────────────────────────────────────────────────────────────

router = pt.Router(
    name="CastAlgoMarket",
    bare_calls=pt.BareCallActions(
        # Allow the deployer to fund the contract min-balance
        no_op=pt.OnCompleteAction.create_only(pt.Approve()),
    ),
)


# ── create_market ─────────────────────────────────────────────────────────────

@router.method
def create_market(
    question: pt.abi.String,
    close_ts: pt.abi.Uint64,
    multisig_addr: pt.abi.Address,
) -> pt.Expr:
    """
    Called once after deployment to initialise state and mint YES/NO ASAs.
    Protected by a close_ts == 0 guard so it can never be called twice.
    multisig_addr: the 2-of-3 admin multisig address authorised to resolve.
    """
    app_addr = pt.Global.current_application_address()

    return pt.Seq(
        # Guard: can only be called once (close_ts starts at 0)
        pt.Assert(pt.App.globalGet(KEY_CLOSE_TS) == pt.Int(0), comment="already initialized"),
        # Validate inputs
        pt.Assert(close_ts.get() > pt.Global.latest_timestamp(), comment="close_ts must be future"),
        pt.Assert(pt.Len(question.get()) > pt.Int(0), comment="question cannot be empty"),
        pt.Assert(pt.Len(question.get()) <= pt.Int(128), comment="question too long"),

        # Store market metadata
        pt.App.globalPut(KEY_CREATOR,   pt.Txn.sender()),
        pt.App.globalPut(KEY_MULTISIG,  multisig_addr.get()),
        pt.App.globalPut(KEY_QUESTION,  question.get()),
        pt.App.globalPut(KEY_CLOSE_TS,  close_ts.get()),
        pt.App.globalPut(KEY_YES_RESERVE, pt.Int(0)),
        pt.App.globalPut(KEY_NO_RESERVE,  pt.Int(0)),
        pt.App.globalPut(KEY_RESOLVED,    pt.Int(0)),
        pt.App.globalPut(KEY_OUTCOME,     pt.Int(0)),

        # Fund contract with inner txn fee budget (caller must pre-fund via payment group)
        # Create YES ASA
        create_asa(
            name=pt.Bytes("CastAlgo YES"),
            unit_name=pt.Bytes("YES"),
            total=pt.Int(ASA_TOTAL_SUPPLY),
            decimals=pt.Int(ASA_DECIMALS),
            manager=app_addr,
            reserve=app_addr,
            clawback=app_addr,   # Contract is clawback → enables burn
            freeze=pt.Global.zero_address(),
        ),
        pt.App.globalPut(KEY_YES_ASA, pt.InnerTxn.created_asset_id()),

        # Create NO ASA
        create_asa(
            name=pt.Bytes("CastAlgo NO"),
            unit_name=pt.Bytes("NO"),
            total=pt.Int(ASA_TOTAL_SUPPLY),
            decimals=pt.Int(ASA_DECIMALS),
            manager=app_addr,
            reserve=app_addr,
            clawback=app_addr,
            freeze=pt.Global.zero_address(),
        ),
        pt.App.globalPut(KEY_NO_ASA, pt.InnerTxn.created_asset_id()),

        pt.Approve(),
    )


# ── buy_yes ───────────────────────────────────────────────────────────────────

@router.method
def buy_yes(
    payment: pt.abi.PaymentTransaction,
    *,
    output: pt.abi.Uint64,
) -> pt.Expr:
    """
    Atomic group: [pay txn → contract] + [this app call].
    Validates payment, updates yes_reserve, sends YES tokens to buyer.
    Returns number of tokens issued.
    """
    pay_txn = payment.get()
    amount  = pay_txn.amount()
    buyer   = pay_txn.sender()

    tokens = pt.ScratchVar(pt.TealType.uint64)

    return pt.Seq(
        pt.Assert(
            pay_txn.receiver() == pt.Global.current_application_address(),
            comment="payment must go to contract",
        ),
        pt.Assert(
            pay_txn.sender() == pt.Txn.sender(),
            comment="payment sender must match caller",
        ),
        handle_buy_yes(amount, buyer),
        tokens.store(amount),   # 1:1 hackathon pricing
        output.set(tokens.load()),
    )


# ── buy_no ────────────────────────────────────────────────────────────────────

@router.method
def buy_no(
    payment: pt.abi.PaymentTransaction,
    *,
    output: pt.abi.Uint64,
) -> pt.Expr:
    """
    Mirror of buy_yes for NO tokens.
    """
    pay_txn = payment.get()
    amount  = pay_txn.amount()
    buyer   = pay_txn.sender()

    tokens = pt.ScratchVar(pt.TealType.uint64)

    return pt.Seq(
        pt.Assert(
            pay_txn.receiver() == pt.Global.current_application_address(),
            comment="payment must go to contract",
        ),
        pt.Assert(
            pay_txn.sender() == pt.Txn.sender(),
            comment="payment sender must match caller",
        ),
        handle_buy_no(amount, buyer),
        tokens.store(amount),
        output.set(tokens.load()),
    )


# ── resolve_market ────────────────────────────────────────────────────────────

@router.method
def resolve_market(outcome: pt.abi.Uint64) -> pt.Expr:
    """
    Called by the creator (backend) after market close_ts.
    outcome: 0 = NO wins, 1 = YES wins.
    """
    return handle_resolve(outcome.get(), pt.Txn.sender())


# ── claim ─────────────────────────────────────────────────────────────────────

@router.method
def claim(*, output: pt.abi.Uint64) -> pt.Expr:
    """
    Called by the winner.  In custodial model the backend calls this on
    behalf of the user (Txn.sender() = user's custodial address).

    Burns winning tokens via clawback and pays out ALGO 1:1.
    Returns payout amount in microAlgos.
    """
    # Store payout for return value
    payout = pt.ScratchVar(pt.TealType.uint64)
    outcome = pt.App.globalGet(KEY_OUTCOME)
    winning_asa = pt.If(outcome == pt.Int(1))                   \
                    .Then(pt.App.globalGet(KEY_YES_ASA))        \
                    .Else(pt.App.globalGet(KEY_NO_ASA))

    balance_val = pt.AssetHolding.balance(pt.Txn.sender(), winning_asa)

    return pt.Seq(
        handle_claim(pt.Txn.sender()),
        balance_val,   # load before claim burns tokens (for return value)
        payout.store(balance_val.value()),
        output.set(payout.load()),
    )


# ── Compile ───────────────────────────────────────────────────────────────────

def compile_contract() -> None:
    """Compile approval + clear programs and write ABI JSON."""
    import algosdk

    approval_program, clear_program, contract = router.compile_program(
        version=8,
        optimize=pt.OptimizeOptions(scratch_slots=True),
    )

    os.makedirs("contracts/build", exist_ok=True)

    with open(APPROVAL_TEAL, "w") as f:
        f.write(approval_program)
    print(f"[OK] Approval TEAL written to {APPROVAL_TEAL}")

    with open(CLEAR_TEAL, "w") as f:
        f.write(clear_program)
    print(f"[OK] Clear TEAL written to {CLEAR_TEAL}")

    with open(ABI_JSON, "w") as f:
        f.write(json.dumps(contract.dictify(), indent=2))
    print(f"[OK] ABI JSON written to {ABI_JSON}")


if __name__ == "__main__":
    compile_contract()
