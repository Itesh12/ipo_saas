import React from "react";
import { AdminSidebar } from "@/components/layout/AdminSidebar";
import { DashboardHeader } from "@/components/layout/DashboardHeader";
import { requireRole } from "@/lib/security/auth-guards";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Authoritative server-side role check from profiles.role:
  // Requires 'admin' or 'super_admin'. Redirects 'user', 'analyst', 'editor' to /dashboard,
  // and unauthenticated users to /login.
  const user = await requireRole("admin");

  return (
    <div className="flex min-h-screen bg-[var(--bg-app)]">
      {/* Admin Sidebar */}
      <AdminSidebar />

      {/* Main Admin Content */}
      <div className="flex-1 flex flex-col min-w-0">
        <DashboardHeader isAdmin={true} userRole={user.role} />
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
