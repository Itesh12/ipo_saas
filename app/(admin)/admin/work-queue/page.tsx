import React from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { WorkQueueTable } from "@/features/admin/components/workQueue/WorkQueueTable";
import { AdminWorkQueueService } from "@/features/admin/services/adminWorkQueueService";
import { createClient } from "@/lib/supabase/server";
import { ScanTriggerButton } from "./ScanTriggerButton";
import { CheckSquare } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function AdminWorkQueuePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  let userRole = "analyst";
  if (user) {
    const { data } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    const profile = data as unknown as { role: string } | null;
    if (profile?.role) userRole = profile.role;
  }

  const { items, total } = await AdminWorkQueueService.getWorkItems({
    status: "all",
    pageSize: 100,
  });

  const canScan = ["super_admin", "admin"].includes(userRole);

  return (
    <div className="space-y-6 animate-fadeIn">
      <PageHeader
        title="Admin Work Queue"
        description="Actionable anomaly triage, human review tasks, and exception resolution."
        badge={
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 flex items-center gap-1.5">
            <CheckSquare className="w-3.5 h-3.5" />
            {total} Total Work Items
          </span>
        }
        actions={canScan ? <ScanTriggerButton /> : undefined}
      />

      <WorkQueueTable
        initialItems={items}
        userRole={userRole}
        userId={user?.id}
      />
    </div>
  );
}
