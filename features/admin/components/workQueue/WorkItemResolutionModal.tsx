"use client";

import React, { useState } from "react";
import { AdminWorkItem } from "../../types/workQueue.types";
import {
  resolveWorkItemAction,
  dismissWorkItemAction,
  reopenWorkItemAction,
} from "../../actions/workQueueActions";
import { Button } from "@/components/ui/Button";
import { X, CheckCircle2, AlertTriangle, RotateCcw } from "lucide-react";

interface WorkItemResolutionModalProps {
  item: AdminWorkItem;
  mode: "resolve" | "dismiss" | "reopen";
  onClose: () => void;
  onSuccess: (updated: AdminWorkItem) => void;
}

export function WorkItemResolutionModal({
  item,
  mode,
  onClose,
  onSuccess,
}: WorkItemResolutionModalProps) {
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const title =
    mode === "resolve"
      ? "Resolve Work Item"
      : mode === "dismiss"
      ? "Dismiss Work Item"
      : "Reopen Work Item";

  const description =
    mode === "resolve"
      ? "Document the remediation actions taken to resolve this anomaly."
      : mode === "dismiss"
      ? "Provide the administrative rationale for dismissing this alert (e.g. acceptable variance)."
      : "Explain the justification for reopening this previously closed item.";

  const buttonText =
    mode === "resolve" ? "Mark Resolved" : mode === "dismiss" ? "Dismiss Item" : "Reopen Item";

  const Icon =
    mode === "resolve" ? CheckCircle2 : mode === "dismiss" ? AlertTriangle : RotateCcw;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!notes.trim()) {
      setError("Notes are strictly required.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      let res;
      if (mode === "resolve") {
        res = await resolveWorkItemAction(item.id, notes.trim());
      } else if (mode === "dismiss") {
        res = await dismissWorkItemAction(item.id, notes.trim());
      } else {
        res = await reopenWorkItemAction(item.id, notes.trim());
      }

      if (res.success && res.item) {
        onSuccess(res.item);
        onClose();
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
      <div className="w-full max-w-md bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl shadow-2xl p-6 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
          <div className="flex items-center gap-2 text-[var(--text-primary)]">
            <Icon className="w-5 h-5 text-[var(--brand-primary)]" />
            <h3 className="text-base font-semibold">{title}</h3>
          </div>
          <button
            onClick={onClose}
            className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-xs text-[var(--text-secondary)]">{description}</p>

        <div className="p-2.5 rounded-lg bg-[var(--bg-surface-elevated)] text-xs space-y-1">
          <div className="font-semibold text-[var(--text-primary)] truncate">{item.title}</div>
          <div className="text-[var(--text-muted)] text-[11px]">
            {item.category} • {item.entity_type} ({item.entity_id.slice(0, 8)}...)
          </div>
        </div>

        {error && (
          <div className="p-2.5 rounded bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
              {mode === "resolve" ? "Resolution Summary" : "Justification Notes"}{" "}
              <span className="text-red-400">*</span>
            </label>
            <textarea
              required
              rows={4}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Provide clear diagnostic rationale..."
              className="w-full text-xs p-3 rounded-lg bg-[var(--bg-surface-elevated)] border border-[var(--border-subtle)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--brand-primary)]"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button size="sm" variant="outline" type="button" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button size="sm" variant="primary" type="submit" isLoading={isSubmitting}>
              {buttonText}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
