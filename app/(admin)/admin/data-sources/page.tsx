import React from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Database } from "lucide-react";

export default function AdminDataSourcesPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Market Data Sources & Ingestion"
        description="Configure data provider normalizers, sync schedules (NSE, BSE, Chittorgarh, Prime Database), and ingestion logs."
      />

      <EmptyState
        icon={Database}
        title="Data Ingestion Pipeline Ready"
        description="External market provider abstractions and automated webhook processors will be enabled in Phase 9 — External Integrations."
        isComingSoon={true}
        actionLabel="Admin Overview"
        actionHref="/admin/dashboard"
      />
    </div>
  );
}
