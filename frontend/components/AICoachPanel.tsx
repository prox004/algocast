'use client';

import { formatProb } from '@/lib/api';

interface CoachAnalysis {
  win_rate: number;
  strengths: string[];
  weaknesses: string[];
  risk_behavior: string;
  improvement_suggestions: string[];
  confidence: string;
}

interface WeeklyPerformance {
  weekly_summary: string;
  total_profit_loss: number;
  best_category: string;
  worst_category: string;
  key_mistakes: string[];
  key_strengths: string[];
  next_week_focus: string[];
  confidence: string;
}

interface UserProfile {
  total_trades: number;
  win_rate: number;
  risk_tolerance: string;
  avg_holding_time: number;
}

interface Props {
  coachAnalysis: CoachAnalysis;
  weeklyPerformance: WeeklyPerformance;
  userProfile: UserProfile;
}

const riskColors = {
  conservative: 'text-emerald-400',
  moderate: 'text-yellow-400',
  aggressive: 'text-orange-400',
  reckless: 'text-red-400'
};

const confidenceColors = {
  low: 'text-gray-400',
  medium: 'text-yellow-400',
  high: 'text-emerald-400'
};

export default function AICoachPanel({ coachAnalysis, weeklyPerformance, userProfile }: Props) {
  
  // Check if user is new (no trades)
  if (userProfile.total_trades === 0) {
    return (
      <div className="space-y-6">
        <div className="card text-center py-12">
          <h3 className="text-xl font-semibold mb-2">AI Coach Waiting</h3>
          <p className="text-gray-400 mb-6 max-w-md mx-auto">
            Your AI trading coach needs at least 3-5 trades to provide meaningful analysis and personalized recommendations.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-lg mx-auto">
            <div className="p-4 bg-gray-800/50 rounded-lg">
              <h4 className="font-medium text-gray-300 mb-2">Getting Started Tips</h4>
              <ul className="text-sm text-gray-400 space-y-1 text-left">
                <li>• Start with small positions (2-3% of balance)</li>
                <li>• Focus on markets with clear AI edges</li>
                <li>• Diversify across different categories</li>
              </ul>
            </div>
            <div className="p-4 bg-gray-800/50 rounded-lg">
              <h4 className="font-medium text-gray-300 mb-2">What You'll Get</h4>
              <ul className="text-sm text-gray-400 space-y-1 text-left">
                <li>• Personalized trading insights</li>
                <li>• Risk behavior analysis</li>
                <li>• Performance improvement tips</li>
              </ul>
            </div>
          </div>
          <button 
            onClick={() => window.location.href = '/'}
            className="btn-primary mt-6"
          >
            Start Trading
          </button>
        </div>
      </div>
    );
  }
  
  return (
    <div className="space-y-6">
      {/* AI Coach Overview */}
      <div className="card">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-semibold flex items-center gap-2">
            <span className="text-brand-500">🤖</span>
            AI Trading Coach
          </h3>
          <span className={`text-sm px-3 py-1 rounded-full border ${
            confidenceColors[coachAnalysis.confidence as keyof typeof confidenceColors]
          } border-current`}>
            {coachAnalysis.confidence} confidence
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Performance Metrics */}
          <div className="space-y-4">
            <h4 className="font-medium text-gray-300">Performance Metrics</h4>
            
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-400">Win Rate</span>
                <span className="font-medium">{formatProb(coachAnalysis.win_rate)}</span>
              </div>
              
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-400">Risk Behavior</span>
                <span className={`font-medium capitalize ${
                  riskColors[coachAnalysis.risk_behavior as keyof typeof riskColors]
                }`}>
                  {coachAnalysis.risk_behavior}
                </span>
              </div>
              
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-400">Avg Hold Time</span>
                <span className="font-medium">{userProfile.avg_holding_time.toFixed(1)}h</span>
              </div>
            </div>
          </div>

          {/* Strengths */}
          <div className="space-y-4">
            <h4 className="font-medium text-gray-300">Your Strengths</h4>
            {coachAnalysis.strengths.length > 0 ? (
              <ul className="space-y-2">
                {coachAnalysis.strengths.map((strength, i) => (
                  <li key={i} className="text-sm text-emerald-400 flex items-start gap-2">
                    <span className="text-emerald-500 mt-1">✓</span>
                    <span>{strength}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-gray-500">Keep trading to identify strengths</p>
            )}
          </div>

          {/* Areas for Improvement */}
          <div className="space-y-4">
            <h4 className="font-medium text-gray-300">Areas to Improve</h4>
            {coachAnalysis.weaknesses.length > 0 ? (
              <ul className="space-y-2">
                {coachAnalysis.weaknesses.map((weakness, i) => (
                  <li key={i} className="text-sm text-yellow-400 flex items-start gap-2">
                    <span className="text-yellow-500 mt-1">⚠</span>
                    <span>{weakness}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-emerald-400">No major weaknesses detected!</p>
            )}
          </div>
        </div>
      </div>

      {/* Improvement Suggestions */}
      <div className="card">
        <h3 className="font-semibold mb-4 flex items-center gap-2">
          <span className="text-brand-500">💡</span>
          Personalized Recommendations
        </h3>
        
        {coachAnalysis.improvement_suggestions.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {coachAnalysis.improvement_suggestions.map((suggestion, i) => (
              <div key={i} className="p-4 bg-brand-500/10 border border-brand-500/20 rounded-lg">
                <p className="text-sm text-gray-300">{suggestion}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-500">No specific suggestions at this time. Keep trading!</p>
        )}
      </div>

      {/* Weekly Focus Areas */}
      <div className="card">
        <h3 className="font-semibold mb-4 flex items-center gap-2">
          <span className="text-brand-500">🎯</span>
          This Week's Focus
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Key Mistakes */}
          <div>
            <h4 className="font-medium text-gray-300 mb-3">Mistakes to Avoid</h4>
            {weeklyPerformance.key_mistakes.length > 0 ? (
              <ul className="space-y-2">
                {weeklyPerformance.key_mistakes.map((mistake, i) => (
                  <li key={i} className="text-sm text-red-400 flex items-start gap-2">
                    <span className="text-red-500 mt-1">✗</span>
                    <span>{mistake}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-emerald-400">No major mistakes this week!</p>
            )}
          </div>

          {/* Next Week Focus */}
          <div>
            <h4 className="font-medium text-gray-300 mb-3">Next Week's Goals</h4>
            {weeklyPerformance.next_week_focus.length > 0 ? (
              <ul className="space-y-2">
                {weeklyPerformance.next_week_focus.map((focus, i) => (
                  <li key={i} className="text-sm text-brand-400 flex items-start gap-2">
                    <span className="text-brand-500 mt-1">→</span>
                    <span>{focus}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-gray-500">Continue current trading approach</p>
            )}
          </div>
        </div>
      </div>

      {/* Trading Patterns Analysis */}
      <div className="card">
        <h3 className="font-semibold mb-4 flex items-center gap-2">
          <span className="text-brand-500">📊</span>
          Pattern Analysis
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="text-center p-4 bg-gray-800/50 rounded-lg">
            <p className="text-2xl font-bold text-brand-500">{userProfile.total_trades}</p>
            <p className="text-sm text-gray-400 mt-1">Total Trades</p>
          </div>
          
          <div className="text-center p-4 bg-gray-800/50 rounded-lg">
            <p className="text-2xl font-bold text-emerald-400">{formatProb(userProfile.win_rate)}</p>
            <p className="text-sm text-gray-400 mt-1">Overall Win Rate</p>
          </div>
          
          <div className="text-center p-4 bg-gray-800/50 rounded-lg">
            <p className={`text-2xl font-bold capitalize ${
              riskColors[userProfile.risk_tolerance as keyof typeof riskColors]
            }`}>
              {userProfile.risk_tolerance}
            </p>
            <p className="text-sm text-gray-400 mt-1">Risk Profile</p>
          </div>
        </div>

        <div className="mt-6 p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
          <h4 className="font-medium text-blue-400 mb-2">AI Insight</h4>
          <p className="text-sm text-gray-300">
            Based on your trading patterns, you show {coachAnalysis.risk_behavior} risk behavior with a {formatProb(coachAnalysis.win_rate)} win rate. 
            {coachAnalysis.win_rate > 0.6 
              ? " This is above average - keep up the good work!" 
              : coachAnalysis.win_rate > 0.4 
                ? " This is around average - focus on the improvement suggestions to enhance performance."
                : " Consider reviewing your market selection strategy and position sizing."
            }
          </p>
        </div>
      </div>
    </div>
  );
}