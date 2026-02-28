'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { type Market, formatAlgo, formatProb, isExpired, getMarketCurrentPrice, type CurrentPrice } from '@/lib/api';

interface Props {
  market: Market;
}

export default function MarketCard({ market }: Props) {
  const expired = isExpired(market);
  const prob = market.market_probability ?? 0;
  const category = market.category || 'general';
  const [currentPrice, setCurrentPrice] = useState<CurrentPrice | null>(null);

  /** Map category key to a display colour */
  const catColors: Record<string, string> = {
    crypto: 'bg-orange-900/50 text-orange-300',
    finance: 'bg-blue-900/50 text-blue-300',
    technology: 'bg-cyan-900/50 text-cyan-300',
    politics: 'bg-rose-900/50 text-rose-300',
    sports: 'bg-green-900/50 text-green-300',
    geopolitics: 'bg-amber-900/50 text-amber-300',
    economy: 'bg-indigo-900/50 text-indigo-300',
    climate: 'bg-teal-900/50 text-teal-300',
    culture: 'bg-pink-900/50 text-pink-300',
    elections: 'bg-red-900/50 text-red-300',
    earnings: 'bg-violet-900/50 text-violet-300',
  };
  const catColor = catColors[category] || 'bg-gray-800/50 text-gray-400';

  useEffect(() => {
    if (market.ticker) {
      getMarketCurrentPrice(market.id)
        .then((res) => setCurrentPrice(res.currentPrice))
        .catch(() => {});
    }
  }, [market.id, market.ticker]);

  return (
    <div className="card hover:border-brand-500/50 cursor-pointer transition-colors h-full flex flex-col relative">
      {/* Clickable overlay for the card — navigates to market detail */}
      <Link href={`/market/${market.id}`} className="absolute inset-0 z-0" aria-label={market.question} />

      {/* Status badge row */}
      <div className="flex items-start justify-between gap-2 mb-3 relative z-10 pointer-events-none">
        <div className="flex items-center gap-1.5">
          <span
            className={`shrink-0 text-xs font-semibold px-2 py-0.5 rounded ${
              market.resolved
                ? 'bg-purple-900/60 text-purple-300'
                : expired
                ? 'bg-yellow-900/60 text-yellow-300'
                : 'bg-emerald-900/60 text-emerald-300'
            }`}
          >
            {market.resolved ? 'RESOLVED' : expired ? 'EXPIRED' : 'LIVE'}
          </span>
          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded capitalize ${catColor}`}>
            {category}
          </span>
        </div>
        {market.resolved && (
          <span className={market.outcome === 1 ? 'badge-yes' : 'badge-no'}>
            {market.outcome === 1 ? 'YES' : 'NO'}
          </span>
        )}
      </div>

      {/* Question */}
      <p className="font-semibold text-sm leading-snug mb-3 flex-1 relative z-10 pointer-events-none">{market.question}</p>

      {/* Tweet Source — clickable links (above the card overlay) */}
      {market.tweet_author && (
        <div className="relative z-10 mb-3 flex items-center gap-2 text-xs">
          <span className="text-gray-500">via</span>
          <a
            href={`https://x.com/${market.tweet_author}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="text-blue-400 hover:text-blue-300 font-semibold transition-colors pointer-events-auto"
          >
            @{market.tweet_author}
          </a>
          {market.tweet_id && (
            <a
              href={`https://x.com/i/web/status/${market.tweet_id}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="text-gray-500 hover:text-gray-300 underline transition-colors pointer-events-auto"
            >
              View Tweet
            </a>
          )}
        </div>
      )}

      {/* Ticker & Price display */}
      {market.ticker && currentPrice && (
        <div className="mb-3 p-2 bg-gray-800/40 rounded border border-gray-700/50 relative z-10 pointer-events-none">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs text-gray-400">Ticker: </span>
              <span className="text-sm font-bold text-white">{currentPrice.ticker}</span>
            </div>
            <div className="text-right">
              <p className="text-base font-bold text-emerald-400">${currentPrice.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              {currentPrice.priceChangePercent24h !== undefined && (
                <p
                  className={`text-xs font-semibold ${
                    currentPrice.priceChangePercent24h >= 0 ? 'text-emerald-400' : 'text-red-400'
                  }`}
                >
                  {currentPrice.priceChangePercent24h >= 0 ? '+' : ''}{currentPrice.priceChangePercent24h.toFixed(2)}%
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Probability bar */}
      <div className="mb-3 relative z-10 pointer-events-none">
        <div className="flex justify-between text-xs text-gray-500 mb-1">
          <span className="text-emerald-400 font-medium">YES {formatProb(prob)}</span>
          <span className="text-red-400 font-medium">NO {formatProb(1 - prob)}</span>
        </div>
        <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-emerald-500 rounded-full"
            style={{ width: `${prob * 100}%` }}
          />
        </div>
      </div>

      {/* AI vs Market */}
      {market.ai_probability > 0 && (
        <div className="flex justify-between text-xs text-gray-600 relative z-10 pointer-events-none">
          <span>AI: {formatProb(market.ai_probability)}</span>
          <span>Market: {formatProb(prob)}</span>
        </div>
      )}

      {/* Footer */}
      <div className="flex justify-between text-xs text-gray-600 mt-2 pt-2 border-t border-gray-800 relative z-10 pointer-events-none">
        <span>Pool {formatAlgo(market.yes_reserve + market.no_reserve)}</span>
        <span>{new Date(market.expiry * 1000).toLocaleDateString()}</span>
      </div>
    </div>
  );
}
