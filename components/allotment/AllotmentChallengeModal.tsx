'use client';

/**
 * components/allotment/AllotmentChallengeModal.tsx
 *
 * Investor Dispute & Allotment Challenge Submission Terminal.
 * Allows investors to submit formal discrepancies for compliance review.
 */

import React, { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { AlertCircle, FileText, CheckCircle2, ShieldAlert } from 'lucide-react';
import { ChallengeType } from '@/features/allotment-verification/types/verificationTypes';
import { submitChallengeAction } from '@/features/allotment-verification/actions/verificationActions';

interface AllotmentChallengeModalProps {
  isOpen: boolean;
  onClose: () => void;
  applicationId: string;
  companyName: string;
  sharesApplied: number;
  blockedAmount: number;
  onSuccess?: () => void;
}

export function AllotmentChallengeModal({
  isOpen,
  onClose,
  applicationId,
  companyName,
  sharesApplied,
  blockedAmount,
  onSuccess,
}: AllotmentChallengeModalProps) {
  const [challengeType, setChallengeType] = useState<ChallengeType>('bank_debited_not_allotted');
  const [claimedShares, setClaimedShares] = useState<number>(sharesApplied);
  const [claimedAmount, setClaimedAmount] = useState<number>(blockedAmount);
  const [statement, setStatement] = useState<string>('');
  const [fileHash, setFileHash] = useState<string>('');
  const [fileName, setFileName] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    // Compute SHA-256 hash in browser
    const arrayBuffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
    setFileHash(hashHex);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (claimedShares > sharesApplied) {
      setError(`Claimed shares (${claimedShares}) cannot exceed applied shares (${sharesApplied}).`);
      return;
    }

    if (!statement.trim()) {
      setError('Please provide a brief statement describing the discrepancy.');
      return;
    }

    setLoading(true);
    try {
      const res = await submitChallengeAction({
        applicationId,
        challengeType,
        investorStatement: statement.trim(),
        claimedSharesAllotted: claimedShares,
        claimedAmount,
        evidenceSha256: fileHash || undefined,
        storageObjectId: fileHash ? `challenges/${applicationId}/${fileHash}.pdf` : undefined,
        mimeType: 'application/pdf',
      });

      if (!res.success) {
        throw new Error(res.error || 'Failed to submit challenge.');
      }

      setSubmitted(true);
      if (onSuccess) onSuccess();
    } catch (err: any) {
      setError(err.message || 'Submission failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="File Allotment Dispute / Challenge"
      description={`Submit a discrepancy contestation for ${companyName} for dual-control administrative review.`}
    >
      {submitted ? (
        <div className="py-6 space-y-4 text-center">
          <CheckCircle2 className="w-12 h-12 text-[var(--status-success)] mx-auto" />
          <h3 className="text-base font-semibold text-[var(--text-primary)]">Dispute Registered Successfully</h3>
          <p className="text-xs text-[var(--text-secondary)] max-w-md mx-auto">
            Your challenge has been submitted for dual-control administrative review. Two separate authorized compliance officers must independently verify the evidence before settlement status changes.
          </p>
          <div className="pt-2">
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                setSubmitted(false);
                onClose();
              }}
            >
              Close
            </Button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          {error && (
            <div className="p-3 rounded-lg bg-[var(--status-danger-bg)] border border-[var(--status-danger)]/30 text-[var(--status-danger)] flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="font-medium text-[var(--text-secondary)]">Discrepancy Category</label>
            <select
              value={challengeType}
              onChange={(e) => setChallengeType(e.target.value as ChallengeType)}
              className="w-full h-9 rounded-lg bg-[var(--bg-surface-elevated)] border border-[var(--border-subtle)] px-3 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--brand-primary)]"
            >
              <option value="bank_debited_not_allotted">Bank Account Debited but Registrar reports Not Allotted</option>
              <option value="cas_shares_credited">CAS / Depository shows Shares Credited</option>
              <option value="registrar_pan_not_found">Registrar reports Record Not Found for verified PAN</option>
              <option value="incorrect_shares_allotted">Reported Shares Allotted differs from actual allotment</option>
              <option value="refund_not_received">ASBA Mandate not unblocked after non-allotment</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="font-medium text-[var(--text-secondary)]">Claimed Allotted Shares</label>
              <Input
                type="number"
                min={0}
                max={sharesApplied}
                value={claimedShares}
                onChange={(e) => setClaimedShares(Number(e.target.value))}
                required
              />
              <span className="text-[10px] text-[var(--text-muted)]">Max applied: {sharesApplied} shares</span>
            </div>

            <div className="space-y-1">
              <label className="font-medium text-[var(--text-secondary)]">Claimed Amount (₹)</label>
              <Input
                type="number"
                min={0}
                value={claimedAmount}
                onChange={(e) => setClaimedAmount(Number(e.target.value))}
                required
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="font-medium text-[var(--text-secondary)]">Dispute Statement</label>
            <textarea
              rows={3}
              value={statement}
              onChange={(e) => setStatement(e.target.value)}
              placeholder="Describe why this allotment should be updated (e.g. CAS transaction reference, bank debit UTR)..."
              className="w-full rounded-lg bg-[var(--bg-surface-elevated)] border border-[var(--border-subtle)] p-3 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--brand-primary)]"
              required
            />
          </div>

          <div className="space-y-1.5 p-3 rounded-lg border border-dashed border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)]/30">
            <label className="font-medium text-[var(--text-secondary)] flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-[var(--brand-primary)]" />
              <span>Supporting Evidence Document (CAS / Bank Statement)</span>
            </label>
            <input
              type="file"
              accept=".pdf,.png,.jpg,.jpeg"
              onChange={handleFileChange}
              className="w-full text-xs text-[var(--text-secondary)] file:mr-3 file:py-1 file:px-2.5 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-[var(--brand-primary)] file:text-white hover:file:opacity-90 cursor-pointer"
            />
            {fileHash && (
              <p className="text-[10px] text-[var(--text-muted)] font-mono truncate">
                SHA-256: {fileHash}
              </p>
            )}
          </div>

          <div className="p-2.5 rounded-lg bg-[var(--status-warning-bg)] border border-[var(--status-warning)]/30 text-[var(--status-warning)] flex items-start gap-2 text-[11px]">
            <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              All submissions are cryptographically hashed and require independent two-person compliance verification before any financial ledger entries are created.
            </span>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-[var(--border-subtle)]">
            <Button variant="outline" size="sm" type="button" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" type="submit" disabled={loading}>
              {loading ? 'Submitting...' : 'Submit Challenge'}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
