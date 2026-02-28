'use client';

import { useState } from 'react';
import { withdraw, formatAlgo } from '@/lib/api';

interface Props {
  onSuccess: () => void;
}

export default function WithdrawForm({ onSuccess }: Props) {
  const [toAddress, setToAddress] = useState('');
  const [amount, setAmount] = useState('');
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const [isError, setIsError] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg('');
    setIsError(false);

    const micro = Math.floor(parseFloat(amount) * 1_000_000);
    if (!toAddress.trim()) return setMsg('Destination address is required');
    if (!micro || micro <= 0) return setMsg('Enter a valid ALGO amount');

    setLoading(true);
    try {
      const res = await withdraw(toAddress.trim(), micro);
      setMsg(`Withdrawn! Tx: ${res.txid} — New balance: ${formatAlgo(res.balance)}`);
      setToAddress('');
      setAmount('');
      onSuccess();
    } catch (err: any) {
      setIsError(true);
      setMsg(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card">
      <h2 className="font-semibold mb-4">Withdraw ALGO</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="label">Destination Address</label>
          <input
            type="text"
            className="input font-mono text-sm"
            placeholder="ALGORAND ADDRESS..."
            value={toAddress}
            onChange={(e) => setToAddress(e.target.value)}
          />
        </div>
        <div>
          <label className="label">Amount (ALGO)</label>
          <input
            type="number"
            min="0"
            step="0.1"
            className="input"
            placeholder="0.0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>

        {msg && (
          <p className={`text-sm px-3 py-2 rounded ${isError ? 'text-red-400 bg-red-900/20' : 'text-emerald-400 bg-emerald-900/20'}`}>
            {msg}
          </p>
        )}

        <button type="submit" disabled={loading} className="btn-primary w-full">
          {loading ? 'Sending…' : 'Withdraw'}
        </button>
      </form>
      <p className="text-xs text-gray-600 mt-3">
        Withdrawals are real on-chain Algorand transactions on TestNet.
      </p>
    </div>
  );
}
