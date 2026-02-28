'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getToken, deposit, formatAlgo } from '@/lib/api';
import WalletBalance from '@/components/WalletBalance';
import WithdrawForm from '@/components/WithdrawForm';

export default function WalletPage() {
  const router = useRouter();
  const [depositAmount, setDepositAmount] = useState('');
  const [depositMsg, setDepositMsg] = useState('');
  const [depositLoading, setDepositLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!getToken()) router.push('/login');
  }, [router]);

  async function handleDeposit(e: React.FormEvent) {
    e.preventDefault();
    setDepositMsg('');
    const micro = Math.floor(parseFloat(depositAmount) * 1_000_000);
    if (!micro || micro <= 0) return setDepositMsg('Enter a valid ALGO amount');
    setDepositLoading(true);
    try {
      const res = await deposit(micro);
      setDepositMsg(`Deposited! New balance: ${formatAlgo(res.balance)}`);
      setDepositAmount('');
      setRefreshKey((k) => k + 1);
    } catch (err: any) {
      setDepositMsg(err.message);
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
          Hackathon mode: deposits are credited instantly without an on-chain transaction.
        </p>
      </div>

      {/* Withdraw */}
      <WithdrawForm onSuccess={() => setRefreshKey((k) => k + 1)} />
    </div>
  );
}
