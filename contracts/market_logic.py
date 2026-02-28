"""
market_logic.py — Buy / Resolve / Claim subroutines
Called from app.py to keep the main contract file clean.
Each function returns a PyTeal Expr or Subroutine.
"""

import pyteal as pt
from asa_utils import send_asa, burn_asa, send_algo

# ── Global state keys (shared with app.py) ────────────────────────────────────

KEY_QUESTION    = pt.Bytes("question")
KEY_CLOSE_TS    = pt.Bytes("close_ts")
KEY_YES_ASA     = pt.Bytes("yes_asa_id")
KEY_NO_ASA      = pt.Bytes("no_asa_id")
KEY_YES_RESERVE = pt.Bytes("yes_reserve")
KEY_NO_RESERVE  = pt.Bytes("no_reserve")
KEY_RESOLVED    = pt.Bytes("resolved")
KEY_OUTCOME     = pt.Bytes("outcome")
KEY_CREATOR     = pt.Bytes("creator")


# ── Guard helpers ─────────────────────────────────────────────────────────────

def assert_not_resolved() -> pt.Expr:
    """Abort if market already resolved."""
    return pt.Assert(
        pt.App.globalGet(KEY_RESOLVED) == pt.Int(0),
        comment="market already resolved",
    )


def assert_trading_open() -> pt.Expr:
    """Abort if trading window is closed (past close_ts)."""
    return pt.Assert(
        pt.Global.latest_timestamp() < pt.App.globalGet(KEY_CLOSE_TS),
        comment="market trading window closed",
    )


def assert_creator(caller: pt.Expr) -> pt.Expr:
    """Abort if caller is not the market creator."""
    return pt.Assert(
        caller == pt.App.globalGet(KEY_CREATOR),
        comment="only creator may call this",
    )


def assert_resolved() -> pt.Expr:
    """Abort if market is NOT resolved yet."""
    return pt.Assert(
        pt.App.globalGet(KEY_RESOLVED) == pt.Int(1),
        comment="market not resolved yet",
    )


# ── Pricing helper ────────────────────────────────────────────────────────────

@pt.Subroutine(pt.TealType.uint64)
def compute_yes_probability() -> pt.Expr:
    """
    Returns yes_reserve * 10_000 / (yes_reserve + no_reserve).
    Yields integer basis points (0–10000) to avoid floats.
    Returns 5000 (50%) if no reserves yet.
    """
    yes_r = pt.App.globalGet(KEY_YES_RESERVE)
    no_r  = pt.App.globalGet(KEY_NO_RESERVE)
    total = yes_r + no_r
    return pt.If(total == pt.Int(0))          \
             .Then(pt.Int(5_000))             \
             .Else(yes_r * pt.Int(10_000) / total)


@pt.Subroutine(pt.TealType.uint64)
def tokens_for_amount(amount_micro: pt.Expr) -> pt.Expr:
    """
    Hackathon pricing: 1:1 token issuance.
    amount_micro microAlgos → amount_micro tokens.
    """
    return amount_micro


# ── Buy logic ─────────────────────────────────────────────────────────────────

def handle_buy_yes(payment_amount: pt.Expr, buyer: pt.Expr) -> pt.Expr:
    """
    Core buy-YES logic.
      - payment_amount : microAlgos received (from preceding payment txn)
      - buyer          : address to send YES tokens to
    Updates yes_reserve and sends YES ASA tokens to buyer.
    """
    tokens = pt.ScratchVar(pt.TealType.uint64)
    return pt.Seq(
        assert_not_resolved(),
        assert_trading_open(),
        pt.Assert(payment_amount > pt.Int(0), comment="amount must be positive"),
        tokens.store(tokens_for_amount(payment_amount)),
        pt.App.globalPut(KEY_YES_RESERVE, pt.App.globalGet(KEY_YES_RESERVE) + payment_amount),
        send_asa(
            asset_id=pt.App.globalGet(KEY_YES_ASA),
            receiver=buyer,
            amount=tokens.load(),
        ),
    )


def handle_buy_no(payment_amount: pt.Expr, buyer: pt.Expr) -> pt.Expr:
    """
    Core buy-NO logic. Mirror of handle_buy_yes for NO tokens.
    """
    tokens = pt.ScratchVar(pt.TealType.uint64)
    return pt.Seq(
        assert_not_resolved(),
        assert_trading_open(),
        pt.Assert(payment_amount > pt.Int(0), comment="amount must be positive"),
        tokens.store(tokens_for_amount(payment_amount)),
        pt.App.globalPut(KEY_NO_RESERVE, pt.App.globalGet(KEY_NO_RESERVE) + payment_amount),
        send_asa(
            asset_id=pt.App.globalGet(KEY_NO_ASA),
            receiver=buyer,
            amount=tokens.load(),
        ),
    )


# ── Resolve logic ──────────────────────────────────────────────────────────────

def handle_resolve(outcome: pt.Expr, caller: pt.Expr) -> pt.Expr:
    """
    Mark market as resolved.
      - outcome : 1 = YES wins, 0 = NO wins
      - caller  : must be creator
    Can only be called after close_ts.
    """
    return pt.Seq(
        assert_creator(caller),
        assert_not_resolved(),
        pt.Assert(
            pt.Global.latest_timestamp() >= pt.App.globalGet(KEY_CLOSE_TS),
            comment="market not expired yet",
        ),
        pt.Assert(
            pt.Or(outcome == pt.Int(0), outcome == pt.Int(1)),
            comment="outcome must be 0 or 1",
        ),
        pt.App.globalPut(KEY_RESOLVED, pt.Int(1)),
        pt.App.globalPut(KEY_OUTCOME, outcome),
    )


# ── Claim logic ───────────────────────────────────────────────────────────────

def handle_claim(claimer: pt.Expr) -> pt.Expr:
    """
    Payout to winner.
      - claimer : address claiming winnings

    Steps:
      1. Market must be resolved
      2. Determine winning ASA (YES or NO based on outcome)
      3. Check claimer's balance of winning ASA (asset_holding_get)
      4. Assert balance > 0 (they hold winning tokens)
      5. Clawback (burn) those tokens back to contract
      6. Send ALGO payout = token_balance (1:1 hackathon model)
    """
    outcome     = pt.App.globalGet(KEY_OUTCOME)
    winning_asa = pt.If(outcome == pt.Int(1))                   \
                    .Then(pt.App.globalGet(KEY_YES_ASA))        \
                    .Else(pt.App.globalGet(KEY_NO_ASA))

    balance_val = pt.AssetHolding.balance(claimer, winning_asa)
    token_bal   = pt.ScratchVar(pt.TealType.uint64)

    return pt.Seq(
        assert_resolved(),
        balance_val,
        pt.Assert(balance_val.hasValue(), comment="claimer has no holding in winning ASA"),
        pt.Assert(balance_val.value() > pt.Int(0), comment="zero winning tokens held"),
        token_bal.store(balance_val.value()),
        # Burn tokens (clawback back to contract)
        burn_asa(
            asset_id=winning_asa,
            clawback_from=claimer,
            amount=token_bal.load(),
        ),
        # Pay out ALGO (1:1)
        send_algo(
            receiver=claimer,
            amount=token_bal.load(),
        ),
    )
