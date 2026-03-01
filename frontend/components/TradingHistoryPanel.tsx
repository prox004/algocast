'use client';

import { useEffect, useState } from 'react';
import { formatAlgo, formatProb } from '@/lib/api';

interface Trade {
  id: string;
  market_id: string;
  side: 'YES' | 'NO';
  amount: number;
  tokens: number;
  timestamp: number;
  market_question?: string;
  profit_loss?: number;
  is_winner?: boolean;
  category?: string;
}

interface Props {
  userId: string;
}

export default function TradingHistoryPanel({ userId }: Props) {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<'all' | 'wins' | 'losses'>('all');
  const [sortBy, setSortBy] = useState<'date' | 'amount' | 'pnl'>('date');

  useEffect(() => {
    loadTrades();
  }, [userId]);

  async function loadTrades() {
    try {
      setLoading(true);
      // TODO: Implement real API endpoint for user trades
      // For now, return empty array for new users - replace with: await getUserTrades(userId);
      const trades: Trade[] = [];
      setTrades(trades);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const filteredTrades = trades.filter(trade => {
    if (filter === 'wins') return trade.is_winner === true;
    if (filter === 'losses') return trade.is_winner === false;
    return true;
  });

  const sortedTrades = [...filteredTrades].sort((a, b) => {
    switch (sortBy) {
      case 'date':
        return b.timestamp - a.timestamp;
      case 'amount':
        return b.amount - a.amount;
      case 'pnl':
        return (b.profit_loss || 0) - (a.profit_loss || 0);
      default:
        return 0;
    }
  });

  if (loading) {
    return (
      <div className="card">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-gray-800 rounded w-48"></div>
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-16 bg-gray-800 rounded"></div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card border-red-800 text-red-400">
        <h3 className="font-semibold mb-2">Error Loading Trades</h3>
        <p>{error}</p>
      </div>
    );
  }

  const totalPnL = trades.reduce((sum, trade) => sum + (trade.profit_loss || 0), 0);
  const winRate = trades.length > 0 ? trades.filter(t => t.is_winner).length / trades.length : 0;

  return (
    <div className="space-y-6">
      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card text-center">
          <p className="text-sm text-gray-500 mb-1">Total Trades</p>
          <p className="text-xl font-bold">{trades.length}</p>
        </div>
        <div className="card text-center">
          <p className="text-sm text-gray-500 mb-1">Win Rate</p>
          <p className="text-xl font-bold text-emerald-400">
            {trades.length === 0 ? 'N/A' : formatProb(winRate)}
          </p>
        </div>
        <div className="card text-center">
          <p className="text-sm text-gray-500 mb-1">Total P&L</p>
          <p className={`text-xl font-bold ${totalPnL >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {trades.length === 0 ? 'N/A' : (
              <>
                {totalPnL >= 0 ? '+' : ''}{formatAlgo(totalPnL * 1000000)}
              </>
            )}
          </p>
        </div>
      </div>

      {/* Filters and Controls */}
      <div className="card">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <h3 className="font-semibold">Trading History</h3>
          
          <div className="flex items-center gap-4">
            {/* Filter */}
            <select 
              value={filter} 
              onChange={(e) => setFilter(e.target.value as any)}
              className="input text-sm"
            >
              <option value="all">All Trades</option>
              <option value="wins">Wins Only</option>
              <option value="losses">Losses Only</option>
            </select>

            {/* Sort */}
            <select 
              value={sortBy} 
              onChange={(e) => setSortBy(e.target.value as any)}
              className="input text-sm"
            >
              <option value="date">Sort by Date</option>
              <option value="amount">Sort by Amount</option>
              <option value="pnl">Sort by P&L</option>
            </select>
          </div>
        </div>

        {/* Trades Table */}
        {sortedTrades.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-6xl mb-4">📊</div>
            <h3 className="text-lg font-semibold mb-2">No Trading History Yet</h3>
            <p className="text-gray-500 mb-6">
              {filter !== 'all' 
                ? `No ${filter} found. Try changing the filter or start trading to build your history.`
                : 'Start trading prediction markets to see your trading history and performance analytics here.'
              }
            </p>
            {filter !== 'all' ? (
              <button 
                onClick={() => setFilter('all')} 
                className="btn-secondary mr-3"
              >
                Show All Trades
              </button>
            ) : null}
            <button 
              onClick={() => window.location.href = '/'} 
              className="btn-primary"
            >
              Browse Markets
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-800 text-left">
                  <th className="pb-3 text-sm font-medium text-gray-400">Market</th>
                  <th className="pb-3 text-sm font-medium text-gray-400">Side</th>
                  <th className="pb-3 text-sm font-medium text-gray-400">Amount</th>
                  <th className="pb-3 text-sm font-medium text-gray-400">Tokens</th>
                  <th className="pb-3 text-sm font-medium text-gray-400">P&L</th>
                  <th className="pb-3 text-sm font-medium text-gray-400">Date</th>
                </tr>
              </thead>
              <tbody>
                {sortedTrades.map((trade) => (
                  <tr key={trade.id} className="border-b border-gray-900">
                    <td className="py-4">
                      <div>
                        <p className="text-sm font-medium truncate max-w-xs">
                          {trade.market_question || `Market ${trade.market_id}`}
                        </p>
                        {trade.category && (
                          <p className="text-xs text-gray-500 capitalize">{trade.category}</p>
                        )}
                      </div>
                    </td>
                    <td className="py-4">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        trade.side === 'YES' 
                          ? 'bg-emerald-500/20 text-emerald-400' 
                          : 'bg-red-500/20 text-red-400'
                      }`}>
                        {trade.side}
                      </span>
                    </td>
                    <td className="py-4 text-sm">{formatAlgo(trade.amount * 1000000)}</td>
                    <td className="py-4 text-sm">{trade.tokens.toFixed(3)}</td>
                    <td className="py-4">
                      {trade.profit_loss !== undefined ? (
                        <span className={`text-sm font-medium ${
                          trade.profit_loss >= 0 ? 'text-emerald-400' : 'text-red-400'
                        }`}>
                          {trade.profit_loss >= 0 ? '+' : ''}{formatAlgo(trade.profit_loss * 1000000)}
                        </span>
                      ) : (
                        <span className="text-sm text-gray-500">Pending</span>
                      )}
                    </td>
                    <td className="py-4 text-sm text-gray-400">
                      {new Date(trade.timestamp).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}