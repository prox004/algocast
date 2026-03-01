import type { Metadata, Viewport } from 'next';
import './globals.css';
import NavBar from '@/components/NavBar';
import CryptoTicker from '@/components/CryptoTicker';
import StockTicker from '@/components/StockTicker';
import { PeraWalletProvider } from '@/lib/PeraWalletContext';

export const metadata: Metadata = {
  title: 'CastAlgo — Prediction Markets on Algorand',
  description: 'AI-powered prediction markets built on Algorand',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen" suppressHydrationWarning>
        <PeraWalletProvider>
          <NavBar />
          <CryptoTicker />
          <main className="max-w-6xl mx-auto px-3 sm:px-4 py-4 sm:py-8 pb-12">{children}</main>
          <StockTicker />
        </PeraWalletProvider>
      </body>
    </html>
  );
}
