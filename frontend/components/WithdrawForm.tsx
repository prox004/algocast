'use client';

import { useState } from 'react';
import { withdraw, formatAlgo } from '@/lib/api';

interface WithdrawFormProps {
  onSuccess?: () => void;
}

/**
 * @deprecated Use the inline withdraw form on /profile instead.
 * Withdraw now requires a verified external wallet — no manual address input.
 */
export default function WithdrawForm({ onSuccess }: WithdrawFormProps) {
  const [amount, setAmount] = useState('');
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const [isError, setIsError] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg('');
    setIsError(false);

    const micro = Math.floor(parseFloat(amount) * 1_000_000);
    if (!micro || micro <= 0) return setMsg('Enter a valid ALGO amount');

    setLoading(true);
    try {
      const res = await withdraw(micro);
      setMsg(`Withdrawn! Tx: ${res.txid} — New balance: ${formatAlgo(res.balance)}`);
      setAmount('');
      onSuccess?.();
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
        Withdrawals go to your verified external wallet.
      </p>
    </div>
  );
}
