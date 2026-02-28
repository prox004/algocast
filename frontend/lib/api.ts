/**
 * lib/api.ts
 *
 * All backend API calls from the frontend go through this module.
 * Base URL read from NEXT_PUBLIC_API_URL env var.
 *
 * Contract: defined in context.md §API Contract
 */

const BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
const TOKEN_KEY = 'castalgo_token';

// ── Token helpers ────────────────────────────────────────────────────────────

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export function logout() {
  clearToken();
  if (typeof window !== 'undefined') window.location.href = '/';
}

// ── Fetch wrapper ────────────────────────────────────────────────────────────

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, { ...options, headers });
  } catch {
    throw new Error('Cannot connect to server — is the backend running?');
  }

  let data: any;
  try {
    data = await res.json();
  } catch {
    throw new Error(`Server error: ${res.status} ${res.statusText}`);
  }

  if (!res.ok) {
    // handles both { error: 'string' } and { error: { message: 'string' } }
    let msg = 'Request failed';
    if (data?.error) {
      if (typeof data.error === 'string') {
        msg = data.error;
      } else if (typeof data.error === 'object' && data.error.message) {
        msg = typeof data.error.message === 'string' ? data.error.message : 'Request failed';
      }
    } else if (data?.message && typeof data.message === 'string') {
      msg = data.message;
    }
    throw new Error(msg);
  }

  // Validate that data is an object (not null, array, or primitive)
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new Error('Invalid response from server');
  }

  return data as T;
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  custodial_address: string;
  balance: number;
}

export interface Market {
  id: string;
  question: string;
  expiry: number;
  category?: string;
  data_source?: string;
  ai_probability: number;
  market_probability: number;
  yes_asa_id: number | null;
  no_asa_id: number | null;
  yes_reserve: number;
  no_reserve: number;
  resolved: boolean;
  outcome: 0 | 1 | null;
  ticker?: string | null;
  asset_type?: 'stock' | 'crypto' | 'commodity' | null;
  tweet_id?: string | null;
  tweet_author?: string | null;
  tweet_content?: string | null;
}

export interface Trade {
  id: string;
  user_id: string;
  market_id: string;
  side: 'YES' | 'NO';
  amount: number;
  tokens: number;
  timestamp: number;
}

export interface AIAnalysis {
  market_id: string;
  ai_probability: number;
  summary: string;
  sentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
}

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

export interface SentimentArticle {
  title: string;
  source: string;
  url: string;
  sentiment?: 'positive' | 'negative' | 'neutral';
}

export interface SentimentResult {
  success: boolean;
  market_id: string;
  news_articles_analyzed: number;
  sentiment_score: number;           // -1 (very bearish) → +1 (very bullish)
  sentiment_label: 'Bullish' | 'Bearish' | 'Neutral';
  ai_probability_adjustment: number;
  confidence: 'High' | 'Medium' | 'Low';
  momentum_indicator:
    | 'Strong Upward Momentum'
    | 'Upward Momentum'
    | 'Stable'
    | 'Downward Momentum'
    | 'Strong Downward Momentum';
  explanation: string;
  articles: SentimentArticle[];
  ai_probability: number;
  market_probability: number;
  mispricing_percent: number;
  fetched_at: string;
}

// ── Auth ─────────────────────────────────────────────────────────────────────

export async function register(email: string, password: string): Promise<{ token: string; user: User }> {
  return request('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export async function login(email: string, password: string): Promise<{ token: string; user: User }> {
  return request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export async function getMe(): Promise<User> {
  return request('/auth/me');
}

// ── Wallet ───────────────────────────────────────────────────────────────────

export async function getWalletBalance(): Promise<{ balance: number; custodial_address: string; email: string }> {
  return request('/wallet/balance');
}

export async function syncWalletBalance(): Promise<{ success: boolean; balance: number; custodial_address: string }> {
  return request('/wallet/sync-balance', {
    method: 'POST',
  });
}

export async function deposit(amount: number): Promise<{ success: boolean; txid: string; balance: number }> {
  return request('/wallet/deposit', {
    method: 'POST',
    body: JSON.stringify({ amount }),
  });
}

export async function withdraw(to_address: string, amount: number): Promise<{ success: boolean; txid: string; balance: number }> {
  return request('/wallet/withdraw', {
    method: 'POST',
    body: JSON.stringify({ to_address, amount }),
  });
}

export async function exportWalletMnemonic(password: string): Promise<{ success: boolean; mnemonic: string; address: string }> {
  return request('/wallet/export-mnemonic', {
    method: 'POST',
    body: JSON.stringify({ password }),
  });
}

// ── Markets ──────────────────────────────────────────────────────────────────

export async function getMarkets(): Promise<Market[]> {
  const data = await request<{ markets: Market[] }>('/markets');
  return data.markets;
}

export async function getMarket(id: string): Promise<Market> {
  return request(`/markets/${id}`);
}

export async function generateMarket(question: string, expiry: number): Promise<{ market: Market }> {
  return request('/markets/generate', {
    method: 'POST',
    body: JSON.stringify({ question, expiry }),
  });
}

export async function buyYes(market_id: string, amount: number): Promise<{ success: boolean; tokens: number; trade: Trade }> {
  return request('/markets/buy-yes', {
    method: 'POST',
    body: JSON.stringify({ market_id, amount }),
  });
}

export async function buyNo(market_id: string, amount: number): Promise<{ success: boolean; tokens: number; trade: Trade }> {
  return request('/markets/buy-no', {
    method: 'POST',
    body: JSON.stringify({ market_id, amount }),
  });
}

export async function claimWinnings(market_id: string): Promise<{ success: boolean; payout: number }> {
  return request('/markets/claim', {
    method: 'POST',
    body: JSON.stringify({ market_id }),
  });
}

export async function getMarketPriceGraph(market_id: string, days?: number): Promise<{ success: boolean; market: any; priceData: PriceGraph }> {
  const url = days ? `/markets/${market_id}/price?days=${days}` : `/markets/${market_id}/price`;
  return request(url);
}

export async function getMarketCurrentPrice(market_id: string): Promise<{ success: boolean; currentPrice: CurrentPrice }> {
  return request(`/markets/${market_id}/current-price`);
}

export async function resolveMarket(market_id: string, outcome: 0 | 1): Promise<{ success: boolean }> {
  return request('/markets/resolve', {
    method: 'POST',
    body: JSON.stringify({ market_id, outcome }),
  });
}

// ── AI ───────────────────────────────────────────────────────────────────────

export async function getAIAnalysis(market_id: string): Promise<AIAnalysis> {
  return request(`/ai/analysis/${market_id}`);
}

export async function getSentiment(market_id: string): Promise<any> {
  return request(`/ai/sentiment/${market_id}`);
}

export async function getSentimentAnalysis(market_id: string): Promise<SentimentResult> {
  return request(`/ai/sentiment/${market_id}`);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Format microAlgos → human readable ALGO string */
export function formatAlgo(microAlgos: number): string {
  return (microAlgos / 1_000_000).toFixed(4) + ' ALGO';
}

/** Format probability 0-1 → percentage string */
export function formatProb(prob: number): string {
  return (prob * 100).toFixed(1) + '%';
}

/** Check if market is expired */
export function isExpired(market: Market): boolean {
  return Math.floor(Date.now() / 1000) > market.expiry;
}
