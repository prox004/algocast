'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { getToken, getMe, logout, type User } from '@/lib/api';

export default function NavBar() {
  const [open, setOpen] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (getToken()) {
      getMe()
        .then((data) => {
          // Explicit validation
          if (
            typeof data === 'object' &&
            data !== null &&
            typeof data.id === 'string' &&
            typeof data.email === 'string'
          ) {
            setUser(data);
          } else {
            setUser(null);
          }
        })
        .catch(() => setUser(null));
    } else {
      setUser(null);
    }
  }, [pathname]); // re-check on route change (e.g. after login)

  const links = [
    { href: '/', label: 'Markets' },
    ...(user ? [
      { href: '/dashboard', label: 'Dashboard' },
      { href: '/profile', label: 'Profile' }
    ] : []),
  ];

  function handleLogout() {
    setUser(null);
    logout();
  }

  return (
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
          {user ? (
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-500 max-w-[130px] truncate" title={user.email}>
                {user.email}
              </span>
              <button onClick={handleLogout} className="btn-secondary text-sm py-1.5 px-3">
                Logout
              </button>
            </div>
          ) : (
            <Link href="/login" className="btn-primary text-sm py-1.5 px-3">
              Login
            </Link>
          )}
        </div>

        {/* Mobile: action + hamburger */}
        <div className="flex md:hidden items-center gap-2">
          {user ? (
            <button onClick={handleLogout} className="btn-secondary text-sm py-1.5 px-3">
              Logout
            </button>
          ) : (
            <Link href="/login" className="btn-primary text-sm py-1.5 px-3">
              Login
            </Link>
          )}
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
          {user && (
            <p className="text-xs text-gray-600 truncate">{user.email}</p>
          )}
        </div>
      )}
    </nav>
  );
}
