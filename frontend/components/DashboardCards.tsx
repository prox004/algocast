'use client';

import { useEffect, useState, useCallback } from 'react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface CoinCard {
  id: string;
  symbol: string;
  name: string;
  price: number;
  changePercent: number;
  sparkline: number[];
}

interface StockCard {
  symbol: string;
  name: string;
  price: number;
  changePercent: number;
  sparkline: number[];
}

interface NewsItem {
  title: string;
  description: string;
  url: string;
  source: string;
  publishedAt: string;
}

// ─── Sparkline SVG ───────────────────────────────────────────────────────────

function Sparkline({ prices, up, uid }: { prices: number[]; up: boolean; uid: string }) {
  if (!prices || prices.length < 2) {
    return <div className="h-12 w-full opacity-20 bg-gradient-to-r from-transparent via-gray-600 to-transparent rounded" />;
  }

  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;
  const W = 240;
  const H = 48;

  const pts = prices
    .map((p, i) => {
      const x = (i / (prices.length - 1)) * W;
      const y = H - ((p - min) / range) * (H - 2) - 1;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');

  const fillPts = `0,${H} ${pts} ${W},${H}`;
  const color = up ? '#22c55e' : '#f87171';
  const gradId = `spk-${uid}`;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full h-12"
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.30" />
          <stop offset="100%" stopColor={color} stopOpacity="0.0" />
        </linearGradient>
      </defs>
      <polyline points={fillPts} fill={`url(#${gradId})`} stroke="none" />
      <polyline
        points={pts}
        fill="none"
        stroke={color}
        strokeWidth="1.8"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

// ─── Shared slide hook ────────────────────────────────────────────────────────

function useAutoSlide(count: number, intervalMs = 4500) {
  const [idx, setIdx] = useState(0);
  const [visible, setVisible] = useState(true);

  const goTo = useCallback(
    (next: number) => {
      setVisible(false);
      setTimeout(() => {
        setIdx(((next % count) + count) % count);
        setVisible(true);
      }, 220);
    },
    [count]
  );

  useEffect(() => {
    if (count <= 1) return;
    const t = setInterval(() => goTo(idx + 1), intervalMs);
    return () => clearInterval(t);
  }, [idx, count, intervalMs, goTo]);

  return { idx, visible, goTo };
}

// ─── Pagination dots ─────────────────────────────────────────────────────────

function Dots({
  count,
  active,
  onDot,
  accent,
}: {
  count: number;
  active: number;
  onDot: (i: number) => void;
  accent: string;
}) {
  return (
    <div className="flex items-center justify-center gap-1.5 mt-3">
      {Array.from({ length: count }).map((_, i) => (
        <button
          key={i}
          onClick={() => onDot(i)}
          className="rounded-full transition-all duration-300"
          style={{
            width: i === active ? 16 : 6,
            height: 6,
            background: i === active ? accent : 'rgba(255,255,255,0.2)',
          }}
        />
      ))}
    </div>
  );
}

// ─── Shared card shell ────────────────────────────────────────────────────────

function CardShell({
  title,
  icon,
  accent,
  borderGlow,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  accent: string;
  borderGlow: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="relative rounded-2xl overflow-hidden flex flex-col"
      style={{
        background: 'linear-gradient(135deg, rgba(15,18,30,0.95) 0%, rgba(20,24,40,0.98) 100%)',
        border: `1px solid ${borderGlow}`,
        boxShadow: `0 0 24px ${borderGlow}22, inset 0 1px 0 rgba(255,255,255,0.05)`,
        minHeight: 220,
      }}
    >
      {/* Top accent bar */}
      <div className="h-[2px] w-full" style={{ background: accent }} />

      {/* Header */}
      <div className="flex items-center gap-2 px-4 pt-3 pb-2">
        <span className="text-base">{icon}</span>
        <span className="text-xs font-bold tracking-widest uppercase" style={{ color: accent }}>
          {title}
        </span>
        <span className="ml-auto w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: accent }} />
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col px-4 pb-4">{children}</div>
    </div>
  );
}

// ─── Crypto Card ─────────────────────────────────────────────────────────────

function CryptoCard() {
  const [coins, setCoins] = useState<CoinCard[]>([]);
  const [loading, setLoading] = useState(true);
  const { idx, visible, goTo } = useAutoSlide(coins.length || 1);

  useEffect(() => {
    fetch('/api/crypto-cards')
      .then((r) => r.json())
      .then((d) => setCoins(d.coins ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const coin = coins[idx];

  return (
    <CardShell
      title="Crypto"
      icon="🪙"
      accent="linear-gradient(90deg,#818cf8,#a78bfa)"
      borderGlow="#818cf8"
    >
      {loading && <SkeletonSlide />}

      {!loading && !coin && (
        <p className="text-gray-500 text-sm flex-1 flex items-center justify-center">No data</p>
      )}

      {!loading && coin && (
        <div
          className="flex-1 flex flex-col"
          style={{
            opacity: visible ? 1 : 0,
            transform: visible ? 'translateY(0)' : 'translateY(8px)',
            transition: 'opacity 0.22s ease, transform 0.22s ease',
          }}
        >
          {/* Name + price row */}
          <div className="flex items-start justify-between mt-1">
            <div>
              <p className="text-[11px] text-gray-500 font-medium tracking-wide">{coin.name}</p>
              <p className="text-2xl font-bold text-white tracking-tight leading-none mt-0.5">
                {coin.price >= 1000
                  ? `$${coin.price.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
                  : coin.price >= 1
                  ? `$${coin.price.toFixed(2)}`
                  : `$${coin.price.toFixed(4)}`}
              </p>
            </div>

            <div className="flex flex-col items-end gap-1">
              <span
                className="text-[11px] font-bold px-2 py-0.5 rounded-full"
                style={{
                  background: coin.changePercent >= 0 ? 'rgba(34,197,94,0.15)' : 'rgba(248,113,113,0.15)',
                  color: coin.changePercent >= 0 ? '#22c55e' : '#f87171',
                }}
              >
                {coin.changePercent >= 0 ? '▲' : '▼'} {Math.abs(coin.changePercent).toFixed(2)}%
              </span>
              <span className="text-[11px] font-semibold text-purple-400">{coin.symbol}</span>
            </div>
          </div>

          {/* Sparkline */}
          <div className="mt-2 -mx-1">
            <Sparkline prices={coin.sparkline} up={coin.changePercent >= 0} uid={`crypto-${coin.id}`} />
          </div>

          <Dots count={coins.length} active={idx} onDot={goTo} accent="#818cf8" />
        </div>
      )}
    </CardShell>
  );
}

// ─── Stock Card ───────────────────────────────────────────────────────────────

function StockCard() {
  const [stocks, setStocks] = useState<StockCard[]>([]);
  const [loading, setLoading] = useState(true);
  const { idx, visible, goTo } = useAutoSlide(stocks.length || 1);

  useEffect(() => {
    fetch('/api/stock-cards')
      .then((r) => r.json())
      .then((d) => setStocks(d.stocks ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const stock = stocks[idx];

  return (
    <CardShell
      title="Stocks"
      icon="📈"
      accent="linear-gradient(90deg,#34d399,#6ee7b7)"
      borderGlow="#34d399"
    >
      {loading && <SkeletonSlide />}

      {!loading && !stock && (
        <p className="text-gray-500 text-sm flex-1 flex items-center justify-center">No data</p>
      )}

      {!loading && stock && (
        <div
          className="flex-1 flex flex-col"
          style={{
            opacity: visible ? 1 : 0,
            transform: visible ? 'translateY(0)' : 'translateY(8px)',
            transition: 'opacity 0.22s ease, transform 0.22s ease',
          }}
        >
          {/* Name + price row */}
          <div className="flex items-start justify-between mt-1">
            <div>
              <p className="text-[11px] text-gray-500 font-medium tracking-wide truncate max-w-[120px]">
                {stock.name}
              </p>
              <p className="text-2xl font-bold text-white tracking-tight leading-none mt-0.5">
                ${stock.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>

            <div className="flex flex-col items-end gap-1">
              <span
                className="text-[11px] font-bold px-2 py-0.5 rounded-full"
                style={{
                  background: stock.changePercent >= 0 ? 'rgba(52,211,153,0.15)' : 'rgba(248,113,113,0.15)',
                  color: stock.changePercent >= 0 ? '#34d399' : '#f87171',
                }}
              >
                {stock.changePercent >= 0 ? '▲' : '▼'} {Math.abs(stock.changePercent).toFixed(2)}%
              </span>
              <span className="text-[11px] font-semibold text-emerald-400">{stock.symbol}</span>
            </div>
          </div>

          {/* Sparkline */}
          <div className="mt-2 -mx-1">
            <Sparkline prices={stock.sparkline} up={stock.changePercent >= 0} uid={`stock-${stock.symbol}`} />
          </div>

          <Dots count={stocks.length} active={idx} onDot={goTo} accent="#34d399" />
        </div>
      )}
    </CardShell>
  );
}

// ─── News Card ────────────────────────────────────────────────────────────────

function timeAgo(iso: string) {
  try {
    const ms = Date.now() - new Date(iso).getTime();
    const m = Math.floor(ms / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  } catch {
    return '';
  }
}

function NewsCard() {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const { idx, visible, goTo } = useAutoSlide(news.length || 1, 5500);

  useEffect(() => {
    fetch('/api/news')
      .then((r) => r.json())
      .then((d) => setNews(d.news ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const item = news[idx];

  return (
    <CardShell
      title="Market News"
      icon="📰"
      accent="linear-gradient(90deg,#fb923c,#fbbf24)"
      borderGlow="#fb923c"
    >
      {loading && <SkeletonSlide />}

      {!loading && !item && (
        <p className="text-gray-500 text-sm flex-1 flex items-center justify-center">No news</p>
      )}

      {!loading && item && (
        <div
          className="flex-1 flex flex-col"
          style={{
            opacity: visible ? 1 : 0,
            transform: visible ? 'translateY(0)' : 'translateY(8px)',
            transition: 'opacity 0.22s ease, transform 0.22s ease',
          }}
        >
          {/* Source + time */}
          <div className="flex items-center gap-2 mt-1">
            <span
              className="text-[10px] font-bold px-2 py-0.5 rounded-full"
              style={{ background: 'rgba(251,146,60,0.15)', color: '#fb923c' }}
            >
              {item.source}
            </span>
            <span className="text-[10px] text-gray-500">{timeAgo(item.publishedAt)}</span>
          </div>

          {/* Title */}
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 text-m font-semibold text-white leading-snug hover:text-orange-300 transition-colors line-clamp-3"
          >
            {item.title}
          </a>

          {/* Description */}
          {item.description && (
            <p className="mt-1.5 text-[11px] text-gray-400 leading-relaxed line-clamp-2">
              {item.description}
            </p>
          )}

          {/* Decorative bar */}
          <div className="mt-auto">
            {/* <div className="mt-3 h-px w-full rounded" style={{ background: 'rgba(251,146,60,0.15)' }} /> */}
            <Dots count={news.length} active={idx} onDot={goTo} accent="#fb923c" />
          </div>
        </div>
      )}
    </CardShell>
  );
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function SkeletonSlide() {
  return (
    <div className="flex-1 flex flex-col gap-3 mt-2 animate-pulse">
      <div className="h-4 w-24 rounded-md bg-gray-700/60" />
      <div className="h-7 w-36 rounded-md bg-gray-700/60" />
      <div className="h-12 w-full rounded-md bg-gray-700/40 mt-1" />
      <div className="flex gap-1.5 mt-2 justify-center">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-1.5 w-1.5 rounded-full bg-gray-700/60" />
        ))}
      </div>
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export default function DashboardCards() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
      <CryptoCard />
      <StockCard />
      <NewsCard />
    </div>
  );
}
