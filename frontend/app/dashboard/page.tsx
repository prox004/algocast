'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getToken, getMe, getComprehensiveAnalysis, formatAlgo, formatProb, type User } from '@/lib/api';
import TradingHistoryPanel from '@/components/TradingHistoryPanel';
import AICoachPanel from '@/components/AICoachPanel';
import MarketRecommendationsPanel from '@/components/MarketRecommendationsPanel';

interface ComprehensiveAnalysis {
  user_profile: {
    user_id: string;
    total_trades: number;
    win_rate: number;
    total_volume: number;
    net_profit_loss: number;
    avg_holding_time: number;
    risk_tolerance: string;
    category_preferences: Record<string, number>;
    category_win_rates: Record<string, number>;
  };
  trading_coach: {
    win_rate: number;
    strengths: string[];
    weaknesses: string[];
    risk_behavior: string;
    improvement_suggestions: string[];
    confidence: string;
  };
  market_recommendations: {
    recommended_markets: Array<{
      market_id: string;
      reason: string;
      match_score: number;
    }>;
    confidence: string;
  } | null;
  weekly_performance: {
    weekly_summary: string;
    total_profit_loss: number;
    best_category: string;
    worst_category: string;
    key_mistakes: string[];
    key_strengths: string[];
    next_week_focus: string[];
    confidence: string;
  };
}

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [analysis, setAnalysis] = useState<ComprehensiveAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'overview' | 'history' | 'coach' | 'recommendations'>('overview');

  useEffect(() => {
    const token = getToken();
    if (!token) {
      router.push('/login');
      return;
    }

    loadDashboard();
  }, [router]);

  async function loadDashboard() {
    try {
      setLoading(true);
      
      // Get user info
      const userData = await getMe();
      setUser(userData);

      // Get comprehensive AI analysis
      const analysisData = await getComprehensiveAnalysis(userData.id);
      setAnalysis(analysisData.analysis);
      
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-800 rounded w-64 mb-4"></div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-32 bg-gray-800 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-7xl mx-auto">
        <div className="card border-red-800 text-red-400">
          <h2 className="font-semibold mb-2">Dashboard Error</h2>
          <p>{error}</p>
          <button onClick={loadDashboard} className="btn-secondary mt-4">
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!user || !analysis) {
    return (
      <div className="max-w-7xl mx-auto">
        <div className="card text-center py-12">
          <p className="text-gray-500">No data available</p>
        </div>
      </div>
    );
  }

  const { user_profile, trading_coach, market_recommendations, weekly_performance } = analysis;

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Trading Dashboard</h1>
          <p className="text-gray-400">Welcome back, {user.email}</p>
        </div>
        <button onClick={loadDashboard} className="btn-secondary">
          Refresh
        </button>
      </div>

      {/* Key Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="card text-center">
          <p className="text-sm text-gray-500 mb-1">Total Trades</p>
          <p className="text-2xl font-bold text-brand-500">{user_profile.total_trades}</p>
        </div>
        <div className="card text-center">
          <p className="text-sm text-gray-500 mb-1">Win Rate</p>
          <p className="text-2xl font-bold text-emerald-400">
            {user_profile.total_trades === 0 ? 'N/A' : formatProb(user_profile.win_rate)}
          </p>
        </div>
        <div className="card text-center">
          <p className="text-sm text-gray-500 mb-1">Net P&L</p>
          <p className={`text-2xl font-bold ${user_profile.net_profit_loss >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {user_profile.total_trades === 0 ? 'N/A' : (
              <>
                {user_profile.net_profit_loss >= 0 ? '+' : ''}{formatAlgo(user_profile.net_profit_loss * 1000000)}
              </>
            )}
          </p>
        </div>
        <div className="card text-center">
          <p className="text-sm text-gray-500 mb-1">Risk Level</p>
          <p className={`text-2xl font-bold capitalize ${
            user_profile.risk_tolerance === 'high' ? 'text-red-400' : 
            user_profile.risk_tolerance === 'medium' ? 'text-yellow-400' : 'text-emerald-400'
          }`}>
            {user_profile.risk_tolerance}
          </p>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-gray-800">
        <nav className="flex space-x-8">
          {[
            { key: 'overview', label: 'Overview' },
            { key: 'history', label: 'Trading History' },
            { key: 'coach', label: 'AI Coach' },
            { key: 'recommendations', label: 'Recommendations' }
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as any)}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === tab.key
                  ? 'border-brand-500 text-brand-500'
                  : 'border-transparent text-gray-500 hover:text-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <>
          {user_profile.total_trades === 0 ? (
            /* New User Welcome */
            <div className="card text-center py-12">

              <h3 className="text-xl font-semibold mb-2">Welcome to Algocast!</h3>
              <p className="text-gray-400 mb-6 max-w-md mx-auto">
                Start trading prediction markets to unlock personalized AI insights, 
                performance analytics, and market recommendations.
              </p>
              <button 
                onClick={() => window.location.href = '/'}
                className="btn-primary"
              >
                Browse Markets
              </button>
            </div>
          ) : (
            /* Existing User Overview */
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Weekly Performance */}
              <div className="card">
                <h3 className="font-semibold mb-4">This Week's Performance</h3>
                <div className="space-y-3">
                  <p className="text-sm text-gray-400">{weekly_performance.weekly_summary}</p>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-gray-500">Best Category</p>
                      <p className="font-medium text-emerald-400">{weekly_performance.best_category || 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Worst Category</p>
                      <p className="font-medium text-red-400">{weekly_performance.worst_category || 'N/A'}</p>
                    </div>
                  </div>

                  {weekly_performance.key_strengths.length > 0 && (
                    <div>
                      <p className="text-xs text-gray-500 mb-2">Key Strengths</p>
                      <ul className="text-sm space-y-1">
                        {weekly_performance.key_strengths.map((strength, i) => (
                          <li key={i} className="text-emerald-400">• {strength}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>

              {/* Category Performance */}
              <div className="card">
                <h3 className="font-semibold mb-4">Category Performance</h3>
                <div className="space-y-3">
                  {Object.entries(user_profile.category_win_rates).length > 0 ? (
                    Object.entries(user_profile.category_win_rates).map(([category, winRate]) => (
                      <div key={category} className="flex items-center justify-between">
                        <span className="text-sm capitalize">{category}</span>
                        <div className="flex items-center gap-2">
                          <div className="w-20 bg-gray-800 rounded-full h-2">
                            <div 
                              className="bg-brand-500 h-2 rounded-full" 
                              style={{ width: `${winRate * 100}%` }}
                            ></div>
                          </div>
                          <span className="text-sm font-medium w-12">{formatProb(winRate)}</span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-gray-500 text-center py-4">
                      No category data yet. Start trading to see performance by category.
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {activeTab === 'history' && (
        <TradingHistoryPanel />
      )}

      {activeTab === 'coach' && (
        <AICoachPanel 
          coachAnalysis={trading_coach}
          weeklyPerformance={weekly_performance}
          userProfile={user_profile}
        />
      )}

      {activeTab === 'recommendations' && (
        <MarketRecommendationsPanel 
          recommendations={market_recommendations}
          userProfile={user_profile}
        />
      )}
    </div>
  );
}