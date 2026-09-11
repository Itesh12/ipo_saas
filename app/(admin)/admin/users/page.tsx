import React from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Users, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/Button";

export default function AdminUsersPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="User Governance & Directory"
        description="Inspect registered accounts, assign administrative roles (Super Admin, Admin, Editor, Analyst), and manage account status."
        actions={
          <Button size="sm" variant="primary" leftIcon={<UserPlus className="w-3.5 h-3.5" />}>
            Invite Admin
          </Button>
        }
      />

      <EmptyState
        icon={Users}
        title="User Directory Module Ready"
        description="Role-based user management, permission assignment, and suspension controls will be hooked up in Phase 8 — Admin Intelligence."
        isComingSoon={true}
        actionLabel="Admin Overview"
        actionHref="/admin/dashboard"
      />
    </div>
  );
}
