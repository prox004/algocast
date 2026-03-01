import { NextResponse } from 'next/server';

const STOCKS = ['NVDA', 'AAPL', 'MSFT', 'TSLA', 'AMZN', 'META', 'GOOGL'];


async function fetchStock(symbol: string) {
  const url = `https://query2.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1h&range=5d`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    next: { revalidate: 300 },
  });
  if (!res.ok) return null;
  const data = await res.json();
  const result = data?.chart?.result?.[0];
  if (!result) return null;

  const meta = result.meta;
  const closePrices: (number | null)[] = result.indicators?.quote?.[0]?.close ?? [];
  const sparkline = closePrices.filter((p): p is number => p !== null).slice(-48);

  const price: number = meta.regularMarketPrice ?? 0;
  const prev: number = meta.chartPreviousClose ?? price;
  const changePercent = prev !== 0 ? ((price - prev) / prev) * 100 : 0;

  return {
    symbol,
    name: (meta.shortName ?? meta.longName ?? symbol) as string,
    price,
    changePercent,
    sparkline,
  };
}

export async function GET() {
  try {
    const results = await Promise.allSettled(STOCKS.map(fetchStock));

    const stocks = results
      .filter(
        (r): r is PromiseFulfilledResult<NonNullable<Awaited<ReturnType<typeof fetchStock>>>> =>
          r.status === 'fulfilled' && r.value !== null
      )
      .map((r) => r.value);

    return NextResponse.json({ stocks });
  } catch (err) {
    console.error('[/api/stock-cards]', err);
    return NextResponse.json({ stocks: [] }, { status: 500 });
  }
}
