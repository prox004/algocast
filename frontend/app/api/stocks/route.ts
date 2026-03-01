import { NextResponse } from 'next/server';

const SYMBOLS = [
  'AAPL', 'MSFT', 'NVDA', 'GOOGL', 'AMZN', 'META', 'TSLA',
  'AMD', 'NFLX', 'COIN', 'INTC', 'CRM', 'ORCL', 'PYPL', 'UBER',
];

async function fetchQuote(symbol: string) {
  const url = `https://query2.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    next: { revalidate: 60 },
  });
  if (!res.ok) throw new Error(`${symbol}: ${res.status}`);
  const data = await res.json();
  const meta = data?.chart?.result?.[0]?.meta;
  if (!meta?.regularMarketPrice) return null;

  const price: number = meta.regularMarketPrice;
  const prev: number = meta.chartPreviousClose ?? price;
  const changePercent = prev !== 0 ? ((price - prev) / prev) * 100 : 0;

  return { symbol, price, changePercent };
}

export async function GET() {
  try {
    const results = await Promise.allSettled(SYMBOLS.map(fetchQuote));

    const stocks = results
      .filter((r): r is PromiseFulfilledResult<NonNullable<Awaited<ReturnType<typeof fetchQuote>>>> =>
        r.status === 'fulfilled' && r.value !== null
      )
      .map((r) => r.value);

    return NextResponse.json({ stocks });
  } catch (err) {
    console.error('[/api/stocks]', err);
    return NextResponse.json({ stocks: [] }, { status: 500 });
  }
}
