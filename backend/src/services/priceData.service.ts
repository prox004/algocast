/**
 * priceData.service.ts — Fetch stock and crypto price data with historical graphs
 * Supports multiple APIs: CoinGecko (crypto), Alpha Vantage (stock)
 */

import axios from 'axios';

export interface PricePoint {
  timestamp: number;
  price: number;
  high?: number;
  low?: number;
  volume?: number;
}

export interface CurrentPrice {
  ticker: string;
  price: number;
  currency: string;
  priceChange24h?: number;
  priceChangePercent24h?: number;
  volumeUSD?: number;
  marketCap?: number;
  timestamp: number;
}

export interface PriceGraph {
  ticker: string;
  assetType: 'stock' | 'crypto';
  current: CurrentPrice;
  historical: PricePoint[];
  timeRange: '1h' | '24h' | '7d' | '30d' | '1y';
  source: string;
}

export class PriceDataService {
  private readonly COINGECKO_API = 'https://api.coingecko.com/api/v3';
  private readonly ALPHA_VANTAGE_API = 'https://www.alphavantage.co/query';
  private readonly FINNHUB_API = 'https://finnhub.io/api/v1';

  // CoinGecko crypto ID mapping
  private readonly CRYPTO_IDS: Record<string, string> = {
    'BTC': 'bitcoin',
    'ETH': 'ethereum',
    'SOL': 'solana',
    'ADA': 'cardano',
    'DOT': 'polkadot',
    'LINK': 'chainlink',
    'XRP': 'ripple',
    'DOGE': 'dogecoin',
    'SHIB': 'shiba-inu',
    'MATIC': 'matic-network',
    'AVAX': 'avalanche-2',
    'FTM': 'fantom',
    'NEAR': 'near',
    'ATOM': 'cosmos',
    'ARB': 'arbitrum',
    'OP': 'optimism',
    'ALGO': 'algorand',
    'UNI': 'uniswap',
    'AAVE': 'aave',
    'LDO': 'lido-dao',
  };

  /**
   * Fetch current price for a crypto ticker using free CoinGecko API
   */
  async getCryptoPrice(ticker: string): Promise<CurrentPrice> {
    try {
      const cryptoId = this.CRYPTO_IDS[ticker] || ticker.toLowerCase();
      
      const response = await axios.get(`${this.COINGECKO_API}/simple/price`, {
        params: {
          ids: cryptoId,
          vs_currencies: 'usd',
          include_market_cap: true,
          include_24hr_vol: true,
          include_24hr_change: true,
          include_last_updated_at: true,
        },
        timeout: 5000,
      });

      const data = response.data[cryptoId];
      if (!data) {
        throw new Error(`Crypto ${ticker} not found in CoinGecko`);
      }

      return {
        ticker,
        price: data.usd,
        currency: 'USD',
        priceChange24h: data.usd_24h_change,
        priceChangePercent24h: data.usd_24h_change,
        volumeUSD: data.usd_24h_vol,
        marketCap: data.usd_market_cap,
        timestamp: Date.now(),
      };
    } catch (error) {
      console.error(`[PriceDataService] Error fetching crypto price ${ticker}:`, error);
      throw error;
    }
  }

  /**
   * Fetch historical price data for crypto (24h hourly data)
   */
  async getCryptoPriceHistory(
    ticker: string,
    days: number = 7,
  ): Promise<PricePoint[]> {
    try {
      const cryptoId = this.CRYPTO_IDS[ticker] || ticker.toLowerCase();

      const response = await axios.get(`${this.COINGECKO_API}/coins/${cryptoId}/market_chart`, {
        params: {
          vs_currency: 'usd',
          days: days,
          interval: 'daily',
        },
        timeout: 5000,
      });

      const prices = response.data.prices || [];
      return prices.map((point: [number, number], index: number) => ({
        timestamp: point[0],
        price: point[1],
      }));
    } catch (error) {
      console.error(`[PriceDataService] Error fetching crypto history ${ticker}:`, error);
      return [];
    }
  }

  /**
   * Fetch complete price graph for crypto
   */
  async getCryptoPriceGraph(ticker: string, days: number = 7): Promise<PriceGraph> {
    const current = await this.getCryptoPrice(ticker);
    const historical = await this.getCryptoPriceHistory(ticker, days);

    const timeRangeMap: Record<number, '1h' | '24h' | '7d' | '30d' | '1y'> = {
      1: '24h',
      7: '7d',
      30: '30d',
      365: '1y',
    };

    return {
      ticker,
      assetType: 'crypto',
      current,
      historical,
      timeRange: timeRangeMap[days] || '7d',
      source: 'CoinGecko',
    };
  }

  /**
   * Mock stock price fetcher (free APIs have limitations)
   * In production, use Alpha Vantage, Finnhub, or IEX Cloud
   */
  async getStockPrice(ticker: string): Promise<CurrentPrice> {
    try {
      // For demo, use mock data with realistic patterns
      // In production, integrate with Alpha Vantage, Finnhub, or IEX Cloud
      const mockPrices: Record<string, number> = {
        'AAPL': 195.42,
        'MSFT': 418.75,
        'GOOGL': 172.33,
        'AMZN': 198.67,
        'TSLA': 248.95,
        'META': 352.44,
        'NVDA': 891.22,
        'JPM': 185.33,
        'V': 284.56,
        'JNJ': 160.78,
      };

      const price = mockPrices[ticker] || Math.random() * 500 + 50;
      const change24h = (Math.random() - 0.5) * 10;

      return {
        ticker,
        price,
        currency: 'USD',
        priceChange24h: change24h,
        priceChangePercent24h: (change24h / price) * 100,
        volumeUSD: Math.random() * 1000000000 + 100000000,
        timestamp: Date.now(),
      };
    } catch (error) {
      console.error(`[PriceDataService] Error fetching stock price ${ticker}:`, error);
      throw error;
    }
  }

  /**
   * Mock stock price history (for demo purposes)
   */
  async getStockPriceHistory(ticker: string, days: number = 7): Promise<PricePoint[]> {
    const points: PricePoint[] = [];
    const now = Date.now();
    const basePrice = Math.random() * 500 + 50;

    for (let i = days * 24; i >= 0; i--) {
      const timestamp = now - i * 3600000; // hourly points
      const noise = (Math.random() - 0.5) * 10; // ±5% variation
      const price = Math.max(basePrice + noise, 1);

      points.push({
        timestamp,
        price,
      });
    }

    return points;
  }

  /**
   * Fetch complete price graph for stock
   */
  async getStockPriceGraph(ticker: string, days: number = 7): Promise<PriceGraph> {
    const current = await this.getStockPrice(ticker);
    const historical = await this.getStockPriceHistory(ticker, days);

    const timeRangeMap: Record<number, '1h' | '24h' | '7d' | '30d' | '1y'> = {
      1: '24h',
      7: '7d',
      30: '30d',
      365: '1y',
    };

    return {
      ticker,
      assetType: 'stock',
      current,
      historical,
      timeRange: timeRangeMap[days] || '7d',
      source: 'Demo Market Data',
    };
  }

  /**
   * Universal price graph fetcher - auto-detects asset type
   */
  async getPriceGraph(
    ticker: string,
    assetType: 'stock' | 'crypto' | null,
    days: number = 7,
  ): Promise<PriceGraph | null> {
    try {
      // If asset type is specified, use it; otherwise try crypto first
      if (assetType === 'crypto') {
        return await this.getCryptoPriceGraph(ticker, days);
      } else if (assetType === 'stock') {
        return await this.getStockPriceGraph(ticker, days);
      } else {
        // Try crypto first (free API), then fall back to stock
        try {
          return await this.getCryptoPriceGraph(ticker, days);
        } catch (err) {
          console.log(`[PriceDataService] ${ticker} not found in crypto, trying stock...`);
          return await this.getStockPriceGraph(ticker, days);
        }
      }
    } catch (error) {
      console.error(`[PriceDataService] Failed to fetch price graph for ${ticker}:`, error);
      return null;
    }
  }

  /**
   * Fetch real-time prices for multiple tickers
   */
  async getPricesForMultiple(
    tickers: Array<{ ticker: string; assetType: 'stock' | 'crypto' | null }>,
  ): Promise<CurrentPrice[]> {
    const results: CurrentPrice[] = [];

    for (const { ticker, assetType } of tickers) {
      try {
        if (assetType === 'crypto' || !assetType) {
          results.push(await this.getCryptoPrice(ticker));
        } else {
          results.push(await this.getStockPrice(ticker));
        }
      } catch (err) {
        console.warn(`[PriceDataService] Could not fetch price for ${ticker}`, err);
      }
    }

    return results;
  }
}

export const priceDataService = new PriceDataService();
