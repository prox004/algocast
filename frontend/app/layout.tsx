import type { Metadata, Viewport } from 'next';
import './globals.css';
import NavBar from '@/components/NavBar';

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
      <body className="min-h-screen">
        <NavBar />
        <main className="max-w-6xl mx-auto px-3 sm:px-4 py-4 sm:py-8">{children}</main>
      </body>
    </html>
  );
}
