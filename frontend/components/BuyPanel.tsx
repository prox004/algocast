'use client';

import { useState, useCallback } from 'react';
import { buyYes, buyNo, formatAlgo, type Market } from '@/lib/api';

interface Props {
  market: Market;
  onTrade?: () => void;
}

export default function BuyPanel({ market, onTrade }: Props) {
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');

  const handleTrade = useCallback(() => {
    onTrade?.();
  }, [onTrade]);

  async function handleBuy(side: 'YES' | 'NO') {
    setMsg('');
    const micro = Math.floor(parseFloat(amount) * 1_000_000);
    if (!micro || micro <= 0) return setMsg('Enter a valid ALGO amount');
    setLoading(true);
    try {
      const fn = side === 'YES' ? buyYes : buyNo;
      const res = await fn(market.id, micro);
      setMsg(`Bought ${res.tokens.toLocaleString()} ${side} tokens!`);
      setAmount('');
      handleTrade();
    } catch (err: any) {
      setMsg(err.message);
    } finally {
      setLoading(false);
    }
  }

  const microAmount = Math.floor(parseFloat(amount || '0') * 1_000_000) || 0;
  const yesProb = market.market_probability ?? 0.5;

  return (
    <div className="card">
      <h2 className="font-semibold mb-4">Buy Tokens</h2>

      <div className="mb-4">
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
        {microAmount > 0 && (
          <p className="text-xs text-gray-500 mt-1">= {formatAlgo(microAmount)}</p>
        )}
      </div>

      {/* Probability preview */}
      {microAmount > 0 && (
        <div className="bg-gray-800/60 rounded-lg px-3 py-2 text-xs text-gray-400 mb-4 space-y-1">
          <div className="flex justify-between">
            <span>Tokens received (1:1)</span>
            <span>{microAmount.toLocaleString()} tokens</span>
          </div>
          <div className="flex justify-between">
            <span>Current YES probability</span>
            <span className="text-emerald-400">{(yesProb * 100).toFixed(1)}%</span>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => handleBuy('YES')}
          disabled={loading}
          className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-2 px-4 rounded-lg transition-colors disabled:opacity-50"
        >
          Buy YES
        </button>
        <button
          onClick={() => handleBuy('NO')}
          disabled={loading}
          className="bg-red-700 hover:bg-red-600 text-white font-semibold py-2 px-4 rounded-lg transition-colors disabled:opacity-50"
        >
          Buy NO
        </button>
      </div>

      {msg && <p className="text-sm mt-3 text-gray-300">{msg}</p>}
    </div>
  );
}
