import { NextResponse } from 'next/server';

const COINS = [
  'bitcoin', 'ethereum', 'algorand', 'solana', 'binancecoin',
  'ripple', 'cardano', 'avalanche-2',
];

const SYMBOL_MAP: Record<string, string> = {
  bitcoin: 'BTC', ethereum: 'ETH', algorand: 'ALGO', solana: 'SOL',
  binancecoin: 'BNB', ripple: 'XRP', cardano: 'ADA', 'avalanche-2': 'AVAX',
};

export async function GET() {
  try {
    const ids = COINS.join(',');
    const res = await fetch(
      `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${ids}&order=market_cap_desc&sparkline=true&price_change_percentage=24h`,
      { next: { revalidate: 120 } }
    );
    if (!res.ok) throw new Error(`CoinGecko ${res.status}`);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any[] = await res.json();

    const coins = data.map((c) => ({
      id: c.id,
      symbol: SYMBOL_MAP[c.id] ?? c.symbol.toUpperCase(),
      name: c.name,
      price: c.current_price as number,
      changePercent: (c.price_change_percentage_24h as number) ?? 0,
      marketCap: c.market_cap as number,
      // last 48 data points of the 7-day hourly sparkline
      sparkline: (c.sparkline_in_7d?.price as number[] | null)?.slice(-48) ?? [],
    }));

    return NextResponse.json({ coins });
  } catch (err) {
    console.error('[/api/crypto-cards]', err);
    return NextResponse.json({ coins: [] }, { status: 500 });
  }
}
