'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function NavBar() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  const links = [
    { href: '/', label: 'Markets' },
    { href: '/wallet', label: 'Wallet' },
  ];

  return (
    <>
      <nav className="border-b border-gray-800 bg-gray-950/90 backdrop-blur sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link href="/" className="text-lg font-bold text-brand-500 tracking-tight">
            CastAlgo
          </Link>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-4 text-sm">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={`transition-colors ${pathname === l.href ? 'text-white' : 'text-gray-400 hover:text-white'}`}
              >
                {l.label}
              </Link>
            ))}
            <Link href="/login" className="btn-primary text-sm py-1.5 px-3">
              Login
            </Link>
          </div>

          {/* Mobile: login + hamburger */}
          <div className="flex md:hidden items-center gap-3">
            <Link href="/login" className="btn-primary text-sm py-1.5 px-3">
              Login
            </Link>
            <button
              onClick={() => setOpen((o) => !o)}
              className="p-2 text-gray-400 hover:text-white"
              aria-label="Toggle menu"
            >
              {open ? (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* Mobile dropdown */}
        {open && (
          <div className="md:hidden border-t border-gray-800 bg-gray-950 px-4 py-3 flex flex-col gap-3">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className={`text-sm py-1.5 transition-colors ${pathname === l.href ? 'text-white font-semibold' : 'text-gray-400'}`}
              >
                {l.label}
              </Link>
            ))}
          </div>
        )}
      </nav>
    </>
  );
}
