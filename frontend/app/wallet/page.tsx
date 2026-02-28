'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import algosdk from 'algosdk';
import { PeraWalletConnect } from '@perawallet/connect';
import { getToken, formatAlgo, getWalletBalance, syncWalletBalance } from '@/lib/api';
import WalletBalance from '@/components/WalletBalance';
import WithdrawForm from '@/components/WithdrawForm';

const peraWallet = new PeraWalletConnect();

export default function WalletPage() {
  const router = useRouter();
  const [depositAmount, setDepositAmount] = useState('');
  const [depositMsg, setDepositMsg] = useState('');
  const [depositLoading, setDepositLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [connectedAddress, setConnectedAddress] = useState<string>('');

  useEffect(() => {
    if (!getToken()) router.push('/login');
  }, [router]);

  useEffect(() => {
    peraWallet.reconnectSession().then((accounts) => {
      if (accounts.length > 0) setConnectedAddress(accounts[0]);
    }).catch(() => {
      setConnectedAddress('');
    });
  }, []);

  async function connectWallet() {
    const accounts = await peraWallet.connect();
    if (!accounts.length) throw new Error('No wallet account selected');
    setConnectedAddress(accounts[0]);
    return accounts[0];
  }

  async function handleDeposit(e: React.FormEvent) {
    e.preventDefault();
    setDepositMsg('');
    const micro = Math.floor(parseFloat(depositAmount) * 1_000_000);
    if (!micro || micro <= 0) return setDepositMsg('Enter a valid ALGO amount');
    setDepositLoading(true);
    try {
      const walletInfo = await getWalletBalance();
      const custodialAddress = walletInfo.custodial_address;
      if (!custodialAddress) throw new Error('Custodial wallet address missing');

      const fromAddress = connectedAddress || await connectWallet();
      const algod = new algosdk.Algodv2('', 'https://testnet-api.algonode.cloud', '');
      const sp = await algod.getTransactionParams().do();
      sp.flatFee = true;
      sp.fee = BigInt(1000);

      const txn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
        sender: fromAddress,
        receiver: custodialAddress,
        amount: BigInt(micro),
        suggestedParams: sp,
      });

      const txnsToSign = [{ txn, signers: [fromAddress] }];
      const signedTxns = await peraWallet.signTransaction([txnsToSign]);
      const { txid } = await algod.sendRawTransaction(signedTxns).do();
      await algosdk.waitForConfirmation(algod, txid, 4);

      const synced = await syncWalletBalance();
      setDepositMsg(`✓ Deposited on-chain! Tx: ${txid.slice(0, 8)}... New balance: ${formatAlgo(synced.balance)}`);
      setDepositAmount('');
      setRefreshKey((k) => k + 1);
    } catch (err: any) {
      const msg = err?.data?.message || err?.message || 'Deposit failed';
      setDepositMsg(msg);
    } finally {
      setDepositLoading(false);
    }
  }

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <h1 className="text-2xl font-bold">Wallet</h1>

      <WalletBalance key={refreshKey} />

      {/* Deposit */}
      <div className="card">
        <h2 className="font-semibold mb-4">Deposit ALGO</h2>
        <form onSubmit={handleDeposit} className="flex gap-3">
          <input
            type="number"
            min="0.000001"
            step="0.1"
            className="input"
            placeholder="Amount in ALGO"
            value={depositAmount}
            onChange={(e) => setDepositAmount(e.target.value)}
          />
          <button type="submit" disabled={depositLoading} className="btn-primary shrink-0">
            {depositLoading ? '…' : 'Deposit'}
          </button>
        </form>
        {depositMsg && (
          <p className="text-sm mt-2 text-gray-300">{depositMsg}</p>
        )}
        <p className="text-xs text-gray-600 mt-3">
          Clicking Deposit opens your Algorand wallet extension and sends ALGO to your custodial address on TestNet.
        </p>
      </div>

      {/* Withdraw */}
      <WithdrawForm onSuccess={() => setRefreshKey((k) => k + 1)} />
    </div>
  );
}
