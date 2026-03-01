'use client';

import { formatAlgo, formatProb } from '@/lib/api';

interface PerformanceData {
  date: string;
  profit_loss: number;
  cumulative_pnl: number;
  trades_count: number;
  win_rate: number;
}

interface Props {
  data: PerformanceData[];
  timeRange: '7d' | '30d' | '90d' | '1y';
  onTimeRangeChange: (range: '7d' | '30d' | '90d' | '1y') => void;
}

export default function PerformanceChart({ data, timeRange, onTimeRangeChange }: Props) {
  if (!data || data.length === 0) {
    return (
      <div className="card">
        <h3 className="font-semibold mb-4">Performance Chart</h3>
        <div className="text-center py-12 text-gray-500">
          <p>No performance data available</p>
          <p className="text-sm mt-2">Start trading to see your performance chart</p>
        </div>
      </div>
    );
  }

  const maxPnL = Math.max(...data.map(d => d.cumulative_pnl));
  const minPnL = Math.min(...data.map(d => d.cumulative_pnl));
  const range = maxPnL - minPnL;
  const padding = range * 0.1;

  const currentPnL = data[data.length - 1]?.cumulative_pnl || 0;
  const totalTrades = data.reduce((sum, d) => sum + d.trades_count, 0);
  const avgWinRate = data.length > 0 ? data.reduce((sum, d) => sum + d.win_rate, 0) / data.length : 0;

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-6">
        <h3 className="font-semibold">Performance Chart</h3>
        
        {/* Time Range Selector */}
        <div className="flex items-center gap-1 bg-gray-800 rounded-lg p-1">
          {(['7d', '30d', '90d', '1y'] as const).map((range) => (
            <button
              key={range}
              onClick={() => onTimeRangeChange(range)}
              className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                timeRange === range
                  ? 'bg-brand-500 text-white'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              {range}
            </button>
          ))}
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="text-center">
          <p className="text-sm text-gray-500 mb-1">Total P&L</p>
          <p className={`text-lg font-bold ${currentPnL >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {currentPnL >= 0 ? '+' : ''}{formatAlgo(currentPnL * 1000000)}
          </p>
        </div>
        <div className="text-center">
          <p className="text-sm text-gray-500 mb-1">Total Trades</p>
          <p className="text-lg font-bold text-brand-500">{totalTrades}</p>
        </div>
        <div className="text-center">
          <p className="text-sm text-gray-500 mb-1">Avg Win Rate</p>
          <p className="text-lg font-bold text-emerald-400">{formatProb(avgWinRate)}</p>
        </div>
      </div>

      {/* Simple Line Chart */}
      <div className="relative h-48 bg-gray-900 rounded-lg p-4">
        <svg className="w-full h-full" viewBox="0 0 400 160">
          {/* Grid lines */}
          <defs>
            <pattern id="grid" width="40" height="32" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 32" fill="none" stroke="#374151" strokeWidth="0.5"/>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
          
          {/* Zero line */}
          <line 
            x1="0" 
            y1="80" 
            x2="400" 
            y2="80" 
            stroke="#6B7280" 
            strokeWidth="1" 
            strokeDasharray="2,2"
          />
          
          {/* Performance line */}
          {data.length > 1 && (
            <polyline
              fill="none"
              stroke={currentPnL >= 0 ? "#10B981" : "#EF4444"}
              strokeWidth="2"
              points={data.map((point, index) => {
                const x = (index / (data.length - 1)) * 400;
                const normalizedY = ((point.cumulative_pnl - minPnL - padding) / (range + 2 * padding)) * 160;
                const y = 160 - normalizedY;
                return `${x},${y}`;
              }).join(' ')}
            />
          )}
          
          {/* Data points */}
          {data.map((point, index) => {
            const x = (index / (data.length - 1)) * 400;
            const normalizedY = ((point.cumulative_pnl - minPnL - padding) / (range + 2 * padding)) * 160;
            const y = 160 - normalizedY;
            
            return (
              <circle
                key={index}
                cx={x}
                cy={y}
                r="3"
                fill={point.cumulative_pnl >= 0 ? "#10B981" : "#EF4444"}
                className="hover:r-4 transition-all cursor-pointer"
              >
                <title>
                  {point.date}: {point.cumulative_pnl >= 0 ? '+' : ''}{formatAlgo(point.cumulative_pnl * 1000000)}
                </title>
              </circle>
            );
          })}
        </svg>
        
        {/* Y-axis labels */}
        <div className="absolute left-0 top-0 h-full flex flex-col justify-between text-xs text-gray-500 -ml-12">
          <span>{formatAlgo((maxPnL + padding) * 1000000)}</span>
          <span>0 ALGO</span>
          <span>{formatAlgo((minPnL - padding) * 1000000)}</span>
        </div>
        
        {/* X-axis labels */}
        <div className="absolute bottom-0 left-0 w-full flex justify-between text-xs text-gray-500 -mb-6">
          <span>{data[0]?.date}</span>
          <span>{data[data.length - 1]?.date}</span>
        </div>
      </div>

      {/* Recent Performance */}
      <div className="mt-6 pt-4 border-t border-gray-800">
        <h4 className="font-medium text-gray-300 mb-3">Recent Performance</h4>
        <div className="space-y-2 max-h-32 overflow-y-auto">
          {data.slice(-5).reverse().map((point, index) => (
            <div key={index} className="flex items-center justify-between text-sm">
              <span className="text-gray-400">{point.date}</span>
              <div className="flex items-center gap-3">
                <span className="text-gray-500">{point.trades_count} trades</span>
                <span className="text-gray-500">{formatProb(point.win_rate)}</span>
                <span className={`font-medium ${
                  point.profit_loss >= 0 ? 'text-emerald-400' : 'text-red-400'
                }`}>
                  {point.profit_loss >= 0 ? '+' : ''}{formatAlgo(point.profit_loss * 1000000)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}