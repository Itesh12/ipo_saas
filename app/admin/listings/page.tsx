'use client';

import React, { useState, useEffect } from 'react';
import {
  TrendingUp,
  CheckCircle,
  AlertTriangle,
  Clock,
  RefreshCw,
  Plus,
  ShieldCheck,
  Building2,
  DollarSign,
  Activity,
  ArrowUpRight,
  ArrowDownRight,
  Layers,
} from 'lucide-react';

interface ListingEvent {
  id: string;
  ipo_id: string;
  security_id: string;
  exchange: string;
  event_type: string;
  listing_date: string;
  listing_price: string;
  issue_price: string;
  listing_gain: string;
  listing_gain_pct: string;
  source: string;
  source_record_id: string | null;
  payload_hash: string;
  idempotency_key: string;
  effective_at: string;
  created_at: string;
  ipos?: {
    company_name: string;
    symbol: string;
  };
  securities?: {
    symbol: string;
    listing_status: string;
  };
}

interface PriceObservation {
  id: string;
  security_id: string;
  price: string;
  day_open: string | null;
  day_high: string | null;
  day_low: string | null;
  previous_close: string | null;
  provider: string;
  raw_hash: string;
  is_verified: boolean;
  provider_timestamp: string;
  received_at: string;
  securities?: {
    symbol: string;
    exchange: string;
    company_name: string;
  };
}

interface CanonicalPrice {
  id: string;
  security_id: string;
  price: string;
  day_open: string | null;
  day_high: string | null;
  day_low: string | null;
  previous_close: string | null;
  source: string;
  provider_timestamp: string;
  captured_at: string;
  securities?: {
    symbol: string;
    exchange: string;
    listing_status: string;
  };
}

export default function AdminListingsPage() {
  const [events, setEvents] = useState<ListingEvent[]>([]);
  const [observations, setObservations] = useState<PriceObservation[]>([]);
  const [canonicalPrices, setCanonicalPrices] = useState<CanonicalPrice[]>([]);
  const [ipos, setIpos] = useState<any[]>([]);
  const [securities, setSecurities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'EVENTS' | 'PRICES' | 'CANONICAL'>('EVENTS');
  const [isEventModalOpen, setIsEventModalOpen] = useState(false);
  const [isPriceModalOpen, setIsPriceModalOpen] = useState(false);
  const [submitMsg, setSubmitMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Form states
  const [selectedIpoId, setSelectedIpoId] = useState('');
  const [selectedSecId, setSelectedSecId] = useState('');
  const [listingPrice, setListingPrice] = useState('');
  const [issuePrice, setIssuePrice] = useState('');
  const [listingDate, setListingDate] = useState(new Date().toISOString().split('T')[0]);
  const [exchange, setExchange] = useState('NSE');
  const [eventSource, setEventSource] = useState('EXCHANGE_DIRECT');

  const [priceInput, setPriceInput] = useState('');
  const [providerInput, setProviderInput] = useState('NSE_OFFICIAL_FEED');

  const fetchData = async () => {
    try {
      setLoading(true);
      const [listRes, priceRes] = await Promise.all([
        fetch('/api/admin/listings'),
        fetch('/api/admin/prices'),
      ]);

      if (listRes.ok) {
        const listData = await listRes.json();
        setEvents(listData.events || []);
        setIpos(listData.ipos || []);
        setSecurities(listData.securities || []);
        if (listData.ipos?.length > 0 && !selectedIpoId) {
          setSelectedIpoId(listData.ipos[0].id);
          setIssuePrice(listData.ipos[0].price_band_high?.toString() || '100');
        }
        if (listData.securities?.length > 0 && !selectedSecId) {
          setSelectedSecId(listData.securities[0].id);
        }
      }

      if (priceRes.ok) {
        const priceData = await priceRes.json();
        setObservations(priceData.observations || []);
        setCanonicalPrices(priceData.canonicalPrices || []);
      }
    } catch (err) {
      console.error('Failed to load listings data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleRecordListingEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSubmitMsg(null);
      const res = await fetch('/api/admin/listings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ipoId: selectedIpoId,
          securityId: selectedSecId,
          exchange,
          eventType: 'LISTING_CONFIRMED',
          listingDate,
          listingPrice,
          issuePrice,
          source: eventSource,
          sourceRecordId: `CIRCULAR-${Date.now()}`,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setSubmitMsg({ text: data.error || 'Failed to record listing event', type: 'error' });
      } else {
        setSubmitMsg({ text: 'Listing event recorded with SHA-256 tamper hash!', type: 'success' });
        setIsEventModalOpen(false);
        fetchData();
      }
    } catch (err: any) {
      setSubmitMsg({ text: err.message || 'Error submitting event', type: 'error' });
    }
  };

  const handleIngestPrice = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSubmitMsg(null);
      const res = await fetch('/api/admin/prices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          securityId: selectedSecId,
          price: priceInput,
          provider: providerInput,
          providerTimestamp: new Date().toISOString(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setSubmitMsg({ text: data.error || 'Failed to ingest price', type: 'error' });
      } else {
        const msg = data.result.canonicalProjected
          ? 'Quote recorded and projected to security_prices (Monotonically NEWEST)'
          : `Quote logged in audit layer (Projection skipped: ${data.result.projectionReason})`;
        setSubmitMsg({ text: msg, type: 'success' });
        setIsPriceModalOpen(false);
        fetchData();
      }
    } catch (err: any) {
      setSubmitMsg({ text: err.message || 'Error ingesting price', type: 'error' });
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--color-border)] pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 text-[10px] font-mono uppercase bg-emerald-500/10 text-emerald-500 rounded border border-emerald-500/20 font-semibold">
              Stage 6 Engine
            </span>
            <h1 className="text-xl font-bold tracking-tight text-[var(--color-text-primary)]">
              Listing & Market Pricing Console
            </h1>
          </div>
          <p className="text-xs text-[var(--color-text-secondary)] mt-1">
            Authoritative first-listing event ledger, raw provider observation provenance, and monotonic canonical price projection.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchData()}
            disabled={loading}
            className="px-3 py-1.5 text-xs font-medium border border-[var(--color-border)] rounded-lg bg-[var(--color-bg-surface)] hover:bg-[var(--color-bg-elevated)] flex items-center gap-1.5 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={() => setIsEventModalOpen(true)}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-500 flex items-center gap-1.5 shadow-sm transition-all"
          >
            <Plus className="w-3.5 h-3.5" />
            Record Listing Event
          </button>
          <button
            onClick={() => setIsPriceModalOpen(true)}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 flex items-center gap-1.5 shadow-sm transition-all"
          >
            <Activity className="w-3.5 h-3.5" />
            Ingest Market Quote
          </button>
        </div>
      </div>

      {/* Notification banner */}
      {submitMsg && (
        <div
          className={`p-3.5 rounded-xl border text-xs flex items-center gap-2.5 ${
            submitMsg.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
          }`}
        >
          {submitMsg.type === 'success' ? (
            <CheckCircle className="w-4 h-4 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 shrink-0" />
          )}
          <span>{submitMsg.text}</span>
        </div>
      )}

      {/* Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-surface)]">
          <div className="flex items-center justify-between text-xs text-[var(--color-text-secondary)]">
            <span>Listing Events</span>
            <Building2 className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-[var(--color-text-primary)]">
            {events.length}
          </div>
          <div className="text-[11px] text-[var(--color-text-muted)] mt-1">
            Immutable SHA-256 audited
          </div>
        </div>

        <div className="p-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-surface)]">
          <div className="flex items-center justify-between text-xs text-[var(--color-text-secondary)]">
            <span>Raw Observations</span>
            <Activity className="w-4 h-4 text-indigo-500" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-[var(--color-text-primary)]">
            {observations.length}
          </div>
          <div className="text-[11px] text-[var(--color-text-muted)] mt-1">
            Provider provenance log
          </div>
        </div>

        <div className="p-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-surface)]">
          <div className="flex items-center justify-between text-xs text-[var(--color-text-secondary)]">
            <span>Canonical Quotes</span>
            <TrendingUp className="w-4 h-4 text-cyan-500" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-[var(--color-text-primary)]">
            {canonicalPrices.length}
          </div>
          <div className="text-[11px] text-[var(--color-text-muted)] mt-1">
            Monotonically projected
          </div>
        </div>

        <div className="p-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-surface)]">
          <div className="flex items-center justify-between text-xs text-[var(--color-text-secondary)]">
            <span>Stage 5 Quarantine</span>
            <ShieldCheck className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="mt-2 text-sm font-semibold text-emerald-500 flex items-center gap-1.5">
            <CheckCircle className="w-4 h-4" />
            Zero Mutations (Δ = 0)
          </div>
          <div className="text-[11px] text-[var(--color-text-muted)] mt-1">
            Read-only financial boundary
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-[var(--color-border)] pb-2 text-xs">
        <button
          onClick={() => setActiveTab('EVENTS')}
          className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
            activeTab === 'EVENTS'
              ? 'bg-emerald-600 text-white'
              : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)]'
          }`}
        >
          Listing Events Ledger ({events.length})
        </button>
        <button
          onClick={() => setActiveTab('CANONICAL')}
          className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
            activeTab === 'CANONICAL'
              ? 'bg-cyan-600 text-white'
              : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)]'
          }`}
        >
          Canonical Security Prices ({canonicalPrices.length})
        </button>
        <button
          onClick={() => setActiveTab('PRICES')}
          className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
            activeTab === 'PRICES'
              ? 'bg-indigo-600 text-white'
              : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)]'
          }`}
        >
          Raw Observations Audit ({observations.length})
        </button>
      </div>

      {/* Tab 1: Listing Events */}
      {activeTab === 'EVENTS' && (
        <div className="overflow-x-auto border border-[var(--color-border)] rounded-xl bg-[var(--color-bg-surface)]">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg-elevated)] text-[var(--color-text-secondary)]">
                <th className="py-3 px-4">IPO / Security</th>
                <th className="py-3 px-4">Exchange</th>
                <th className="py-3 px-4">Listing Date</th>
                <th className="py-3 px-4 text-right">Issue Price</th>
                <th className="py-3 px-4 text-right">Listing Price</th>
                <th className="py-3 px-4 text-right">Official Listing Gain</th>
                <th className="py-3 px-4">Source & Audit Hash</th>
                <th className="py-3 px-4">Recorded At</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {events.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-[var(--color-text-muted)]">
                    No listing events recorded yet. Click &quot;Record Listing Event&quot; to initialize first listing reference facts.
                  </td>
                </tr>
              ) : (
                events.map((ev) => {
                  const gainPct = parseFloat(ev.listing_gain_pct);
                  const isPositive = gainPct >= 0;
                  return (
                    <tr key={ev.id} className="hover:bg-[var(--color-bg-elevated)]/40 transition-colors">
                      <td className="py-3 px-4">
                        <div className="font-semibold text-[var(--color-text-primary)]">
                          {ev.ipos?.company_name || 'IPO Record'}
                        </div>
                        <div className="text-[10px] font-mono text-[var(--color-text-muted)]">
                          Symbol: {ev.securities?.symbol || 'UNKNOWN'}
                        </div>
                      </td>
                      <td className="py-3 px-4 font-mono font-medium">
                        <span className="px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                          {ev.exchange}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono">{ev.listing_date}</td>
                      <td className="py-3 px-4 text-right font-mono">
                        ₹{parseFloat(ev.issue_price).toFixed(2)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-emerald-400">
                        ₹{parseFloat(ev.listing_price).toFixed(2)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono">
                        <span
                          className={`inline-flex items-center gap-1 font-semibold ${
                            isPositive ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {isPositive ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
                          {gainPct.toFixed(2)}%
                        </span>
                        <div className="text-[10px] text-[var(--color-text-muted)]">
                          ₹{parseFloat(ev.listing_gain).toFixed(2)}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-medium text-[var(--color-text-primary)]">{ev.source}</div>
                        <div className="text-[10px] font-mono text-[var(--color-text-muted)] truncate max-w-[140px]" title={ev.payload_hash}>
                          SHA: {ev.payload_hash.slice(0, 12)}...
                        </div>
                      </td>
                      <td className="py-3 px-4 text-[11px] text-[var(--color-text-muted)] font-mono">
                        {new Date(ev.created_at).toLocaleDateString('en-IN', {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Tab 2: Canonical Security Prices */}
      {activeTab === 'CANONICAL' && (
        <div className="overflow-x-auto border border-[var(--color-border)] rounded-xl bg-[var(--color-bg-surface)]">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg-elevated)] text-[var(--color-text-secondary)]">
                <th className="py-3 px-4">Security</th>
                <th className="py-3 px-4">Exchange</th>
                <th className="py-3 px-4">Trading Status</th>
                <th className="py-3 px-4 text-right">Canonical Market Price</th>
                <th className="py-3 px-4">Source Provider</th>
                <th className="py-3 px-4">Provider Observation Time</th>
                <th className="py-3 px-4">Captured At</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {canonicalPrices.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-[var(--color-text-muted)]">
                    No canonical security prices available yet.
                  </td>
                </tr>
              ) : (
                canonicalPrices.map((p) => (
                  <tr key={p.id} className="hover:bg-[var(--color-bg-elevated)]/40 transition-colors">
                    <td className="py-3 px-4 font-semibold font-mono text-[var(--color-text-primary)]">
                      {p.securities?.symbol || 'UNKNOWN'}
                    </td>
                    <td className="py-3 px-4 font-mono">{p.securities?.exchange || 'NSE'}</td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        {p.securities?.listing_status || 'LISTED'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-lg text-emerald-400">
                      ₹{parseFloat(p.price).toFixed(2)}
                    </td>
                    <td className="py-3 px-4 font-medium">{p.source}</td>
                    <td className="py-3 px-4 font-mono text-[11px] text-[var(--color-text-muted)]">
                      {new Date(p.provider_timestamp).toISOString()}
                    </td>
                    <td className="py-3 px-4 font-mono text-[11px] text-[var(--color-text-muted)]">
                      {new Date(p.captured_at).toLocaleTimeString('en-IN')}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Tab 3: Raw Observations Audit */}
      {activeTab === 'PRICES' && (
        <div className="overflow-x-auto border border-[var(--color-border)] rounded-xl bg-[var(--color-bg-surface)]">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg-elevated)] text-[var(--color-text-secondary)]">
                <th className="py-3 px-4">Security</th>
                <th className="py-3 px-4">Provider</th>
                <th className="py-3 px-4 text-right">Raw Quote Price</th>
                <th className="py-3 px-4">Provider Timestamp</th>
                <th className="py-3 px-4">Arrival / Ingested</th>
                <th className="py-3 px-4">Audit Provenance Hash</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {observations.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-[var(--color-text-muted)]">
                    No market price observations logged yet.
                  </td>
                </tr>
              ) : (
                observations.map((obs) => (
                  <tr key={obs.id} className="hover:bg-[var(--color-bg-elevated)]/40 transition-colors">
                    <td className="py-3 px-4 font-mono font-semibold text-[var(--color-text-primary)]">
                      {obs.securities?.symbol || 'UNKNOWN'}
                    </td>
                    <td className="py-3 px-4 font-medium">{obs.provider}</td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-emerald-400">
                      ₹{parseFloat(obs.price).toFixed(2)}
                    </td>
                    <td className="py-3 px-4 font-mono text-[11px] text-[var(--color-text-muted)]">
                      {new Date(obs.provider_timestamp).toISOString()}
                    </td>
                    <td className="py-3 px-4 font-mono text-[11px] text-[var(--color-text-muted)]">
                      {new Date(obs.received_at).toLocaleTimeString('en-IN')}
                    </td>
                    <td className="py-3 px-4 font-mono text-[10px] text-[var(--color-text-muted)] truncate max-w-[140px]" title={obs.raw_hash}>
                      SHA: {obs.raw_hash.slice(0, 12)}...
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal: Record Listing Event */}
      {isEventModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[var(--color-bg-surface)] border border-[var(--color-border)] rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <h2 className="text-lg font-bold text-[var(--color-text-primary)] flex items-center gap-2">
              <Building2 className="w-5 h-5 text-emerald-500" />
              Record Official Listing Event
            </h2>
            <p className="text-xs text-[var(--color-text-secondary)]">
              Creates an append-only listing reference fact in ipo_listing_events with SHA-256 tamper verification.
            </p>

            <form onSubmit={handleRecordListingEvent} className="space-y-4 text-xs">
              <div>
                <label className="block text-[var(--color-text-secondary)] font-medium mb-1">Select IPO</label>
                <select
                  value={selectedIpoId}
                  onChange={(e) => {
                    setSelectedIpoId(e.target.value);
                    const sel = ipos.find((i) => i.id === e.target.value);
                    if (sel?.price_band_high) setIssuePrice(sel.price_band_high.toString());
                  }}
                  className="w-full p-2.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)]"
                >
                  {ipos.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.company_name} ({i.symbol})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[var(--color-text-secondary)] font-medium mb-1">Select Security</label>
                <select
                  value={selectedSecId}
                  onChange={(e) => setSelectedSecId(e.target.value)}
                  className="w-full p-2.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)]"
                >
                  {securities.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.symbol} ({s.exchange}) - ISIN: {s.isin || 'N/A'}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[var(--color-text-secondary)] font-medium mb-1">Issue Price (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={issuePrice}
                    onChange={(e) => setIssuePrice(e.target.value)}
                    className="w-full p-2.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] font-mono text-[var(--color-text-primary)]"
                  />
                </div>
                <div>
                  <label className="block text-[var(--color-text-secondary)] font-medium mb-1">Official Listing Price (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder="e.g. 150.00"
                    value={listingPrice}
                    onChange={(e) => setListingPrice(e.target.value)}
                    className="w-full p-2.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] font-mono text-[var(--color-text-primary)]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[var(--color-text-secondary)] font-medium mb-1">Listing Date</label>
                  <input
                    type="date"
                    required
                    value={listingDate}
                    onChange={(e) => setListingDate(e.target.value)}
                    className="w-full p-2.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)]"
                  />
                </div>
                <div>
                  <label className="block text-[var(--color-text-secondary)] font-medium mb-1">Exchange</label>
                  <select
                    value={exchange}
                    onChange={(e) => setExchange(e.target.value)}
                    className="w-full p-2.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)]"
                  >
                    <option value="NSE">NSE</option>
                    <option value="BSE">BSE</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[var(--color-text-secondary)] font-medium mb-1">Authority Source</label>
                <select
                  value={eventSource}
                  onChange={(e) => setEventSource(e.target.value)}
                  className="w-full p-2.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)]"
                >
                  <option value="EXCHANGE_DIRECT">EXCHANGE_DIRECT (NSE/BSE Circular)</option>
                  <option value="REGISTRAR_NOTICE">REGISTRAR_NOTICE (Official Basis)</option>
                  <option value="MANUAL_ADMIN">MANUAL_ADMIN (Verified Entry)</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setIsEventModalOpen(false)}
                  className="px-4 py-2 rounded-lg border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)] transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-emerald-600 text-white font-semibold hover:bg-emerald-500 shadow-md transition-all"
                >
                  Confirm & Commit Event
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Ingest Market Quote */}
      {isPriceModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[var(--color-bg-surface)] border border-[var(--color-border)] rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <h2 className="text-lg font-bold text-[var(--color-text-primary)] flex items-center gap-2">
              <Activity className="w-5 h-5 text-indigo-500" />
              Ingest Market Price Quote
            </h2>
            <p className="text-xs text-[var(--color-text-secondary)]">
              Appends raw observation to market_price_observations and atomically updates security_prices with monotonic protection.
            </p>

            <form onSubmit={handleIngestPrice} className="space-y-4 text-xs">
              <div>
                <label className="block text-[var(--color-text-secondary)] font-medium mb-1">Target Security</label>
                <select
                  value={selectedSecId}
                  onChange={(e) => setSelectedSecId(e.target.value)}
                  className="w-full p-2.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)]"
                >
                  {securities.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.symbol} ({s.exchange}) - ISIN: {s.isin || 'N/A'}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[var(--color-text-secondary)] font-medium mb-1">Quote Price (₹)</label>
                <input
                  type="number"
                  step="0.00000001"
                  required
                  placeholder="e.g. 185.50"
                  value={priceInput}
                  onChange={(e) => setPriceInput(e.target.value)}
                  className="w-full p-2.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] font-mono text-[var(--color-text-primary)]"
                />
              </div>

              <div>
                <label className="block text-[var(--color-text-secondary)] font-medium mb-1">Provider Source</label>
                <select
                  value={providerInput}
                  onChange={(e) => setProviderInput(e.target.value)}
                  className="w-full p-2.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)]"
                >
                  <option value="NSE_OFFICIAL_FEED">NSE_OFFICIAL_FEED</option>
                  <option value="BSE_OFFICIAL_FEED">BSE_OFFICIAL_FEED</option>
                  <option value="BLOOMBERG_TICKS">BLOOMBERG_TICKS</option>
                  <option value="REFINITIV_DIRECT">REFINITIV_DIRECT</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setIsPriceModalOpen(false)}
                  className="px-4 py-2 rounded-lg border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)] transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-indigo-600 text-white font-semibold hover:bg-indigo-500 shadow-md transition-all"
                >
                  Ingest & Project Monotonically
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
