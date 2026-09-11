import React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { ApplicationWizard } from "@/components/application/ApplicationWizard";
import { createClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/security/auth-guards";
import { getApplicantsForUser } from "@/features/application/services/applicantService";
import { ArrowLeft } from "lucide-react";

export const dynamic = "force-dynamic";

interface ApplyIpoPageProps {
  params: Promise<{ slug: string }>;
}

export default async function ApplyIpoPage({ params }: ApplyIpoPageProps) {
  const { slug } = await params;
  const user = await requireAuth(`/login?redirectTo=/ipos/${slug}/apply`);
  const userId = user.id;

  const supabase = await createClient();

  const [ipoRes, allIposRes, applicants] = await Promise.all([
    supabase
      .from("ipos")
      .select("id, company_name, symbol, slug, lot_size, price_band_low, price_band_high, status")
      .eq("slug", slug)
      .eq("publication_status", "published")
      .single(),
    supabase
      .from("ipos")
      .select("id, company_name, symbol, slug, lot_size, price_band_low, price_band_high, status")
      .eq("publication_status", "published")
      .in("status", ["open", "upcoming", "announced"])
      .order("close_date", { ascending: true }),
    getApplicantsForUser(userId),
  ]);

  const targetIpo = ipoRes.data as unknown as {
    id: string;
    company_name: string;
    symbol: string | null;
    slug: string;
    lot_size: number;
    price_band_low: number;
    price_band_high: number;
    status: string;
  } | null;

  if (!targetIpo) {
    notFound();
  }

  const allIpos = (allIposRes.data as unknown as typeof targetIpo[]) || [targetIpo];

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <Link href={`/ipos/${slug}`}>
        <Button size="sm" variant="ghost" leftIcon={<ArrowLeft className="w-3.5 h-3.5" />}>
          Back to {targetIpo.company_name} Research Terminal
        </Button>
      </Link>

      <PageHeader
        title={`Apply for ${targetIpo.company_name}`}
        description={`Price Band: ₹${targetIpo.price_band_low} - ₹${targetIpo.price_band_high} | Minimum Lot Size: ${targetIpo.lot_size} shares.`}
      />

      <ApplicationWizard
        ipos={allIpos}
        applicants={applicants.filter((a) => a.isActive)}
        preselectedIpoId={targetIpo.id}
      />
    </div>
  );
}
