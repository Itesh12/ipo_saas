"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { Checkbox } from "@/components/ui/Checkbox";
import { formatINR } from "@/lib/utils";
import { InvestorCategory, isCutoffAllowedForCategory } from "@/config/investorCategories";
import {
  calculateAndValidateBids,
  getCategoryLotBounds,
  BidRequestInput,
} from "@/features/application/services/lotSizeCalculator";
import { modifyApplicationBidsAction } from "@/features/application/actions/applicationActions";
import { Edit3, Plus, Trash2, X, AlertCircle, CheckCircle2 } from "lucide-react";

export interface ModifyBidsModalProps {
  applicationId: string;
  ipo: {
    company_name: string;
    lot_size: number;
    price_band_low: number;
    price_band_high: number;
  };
  category: InvestorCategory;
  initialBids: Array<{
    bid_number: number;
    lot_count: number;
    price: number;
    is_cutoff: boolean;
  }>;
  currentAmount: number;
}

export function ModifyBidsModal({
  applicationId,
  ipo,
  category,
  initialBids,
  currentAmount,
}: ModifyBidsModalProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [bids, setBids] = useState<BidRequestInput[]>(
    initialBids.map((b) => ({
      bidNumber: b.bid_number,
      lotCount: b.lot_count,
      price: b.price,
      isCutoff: b.is_cutoff,
    }))
  );
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cutoffAllowed = isCutoffAllowedForCategory(category);
  const bounds = getCategoryLotBounds(
    {
      lotSize: ipo.lot_size,
      priceBandLow: ipo.price_band_low,
      priceBandHigh: ipo.price_band_high,
    },
    category
  );

  const calcResult = calculateAndValidateBids(
    {
      lotSize: ipo.lot_size,
      priceBandLow: ipo.price_band_low,
      priceBandHigh: ipo.price_band_high,
    },
    bids,
    category
  );

  const handleAddBid = () => {
    if (bids.length < 3) {
      setBids([
        ...bids,
        {
          bidNumber: bids.length + 1,
          lotCount: bids[0]?.lotCount || 1,
          price: ipo.price_band_high,
          isCutoff: cutoffAllowed,
        },
      ]);
    }
  };

  const handleRemoveBid = (bidNumber: number) => {
    if (bids.length > 1) {
      const remaining = bids.filter((b) => b.bidNumber !== bidNumber);
      setBids(remaining.map((b, idx) => ({ ...b, bidNumber: idx + 1 })));
    }
  };

  const handleUpdateBid = (
    bidNumber: number,
    field: keyof BidRequestInput,
    value: number | boolean
  ) => {
    setBids(
      bids.map((b) => {
        if (b.bidNumber === bidNumber) {
          const updated = { ...b, [field]: value };
          if (field === "isCutoff" && value === true) {
            updated.price = ipo.price_band_high;
          }
          return updated;
        }
        return b;
      })
    );
  };

  const handleSubmit = async () => {
    if (!calcResult.isValid) {
      setError(calcResult.validationError || "Invalid bid configuration.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await modifyApplicationBidsAction({
        applicationId,
        bids: bids.map((b) => ({
          bid_number: b.bidNumber,
          lot_count: b.lotCount,
          price: b.isCutoff ? ipo.price_band_high : b.price || ipo.price_band_high,
          is_cutoff: Boolean(b.isCutoff),
        })),
        reason: reason || "User bid modification",
      });

      if (res.success) {
        setIsOpen(false);
        router.refresh();
      } else {
        setError(res.error || "Failed to update bids.");
      }
    } catch {
      setError("An unexpected error occurred during modification.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button
        size="sm"
        variant="secondary"
        leftIcon={<Edit3 className="w-3.5 h-3.5" />}
        onClick={() => setIsOpen(true)}
      >
        Modify Bids
      </Button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="py-3.5 px-5 bg-[var(--bg-surface-elevated)]/50 border-b border-[var(--border-subtle)] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Edit3 className="w-4 h-4 text-[var(--brand-primary)]" />
                <h3 className="text-sm font-bold text-[var(--text-primary)]">
                  Modify Book-Building Bids
                </h3>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="text-[var(--text-muted)] hover:text-[var(--text-primary)] p-1 rounded-md"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-5 overflow-y-auto">
              {/* IPO Terms Header */}
              <div className="bg-[var(--bg-surface-elevated)]/30 border border-[var(--border-subtle)] p-3 rounded-lg text-xs flex items-center justify-between">
                <div>
                  <span className="text-[var(--text-muted)] block">Company</span>
                  <span className="font-semibold text-[var(--text-primary)]">{ipo.company_name}</span>
                </div>
                <div>
                  <span className="text-[var(--text-muted)] block">Price Band</span>
                  <span className="font-mono font-bold text-[var(--text-primary)]">
                    ₹{ipo.price_band_low} - ₹{ipo.price_band_high}
                  </span>
                </div>
                <div>
                  <span className="text-[var(--text-muted)] block">Lot Size</span>
                  <span className="font-bold text-[var(--text-primary)]">{ipo.lot_size} shares</span>
                </div>
              </div>

              {/* Category Limits Info */}
              <div className="flex items-center justify-between text-xs px-1 text-[var(--text-secondary)]">
                <span>
                  Quota: <strong className="uppercase text-[var(--text-primary)]">{category}</strong>
                </span>
                <span>
                  Allowed Lots: <strong>{bounds.minLots}</strong> to{" "}
                  <strong>{bounds.maxLots > 1000 ? "Unlimited" : bounds.maxLots}</strong>
                </span>
              </div>

              {/* Bids List */}
              <div className="space-y-3">
                {bids.map((b, idx) => {
                  const shares = b.lotCount * ipo.lot_size;
                  const effectivePrice = b.isCutoff ? ipo.price_band_high : b.price || ipo.price_band_high;
                  const bidAmount = shares * effectivePrice;

                  return (
                    <div
                      key={b.bidNumber}
                      className="p-3 bg-[var(--bg-surface-elevated)]/20 border border-[var(--border-subtle)] rounded-lg space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-[var(--text-primary)]">
                          Bid #{b.bidNumber}
                        </span>
                        {bids.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveBid(b.bidNumber)}
                            className="text-red-400 hover:text-red-300 p-1"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                          <label className="text-[11px] text-[var(--text-muted)] block mb-1">
                            Lots ({ipo.lot_size} sh/lot)
                          </label>
                          <Input
                            type="number"
                            min={1}
                            max={bounds.maxLots}
                            value={b.lotCount}
                            onChange={(e) =>
                              handleUpdateBid(b.bidNumber, "lotCount", Math.max(1, parseInt(e.target.value) || 1))
                            }
                          />
                        </div>

                        <div>
                          <label className="text-[11px] text-[var(--text-muted)] block mb-1">
                            Bid Price (₹)
                          </label>
                          <Input
                            type="number"
                            min={ipo.price_band_low}
                            max={ipo.price_band_high}
                            value={b.isCutoff ? ipo.price_band_high : b.price}
                            disabled={b.isCutoff}
                            onChange={(e) =>
                              handleUpdateBid(b.bidNumber, "price", parseFloat(e.target.value) || ipo.price_band_high)
                            }
                          />
                        </div>

                        <div className="flex flex-col justify-end">
                          {cutoffAllowed ? (
                            <label className="flex items-center gap-1.5 cursor-pointer pb-2 text-xs">
                              <Checkbox
                                checked={Boolean(b.isCutoff)}
                                onChange={(e) => handleUpdateBid(b.bidNumber, "isCutoff", e.target.checked)}
                              />
                              <span>Cut-off Price</span>
                            </label>
                          ) : (
                            <span className="text-[10px] text-[var(--text-muted)] pb-2">
                              Cut-off not allowed for {category}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-1 border-t border-[var(--border-subtle)]/50 text-[11px]">
                        <span className="text-[var(--text-muted)]">{shares} shares</span>
                        <span className="font-mono font-bold text-[var(--brand-primary)]">
                          {formatINR(bidAmount)}
                        </span>
                      </div>
                    </div>
                  );
                })}

                {bids.length < 3 && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    leftIcon={<Plus className="w-3.5 h-3.5" />}
                    onClick={handleAddBid}
                    className="w-full border border-dashed border-[var(--border-subtle)] py-2 text-xs"
                  >
                    Add Bid ({bids.length}/3)
                  </Button>
                )}
              </div>

              {/* Modification Reason */}
              <div>
                <label className="text-xs text-[var(--text-secondary)] block mb-1">
                  Reason for Modification (Optional)
                </label>
                <Input
                  type="text"
                  placeholder="e.g. Revised bid price upward"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </div>

              {/* Amount Comparison Banner */}
              <div className="p-3 bg-[var(--bg-surface-elevated)]/40 border border-[var(--border-subtle)] rounded-lg flex items-center justify-between text-xs">
                <div>
                  <span className="text-[var(--text-muted)] block text-[11px]">Previous Amount</span>
                  <span className="font-mono line-through text-[var(--text-muted)]">
                    {formatINR(currentAmount)}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-[var(--text-muted)] block text-[11px]">New Application Amount (Max Bid)</span>
                  <span className="font-mono font-bold text-sm text-[var(--brand-primary)]">
                    {formatINR(calcResult.applicationAmount)}
                  </span>
                </div>
              </div>

              {/* Validation Warning */}
              {error && (
                <div className="p-2.5 bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="py-3 px-5 bg-[var(--bg-surface-elevated)]/30 border-t border-[var(--border-subtle)] flex items-center justify-end gap-3">
              <Button size="sm" variant="ghost" onClick={() => setIsOpen(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                variant="primary"
                disabled={loading || !calcResult.isValid}
                onClick={handleSubmit}
              >
                {loading ? "Updating..." : "Confirm & Update Bids"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
