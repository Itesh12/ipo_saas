import React from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { ApplicationWizard } from "@/components/application/ApplicationWizard";
import { createClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/security/auth-guards";
import { getApplicantsForUser } from "@/features/application/services/applicantService";

export const dynamic = "force-dynamic";

interface NewApplicationPageProps {
  searchParams: Promise<{
    ipoId?: string;
    applicantId?: string;
  }>;
}

export default async function NewApplicationPage({ searchParams }: NewApplicationPageProps) {
  const params = await searchParams;
  const user = await requireAuth();
  const userId = user.id;

  const supabase = await createClient();

  const [iposRes, applicants] = await Promise.all([
    supabase
      .from("ipos")
      .select("id, company_name, symbol, slug, lot_size, price_band_low, price_band_high, status")
      .eq("publication_status", "published")
      .in("status", ["open", "upcoming", "announced"])
      .order("close_date", { ascending: true }),
    getApplicantsForUser(userId),
  ]);

  const ipos = iposRes.data || [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Submit New IPO Application"
        description="Configure your multi-bid book-building application and generate your ASBA UPI mandate request."
      />

      <ApplicationWizard
        ipos={ipos}
        applicants={applicants.filter((a) => a.isActive)}
        preselectedIpoId={params.ipoId}
      />
    </div>
  );
}
