import { NextResponse } from 'next/server';

interface NewsItem {
  title: string;
  description: string;
  url: string;
  source: string;
  publishedAt: string;
}

function parseRSS(xml: string): NewsItem[] {
  const items: NewsItem[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;

  let match;
  while ((match = itemRegex.exec(xml)) !== null && items.length < 8) {
    const block = match[1];

    const get = (tag: string) => {
      const m = block.match(new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`, 'i'));
      return m ? m[1].trim() : '';
    };

    const title = get('title');
    const url = get('link') || get('guid');
    const description = get('description').replace(/<[^>]+>/g, '').slice(0, 160);
    const source = get('source') || 'Reuters';
    const pubDate = get('pubDate');

    if (title && url) {
      items.push({ title, description, url, source, publishedAt: pubDate });
    }
  }
  return items;
}

export async function GET() {
  // Try CoinGecko news first (JSON, no auth)
  try {
    const res = await fetch('https://api.coingecko.com/api/v3/news', {
      next: { revalidate: 300 },
    });
    if (res.ok) {
      const json = await res.json();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const raw: any[] = Array.isArray(json) ? json : (json?.data ?? []);
      if (raw.length > 0) {
        const news: NewsItem[] = raw.slice(0, 8).map((item) => ({
          title: item.title ?? item.name ?? '',
          description: (item.description ?? item.content ?? '').replace(/<[^>]+>/g, '').slice(0, 160),
          url: item.url ?? item.link ?? '#',
          source: item.news_site ?? item.author ?? 'CoinGecko',
          publishedAt: item.created_at
            ? new Date(item.created_at * 1000).toISOString()
            : item.updated_at
            ? new Date(item.updated_at * 1000).toISOString()
            : new Date().toISOString(),
        }));
        return NextResponse.json({ news });
      }
    }
  } catch {
    // fall through to RSS
  }

  // Fallback: Yahoo Finance RSS
  try {
    const res = await fetch('https://finance.yahoo.com/news/rssindex', {
      headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/rss+xml,application/xml' },
      next: { revalidate: 300 },
    });
    if (res.ok) {
      const xml = await res.text();
      const news = parseRSS(xml);
      if (news.length > 0) return NextResponse.json({ news });
    }
  } catch {
    // fall through
  }

  return NextResponse.json({ news: [] }, { status: 500 });
}
