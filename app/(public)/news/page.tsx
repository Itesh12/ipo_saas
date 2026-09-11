import React from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Newspaper } from "lucide-react";

export default function NewsPage() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <PageHeader
        title="IPO News & Market Circulars"
        description="SEBI regulatory circulars, exchange updates (NSE/BSE), DRHP/RHP filings, and market commentary."
      />

      <EmptyState
        icon={Newspaper}
        title="News Feed Initialized"
        description="Real-time financial circulars and categorized IPO market articles will be connected in Phase 3 — IPO Research."
        isComingSoon={true}
        actionLabel="Go to Dashboard"
        actionHref="/dashboard"
      />
    </div>
  );
}
