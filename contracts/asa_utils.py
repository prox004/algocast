"""
asa_utils.py — YES/NO Algorand Standard Asset creation helpers
Called by the smart contract (inner transactions) and by deploy.py.
"""

import pyteal as pt


# ── Inner transaction: create an ASA ──────────────────────────────────────────

def create_asa(
    name: pt.Expr,
    unit_name: pt.Expr,
    total: pt.Expr,
    decimals: pt.Expr,
    manager: pt.Expr,
    reserve: pt.Expr,
    clawback: pt.Expr,
    freeze: pt.Expr,
) -> pt.Expr:
    """
    Returns a PyTeal expression that submits an inner AssetConfig transaction
    to create a new ASA.  Returns the newly created asset ID via
    `pt.InnerTxn.created_asset_id()` after execution.

    Usage:
        pt.Seq(
            pt.InnerTxnBuilder.Execute(create_asa_fields(...)),
            created_id := pt.InnerTxn.created_asset_id(),
        )
    """
    return pt.Seq(
        pt.InnerTxnBuilder.Execute(
            {
                pt.TxnField.type_enum:      pt.TxnType.AssetConfig,
                pt.TxnField.config_asset_total:     total,
                pt.TxnField.config_asset_decimals:  decimals,
                pt.TxnField.config_asset_name:      name,
                pt.TxnField.config_asset_unit_name: unit_name,
                pt.TxnField.config_asset_manager:   manager,
                pt.TxnField.config_asset_reserve:   reserve,
                pt.TxnField.config_asset_clawback:  clawback,
                pt.TxnField.config_asset_freeze:    freeze,
                pt.TxnField.fee:                    pt.Int(0),
            }
        )
    )


def send_asa(
    asset_id: pt.Expr,
    receiver: pt.Expr,
    amount: pt.Expr,
) -> pt.Expr:
    """
    Inner AssetTransfer: contract sends `amount` units of `asset_id` to `receiver`.
    The contract must hold the ASA (clawback / opt-in already done at creation).
    """
    return pt.InnerTxnBuilder.Execute(
        {
            pt.TxnField.type_enum:         pt.TxnType.AssetTransfer,
            pt.TxnField.xfer_asset:        asset_id,
            pt.TxnField.asset_amount:      amount,
            pt.TxnField.asset_receiver:    receiver,
            pt.TxnField.fee:               pt.Int(0),
        }
    )


def burn_asa(
    asset_id: pt.Expr,
    clawback_from: pt.Expr,
    amount: pt.Expr,
) -> pt.Expr:
    """
    Inner AssetTransfer using clawback: reclaim `amount` tokens from `clawback_from`
    back to the contract (clawback address). Used during claim().
    """
    return pt.InnerTxnBuilder.Execute(
        {
            pt.TxnField.type_enum:         pt.TxnType.AssetTransfer,
            pt.TxnField.xfer_asset:        asset_id,
            pt.TxnField.asset_amount:      amount,
            pt.TxnField.asset_sender:      clawback_from,   # clawback source
            pt.TxnField.asset_receiver:    pt.Global.current_application_address(),
            pt.TxnField.fee:               pt.Int(0),
        }
    )


def send_algo(
    receiver: pt.Expr,
    amount: pt.Expr,
) -> pt.Expr:
    """
    Inner PaymentTxn: contract pays `amount` microAlgos to `receiver`.
    """
    return pt.InnerTxnBuilder.Execute(
        {
            pt.TxnField.type_enum:  pt.TxnType.Payment,
            pt.TxnField.receiver:   receiver,
            pt.TxnField.amount:     amount,
            pt.TxnField.fee:        pt.Int(0),
        }
    )
