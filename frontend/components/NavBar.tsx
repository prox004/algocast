'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useUser } from '@auth0/nextjs-auth0/client';
import { getToken, getMe, logout, type User } from '@/lib/api';

export default function NavBar() {
  const [open, setOpen] = useState(false);
  const [legacyUser, setLegacyUser] = useState<User | null>(null);
  const { user: auth0User, error, isLoading } = useUser();
  const pathname = usePathname();
  const router = useRouter();

  // Determine which user system to use
  const user = auth0User || legacyUser;
  const isAuth0 = !!auth0User;

  useEffect(() => {
    // Only check legacy auth if Auth0 is not active
    if (!auth0User && !isLoading) {
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
              setLegacyUser(data);
            } else {
              setLegacyUser(null);
            }
          })
          .catch(() => setLegacyUser(null));
      } else {
        setLegacyUser(null);
      }
    }
  }, [pathname, auth0User, isLoading]); // re-check on route change

  const links = [
    { href: '/', label: 'Markets' },
    ...(user ? [
      { href: '/dashboard', label: 'Dashboard' },
      { href: '/profile', label: 'Profile' }
    ] : []),
  ];

  function handleLogout() {
    if (isAuth0) {
      // Auth0 logout
      window.location.href = '/api/auth/logout';
    } else {
      // Legacy logout
      setLegacyUser(null);
      logout();
    }
  }

  function handleLogin() {
    if (process.env.NEXT_PUBLIC_AUTH0_ENABLED === 'true') {
      // Auth0 login
      window.location.href = '/api/auth/login';
    } else {
      // Legacy login
      router.push('/login');
    }
  }

  const userEmail = auth0User?.email || legacyUser?.email || '';
  const userName = auth0User?.name || legacyUser?.email?.split('@')[0] || '';

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
              <div className="flex items-center gap-2">
                {auth0User?.picture && (
                  <img 
                    src={auth0User.picture} 
                    alt={userName}
                    className="w-6 h-6 rounded-full"
                  />
                )}
                <span className="text-xs text-gray-500 max-w-[130px] truncate" title={userEmail}>
                  {userName || userEmail}
                </span>
                {isAuth0 && (
                  <span className="text-xs bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded">
                    Auth0
                  </span>
                )}
              </div>
              <button onClick={handleLogout} className="btn-secondary text-sm py-1.5 px-3">
                Logout
              </button>
            </div>
          ) : (
            <button onClick={handleLogin} className="btn-primary text-sm py-1.5 px-3">
              Login
            </button>
          )}
        </div>

        {/* Mobile: action + hamburger */}
        <div className="flex md:hidden items-center gap-2">
          {user ? (
            <button onClick={handleLogout} className="btn-secondary text-sm py-1.5 px-3">
              Logout
            </button>
          ) : (
            <button onClick={handleLogin} className="btn-primary text-sm py-1.5 px-3">
              Login
            </button>
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
            <div className="flex items-center gap-2">
              {auth0User?.picture && (
                <img 
                  src={auth0User.picture} 
                  alt={userName}
                  className="w-5 h-5 rounded-full"
                />
              )}
              <p className="text-xs text-gray-600 truncate">{userName || userEmail}</p>
              {isAuth0 && (
                <span className="text-xs bg-green-500/20 text-green-400 px-1 py-0.5 rounded">
                  Auth0
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </nav>
  );
}
