'use client';

import { useState } from 'react';
import { buyYes, buyNo, formatAlgo, type Market } from '@/lib/api';

const PRESETS = [0.1, 0.5, 1, 5];

interface Props {
  market: Market;
  defaultSide?: 'YES' | 'NO';
  onTrade?: () => void;
  onClose?: () => void;
}

export default function BuyPanel({ market, defaultSide = 'YES', onTrade, onClose }: Props) {
  const [side, setSide] = useState<'YES' | 'NO'>(defaultSide);
  const [amount, setAmount] = useState(0.1);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');

  async function handleBuy() {
    setMsg('');
    if (amount <= 0) return setMsg('Enter a valid ALGO amount');
    setLoading(true);
    try {
      const micro = Math.floor(amount * 1_000_000);
      const fn = side === 'YES' ? buyYes : buyNo;
      const res = await fn(market.id, micro);
      setMsg(`Bought ${res.tokens.toLocaleString()} ${side} tokens!`);
      setTimeout(() => { onTrade?.(); }, 900);
    } catch (err: any) {
      setMsg(err.message);
    } finally {
      setLoading(false);
    }
  }

  const micro = Math.floor(amount * 1_000_000);
  const yesProb = market.market_probability ?? 0.5;

  return (
    // Bottom sheet overlay
    <div
      className="fixed inset-0 bg-black/70 z-50 flex items-end"
      onClick={() => !loading && onClose?.()}
    >
      <div
        className="w-full bg-gray-900 border-t border-gray-800 rounded-t-2xl p-5 pb-8 safe-bottom max-w-2xl mx-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Handle */}
        <div className="w-10 h-1 bg-gray-700 rounded-full mx-auto mb-5" />

        {/* YES / NO toggle */}
        <div className="flex gap-2 mb-5">
          <button
            onClick={() => setSide('YES')}
            className={`flex-1 py-3 rounded-xl font-bold text-base transition-colors ${
              side === 'YES'
                ? 'bg-emerald-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            Buy YES
          </button>
          <button
            onClick={() => setSide('NO')}
            className={`flex-1 py-3 rounded-xl font-bold text-base transition-colors ${
              side === 'NO'
                ? 'bg-red-700 text-white'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            Buy NO
          </button>
        </div>

        {/* Current odds */}
        <div className="flex justify-between text-sm mb-4 px-1">
          <span className="text-gray-400">YES odds</span>
          <span className="font-semibold">
            <span className="text-emerald-400">{(yesProb * 100).toFixed(1)}%</span>
            <span className="text-gray-600 mx-1">/</span>
            <span className="text-red-400">{((1 - yesProb) * 100).toFixed(1)}%</span>
          </span>
        </div>

        {/* Preset amounts */}
        <div className="grid grid-cols-4 gap-2 mb-3">
          {PRESETS.map((p) => (
            <button
              key={p}
              onClick={() => setAmount(p)}
              className={`py-3 rounded-xl text-sm font-semibold border transition-colors ${
                amount === p
                  ? side === 'YES'
                    ? 'bg-emerald-600 border-emerald-600 text-white'
                    : 'bg-red-700 border-red-700 text-white'
                  : 'border-gray-700 text-gray-400 hover:border-gray-500'
              }`}
            >
              {p}A
            </button>
          ))}
        </div>

        {/* Custom input */}
        <input
          type="number"
          className="input mb-1 text-base"
          placeholder="Custom amount in ALGO"
          min="0"
          step="0.1"
          value={amount || ''}
          onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
        />
        {micro > 0 && (
          <p className="text-xs text-gray-600 mb-2 px-1">{formatAlgo(micro)}</p>
        )}

        {/* Potential winnings display */}
        {amount > 0 && (
          <div className="bg-gray-800/60 border border-gray-700/50 rounded-xl p-3 mb-4">
            <p className="text-xs text-gray-400 mb-2 font-semibold uppercase tracking-wide">Potential Winnings</p>
            <div className="flex justify-between items-center">
              <div className="text-center flex-1">
                <p className="text-[10px] text-gray-500 mb-0.5">If {side} wins</p>
                <p className="text-emerald-400 font-bold text-sm">
                  {(amount / (side === 'YES' ? yesProb : (1 - yesProb))).toFixed(4)} ALGO
                </p>
                <p className="text-emerald-500/70 text-[10px]">
                  +{(amount / (side === 'YES' ? yesProb : (1 - yesProb)) - amount).toFixed(4)} profit
                </p>
              </div>
              <div className="w-px h-8 bg-gray-700" />
              <div className="text-center flex-1">
                <p className="text-[10px] text-gray-500 mb-0.5">If {side === 'YES' ? 'NO' : 'YES'} wins</p>
                <p className="text-red-400 font-bold text-sm">0 ALGO</p>
                <p className="text-red-500/70 text-[10px]">-{amount.toFixed(4)} loss</p>
              </div>
            </div>
            <p className="text-[10px] text-gray-600 text-center mt-2">
              Multiplier: {(1 / (side === 'YES' ? yesProb : (1 - yesProb))).toFixed(2)}x
            </p>
          </div>
        )}

        {msg && (
          <p className={`text-sm mb-3 text-center ${
            msg.startsWith('Bought') ? 'text-emerald-400' : 'text-red-400'
          }`}>{msg}</p>
        )}

        {/* Confirm button */}
        <button
          onClick={handleBuy}
          disabled={loading || amount <= 0}
          className={`w-full py-4 rounded-xl font-bold text-base transition-colors disabled:opacity-50 ${
            side === 'YES'
              ? 'bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700'
              : 'bg-red-700 hover:bg-red-600 active:bg-red-800'
          }`}
        >
          {loading ? 'Processing...' : `Confirm ${side} — ${amount} ALGO`}
        </button>

        <button
          onClick={() => onClose?.()}
          className="w-full py-3 mt-2 text-gray-500 text-sm"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
