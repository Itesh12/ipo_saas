import React from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { FileSpreadsheet } from "lucide-react";

export default function ReportsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Tax & Financial Reports"
        description="Downloadable STCG/LTCG capital gains statements, annual application audit logs, and broker transaction summaries."
      />

      <EmptyState
        icon={FileSpreadsheet}
        title="Reports Exporter Ready"
        description="PDF & Excel report generation for Indian tax computation will be connected in Phase 5 & Phase 6."
        isComingSoon={true}
        actionLabel="Go to Dashboard"
        actionHref="/dashboard"
      />
    </div>
  );
}
