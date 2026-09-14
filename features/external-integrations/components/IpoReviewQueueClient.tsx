'use client';

/**
 * features/external-integrations/components/IpoReviewQueueClient.tsx
 *
 * Phase 9 Stage 3A.3: Canonical Ingestion Review & Editorial Gate Interface.
 * Displays staged candidates, 7-field promotion gate status, IST lifecycle derivation,
 * and handles explicit promotion to draft vs approval and publication to master.
 */

import React, { useState, useTransition } from 'react';
import {
  CheckCircle2,
  XCircle,
  Clock,
  Search,
} from 'lucide-react';
import {
  promoteCandidateToDraftAction,
  approveAndPublishCandidateAction,
  rejectCandidateAction,
} from '../actions/ingestionActions';
import {
  CanonicalInboxRecord,
  IngestionObservationRecord,
  NormalizedIpoMasterPayload,
} from '../ipo-master/ipoMasterTypes';
import { PromotionValidationResult } from '../services/ipoPromotionValidator';
import { LifecycleResolutionOutcome } from '../services/ipoLifecycleResolver';

export interface ReviewQueueItem {
  inbox: CanonicalInboxRecord;
  observation?: IngestionObservationRecord;
  validation: PromotionValidationResult;
  lifecycle?: LifecycleResolutionOutcome;
}

interface Props {
  initialItems: ReviewQueueItem[];
}

export function IpoReviewQueueClient({ initialItems }: Props) {
  const [items, setItems] = useState<ReviewQueueItem[]>(initialItems);
  const [filter, setFilter] = useState<'all' | 'ready' | 'missing' | 'conflicted' | 'promoted'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [actionMessage, setActionMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [isPending, startTransition] = useTransition();

  // Metrics
  const totalCount = items.length;
  const readyCount = items.filter((i) => i.validation.eligible && i.inbox.review_status !== 'promoted_to_published').length;
  const missingCount = items.filter((i) => !i.validation.eligible && !i.inbox.has_conflict).length;
  const conflictCount = items.filter((i) => i.inbox.has_conflict || i.inbox.review_status === 'conflicted').length;
  const promotedCount = items.filter((i) => i.inbox.review_status === 'promoted_to_published').length;

  const filteredItems = items.filter((item) => {
    const nameMatch = item.inbox.canonical_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.inbox.symbol && item.inbox.symbol.toLowerCase().includes(searchTerm.toLowerCase()));

    if (!nameMatch) return false;

    if (filter === 'ready') return item.validation.eligible && item.inbox.review_status !== 'promoted_to_published';
    if (filter === 'missing') return !item.validation.eligible && !item.inbox.has_conflict && item.inbox.review_status !== 'promoted_to_published';
    if (filter === 'conflicted') return item.inbox.has_conflict || item.inbox.review_status === 'conflicted';
    if (filter === 'promoted') return item.inbox.review_status === 'promoted_to_published';
    return true;
  });

  const handlePromoteToDraft = (inboxId: string) => {
    startTransition(async () => {
      try {
        const res = await promoteCandidateToDraftAction(inboxId);
        setActionMessage({
          type: 'success',
          text: `Successfully promoted "${res.companyName}" to Canonical Draft (ID: ${res.ipoId.slice(0, 8)}...).`,
        });
        setItems((prev) =>
          prev.map((i) =>
            i.inbox.id === inboxId
              ? { ...i, inbox: { ...i.inbox, review_status: 'promoted_to_draft' } }
              : i
          )
        );
      } catch (err: unknown) {
        setActionMessage({
          type: 'error',
          text: err instanceof Error ? err.message : String(err),
        });
      }
    });
  };

  const handleApproveAndPublish = (inboxId: string) => {
    startTransition(async () => {
      try {
        const res = await approveAndPublishCandidateAction(inboxId);
        setActionMessage({
          type: 'success',
          text: `Approved and published "${res.companyName}" to Canonical Master! Active at /ipos/${res.slug}`,
        });
        setItems((prev) =>
          prev.map((i) =>
            i.inbox.id === inboxId
              ? { ...i, inbox: { ...i.inbox, review_status: 'promoted_to_published' } }
              : i
          )
        );
      } catch (err: unknown) {
        setActionMessage({
          type: 'error',
          text: err instanceof Error ? err.message : String(err),
        });
      }
    });
  };

  const handleReject = (inboxId: string) => {
    const reason = window.prompt('Enter rejection reason:');
    if (!reason) return;

    startTransition(async () => {
      try {
        await rejectCandidateAction(inboxId, reason);
        setActionMessage({
          type: 'success',
          text: `Candidate rejected.`,
        });
        setItems((prev) =>
          prev.map((i) =>
            i.inbox.id === inboxId
              ? { ...i, inbox: { ...i.inbox, review_status: 'rejected' } }
              : i
          )
        );
      } catch (err: unknown) {
        setActionMessage({
          type: 'error',
          text: err instanceof Error ? err.message : String(err),
        });
      }
    });
  };

  return (
    <div className="space-y-6">
      {actionMessage && (
        <div
          className={`p-4 rounded-xl border text-sm font-medium flex items-center justify-between ${
            actionMessage.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
          }`}
        >
          <span>{actionMessage.text}</span>
          <button
            onClick={() => setActionMessage(null)}
            className="text-xs uppercase font-bold tracking-wider hover:underline ml-4"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Metrics Banner */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="bg-[#121824] border border-white/5 p-4 rounded-xl">
          <div className="text-xs text-slate-400 font-semibold uppercase">Total Staged</div>
          <div className="text-2xl font-bold text-white mt-1">{totalCount}</div>
        </div>
        <div className="bg-[#121824] border border-emerald-500/20 p-4 rounded-xl">
          <div className="text-xs text-emerald-400 font-semibold uppercase">Ready to Publish</div>
          <div className="text-2xl font-bold text-emerald-400 mt-1">{readyCount}</div>
        </div>
        <div className="bg-[#121824] border border-amber-500/20 p-4 rounded-xl">
          <div className="text-xs text-amber-400 font-semibold uppercase">Missing Fields</div>
          <div className="text-2xl font-bold text-amber-400 mt-1">{missingCount}</div>
        </div>
        <div className="bg-[#121824] border border-rose-500/20 p-4 rounded-xl">
          <div className="text-xs text-rose-400 font-semibold uppercase">Conflicted</div>
          <div className="text-2xl font-bold text-rose-400 mt-1">{conflictCount}</div>
        </div>
        <div className="bg-[#121824] border border-blue-500/20 p-4 rounded-xl">
          <div className="text-xs text-blue-400 font-semibold uppercase">Published</div>
          <div className="text-2xl font-bold text-blue-400 mt-1">{promotedCount}</div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-[#121824] border border-white/5 p-4 rounded-xl">
        <div className="flex items-center gap-2 overflow-x-auto w-full sm:w-auto">
          <button
            onClick={() => setFilter('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              filter === 'all'
                ? 'bg-white/15 text-white'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            All ({totalCount})
          </button>
          <button
            onClick={() => setFilter('ready')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              filter === 'ready'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            Ready to Publish ({readyCount})
          </button>
          <button
            onClick={() => setFilter('missing')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              filter === 'missing'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            Missing Data ({missingCount})
          </button>
          <button
            onClick={() => setFilter('conflicted')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              filter === 'conflicted'
                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            Conflicted ({conflictCount})
          </button>
          <button
            onClick={() => setFilter('promoted')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              filter === 'promoted'
                ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            Published ({promotedCount})
          </button>
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search company or symbol..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-[#0b0f19] border border-white/10 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-[var(--brand-primary)]"
          />
        </div>
      </div>

      {/* Candidates List */}
      <div className="space-y-4">
        {filteredItems.length === 0 ? (
          <div className="p-8 text-center bg-[#121824] border border-white/5 rounded-xl text-slate-400">
            No candidate IPOs found matching this filter.
          </div>
        ) : (
          filteredItems.map(({ inbox, observation, validation, lifecycle }) => {
            const payload = (observation?.normalized_payload || {}) as Partial<NormalizedIpoMasterPayload>;
            const isPromoted = inbox.review_status === 'promoted_to_published';
            const isDraft = inbox.review_status === 'promoted_to_draft';

            return (
              <div
                key={inbox.id}
                className={`p-5 rounded-xl border transition ${
                  isPromoted
                    ? 'bg-[#121824]/60 border-blue-500/20'
                    : validation.eligible
                    ? 'bg-[#121824] border-emerald-500/30'
                    : inbox.has_conflict
                    ? 'bg-[#121824] border-rose-500/30'
                    : 'bg-[#121824] border-white/5'
                }`}
              >
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  {/* Left Column: Entity Details */}
                  <div className="space-y-2 max-w-2xl">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <span className="font-bold text-lg text-white">{inbox.canonical_name}</span>
                      {inbox.symbol && (
                        <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-white/10 text-slate-300">
                          {inbox.symbol}
                        </span>
                      )}
                      {inbox.isin && (
                        <span className="text-xs font-mono text-slate-400">ISIN: {inbox.isin}</span>
                      )}
                      <span className="text-xs uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-white/5 text-slate-400 border border-white/10">
                        {observation?.source.toUpperCase() || 'UNKNOWN'}
                      </span>
                      {isPromoted ? (
                        <span className="text-xs uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30">
                          Published to Master
                        </span>
                      ) : isDraft ? (
                        <span className="text-xs uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-purple-500/20 text-purple-400 border border-purple-500/30">
                          Canonical Draft
                        </span>
                      ) : null}
                    </div>

                    {/* Operational Details Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs text-slate-300 pt-1">
                      <div>
                        <span className="text-slate-500 block">Price Band:</span>
                        <span className="font-medium text-white">
                          {payload.price_band_low && payload.price_band_high
                            ? `₹${payload.price_band_low} – ₹${payload.price_band_high}`
                            : 'Unannounced'}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 block">Lot Size:</span>
                        <span className="font-medium text-white">
                          {payload.lot_size ? `${payload.lot_size} Shares` : 'Pending'}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 block">Bidding Window:</span>
                        <span className="font-medium text-white">
                          {payload.open_date && payload.close_date
                            ? `${payload.open_date} to ${payload.close_date}`
                            : 'Pending'}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 block">Exchange:</span>
                        <span className="font-medium text-white">{payload.exchange || 'Pending'}</span>
                      </div>
                    </div>

                    {/* Seven-Field Gate Badges */}
                    <div className="flex items-center gap-1.5 flex-wrap pt-2">
                      <span className="text-xs text-slate-500 font-semibold mr-1">7-Field Gate:</span>
                      {[
                        { key: 'company_name', label: 'Issuer' },
                        { key: 'issue_type', label: 'Type' },
                        { key: 'price_band', label: 'Price Band' },
                        { key: 'lot_size', label: 'Lot Size' },
                        { key: 'open_date', label: 'Bid Start' },
                        { key: 'close_date', label: 'Bid End' },
                        { key: 'exchange', label: 'Exchange' },
                      ].map((field) => {
                        const isPassed = validation.passedFields.includes(field.key);
                        return (
                          <span
                            key={field.key}
                            className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded ${
                              isPassed
                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                            }`}
                          >
                            {isPassed ? (
                              <CheckCircle2 className="w-3 h-3" />
                            ) : (
                              <XCircle className="w-3 h-3" />
                            )}
                            {field.label}
                          </span>
                        );
                      })}
                    </div>

                    {/* Lifecycle status */}
                    {lifecycle && (
                      <div className="text-xs text-slate-400 flex items-center gap-2 pt-1">
                        <Clock className="w-3.5 h-3.5 text-slate-500" />
                        <span>
                          Derived Lifecycle:{' '}
                          <strong className="text-slate-200 uppercase">{lifecycle.status}</strong>{' '}
                          ({lifecycle.explanation})
                        </span>
                        {lifecycle.isDerivedTime && (
                          <span className="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded">
                            Derived market session ({lifecycle.timeConventionVersion})
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Right Column: Actions */}
                  <div className="flex flex-row lg:flex-col items-center lg:items-end gap-2 shrink-0">
                    <button
                      onClick={() => handleApproveAndPublish(inbox.id)}
                      disabled={isPending || !validation.eligible || isPromoted}
                      className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition flex items-center gap-1.5 ${
                        isPromoted
                          ? 'bg-white/5 text-slate-500 cursor-not-allowed'
                          : validation.eligible
                          ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/20'
                          : 'bg-white/5 text-slate-500 cursor-not-allowed'
                      }`}
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      {isPromoted ? 'Published' : 'Approve & Publish'}
                    </button>

                    <button
                      onClick={() => handlePromoteToDraft(inbox.id)}
                      disabled={isPending || isPromoted || isDraft}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition border ${
                        isPromoted || isDraft
                          ? 'border-white/5 text-slate-600 cursor-not-allowed'
                          : 'border-white/10 text-slate-300 hover:bg-white/5'
                      }`}
                    >
                      {isDraft ? 'In Draft' : 'Promote to Draft'}
                    </button>

                    <button
                      onClick={() => handleReject(inbox.id)}
                      disabled={isPending || isPromoted}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold text-rose-400 hover:bg-rose-500/10 transition"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
