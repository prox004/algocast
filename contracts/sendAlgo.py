import algokit_utils
from algosdk import util

# 1. Setup Connection
algod_client = algokit_utils.get_algod_client(
    algokit_utils.get_default_localnet_config("algod")
)

# 2. Get Dispenser (Sender)
sender = algokit_utils.get_localnet_default_account(algod_client)
print(f"Sender Address: {sender.address}")

# 3. User-Driven Inputs
receiver_address = input("Enter the receiver's Algorand address: ").strip()
algo_amount = input("Enter the amount of ALGO to send: ")

try:
    # Convert ALGO to microAlgos (10^6)
    micro_algos = int(float(algo_amount) * 1_000_000)

    # 4. Execute Transfer
    print(f"Sending {algo_amount} ALGO to {receiver_address}...")
    
    result = algokit_utils.transfer(
        algod_client,
        algokit_utils.TransferParameters(
            from_account=sender,
            to_address=receiver_address,
            micro_algos=micro_algos,
        ),
    )

    print("\n--- Transaction Successful ---")
    print(f"Transaction ID: {result.tx_id}")
    
    # Check new balance
    account_info = algod_client.account_info(receiver_address)
    print(f"Receiver's new balance: {account_info.get('amount') / 1_000_000} ALGO")

except Exception as e:
    print(f"\nError: {e}")