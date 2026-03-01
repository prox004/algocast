// ── Shared Types for Personalized AI Assistant ──────────────────────────────

export interface Trade {
  id: string;
  user_id: string;
  market_id: string;
  side: 'YES' | 'NO';
  amount: number;
  tokens: number;
  timestamp: number;
  entry_probability?: number;
  exit_probability?: number;
  profit_loss?: number;
  category?: string;
  holding_time?: number; // in hours
  is_winner?: boolean;
}

export interface Market {
  id: string;
  question: string;
  category: string;
  ai_probability: number;
  market_probability: number;
  expiry: number;
  resolved: boolean;
  outcome?: 0 | 1;
  volatility?: number;
}

export interface UserProfile {
  user_id: string;
  total_trades: number;
  win_rate: number;
  total_volume: number;
  net_profit_loss: number;
  avg_holding_time: number;
  risk_tolerance: 'low' | 'medium' | 'high';
  category_preferences: Record<string, number>;
  category_win_rates: Record<string, number>;
}

// ── Trading Coach Agent ──────────────────────────────────────────────────────

export interface TradingCoachInput {
  user_id: string;
  trades: Trade[];
  timeframe_days?: number;
}

export interface TradingCoachOutput {
  win_rate: number;
  strengths: string[];
  weaknesses: string[];
  risk_behavior: 'conservative' | 'moderate' | 'aggressive' | 'reckless';
  improvement_suggestions: string[];
  confidence: 'low' | 'medium' | 'high';
}

// ── Market Recommender ──────────────────────────────────────────────────────

export interface MarketRecommenderInput {
  user_id: string;
  user_profile: UserProfile;
  available_markets: Market[];
  max_recommendations?: number;
}

export interface MarketRecommendation {
  market_id: string;
  reason: string;
  match_score: number;
}

export interface MarketRecommenderOutput {
  recommended_markets: MarketRecommendation[];
  confidence: 'low' | 'medium' | 'high';
}

// ── Position Sizing Agent ────────────────────────────────────────────────────

export interface PositionSizingInput {
  user_bankroll: number;
  risk_tolerance: 'low' | 'medium' | 'high';
  ai_probability: number;
  market_probability: number;
  market_category?: string;
  user_category_performance?: number;
}

export interface PositionSizingOutput {
  recommended_bet_size: number;
  percentage_of_bankroll: number;
  risk_level: 'low' | 'medium' | 'high';
  reasoning: string;
}

// ── Exit Strategy Agent ──────────────────────────────────────────────────────

export interface ExitStrategyInput {
  trade: Trade;
  current_probability: number;
  time_remaining_hours: number;
  volatility_level: 'low' | 'medium' | 'high';
  ai_updated_probability: number;
}

export interface ExitStrategyOutput {
  action: 'HOLD' | 'TAKE_PROFIT' | 'CUT_LOSS';
  confidence: 'low' | 'medium' | 'high';
  reasoning: string;
}

// ── Performance Analyzer ─────────────────────────────────────────────────────

export interface PerformanceAnalyzerInput {
  user_id: string;
  weekly_trades: Trade[];
  week_start: number; // timestamp
  week_end: number; // timestamp
}

export interface PerformanceAnalyzerOutput {
  weekly_summary: string;
  total_profit_loss: number;
  best_category: string;
  worst_category: string;
  key_mistakes: string[];
  key_strengths: string[];
  next_week_focus: string[];
  confidence: 'low' | 'medium' | 'high';
}

// ── Utility Types ────────────────────────────────────────────────────────────

export interface CategoryStats {
  category: string;
  trade_count: number;
  win_rate: number;
  avg_profit: number;
  total_volume: number;
}

export interface TradingPattern {
  pattern_type: 'revenge_trading' | 'overexposure' | 'short_term_bias' | 'category_strength';
  severity: 'low' | 'medium' | 'high';
  description: string;
  suggestion: string;
}