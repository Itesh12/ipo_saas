"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Checkbox } from "@/components/ui/Checkbox";
import { formatINR } from "@/lib/utils";
import {
  CURRENT_REGULATORY_RULES,
  InvestorCategory,
  isCutoffAllowedForCategory,
} from "@/config/investorCategories";
import { evaluateBids, computeApplicationAggregates, BidInput } from "@/features/application/services/applicationRules";
import { submitApplicationAction } from "@/features/application/actions/applicationActions";
import { ApplicantSummary } from "@/features/application/types/application.types";
import { ArrowRight, ArrowLeft, CheckCircle2, ShieldCheck, Plus, Trash2, Building2 } from "lucide-react";
import Link from "next/link";

export interface ApplicationWizardProps {
  ipos: Array<{
    id: string;
    company_name: string;
    symbol: string | null;
    slug: string;
    lot_size: number;
    price_band_low: number;
    price_band_high: number;
    status: string;
  }>;
  applicants: ApplicantSummary[];
  preselectedIpoId?: string;
}

export function ApplicationWizard({
  ipos,
  applicants,
  preselectedIpoId,
}: ApplicationWizardProps) {
  const router = useRouter();

  // Wizard Steps: 1: Target IPO & Applicant -> 2: Category & Bids -> 3: Review & Submit
  const [step, setStep] = useState<number>(1);
  const [selectedIpoId, setSelectedIpoId] = useState<string>(preselectedIpoId || ipos[0]?.id || "");
  const [selectedApplicantId, setSelectedApplicantId] = useState<string>(applicants[0]?.id || "");
  const [selectedCategory, setSelectedCategory] = useState<InvestorCategory>("retail");

  // Bids state (up to 3 bids)
  const selectedIpo = ipos.find((i) => i.id === selectedIpoId) || ipos[0];
  const [bids, setBids] = useState<BidInput[]>([
    {
      bidNumber: 1,
      lotCount: 1,
      price: selectedIpo?.price_band_high || 100,
      isCutoff: true,
    },
  ]);
  const [upiId, setUpiId] = useState<string>("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cutoffAllowed = isCutoffAllowedForCategory(selectedCategory, CURRENT_REGULATORY_RULES);

  // Evaluate bids dynamically
  const bidEval = selectedIpo
    ? evaluateBids(
        bids,
        selectedIpo.lot_size,
        selectedIpo.price_band_low,
        selectedIpo.price_band_high,
        selectedCategory
      )
    : { success: false, error: "No IPO selected." };

  const aggregates =
    bidEval.success && bidEval.calculatedBids
      ? computeApplicationAggregates(bidEval.calculatedBids, selectedCategory)
      : null;

  const handleAddBid = () => {
    if (bids.length < 3 && selectedIpo) {
      setBids([
        ...bids,
        {
          bidNumber: bids.length + 1,
          lotCount: bids[0].lotCount,
          price: selectedIpo.price_band_high,
          isCutoff: cutoffAllowed,
        },
      ]);
    }
  };

  const handleRemoveBid = (bidNumber: number) => {
    if (bids.length > 1) {
      const remaining = bids.filter((b) => b.bidNumber !== bidNumber);
      const reindexed = remaining.map((b, idx) => ({ ...b, bidNumber: idx + 1 }));
      setBids(reindexed);
    }
  };

  const handleUpdateBid = (
    bidNumber: number,
    field: keyof BidInput,
    value: number | boolean
  ) => {
    setBids(
      bids.map((b) => {
        if (b.bidNumber === bidNumber) {
          const updated = { ...b, [field]: value };
          if (field === "isCutoff" && value === true && selectedIpo) {
            updated.price = selectedIpo.price_band_high;
          }
          return updated;
        }
        return b;
      })
    );
  };

  const handleSubmit = async () => {
    if (!selectedIpo || !selectedApplicantId || !aggregates?.success) {
      setError("Please ensure all application parameters are valid.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await submitApplicationAction({
        ipo_id: selectedIpo.id,
        applicant_id: selectedApplicantId,
        investor_category: selectedCategory,
        bids: bids.map((b) => ({
          bid_number: b.bidNumber,
          lot_count: b.lotCount,
          price: b.isCutoff ? selectedIpo.price_band_high : b.price,
          is_cutoff: b.isCutoff,
        })),
        upi_id: upiId || null,
        notes: null,
      });

      if (res.success && res.data) {
        router.push(`/applications/${res.data.id}`);
      } else {
        setError(res.error || "Submission failed.");
      }
    } catch {
      setError("An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  };

  const selectedApplicant = applicants.find((a) => a.id === selectedApplicantId);

  if (applicants.length === 0) {
    return (
      <Card className="p-8 text-center space-y-4 border-[var(--border-subtle)]">
        <Building2 className="w-12 h-12 text-[var(--text-muted)] mx-auto opacity-70" />
        <div className="space-y-1">
          <h3 className="text-base font-bold text-[var(--text-primary)]">No Applicant Profile Found</h3>
          <p className="text-xs text-[var(--text-secondary)] max-w-sm mx-auto">
            You must register at least one Demat applicant profile (Self or Family member) before submitting an application.
          </p>
        </div>
        <Link href="/applicants">
          <Button variant="primary" size="sm">
            Create Applicant Profile
          </Button>
        </Link>
      </Card>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      {/* Wizard Step Indicator */}
      <div className="flex items-center justify-between px-2 text-xs">
        <div className={`flex items-center gap-2 ${step >= 1 ? "text-[var(--brand-primary)] font-bold" : "text-[var(--text-muted)]"}`}>
          <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] ${step >= 1 ? "bg-[var(--brand-primary)] text-white" : "bg-[var(--bg-surface-elevated)] border border-[var(--border-subtle)]"}`}>
            1
          </div>
          <span>Select Target</span>
        </div>

        <div className="flex-1 h-0.5 mx-3 bg-[var(--border-subtle)]" />

        <div className={`flex items-center gap-2 ${step >= 2 ? "text-[var(--brand-primary)] font-bold" : "text-[var(--text-muted)]"}`}>
          <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] ${step >= 2 ? "bg-[var(--brand-primary)] text-white" : "bg-[var(--bg-surface-elevated)] border border-[var(--border-subtle)]"}`}>
            2
          </div>
          <span>Category & Bids</span>
        </div>

        <div className="flex-1 h-0.5 mx-3 bg-[var(--border-subtle)]" />

        <div className={`flex items-center gap-2 ${step >= 3 ? "text-[var(--brand-primary)] font-bold" : "text-[var(--text-muted)]"}`}>
          <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] ${step >= 3 ? "bg-[var(--brand-primary)] text-white" : "bg-[var(--bg-surface-elevated)] border border-[var(--border-subtle)]"}`}>
            3
          </div>
          <span>Review & Submit</span>
        </div>
      </div>

      {error && (
        <div className="p-3.5 text-xs rounded-xl bg-[var(--status-danger-bg)] text-[var(--status-danger)] border border-[var(--status-danger)]/20">
          {error}
        </div>
      )}

      {/* STEP 1: Select Target IPO & Applicant */}
      {step === 1 && (
        <Card className="border-[var(--border-subtle)] bg-[var(--bg-surface)]">
          <CardHeader className="py-4 px-6 border-b border-[var(--border-subtle)]">
            <CardTitle className="text-sm">Step 1: Select Target IPO & Applicant Profile</CardTitle>
          </CardHeader>
          <CardContent className="p-6 space-y-5">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[var(--text-secondary)]">Target IPO Issue</label>
              <Select
                value={selectedIpoId}
                onChange={(e) => {
                  setSelectedIpoId(e.target.value);
                  const ipo = ipos.find((i) => i.id === e.target.value);
                  if (ipo) {
                    setBids([
                      {
                        bidNumber: 1,
                        lotCount: 1,
                        price: ipo.price_band_high,
                        isCutoff: cutoffAllowed,
                      },
                    ]);
                  }
                }}
              >
                {ipos.map((ipo) => (
                  <option key={ipo.id} value={ipo.id}>
                    {ipo.company_name} (Band: ₹{ipo.price_band_low} - ₹{ipo.price_band_high} | Lot: {ipo.lot_size})
                  </option>
                ))}
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[var(--text-secondary)]">Applicant Demat Profile</label>
              <Select
                value={selectedApplicantId}
                onChange={(e) => {
                  setSelectedApplicantId(e.target.value);
                  const applicant = applicants.find((a) => a.id === e.target.value);
                  if (applicant) {
                    setSelectedCategory(applicant.defaultCategory);
                  }
                }}
              >
                {applicants.map((app) => (
                  <option key={app.id} value={app.id}>
                    {app.displayName} ({app.relationship.toUpperCase()} | PAN: {app.panMasked})
                  </option>
                ))}
              </Select>
            </div>

            {selectedApplicant && (
              <div className="p-3.5 rounded-xl bg-[var(--bg-surface-elevated)]/40 border border-[var(--border-subtle)] grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                <div>
                  <span className="text-[11px] text-[var(--text-muted)]">Applicant Relationship</span>
                  <p className="font-semibold capitalize text-[var(--text-primary)] mt-0.5">
                    {selectedApplicant.relationship}
                  </p>
                </div>
                <div>
                  <span className="text-[11px] text-[var(--text-muted)]">Masked PAN</span>
                  <p className="font-semibold font-mono text-[var(--text-primary)] mt-0.5">
                    {selectedApplicant.panMasked}
                  </p>
                </div>
                <div>
                  <span className="text-[11px] text-[var(--text-muted)]">Demat Reference</span>
                  <p className="font-semibold text-[var(--text-primary)] mt-0.5 truncate">
                    {selectedApplicant.dematMasked}
                  </p>
                </div>
              </div>
            )}

            <div className="flex justify-end pt-2">
              <Button
                variant="primary"
                onClick={() => setStep(2)}
                rightIcon={<ArrowRight className="w-4 h-4" />}
              >
                Continue to Bids
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* STEP 2: Category & Bids Entry */}
      {step === 2 && selectedIpo && (
        <Card className="border-[var(--border-subtle)] bg-[var(--bg-surface)]">
          <CardHeader className="py-4 px-6 border-b border-[var(--border-subtle)] flex flex-row items-center justify-between">
            <CardTitle className="text-sm">Step 2: Category & Multi-Bid Configuration</CardTitle>
            <span className="text-xs text-[var(--text-muted)]">
              Lot: {selectedIpo.lot_size} shares | Band: ₹{selectedIpo.price_band_low} - ₹{selectedIpo.price_band_high}
            </span>
          </CardHeader>
          <CardContent className="p-6 space-y-6">
            {/* Category Selector */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[var(--text-secondary)]">Investor Quota Category</label>
              <Select
                value={selectedCategory}
                onChange={(e) => {
                  const newCat = e.target.value as InvestorCategory;
                  setSelectedCategory(newCat);
                  const isCutoff = isCutoffAllowedForCategory(newCat, CURRENT_REGULATORY_RULES);
                  if (!isCutoff) {
                    // Disable cut-off on bids
                    setBids(bids.map((b) => ({ ...b, isCutoff: false, price: selectedIpo.price_band_high })));
                  }
                }}
              >
                <option value="retail">Retail Individual (up to ₹2,00,000 | Cut-off allowed)</option>
                <option value="s_hni">sHNI (₹2,00,000 - ₹10,00,000 | Price bidding required)</option>
                <option value="b_hni">bHNI (Above ₹10,00,000 | Price bidding required)</option>
                <option value="employee">Employee Quota (up to ₹5,00,000)</option>
                <option value="shareholder">Shareholder Quota (up to ₹2,00,000)</option>
              </Select>
              <p className="text-[11px] text-[var(--text-muted)]">
                {CURRENT_REGULATORY_RULES.categories[selectedCategory].description}
              </p>
            </div>

            {/* Bids List */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[var(--text-secondary)]">
                  Book-Building Bids ({bids.length} of 3)
                </span>
                {bids.length < 3 && (
                  <Button
                    size="sm"
                    variant="outline"
                    leftIcon={<Plus className="w-3 h-3" />}
                    onClick={handleAddBid}
                  >
                    Add Alternative Bid
                  </Button>
                )}
              </div>

              {bids.map((bid) => {
                const calculatedQty = bid.lotCount * selectedIpo.lot_size;
                const effectivePrice = bid.isCutoff ? selectedIpo.price_band_high : bid.price;
                const bidAmount = calculatedQty * effectivePrice;

                return (
                  <div
                    key={bid.bidNumber}
                    className="p-4 rounded-xl bg-[var(--bg-surface-elevated)]/30 border border-[var(--border-subtle)] space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <Badge variant="default" size="sm">
                        Bid #{bid.bidNumber}
                      </Badge>
                      {bids.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveBid(bid.bidNumber)}
                          className="text-[var(--status-danger)] hover:opacity-80 p-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end text-xs">
                      <div className="space-y-1">
                        <label className="text-[11px] font-semibold text-[var(--text-secondary)]">Lots</label>
                        <Input
                          type="number"
                          min={1}
                          max={500}
                          value={bid.lotCount}
                          onChange={(e) =>
                            handleUpdateBid(bid.bidNumber, "lotCount", parseInt(e.target.value) || 1)
                          }
                          required
                        />
                        <span className="text-[10px] text-[var(--text-muted)]">{calculatedQty} shares</span>
                      </div>

                      <div className="space-y-1">
                        <label className="text-[11px] font-semibold text-[var(--text-secondary)]">Price (₹)</label>
                        <Input
                          type="number"
                          min={selectedIpo.price_band_low}
                          max={selectedIpo.price_band_high}
                          step={1}
                          value={bid.price}
                          disabled={bid.isCutoff}
                          onChange={(e) =>
                            handleUpdateBid(bid.bidNumber, "price", parseFloat(e.target.value) || selectedIpo.price_band_high)
                          }
                          required
                        />
                        <span className="text-[10px] text-[var(--text-muted)]">
                          Band: ₹{selectedIpo.price_band_low} - ₹{selectedIpo.price_band_high}
                        </span>
                      </div>

                      <div className="space-y-1 flex items-center h-10">
                        {cutoffAllowed ? (
                          <label className="flex items-center gap-2 cursor-pointer select-none">
                            <Checkbox
                              checked={bid.isCutoff}
                              onChange={(e) =>
                                handleUpdateBid(bid.bidNumber, "isCutoff", e.target.checked)
                              }
                            />
                            <span className="text-xs font-semibold text-[var(--text-primary)]">
                              Cut-off Price
                            </span>
                          </label>
                        ) : (
                          <span className="text-[11px] text-[var(--text-muted)] italic">
                            Cut-off not allowed for {selectedCategory}
                          </span>
                        )}
                      </div>

                      <div className="space-y-1 sm:text-right">
                        <label className="text-[11px] font-semibold text-[var(--text-secondary)]">Bid Amount</label>
                        <p className="font-bold text-sm text-[var(--brand-primary)]">
                          {formatINR(bidAmount)}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* SEBI Rule Explainer */}
            <div className="p-3.5 rounded-xl bg-[var(--bg-surface-elevated)]/40 border border-[var(--border-subtle)] text-xs text-[var(--text-secondary)] flex items-start gap-2.5">
              <ShieldCheck className="w-4 h-4 text-[var(--status-success)] shrink-0 mt-0.5" />
              <p>
                <strong>SEBI Margin Requirement:</strong> When submitting multiple bids, the required application amount is determined by the <strong>highest bid value</strong> ({aggregates?.aggregates ? formatINR(aggregates.aggregates.applicationAmount) : "—"}), not their sum.
              </p>
            </div>

            <div className="flex items-center justify-between pt-2">
              <Button variant="outline" onClick={() => setStep(1)} leftIcon={<ArrowLeft className="w-4 h-4" />}>
                Back
              </Button>
              <Button
                variant="primary"
                disabled={!aggregates?.success}
                onClick={() => setStep(3)}
                rightIcon={<ArrowRight className="w-4 h-4" />}
              >
                Review Application
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* STEP 3: Review & Submit */}
      {step === 3 && selectedIpo && aggregates?.aggregates && (
        <Card className="border-[var(--border-subtle)] bg-[var(--bg-surface)]">
          <CardHeader className="py-4 px-6 border-b border-[var(--border-subtle)]">
            <CardTitle className="text-sm">Step 3: Review Application & Authorize Mandate</CardTitle>
          </CardHeader>
          <CardContent className="p-6 space-y-5">
            <div className="p-4 rounded-xl bg-[var(--bg-surface-elevated)]/30 border border-[var(--border-subtle)] space-y-3">
              <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-2.5">
                <span className="text-xs text-[var(--text-muted)]">Target IPO</span>
                <span className="text-xs font-bold text-[var(--text-primary)]">{selectedIpo.company_name}</span>
              </div>
              <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-2.5">
                <span className="text-xs text-[var(--text-muted)]">Applicant</span>
                <span className="text-xs font-semibold text-[var(--text-primary)]">
                  {selectedApplicant?.displayName} ({selectedApplicant?.panMasked})
                </span>
              </div>
              <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-2.5">
                <span className="text-xs text-[var(--text-muted)]">Investor Category</span>
                <span className="text-xs font-semibold capitalize text-[var(--text-primary)]">{selectedCategory}</span>
              </div>
              <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-2.5">
                <span className="text-xs text-[var(--text-muted)]">Total Lots & Quantity</span>
                <span className="text-xs font-semibold text-[var(--text-primary)]">
                  {aggregates.aggregates.totalLots} Lots ({aggregates.aggregates.totalQuantity} Shares)
                </span>
              </div>
              <div className="flex items-center justify-between pt-1">
                <span className="text-xs font-bold text-[var(--text-primary)]">Application Amount (Lien Blocked)</span>
                <span className="text-base font-bold text-[var(--brand-primary)]">
                  {formatINR(aggregates.aggregates.applicationAmount)}
                </span>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[var(--text-secondary)]">
                UPI ID for Mandate Request (Optional)
              </label>
              <Input
                placeholder="e.g. rahul@okaxis"
                value={upiId}
                onChange={(e) => setUpiId(e.target.value)}
              />
              <p className="text-[11px] text-[var(--text-muted)]">
                A mandate request for {formatINR(aggregates.aggregates.applicationAmount)} will be generated to this UPI handle.
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-[var(--bg-surface-elevated)]/40 border border-[var(--border-subtle)] text-[11px] text-[var(--text-muted)] flex items-start gap-2.5">
              <ShieldCheck className="w-4 h-4 text-[var(--status-success)] shrink-0 mt-0.5" />
              <p>
                <strong>Security Declaration:</strong> Funds are lien-blocked in your bank under ASBA regulations and are only debited upon share allotment. We never ask for your UPI PIN.
              </p>
            </div>

            <div className="flex items-center justify-between pt-2">
              <Button variant="outline" onClick={() => setStep(2)} leftIcon={<ArrowLeft className="w-4 h-4" />}>
                Back
              </Button>
              <Button
                variant="primary"
                disabled={loading}
                onClick={handleSubmit}
                leftIcon={<CheckCircle2 className="w-4 h-4" />}
              >
                {loading ? "Submitting..." : "Submit Application"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
