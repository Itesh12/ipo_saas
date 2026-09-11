import React from "react";
import { DashboardSidebar } from "@/components/layout/DashboardSidebar";
import { DashboardHeader } from "@/components/layout/DashboardHeader";
import { NotificationProvider } from "@/features/notifications/context/NotificationContext";
import { getCurrentUser } from "@/lib/security/auth-guards";
import { getUnreadNotificationCount } from "@/features/notifications/services/notificationService";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const currentUser = await getCurrentUser();

  let initialUnreadCount = 0;
  if (currentUser) {
    initialUnreadCount = await getUnreadNotificationCount(currentUser.id);
  }

  return (
    <NotificationProvider initialUnreadCount={initialUnreadCount} userId={currentUser?.id}>
      <div className="flex min-h-screen bg-[var(--bg-app)]">
        {/* Desktop Sidebar */}
        <DashboardSidebar />

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col min-w-0">
          <DashboardHeader userRole={currentUser?.role} />
          <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
            {children}
          </main>
        </div>
      </div>
    </NotificationProvider>
  );
}
