'use client';

import { useEffect, useState } from 'react';
import { getMarketCurrentPrice, getMarketPriceGraph, CurrentPrice, PriceGraph } from '@/lib/api';

interface PriceChartProps {
  marketId: string;
  ticker: string | null | undefined;
  assetType?: 'stock' | 'crypto' | null;
}

export default function PriceChart({ marketId, ticker, assetType }: PriceChartProps) {
  const [currentPrice, setCurrentPrice] = useState<CurrentPrice | null>(null);
  const [priceGraph, setPriceGraph] = useState<PriceGraph | null>(null);
  const [days, setDays] = useState(7);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!ticker) return;

    const fetchPrice = async () => {
      setLoading(true);
      setError('');
      try {
        // Fetch current price
        const currentRes = await getMarketCurrentPrice(marketId);
        setCurrentPrice(currentRes.currentPrice);

        // Fetch price history
        const graphRes = await getMarketPriceGraph(marketId, days);
        setPriceGraph(graphRes.priceData);
      } catch (err: any) {
        setError(err.message || 'Failed to fetch price data');
      } finally {
        setLoading(false);
      }
    };

    fetchPrice();
  }, [marketId, ticker, days]);

  if (!ticker) {
    return null;
  }

  return (
    <div className="card space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-12 h-12 bg-gradient-to-br from-emerald-500 to-cyan-500 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-sm">{ticker}</span>
          </div>
          <div>
            <h3 className="font-semibold text-gray-100">{ticker}</h3>
            <p className="text-xs text-gray-400">
              {assetType === 'crypto' ? 'Cryptocurrency' : assetType === 'stock' ? 'Stock' : 'Asset'}
            </p>
          </div>
        </div>

        {/* Time range selector */}
        <div className="flex gap-1">
          {[1, 7, 30, 365].map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`px-2 py-1 text-xs font-semibold rounded transition-all ${
                days === d
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/50'
                  : 'bg-gray-700/30 text-gray-400 hover:text-gray-300'
              }`}
            >
              {d === 1 ? '1D' : d === 7 ? '7D' : d === 30 ? '30D' : '1Y'}
            </button>
          ))}
        </div>
      </div>

      {/* Current Price */}
      {currentPrice && (
        <div className="space-y-2">
          <div className="text-3xl font-bold text-gray-100">
            ${currentPrice.price.toFixed(2)}
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm">
            {currentPrice.priceChange24h !== undefined && (
              <div>
                <p className="text-gray-400">24h Change</p>
                <p
                  className={`font-semibold ${
                    currentPrice.priceChange24h >= 0 ? 'text-emerald-400' : 'text-red-400'
                  }`}
                >
                  {currentPrice.priceChange24h >= 0 ? '+' : ''}
                  ${currentPrice.priceChange24h.toFixed(2)}
                  {currentPrice.priceChangePercent24h && (
                    <> ({currentPrice.priceChangePercent24h.toFixed(2)}%)</>
                  )}
                </p>
              </div>
            )}

            {currentPrice.volumeUSD && (
              <div>
                <p className="text-gray-400">24h Volume</p>
                <p className="font-semibold text-gray-200">
                  ${(currentPrice.volumeUSD / 1e6).toFixed(1)}M
                </p>
              </div>
            )}

            {currentPrice.marketCap && (
              <div>
                <p className="text-gray-400">Market Cap</p>
                <p className="font-semibold text-gray-200">
                  ${(currentPrice.marketCap / 1e9).toFixed(2)}B
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Chart placeholder */}
      {loading && <div className="text-gray-400 text-center py-8">Loading price data...</div>}

      {error && <div className="text-red-400 text-center py-4 text-sm">{error}</div>}

      {priceGraph && !loading && (
        <div className="space-y-4">
          {/* Simple sparkline/chart using ASCII representation */}
          <div className="bg-gray-900/50 rounded-lg p-4 space-y-2">
            <p className="text-xs text-gray-400">{priceGraph.timeRange.toUpperCase()} Price Chart</p>

            {/* Statistics */}
            <div className="grid grid-cols-4 gap-2 text-xs">
              <div>
                <p className="text-gray-500">High</p>
                <p className="font-semibold text-gray-300">
                  ${Math.max(...priceGraph.historical.map((p) => p.price)).toFixed(2)}
                </p>
              </div>
              <div>
                <p className="text-gray-500">Low</p>
                <p className="font-semibold text-gray-300">
                  ${Math.min(...priceGraph.historical.map((p) => p.price)).toFixed(2)}
                </p>
              </div>
              <div>
                <p className="text-gray-500">Avg</p>
                <p className="font-semibold text-gray-300">
                  $
                  {(
                    priceGraph.historical.reduce((sum, p) => sum + p.price, 0) /
                    priceGraph.historical.length
                  ).toFixed(2)}
                </p>
              </div>
              <div>
                <p className="text-gray-500">Source</p>
                <p className="font-semibold text-gray-300">{priceGraph.source}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
