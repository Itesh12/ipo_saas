/**
 * app/(dashboard)/notifications/page.tsx
 *
 * Authoritative In-App Notification Center.
 * Replaces previous Coming Soon placeholder with live functional inbox.
 */

import React from "react";
import { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { createClient } from "@/lib/supabase/server";
import { getUserNotifications } from "@/features/notifications/services/notificationService";
import { NotificationList } from "@/features/notifications/components/NotificationList";

export const metadata: Metadata = {
  title: "Notifications | IPO SaaS Platform",
  description: "In-app alerts for IPO milestones, allotment outcomes, and financial ledger updates.",
};

export default async function NotificationsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/notifications");
  }

  const { notifications, unreadCount } = await getUserNotifications({
    userId: user.id,
    limit: 50,
  });

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <PageHeader
        title="Notification Center"
        description="Authoritative receipts for IPO milestones, UPI mandates, allotment outcomes, and ledger credits."
      />

      <NotificationList
        initialNotifications={notifications}
        unreadCount={unreadCount}
      />
    </div>
  );
}
