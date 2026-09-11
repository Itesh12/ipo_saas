import React from "react";
import { IpoDataQualityItem } from "../../types/intelligence.types";

interface MissingDataBadgeListProps {
  item: IpoDataQualityItem;
}

export function MissingDataBadgeList({ item }: MissingDataBadgeListProps) {
  const missing: string[] = [];

  if (!item.has_basic_details) missing.push("Pricing & Issue");
  if (!item.has_financials) missing.push("Financials");
  if (!item.has_valuation) missing.push("Valuation");
  if (!item.has_promoters) missing.push("Promoters");
  if (!item.has_risks) missing.push("Risks");
  if (!item.has_subscription) missing.push("Subscription");
  if (!item.has_fresh_gmp) missing.push("Fresh GMP");
  if (!item.has_documents) missing.push("Prospectus");

  if (missing.length === 0) {
    return (
      <span className="text-[11px] text-emerald-400 font-medium flex items-center gap-1">
        ✓ Complete
      </span>
    );
  }

  return (
    <div className="flex flex-wrap gap-1">
      {missing.map((m) => (
        <span
          key={m}
          className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-500/10 text-red-400 border border-red-500/20 whitespace-nowrap"
        >
          {m}
        </span>
      ))}
    </div>
  );
}
