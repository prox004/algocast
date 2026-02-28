'use client';

import Link from 'next/link';
import { type Market, formatAlgo, formatProb, isExpired } from '@/lib/api';

interface Props {
  market: Market;
}

export default function MarketCard({ market }: Props) {
  const expired = isExpired(market);
  const prob = market.market_probability ?? 0;

  return (
    <Link href={`/market/${market.id}`}>
      <div className="card hover:border-brand-500/50 cursor-pointer transition-colors h-full flex flex-col">
        {/* Status badge */}
        <div className="flex items-start justify-between gap-2 mb-3">
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
          {market.resolved && (
            <span className={market.outcome === 1 ? 'badge-yes' : 'badge-no'}>
              {market.outcome === 1 ? 'YES' : 'NO'}
            </span>
          )}
        </div>

        {/* Question */}
        <p className="font-semibold text-sm leading-snug mb-4 flex-1">{market.question}</p>

        {/* Probability bar */}
        <div className="mb-3">
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
          <div className="flex justify-between text-xs text-gray-600">
            <span>AI: {formatProb(market.ai_probability)}</span>
            <span>Market: {formatProb(prob)}</span>
          </div>
        )}

        {/* Footer */}
        <div className="flex justify-between text-xs text-gray-600 mt-2 pt-2 border-t border-gray-800">
          <span>Pool {formatAlgo(market.yes_reserve + market.no_reserve)}</span>
          <span>{new Date(market.expiry * 1000).toLocaleDateString()}</span>
        </div>
      </div>
    </Link>
  );
}
