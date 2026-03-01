'use client';

import { useState, useEffect } from 'react';
import { getUserTrades, formatAlgo, type Trade } from '@/lib/api';

function tradeStatus(t: Trade): { label: string; color: string } {
  if (t.market_resolved) {
    if (t.is_winner === true) return { label: 'Won', color: 'text-emerald-400' };
    if (t.is_winner === false) return { label: 'Lost', color: 'text-red-400' };
    return { label: 'Resolved', color: 'text-yellow-400' };
  }
  if (t.market_expiry && t.market_expiry < Math.floor(Date.now() / 1000)) {
    return { label: 'Waiting Resolution', color: 'text-amber-400' };
  }
  return { label: 'Open', color: 'text-blue-400' };
}

export default function TradesHistory() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getUserTrades()
      .then((t) => setTrades(t))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
        <h2 className="text-lg font-bold mb-4">My Trades</h2>
        <div className="flex items-center justify-center py-8">
          <div className="w-5 h-5 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
      <h2 className="text-lg font-bold mb-4">My Trades</h2>

      {trades.length === 0 ? (
        <p className="text-gray-500 text-sm text-center py-6">No trades yet</p>
      ) : (
        <div className="space-y-3 max-h-[400px] overflow-y-auto scrollbar-thin">
          {trades.map((t) => {
            const status = tradeStatus(t);
            const pnl = t.profit_loss ?? null;
            return (
              <div
                key={t.id}
                className="bg-gray-800/60 border border-gray-700/50 rounded-xl p-3"
              >
                {/* Header: market question + status */}
                <div className="flex justify-between items-start mb-2">
                  <p className="text-sm text-gray-200 font-medium leading-tight flex-1 mr-3 line-clamp-2">
                    {t.market_question || 'Unknown market'}
                  </p>
                  <span className={`text-xs font-semibold whitespace-nowrap ${status.color}`}>
                    {status.label}
                  </span>
                </div>

                {/* Details row */}
                <div className="flex items-center gap-3 text-xs text-gray-400">
                  <span
                    className={`px-2 py-0.5 rounded font-bold ${
                      t.side === 'YES'
                        ? 'bg-emerald-900/40 text-emerald-400'
                        : 'bg-red-900/40 text-red-400'
                    }`}
                  >
                    {t.side}
                  </span>
                  <span>{formatAlgo(t.amount)}</span>
                  <span className="text-gray-600">
                    {new Date(t.timestamp * 1000).toLocaleDateString()}
                  </span>

                  {/* PnL */}
                  {pnl !== null && t.market_resolved && (
                    <span
                      className={`ml-auto font-bold ${
                        pnl > 0 ? 'text-emerald-400' : pnl < 0 ? 'text-red-400' : 'text-gray-500'
                      }`}
                    >
                      {pnl > 0 ? '+' : ''}
                      {formatAlgo(pnl)}
                    </span>
                  )}
                </div>

                {/* Tx link */}
                {t.txid && (
                  <a
                    href={`https://testnet.explorer.perawallet.app/tx/${t.txid}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] text-purple-400 hover:underline mt-1 inline-block"
                  >
                    View on Explorer ↗
                  </a>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
