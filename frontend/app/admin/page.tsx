'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
const ADMIN_TOKEN_KEY = 'castalgo_admin_token';

interface Admin {
  id: string;
  email: string;
  role: string;
  algorand_address: string;
}

interface Proposal {
  id: string;
  market_id: string;
  proposed_outcome: number;
  proposer_admin_id: string;
  signatures_collected: string[];
  status: string;
  evidence: string;
  resolution_hash: string;
  created_at: number;
}

interface DisputedMarket {
  id: string;
  question: string;
  status: string;
  dispute_flag: number;
}

function getAdminToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(ADMIN_TOKEN_KEY);
}

async function adminRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getAdminToken();
  if (!token) throw new Error('Not authenticated');

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.headers as Record<string, string>),
    },
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data as T;
}

export default function AdminDashboardPage() {
  const router = useRouter();
  const [admin, setAdmin] = useState<Admin | null>(null);
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [disputed, setDisputed] = useState<DisputedMarket[]>([]);
  const [multisigAddr, setMultisigAddr] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Propose resolution form state
  const [proposeForm, setProposeForm] = useState({
    market_id: '',
    outcome: '1',
    evidence: '',
  });
  const [proposeLoading, setProposeLoading] = useState(false);
  const [proposeResult, setProposeResult] = useState('');

  // Sign resolution
  const [signLoading, setSignLoading] = useState<string | null>(null);
  const [signResult, setSignResult] = useState('');

  const loadData = useCallback(async () => {
    try {
      const [meRes, adminsRes, proposalsRes, disputedRes, msigRes] = await Promise.all([
        adminRequest<{ admin: Admin }>('/admin/me'),
        adminRequest<{ admins: Admin[] }>('/admin/admins'),
        adminRequest<{ proposals: Proposal[] }>('/admin/pending-resolutions'),
        adminRequest<{ markets: DisputedMarket[] }>('/admin/disputed-markets'),
        adminRequest<{ multisig_address: string }>('/admin/multisig-address'),
      ]);

      setAdmin(meRes.admin);
      setAdmins(adminsRes.admins);
      setProposals(proposalsRes.proposals);
      setDisputed(disputedRes.markets);
      setMultisigAddr(msigRes.multisig_address);
    } catch (err: any) {
      if (err.message === 'Not authenticated' || err.message.includes('token')) {
        router.push('/admin/login');
        return;
      }
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    if (!getAdminToken()) {
      router.push('/admin/login');
      return;
    }
    loadData();
  }, [router, loadData]);

  async function handlePropose(e: React.FormEvent) {
    e.preventDefault();
    setProposeLoading(true);
    setProposeResult('');
    try {
      const res = await adminRequest<{ success: boolean; message: string; proposal: Proposal }>(
        '/admin/propose-resolution',
        {
          method: 'POST',
          body: JSON.stringify({
            market_id: proposeForm.market_id,
            outcome: Number(proposeForm.outcome),
            evidence: proposeForm.evidence,
          }),
        }
      );
      setProposeResult(res.message);
      setProposeForm({ market_id: '', outcome: '1', evidence: '' });
      await loadData();
    } catch (err: any) {
      setProposeResult(`Error: ${err.message}`);
    } finally {
      setProposeLoading(false);
    }
  }

  async function handleSign(proposalId: string) {
    setSignLoading(proposalId);
    setSignResult('');
    try {
      const res = await adminRequest<{ success: boolean; message: string; resolved: boolean }>(
        '/admin/sign-resolution',
        {
          method: 'POST',
          body: JSON.stringify({ proposal_id: proposalId }),
        }
      );
      setSignResult(res.message);
      await loadData();
    } catch (err: any) {
      setSignResult(`Error: ${err.message}`);
    } finally {
      setSignLoading(null);
    }
  }

  function handleLogout() {
    localStorage.removeItem(ADMIN_TOKEN_KEY);
    localStorage.removeItem('castalgo_admin');
    router.push('/admin/login');
  }

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto mt-8">
        <div className="card animate-pulse h-40 bg-gray-800" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <svg className="w-6 h-6 text-brand-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
          <h1 className="text-2xl font-bold">Admin Governance</h1>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-500">{admin?.email}</span>
          <button onClick={handleLogout} className="btn-secondary text-sm py-1.5 px-3">
            Logout
          </button>
        </div>
      </div>

      {error && (
        <div className="card border-red-800 text-red-400 text-sm">{error}</div>
      )}

      {/* Multisig Info */}
      <div className="card">
        <h2 className="text-lg font-semibold mb-3">2-of-3 Multisig</h2>
        <div className="text-sm space-y-2">
          <div>
            <span className="text-gray-500">Multisig Address: </span>
            <code className="text-brand-500 text-xs break-all">{multisigAddr}</code>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-3">
            {admins.map((a, i) => (
              <div key={a.id} className="bg-gray-800 rounded-lg p-3">
                <div className="text-xs text-gray-500 mb-1">Admin {i + 1}</div>
                <div className="text-sm font-medium truncate">{a.email}</div>
                <div className="text-xs text-gray-600 truncate mt-1" title={a.algorand_address}>
                  {a.algorand_address.slice(0, 8)}...{a.algorand_address.slice(-6)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Propose Resolution */}
      <div className="card">
        <h2 className="text-lg font-semibold mb-3">Propose Resolution</h2>
        <form onSubmit={handlePropose} className="space-y-3">
          <div>
            <label className="label">Market ID</label>
            <input
              className="input"
              placeholder="market-uuid"
              value={proposeForm.market_id}
              onChange={(e) => setProposeForm((f) => ({ ...f, market_id: e.target.value }))}
              required
            />
          </div>
          <div>
            <label className="label">Outcome</label>
            <select
              className="input"
              value={proposeForm.outcome}
              onChange={(e) => setProposeForm((f) => ({ ...f, outcome: e.target.value }))}
            >
              <option value="1">YES (1)</option>
              <option value="0">NO (0)</option>
            </select>
          </div>
          <div>
            <label className="label">Evidence / Data Source</label>
            <textarea
              className="input min-h-[80px]"
              placeholder="Provide evidence and data source for this resolution..."
              value={proposeForm.evidence}
              onChange={(e) => setProposeForm((f) => ({ ...f, evidence: e.target.value }))}
              required
            />
          </div>
          {proposeResult && (
            <p className={`text-sm px-3 py-2 rounded ${
              proposeResult.startsWith('Error')
                ? 'text-red-400 bg-red-900/20'
                : 'text-emerald-400 bg-emerald-900/20'
            }`}>
              {proposeResult}
            </p>
          )}
          <button type="submit" disabled={proposeLoading} className="btn-primary">
            {proposeLoading ? 'Submitting…' : 'Propose Resolution'}
          </button>
        </form>
      </div>

      {/* Pending Resolutions */}
      <div className="card">
        <h2 className="text-lg font-semibold mb-3">
          Pending Resolutions
          <span className="text-sm text-gray-500 font-normal ml-2">({proposals.length})</span>
        </h2>
        {proposals.length === 0 ? (
          <p className="text-gray-500 text-sm">No pending resolution proposals.</p>
        ) : (
          <div className="space-y-3">
            {proposals.map((p) => (
              <div key={p.id} className="bg-gray-800 rounded-lg p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">
                      Market: <code className="text-xs text-gray-400">{p.market_id}</code>
                    </div>
                    <div className="text-sm mt-1">
                      Outcome: <span className={p.proposed_outcome === 1 ? 'text-emerald-400' : 'text-red-400'}>
                        {p.proposed_outcome === 1 ? 'YES' : 'NO'}
                      </span>
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      Signatures: {p.signatures_collected.length}/2
                      {p.signatures_collected.map((addr, i) => (
                        <span key={i} className="ml-2 text-gray-600">
                          {addr.slice(0, 6)}...
                        </span>
                      ))}
                    </div>
                    {p.evidence && (
                      <div className="text-xs text-gray-500 mt-1 truncate" title={p.evidence}>
                        Evidence: {p.evidence}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => handleSign(p.id)}
                    disabled={signLoading === p.id}
                    className="btn-primary text-sm py-1.5 px-3 shrink-0"
                  >
                    {signLoading === p.id ? 'Signing…' : 'Co-sign'}
                  </button>
                </div>
              </div>
            ))}
            {signResult && (
              <p className={`text-sm px-3 py-2 rounded ${
                signResult.startsWith('Error')
                  ? 'text-red-400 bg-red-900/20'
                  : 'text-emerald-400 bg-emerald-900/20'
              }`}>
                {signResult}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Disputed Markets */}
      <div className="card">
        <h2 className="text-lg font-semibold mb-3">
          Disputed Markets
          <span className="text-sm text-gray-500 font-normal ml-2">({disputed.length})</span>
        </h2>
        {disputed.length === 0 ? (
          <p className="text-gray-500 text-sm">No disputed markets.</p>
        ) : (
          <div className="space-y-2">
            {disputed.map((m) => (
              <div key={m.id} className="bg-gray-800 rounded-lg p-3 flex items-center justify-between">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{m.question}</div>
                  <div className="text-xs text-gray-500">
                    Status: {m.status} &middot; ID: {m.id.slice(0, 8)}...
                  </div>
                </div>
                <span className="badge-no shrink-0 ml-2">Disputed</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Back link */}
      <div className="text-center pb-8">
        <Link href="/" className="text-sm text-gray-500 hover:text-gray-300 transition-colors">
          ← Back to Markets
        </Link>
      </div>
    </div>
  );
}
