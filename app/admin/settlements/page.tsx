'use client';

import React, { useState, useEffect } from 'react';
import { 
  CheckCircle, 
  AlertTriangle, 
  Clock, 
  RefreshCw, 
  ArrowRight, 
  ShieldCheck, 
  DollarSign, 
  PieChart, 
  Layers, 
  ArrowUpRight 
} from 'lucide-react';

interface SettlementItem {
  id: string;
  application_id: string;
  user_id: string;
  applicant_id: string | null;
  event_id: string;
  allotment_id: string;
  idempotency_key: string;
  settlement_status: 'RECEIVED' | 'VALIDATING' | 'SECURITY_RESOLVED' | 'SETTLEMENT_READY' | 'SETTLED' | 'SETTLED_WITH_REFUND' | 'REFUND_SETTLED' | 'BLOCKED' | 'NEEDS_REVIEW';
  shares_applied: number;
  shares_allotted: number;
  allotment_price: number;
  allotted_value: number;
  refund_value: number;
  applicable_blocked_amount: number;
  security_id: string | null;
  journal_entry_id: string | null;
  portfolio_position_id: string | null;
  investment_transaction_id: string | null;
  failure_code: string | null;
  failure_reason: string | null;
  processed_at: string | null;
  created_at: string;
}

export default function AdminSettlementsPage() {
  const [settlements, setSettlements] = useState<SettlementItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [filter, setFilter] = useState<'ALL' | 'SETTLED' | 'REFUND_SETTLED' | 'NEEDS_REVIEW' | 'BLOCKED'>('ALL');
  const [dispatchMsg, setDispatchMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const fetchSettlements = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/admin/settlements');
      if (res.ok) {
        const data = await res.json();
        setSettlements(data.settlements || []);
      }
    } catch (err) {
      console.error('Failed to load settlements:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettlements();
  }, []);

  const handleTriggerDispatch = async () => {
    try {
      setProcessing(true);
      setDispatchMsg(null);
      const res = await fetch('/api/outbox/stage4-dispatch', { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.success) {
        setDispatchMsg({
          text: `Processed ${data.processed || 0} events, Acknowledged: ${data.acknowledged || 0}, Failed: ${data.failed || 0}`,
          type: 'success',
        });
        await fetchSettlements();
      } else {
        setDispatchMsg({ text: data.error || 'Failed to dispatch outbox queue.', type: 'error' });
      }
    } catch (err: any) {
      setDispatchMsg({ text: err.message || 'Dispatch error', type: 'error' });
    } finally {
      setProcessing(false);
    }
  };

  const filtered = settlements.filter(s => {
    if (filter === 'ALL') return true;
    if (filter === 'SETTLED') return s.settlement_status === 'SETTLED' || s.settlement_status === 'SETTLED_WITH_REFUND';
    return s.settlement_status === filter;
  });

  const totalCount = settlements.length;
  const settledCount = settlements.filter(s => s.settlement_status === 'SETTLED' || s.settlement_status === 'SETTLED_WITH_REFUND').length;
  const refundCount = settlements.filter(s => s.settlement_status === 'REFUND_SETTLED').length;
  const reviewCount = settlements.filter(s => s.settlement_status === 'NEEDS_REVIEW').length;
  const blockedCount = settlements.filter(s => s.settlement_status === 'BLOCKED').length;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-8 font-sans">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider rounded bg-emerald-950 text-emerald-400 border border-emerald-800">
                Candidate C • Stage 5
              </span>
              <span className="text-xs text-slate-400 font-mono">Demat & GL Engine</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">
              Settlement & Demat Accounting Console
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              Authoritative financial settlement terminal: double-entry GL postings, ASBA lien release, and Demat portfolio position crediting.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleTriggerDispatch}
              disabled={processing}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-semibold rounded-lg shadow-lg shadow-emerald-900/30 transition-all cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${processing ? 'animate-spin' : ''}`} />
              Trigger Outbox Dispatch
            </button>
          </div>
        </div>

        {dispatchMsg && (
          <div className={`p-4 rounded-lg text-sm border flex items-center justify-between ${
            dispatchMsg.type === 'success' 
              ? 'bg-emerald-950/60 border-emerald-800 text-emerald-300' 
              : 'bg-rose-950/60 border-rose-800 text-rose-300'
          }`}>
            <span>{dispatchMsg.text}</span>
            <button onClick={() => setDispatchMsg(null)} className="text-xs underline hover:text-white">Dismiss</button>
          </div>
        )}

        {/* Metrics Overview */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 md:gap-4">
          <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4">
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-medium uppercase">Total Settlements</span>
              <Layers className="w-4 h-4" />
            </div>
            <div className="text-2xl font-bold text-white">{totalCount}</div>
            <div className="text-xs text-slate-500 mt-1">Lifecycle events</div>
          </div>

          <div className="bg-slate-900/80 border border-emerald-900/40 rounded-xl p-4">
            <div className="flex items-center justify-between text-emerald-400 mb-2">
              <span className="text-xs font-medium uppercase">Settled / Equities</span>
              <CheckCircle className="w-4 h-4" />
            </div>
            <div className="text-2xl font-bold text-emerald-400">{settledCount}</div>
            <div className="text-xs text-slate-500 mt-1">Demat credited</div>
          </div>

          <div className="bg-slate-900/80 border border-blue-900/40 rounded-xl p-4">
            <div className="flex items-center justify-between text-blue-400 mb-2">
              <span className="text-xs font-medium uppercase">Refund Settled</span>
              <DollarSign className="w-4 h-4" />
            </div>
            <div className="text-2xl font-bold text-blue-400">{refundCount}</div>
            <div className="text-xs text-slate-500 mt-1">ASBA unblocked</div>
          </div>

          <div className="bg-slate-900/80 border border-amber-900/40 rounded-xl p-4">
            <div className="flex items-center justify-between text-amber-400 mb-2">
              <span className="text-xs font-medium uppercase">Needs Review</span>
              <Clock className="w-4 h-4" />
            </div>
            <div className="text-2xl font-bold text-amber-400">{reviewCount}</div>
            <div className="text-xs text-slate-500 mt-1">Ambiguous security</div>
          </div>

          <div className="bg-slate-900/80 border border-rose-900/40 rounded-xl p-4">
            <div className="flex items-center justify-between text-rose-400 mb-2">
              <span className="text-xs font-medium uppercase">Blocked</span>
              <AlertTriangle className="w-4 h-4" />
            </div>
            <div className="text-2xl font-bold text-rose-400">{blockedCount}</div>
            <div className="text-xs text-slate-500 mt-1">Discrepancy / Hold</div>
          </div>
        </div>

        {/* Filter Navigation */}
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 pb-3">
          {(['ALL', 'SETTLED', 'REFUND_SETTLED', 'NEEDS_REVIEW', 'BLOCKED'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setFilter(tab)}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                filter === tab 
                  ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20' 
                  : 'bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800 border border-slate-800'
              }`}
            >
              {tab.replace('_', ' ')}
            </button>
          ))}
        </div>

        {/* Settlements Table */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-900 text-xs font-semibold uppercase text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="py-3.5 px-4">Application & Key</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4 text-right">Shares (Allotted / Applied)</th>
                  <th className="py-3.5 px-4 text-right">Price</th>
                  <th className="py-3.5 px-4 text-right">Allotted Value</th>
                  <th className="py-3.5 px-4 text-right">Refund Value</th>
                  <th className="py-3.5 px-4">Lineage (GL / Demat)</th>
                  <th className="py-3.5 px-4">Processed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {loading ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-500">
                      <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-emerald-400" />
                      Loading settlements...
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-500">
                      No settlements found in this queue.
                    </td>
                  </tr>
                ) : (
                  filtered.map(item => (
                    <tr key={item.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="py-3.5 px-4">
                        <div className="font-mono text-xs text-white font-medium">
                          {item.application_id.slice(0, 13)}...
                        </div>
                        <div className="text-[11px] text-slate-500 font-mono mt-0.5 truncate max-w-[200px]" title={item.idempotency_key}>
                          {item.idempotency_key}
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${
                          item.settlement_status === 'SETTLED'
                            ? 'bg-emerald-950/80 text-emerald-400 border-emerald-800'
                            : item.settlement_status === 'SETTLED_WITH_REFUND'
                            ? 'bg-teal-950/80 text-teal-400 border-teal-800'
                            : item.settlement_status === 'REFUND_SETTLED'
                            ? 'bg-blue-950/80 text-blue-400 border-blue-800'
                            : item.settlement_status === 'NEEDS_REVIEW'
                            ? 'bg-amber-950/80 text-amber-400 border-amber-800'
                            : 'bg-rose-950/80 text-rose-400 border-rose-800'
                        }`}>
                          {item.settlement_status}
                        </span>
                        {item.failure_reason && (
                          <div className="text-[10px] text-rose-400 mt-1 max-w-[180px] truncate" title={item.failure_reason}>
                            {item.failure_reason}
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono text-xs">
                        <span className="text-white font-semibold">{item.shares_allotted}</span>
                        <span className="text-slate-500"> / {item.shares_applied}</span>
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono text-xs text-slate-300">
                        ₹{item.allotment_price.toFixed(2)}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono text-xs text-emerald-400 font-medium">
                        ₹{item.allotted_value.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono text-xs text-blue-400 font-medium">
                        ₹{item.refund_value.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-3.5 px-4 text-xs font-mono">
                        {item.journal_entry_id ? (
                          <div className="text-emerald-400 text-[11px] truncate max-w-[130px]" title={item.journal_entry_id}>
                            GL: {item.journal_entry_id.slice(0, 8)}
                          </div>
                        ) : (
                          <div className="text-slate-600 text-[11px]">GL: None</div>
                        )}
                        {item.portfolio_position_id && (
                          <div className="text-blue-400 text-[11px] truncate max-w-[130px]" title={item.portfolio_position_id}>
                            Pos: {item.portfolio_position_id.slice(0, 8)}
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-xs text-slate-400">
                        {item.processed_at ? new Date(item.processed_at).toLocaleTimeString() : 'Pending'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
}
