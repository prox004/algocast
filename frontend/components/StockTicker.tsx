'use client';

import { useEffect, useState } from 'react';

interface StockQuote {
  symbol: string;
  price: number;
  changePercent: number;
}

function formatPrice(price: number): string {
  if (price >= 1000)
    return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function StockTicker() {
  const [stocks, setStocks] = useState<StockQuote[]>([]);
  const [error, setError] = useState(false);

  useEffect(() => {
    async function fetchStocks() {
      try {
        const res = await fetch('/api/stocks');
        if (!res.ok) throw new Error('fetch failed');
        const data = await res.json();
        if (data.stocks?.length > 0) setStocks(data.stocks);
        else throw new Error('empty');
      } catch {
        setError(true);
      }
    }

    fetchStocks();
    const interval = setInterval(fetchStocks, 60_000);
    return () => clearInterval(interval);
  }, []);

  // Slim placeholder while loading / on error
  if (error || stocks.length === 0) {
    return (
      <div className="fixed bottom-0 left-0 right-0 z-50 h-8 bg-black/80 border-t border-gray-800" />
    );
  }

  // Duplicate for seamless loop
  const items = [...stocks, ...stocks];

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 h-8 bg-black/85 border-t border-gray-800 overflow-hidden flex items-center backdrop-blur-sm">
      {/* Label */}
      <div className="shrink-0 px-3 text-[10px] font-bold tracking-widest text-gray-500 uppercase border-r border-gray-800 h-full flex items-center">
        STOCKS
      </div>

      {/* Scrolling track */}
      <div
        className="flex whitespace-nowrap"
        style={{ animation: `stockTickerScroll ${stocks.length * 5}s linear infinite` }}
      >
        {items.map((stock, i) => {
          const up = stock.changePercent >= 0;
          return (
            <span
              key={`${stock.symbol}-${i}`}
              className="inline-flex items-center gap-1.5 px-4 text-xs font-medium"
            >
              <span className="text-gray-300 font-semibold">{stock.symbol}</span>
              <span className="text-white">${formatPrice(stock.price)}</span>
              <span className={up ? 'text-green-400' : 'text-red-400'}>
                {up ? '▲' : '▼'} {Math.abs(stock.changePercent).toFixed(2)}%
              </span>
              <span className="text-gray-700 ml-2">|</span>
            </span>
          );
        })}
      </div>

      <style jsx>{`
        @keyframes stockTickerScroll {
          0%   { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
      `}</style>
    </div>
  );
}
