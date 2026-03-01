'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatProb } from '@/lib/api';

interface MarketRecommendation {
  market_id: string;
  reason: string;
  match_score: number;
}

interface Recommendations {
  recommended_markets: MarketRecommendation[];
  confidence: string;
}

interface UserProfile {
  total_trades: number;
  win_rate: number;
  risk_tolerance: string;
  category_preferences: Record<string, number>;
  category_win_rates: Record<string, number>;
}

interface Props {
  recommendations: Recommendations | null;
  userProfile: UserProfile;
}

const confidenceColors = {
  low: 'text-gray-400 border-gray-600',
  medium: 'text-yellow-400 border-yellow-600',
  high: 'text-emerald-400 border-emerald-600'
};

export default function MarketRecommendationsPanel({ recommendations, userProfile }: Props) {
  const router = useRouter();
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  if (!recommendations || recommendations.recommended_markets.length === 0) {
    return (
      <div className="space-y-6">
        {/* No Recommendations */}
        <div className="card text-center py-12">
          <div className="text-6xl mb-4">🎯</div>
          <h3 className="text-xl font-semibold mb-2">
            {userProfile.total_trades < 5 ? 'Building Your Profile' : 'No Recommendations Available'}
          </h3>
          <p className="text-gray-400 mb-6">
            {userProfile.total_trades < 5 
              ? "Complete a few more trades to get personalized market recommendations based on your trading patterns and preferences."
              : "No suitable markets found matching your trading profile right now. Check back later for new opportunities."
            }
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button 
              onClick={() => window.location.href = '/'}
              className="btn-primary"
            >
              Browse All Markets
            </button>
            {userProfile.total_trades >= 5 && (
              <button 
                onClick={() => window.location.reload()}
                className="btn-secondary"
              >
                Refresh Recommendations
              </button>
            )}
          </div>
        </div>

        {/* User Preferences - only show if user has some trading history */}
        {userProfile.total_trades > 0 && (
          <div className="card">
            <h3 className="font-semibold mb-4">Your Trading Profile</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h4 className="font-medium text-gray-300 mb-3">Category Preferences</h4>
                {Object.entries(userProfile.category_preferences).length > 0 ? (
                  <div className="space-y-2">
                    {Object.entries(userProfile.category_preferences)
                      .sort(([,a], [,b]) => b - a)
                      .map(([category, percentage]) => (
                      <div key={category} className="flex items-center justify-between">
                        <span className="text-sm capitalize">{category}</span>
                        <span className="text-sm font-medium">{Math.round(percentage * 100)}%</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">Trade in different categories to see preferences</p>
                )}
              </div>

              <div>
                <h4 className="font-medium text-gray-300 mb-3">Category Performance</h4>
                {Object.entries(userProfile.category_win_rates).length > 0 ? (
                  <div className="space-y-2">
                    {Object.entries(userProfile.category_win_rates)
                      .sort(([,a], [,b]) => b - a)
                      .map(([category, winRate]) => (
                      <div key={category} className="flex items-center justify-between">
                        <span className="text-sm capitalize">{category}</span>
                        <span className={`text-sm font-medium ${
                          winRate > 0.6 ? 'text-emerald-400' : 
                          winRate > 0.4 ? 'text-yellow-400' : 'text-red-400'
                        }`}>
                          {formatProb(winRate)}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">No performance data yet</p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  const sortedRecommendations = [...recommendations.recommended_markets]
    .sort((a, b) => b.match_score - a.match_score);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-semibold flex items-center gap-2">
            <span className="text-brand-500">🎯</span>
            Personalized Market Recommendations
          </h3>
          <span className={`text-sm px-3 py-1 rounded-full border ${
            confidenceColors[recommendations.confidence as keyof typeof confidenceColors]
          }`}>
            {recommendations.confidence} confidence
          </span>
        </div>
        
        <p className="text-gray-400 text-sm">
          Based on your trading history and preferences, here are markets that match your profile.
        </p>
      </div>

      {/* Recommendations List */}
      <div className="space-y-4">
        {sortedRecommendations.map((rec, index) => (
          <div key={rec.market_id} className="card hover:border-brand-500/50 transition-colors cursor-pointer"
               onClick={() => router.push(`/market/${rec.market_id}`)}>
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-lg font-bold text-brand-500">#{index + 1}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">Match Score:</span>
                    <div className="flex items-center gap-2">
                      <div className="w-20 bg-gray-800 rounded-full h-2">
                        <div 
                          className="bg-brand-500 h-2 rounded-full" 
                          style={{ width: `${rec.match_score * 100}%` }}
                        ></div>
                      </div>
                      <span className="text-sm font-bold text-brand-400">
                        {Math.round(rec.match_score * 100)}%
                      </span>
                    </div>
                  </div>
                </div>
                
                <h4 className="font-medium mb-2">Market {rec.market_id}</h4>
                <p className="text-sm text-gray-400">{rec.reason}</p>
              </div>
              
              <div className="flex items-center gap-2 ml-4">
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    router.push(`/market/${rec.market_id}`);
                  }}
                  className="btn-primary text-sm"
                >
                  View Market
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* AI Insights */}
      <div className="card">
        <h3 className="font-semibold mb-4 flex items-center gap-2">
          <span className="text-brand-500">🧠</span>
          AI Recommendation Insights
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
            <h4 className="font-medium text-blue-400 mb-2">Why These Markets?</h4>
            <p className="text-sm text-gray-300">
              These recommendations are based on your {userProfile.risk_tolerance} risk tolerance, 
              {formatProb(userProfile.win_rate)} win rate, and category preferences. 
              Markets with higher match scores align better with your trading patterns.
            </p>
          </div>
          
          <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
            <h4 className="font-medium text-emerald-400 mb-2">Optimization Tips</h4>
            <p className="text-sm text-gray-300">
              Focus on markets with 70%+ match scores for best results. 
              Consider your strongest categories: {
                Object.entries(userProfile.category_win_rates)
                  .sort(([,a], [,b]) => b - a)
                  .slice(0, 2)
                  .map(([cat]) => cat)
                  .join(', ') || 'building data'
              }.
            </p>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="card">
        <h3 className="font-semibold mb-4">Quick Actions</h3>
        <div className="flex flex-wrap gap-3">
          <button 
            onClick={() => router.push('/')}
            className="btn-secondary"
          >
            Browse All Markets
          </button>
          <button 
            onClick={() => window.location.reload()}
            className="btn-secondary"
          >
            Refresh Recommendations
          </button>
          <button 
            onClick={() => router.push('/dashboard?tab=coach')}
            className="btn-secondary"
          >
            View AI Coach
          </button>
        </div>
      </div>
    </div>
  );
}