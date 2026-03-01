'use client';

import { useEffect, useState, useCallback } from 'react';
import { getToken } from '@/lib/api';

/**
 * UMA Protocol Status & Dispute Panel
 *
 * Displays the UMA dispute resolution status for a market:
 *   - PROPOSED: Shows dispute window countdown + raise dispute button
 *   - UMA_VOTING: Shows voting countdown + vote tally
 *   - UMA_LOCKED: Shows final locked verdict with lock hash
 *   - EXPIRED_NO_DISPUTE: Shows auto-finalized verdict
 *
 * Rules displayed:
 *   - 10-min dispute window
 *   - 10-min voting period
 *   - No bonds (testnet)
 *   - Final verdict is immutable
 */

const BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

interface UmaResolution {
  id: string;
  market_id: string;
  proposed_outcome: number;
  proposed_by: string;
  evidence: string | null;
  status: string;
  proposed_at: number;
  dispute_window_ends: number;
  dispute_time_remaining_ms: number;
  voting_ends: number | null;
  voting_time_remaining_ms: number;
  locked_at: number | null;
  final_outcome: number | null;
  lock_hash: string | null;
  dispute_reason: string | null;
  disputed_by: string | null;
  disputed_at: number | null;
  votes: {
    total: number;
    yes: number;
    no: number;
    details: Array<{ admin_id: string; vote: number; voted_at: number }>;
  };
  is_locked: boolean;
  is_immutable: boolean;
}

interface Props {
  marketId: string;
}

export default function UmaDisputePanel({ marketId }: Props) {
  const [umaData, setUmaData] = useState<{
    uma_active: boolean;
    uma_resolution: UmaResolution | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [disputeReason, setDisputeReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitMsg, setSubmitMsg] = useState('');
  const [timeRemaining, setTimeRemaining] = useState(0);

  const isLoggedIn = Boolean(getToken());

  const fetchUmaStatus = useCallback(async () => {
    try {
      const res = await fetch(`${BASE}/dispute/${marketId}/uma`);
      const data = await res.json();
      if (data.success) {
        setUmaData(data);
        // Set initial time remaining
        if (data.uma_resolution) {
          if (data.uma_resolution.status === 'PROPOSED') {
            setTimeRemaining(data.uma_resolution.dispute_time_remaining_ms);
          } else if (data.uma_resolution.status === 'UMA_VOTING') {
            setTimeRemaining(data.uma_resolution.voting_time_remaining_ms);
          } else {
            setTimeRemaining(0);
          }
        }
      }
    } catch {
      setError('Failed to load UMA status');
    } finally {
      setLoading(false);
    }
  }, [marketId]);

  useEffect(() => {
    fetchUmaStatus();
    // Poll every 10 seconds for updates
    const interval = setInterval(fetchUmaStatus, 10000);
    return () => clearInterval(interval);
  }, [fetchUmaStatus]);

  // Countdown timer
  useEffect(() => {
    if (timeRemaining <= 0) return;
    const interval = setInterval(() => {
      setTimeRemaining((prev) => Math.max(0, prev - 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [timeRemaining > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleRaiseDispute() {
    if (!disputeReason.trim()) return;
    setSubmitting(true);
    setSubmitMsg('');

    try {
      const token = getToken();
      const res = await fetch(`${BASE}/dispute/${marketId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ reason: disputeReason.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setSubmitMsg('Dispute raised! Admin voting has started.');
        setDisputeReason('');
        fetchUmaStatus();
      } else {
        setSubmitMsg(data.error || 'Failed to raise dispute');
      }
    } catch {
      setSubmitMsg('Network error');
    } finally {
      setSubmitting(false);
    }
  }

  function formatTime(ms: number): string {
    if (ms <= 0) return '0:00';
    const totalSeconds = Math.ceil(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }

  if (loading) return null;
  if (!umaData?.uma_active) return null;

  const uma = umaData.uma_resolution!;
  const status = uma.status;

  return (
    <div className="card border border-amber-700/40 bg-gradient-to-br from-amber-950/30 to-orange-950/20">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-lg">⚖️</span>
          <h2 className="font-bold text-sm text-amber-300">UMA Dispute Resolution</h2>
        </div>
        <StatusBadge status={status} />
      </div>

      {/* PROPOSED: Dispute Window */}
      {status === 'PROPOSED' && (
        <div>
          {/* Proposed outcome */}
          <div className="bg-gray-800/60 rounded-lg p-3 mb-3">
            <p className="text-xs text-gray-400 mb-1">Proposed Resolution</p>
            <p className={`text-lg font-bold ${uma.proposed_outcome === 1 ? 'text-emerald-400' : 'text-red-400'}`}>
              {uma.proposed_outcome === 1 ? '✓ YES' : '✗ NO'}
            </p>
            {uma.evidence && (
              <p className="text-xs text-gray-500 mt-1">{uma.evidence}</p>
            )}
          </div>

          {/* Countdown */}
          <div className="bg-amber-900/30 border border-amber-700/30 rounded-lg p-3 mb-3 text-center">
            <p className="text-xs text-amber-400/70 mb-1">Dispute Window</p>
            <p className="text-2xl font-mono font-bold text-amber-300">
              {formatTime(timeRemaining)}
            </p>
            <p className="text-[10px] text-gray-500 mt-1">
              Raise a dispute before time runs out
            </p>
          </div>

          {/* Raise dispute form */}
          {isLoggedIn && timeRemaining > 0 && (
            <div className="space-y-2">
              <textarea
                value={disputeReason}
                onChange={(e) => setDisputeReason(e.target.value)}
                placeholder="Why do you disagree with this resolution?"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2 text-sm text-gray-200 placeholder-gray-500 resize-none"
                rows={2}
                maxLength={500}
              />
              <button
                onClick={handleRaiseDispute}
                disabled={submitting || !disputeReason.trim()}
                className="w-full py-2.5 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:bg-gray-700 disabled:text-gray-500 text-white font-semibold text-sm transition-colors"
              >
                {submitting ? 'Raising Dispute...' : '⚠️ Raise UMA Dispute'}
              </button>
              {submitMsg && (
                <p className={`text-xs ${submitMsg.includes('raised') ? 'text-emerald-400' : 'text-red-400'}`}>
                  {submitMsg}
                </p>
              )}
            </div>
          )}

          {!isLoggedIn && (
            <p className="text-xs text-gray-500 text-center">Log in to raise a dispute</p>
          )}

          {/* Rules */}
          <div className="mt-3 pt-3 border-t border-gray-800">
            <p className="text-[10px] text-gray-600">
              No bond required (TestNet) • If no dispute → auto-locked • Final verdict is immutable
            </p>
          </div>
        </div>
      )}

      {/* UMA_VOTING: Admin Voting Phase */}
      {status === 'UMA_VOTING' && (
        <div>
          {/* Dispute info */}
          <div className="bg-red-900/20 border border-red-700/30 rounded-lg p-3 mb-3">
            <p className="text-xs text-red-400 font-semibold mb-1">⚠️ Disputed</p>
            <p className="text-xs text-gray-400">{uma.dispute_reason}</p>
          </div>

          {/* Proposed outcome */}
          <div className="bg-gray-800/60 rounded-lg p-3 mb-3">
            <p className="text-xs text-gray-400 mb-1">Original Proposal</p>
            <p className={`font-bold ${uma.proposed_outcome === 1 ? 'text-emerald-400' : 'text-red-400'}`}>
              {uma.proposed_outcome === 1 ? 'YES' : 'NO'}
            </p>
          </div>

          {/* Voting countdown */}
          <div className="bg-blue-900/30 border border-blue-700/30 rounded-lg p-3 mb-3 text-center">
            <p className="text-xs text-blue-400/70 mb-1">Admin Voting Period</p>
            <p className="text-2xl font-mono font-bold text-blue-300">
              {formatTime(timeRemaining)}
            </p>
          </div>

          {/* Vote tally */}
          <div className="grid grid-cols-2 gap-2 mb-3">
            <div className="bg-emerald-950/40 border border-emerald-800/30 rounded-lg p-2 text-center">
              <p className="text-xs text-emerald-400/70">YES Votes</p>
              <p className="text-xl font-bold text-emerald-400">{uma.votes.yes}</p>
            </div>
            <div className="bg-red-950/40 border border-red-800/30 rounded-lg p-2 text-center">
              <p className="text-xs text-red-400/70">NO Votes</p>
              <p className="text-xl font-bold text-red-400">{uma.votes.no}</p>
            </div>
          </div>

          <p className="text-[10px] text-gray-600 text-center">
            {uma.votes.total} of {uma.votes.total + 1}+ admins have voted • Majority wins • Tie → original proposal
          </p>
        </div>
      )}

      {/* UMA_LOCKED or EXPIRED_NO_DISPUTE: Final Verdict */}
      {(status === 'UMA_LOCKED' || status === 'EXPIRED_NO_DISPUTE') && (
        <div>
          {/* Locked badge */}
          <div className="bg-purple-900/30 border border-purple-600/40 rounded-lg p-4 mb-3 text-center">
            <p className="text-xs text-purple-400/70 mb-1">🔒 PERMANENTLY LOCKED</p>
            <p className={`text-2xl font-black ${uma.final_outcome === 1 ? 'text-emerald-400' : 'text-red-400'}`}>
              {uma.final_outcome === 1 ? '✓ YES' : '✗ NO'}
            </p>
            <p className="text-[10px] text-purple-400/50 mt-2 font-medium">
              This verdict is IMMUTABLE — not even admins can change it
            </p>
          </div>

          {/* Vote results (if it went to voting) */}
          {status === 'UMA_LOCKED' && uma.votes.total > 0 && (
            <div className="grid grid-cols-2 gap-2 mb-3">
              <div className="bg-emerald-950/30 rounded-lg p-2 text-center">
                <p className="text-xs text-emerald-400/50">YES</p>
                <p className="text-lg font-bold text-emerald-400/70">{uma.votes.yes}</p>
              </div>
              <div className="bg-red-950/30 rounded-lg p-2 text-center">
                <p className="text-xs text-red-400/50">NO</p>
                <p className="text-lg font-bold text-red-400/70">{uma.votes.no}</p>
              </div>
            </div>
          )}

          {status === 'EXPIRED_NO_DISPUTE' && (
            <p className="text-xs text-gray-500 text-center mb-3">
              No dispute was raised within the 10-minute window. Resolution auto-finalized.
            </p>
          )}

          {/* Lock hash */}
          {uma.lock_hash && (
            <div className="bg-gray-800/40 rounded-lg p-2">
              <p className="text-[10px] text-gray-500 mb-0.5">Lock Hash (SHA-256)</p>
              <p className="text-[10px] font-mono text-gray-400 break-all">{uma.lock_hash}</p>
            </div>
          )}

          {/* Evidence */}
          {uma.evidence && (
            <div className="mt-2">
              <p className="text-[10px] text-gray-500">Evidence: {uma.evidence}</p>
            </div>
          )}

          {/* Dispute reason if it was disputed */}
          {uma.dispute_reason && (
            <div className="mt-2 bg-amber-900/20 rounded-lg p-2">
              <p className="text-[10px] text-amber-400/70">Original Dispute: {uma.dispute_reason}</p>
            </div>
          )}
        </div>
      )}

      {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { bg: string; text: string; label: string }> = {
    PROPOSED: { bg: 'bg-amber-900/60', text: 'text-amber-300', label: 'DISPUTE WINDOW' },
    UMA_VOTING: { bg: 'bg-blue-900/60', text: 'text-blue-300', label: 'ADMIN VOTING' },
    UMA_LOCKED: { bg: 'bg-purple-900/60', text: 'text-purple-300', label: '🔒 LOCKED' },
    EXPIRED_NO_DISPUTE: { bg: 'bg-purple-900/60', text: 'text-purple-300', label: '🔒 LOCKED' },
  };
  const c = config[status] || { bg: 'bg-gray-700', text: 'text-gray-300', label: status };

  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${c.bg} ${c.text}`}>
      {c.label}
    </span>
  );
}
