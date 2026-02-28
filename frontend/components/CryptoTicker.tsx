'use client';

import { useEffect, useState, useRef } from 'react';

interface CoinPrice {
  id: string;
  symbol: string;
  name: string;
  current_price: number;
  price_change_percentage_24h: number;
}

const COINS = [
  'bitcoin', 'ethereum', 'algorand', 'solana', 'binancecoin',
  'ripple', 'cardano', 'avalanche-2', 'polkadot', 'chainlink',
];

const SYMBOL_MAP: Record<string, string> = {
  bitcoin: 'BTC', ethereum: 'ETH', algorand: 'ALGO', solana: 'SOL',
  binancecoin: 'BNB', ripple: 'XRP', cardano: 'ADA',
  'avalanche-2': 'AVAX', polkadot: 'DOT', chainlink: 'LINK',
};

function formatPrice(price: number): string {
  if (price >= 1000) return price.toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (price >= 1) return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return price.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
}

export default function CryptoTicker() {
  const [coins, setCoins] = useState<CoinPrice[]>([]);
  const [error, setError] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function fetchPrices() {
      try {
        const ids = COINS.join(',');
        const res = await fetch(
          `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${ids}&order=market_cap_desc&sparkline=false&price_change_percentage=24h`,
          { next: { revalidate: 60 } }
        );
        if (!res.ok) throw new Error('fetch failed');
        const data: CoinPrice[] = await res.json();
        setCoins(data);
      } catch {
        setError(true);
      }
    }

    fetchPrices();
    const interval = setInterval(fetchPrices, 60_000); // refresh every 60s
    return () => clearInterval(interval);
  }, []);

  // Nothing to show yet / error → render a slim placeholder bar
  if (error || coins.length === 0) {
    return (
      <div className="border-b border-gray-800 bg-gray-900/60 h-8" />
    );
  }

  // Duplicate items so the scroll looks seamless
  const items = [...coins, ...coins];

  return (
    <div className="border-b border-gray-800 bg-gray-900/60 overflow-hidden h-8 flex items-center">
      <div
        ref={trackRef}
        className="flex gap-0 whitespace-nowrap ticker-track"
        style={{ animation: `tickerScroll ${coins.length * 4}s linear infinite` }}
      >
        {items.map((coin, i) => {
          const up = coin.price_change_percentage_24h >= 0;
          const symbol = SYMBOL_MAP[coin.id] ?? coin.symbol.toUpperCase();
          const change = coin.price_change_percentage_24h?.toFixed(2);

          return (
            <span
              key={`${coin.id}-${i}`}
              className="inline-flex items-center gap-1.5 px-4 text-xs font-medium"
            >
              <span className="text-gray-300 font-semibold">{symbol}</span>
              <span className="text-white">${formatPrice(coin.current_price)}</span>
              <span className={up ? 'text-green-400' : 'text-red-400'}>
                {up ? '▲' : '▼'} {Math.abs(parseFloat(change ?? '0')).toFixed(2)}%
              </span>
              <span className="text-gray-700 ml-2">|</span>
            </span>
          );
        })}
      </div>

      <style jsx>{`
        @keyframes tickerScroll {
          0%   { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .ticker-track {
          will-change: transform;
        }
      `}</style>
    </div>
  );
}
