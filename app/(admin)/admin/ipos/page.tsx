import React from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { AdminIPOTable } from "@/features/ipo/components/AdminIPOTable";
import { getAllIPOsAdmin } from "@/features/ipo/services/ipoAdminService";

export default async function AdminIPOsDirectoryPage() {
  const ipos = await getAllIPOsAdmin();

  return (
    <div className="space-y-6">
      <PageHeader
        title="IPO Master Directory"
        description="Manage the complete lifecycle, pricing parameters, issue structures, and publication states of Indian IPO masters."
        badge={
          <span className="text-xs uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-[var(--brand-primary)]/10 text-[var(--brand-primary)] border border-[var(--brand-primary)]/20">
            {ipos.length} Records
          </span>
        }
      />

      <AdminIPOTable initialIpos={ipos} />
    </div>
  );
}
