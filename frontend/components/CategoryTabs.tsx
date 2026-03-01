'use client';

import { useRef, useState, useEffect } from 'react';

/** All supported categories — order matters (shown left-to-right) */
const CATEGORIES = [
  { key: 'all',              label: 'All',               icon: '📊' },
  { key: 'open',             label: 'Open',              icon: '🟢' },
  { key: 'expired',          label: 'Expired',           icon: '⏰' },
  { key: 'resolved',         label: 'Resolved',          icon: '✅' },
  { key: 'trending',         label: 'Trending',          icon: '🔥' },
  { key: 'new',              label: 'New',               icon: '✨' },
  { key: 'politics',         label: 'Politics',          icon: '🏛️' },
  { key: 'sports',           label: 'Sports',            icon: '⚽' },
  { key: 'crypto',           label: 'Crypto',            icon: '₿' },
  { key: 'finance',          label: 'Finance',           icon: '💹' },
  { key: 'geopolitics',      label: 'Geopolitics',       icon: '🌍' },
  { key: 'earnings',         label: 'Earnings',          icon: '📈' },
  { key: 'technology',       label: 'Tech',              icon: '💻' },
  { key: 'culture',          label: 'Culture',           icon: '🎭' },
  { key: 'world',            label: 'World',             icon: '🗺️' },
  { key: 'economy',          label: 'Economy',           icon: '🏦' },
  { key: 'climate',          label: 'Climate & Science', icon: '🌱' },
  { key: 'elections',        label: 'Elections',         icon: '🗳️' },
  { key: 'general',          label: 'General',           icon: '📌' },
] as const;

export type CategoryKey = (typeof CATEGORIES)[number]['key'];

interface Props {
  active: CategoryKey;
  onChange: (key: CategoryKey) => void;
  /** Optional map of category → count, used to hide empty tabs */
  counts?: Record<string, number>;
}

export default function CategoryTabs({ active, onChange, counts }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  function updateArrows() {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }

  useEffect(() => {
    updateArrows();
    const el = scrollRef.current;
    el?.addEventListener('scroll', updateArrows, { passive: true });
    window.addEventListener('resize', updateArrows);
    return () => {
      el?.removeEventListener('scroll', updateArrows);
      window.removeEventListener('resize', updateArrows);
    };
  }, []);

  function scroll(dir: 'left' | 'right') {
    scrollRef.current?.scrollBy({ left: dir === 'left' ? -200 : 200, behavior: 'smooth' });
  }

  // Determine visible categories: always show status filters + 'all', 'trending', 'new',
  // plus any content category that has at least 1 market (if counts provided)
  const visible = CATEGORIES.filter((cat) => {
    if (['all', 'open', 'expired', 'resolved', 'trending', 'new'].includes(cat.key)) return true;
    if (!counts) return true; // no count info → show everything
    return (counts[cat.key] ?? 0) > 0;
  });

  return (
    <div className="relative mb-5">
      {/* Left fade + arrow */}
      {canScrollLeft && (
        <button
          onClick={() => scroll('left')}
          className="absolute left-0 top-0 bottom-0 z-10 w-8 flex items-center justify-center
                     bg-gradient-to-r from-[var(--background)] to-transparent text-gray-400 hover:text-white"
          aria-label="Scroll left"
        >
          ‹
        </button>
      )}

      {/* Scrollable tab strip */}
      <div
        ref={scrollRef}
        className="flex items-center gap-1 overflow-x-auto scrollbar-hide px-1 py-1"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {visible.map((cat) => {
          const isActive = active === cat.key;
          return (
            <button
              key={cat.key}
              onClick={() => onChange(cat.key)}
              className={`
                shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs sm:text-sm font-medium
                transition-all whitespace-nowrap
                ${
                  isActive
                    ? 'bg-white/10 text-white border border-white/20'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-white/5 border border-transparent'
                }
              `}
            >
              <span className="text-sm">{cat.icon}</span>
              {cat.label}
              {counts && counts[cat.key] !== undefined && cat.key !== 'all' && (
                <span className={`ml-0.5 text-[10px] ${isActive ? 'text-gray-300' : 'text-gray-600'}`}>
                  {counts[cat.key]}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Right fade + arrow */}
      {canScrollRight && (
        <button
          onClick={() => scroll('right')}
          className="absolute right-0 top-0 bottom-0 z-10 w-8 flex items-center justify-center
                     bg-gradient-to-l from-[var(--background)] to-transparent text-gray-400 hover:text-white"
          aria-label="Scroll right"
        >
          ›
        </button>
      )}
    </div>
  );
}
