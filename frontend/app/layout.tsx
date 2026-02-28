import type { Metadata } from 'next';
import './globals.css';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'CastAlgo — Prediction Markets on Algorand',
  description: 'AI-powered prediction markets built on Algorand',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <nav className="border-b border-gray-800 bg-gray-950/80 backdrop-blur sticky top-0 z-50">
          <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
            <Link href="/" className="text-lg font-bold text-brand-500 tracking-tight">
              CastAlgo
            </Link>
            <div className="flex items-center gap-4 text-sm">
              <Link href="/" className="text-gray-400 hover:text-white transition-colors">
                Markets
              </Link>
              <Link href="/wallet" className="text-gray-400 hover:text-white transition-colors">
                Wallet
              </Link>
              <Link href="/login" className="btn-primary text-sm py-1.5 px-3">
                Login
              </Link>
            </div>
          </div>
        </nav>
        <main className="max-w-6xl mx-auto px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
