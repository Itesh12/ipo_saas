import React from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { ScreenerClientContainer } from '@/components/screener/ScreenerClientContainer';
import { IpoScreenerService } from '@/features/analytics/services/ipoScreenerService';
import { SavedScreenService } from '@/features/analytics/services/savedScreenService';
import { ScreenerFilterPayload } from '@/features/analytics/types/analytics.types';
import { createClient } from '@/lib/supabase/server';

interface IpoScreenerPageProps {
  searchParams: Promise<{
    query?: string;
    issue_type?: string;
    status?: string;
    min_issue_size?: string;
    max_issue_size?: string;
    min_pe?: string;
    max_pe?: string;
    min_roe?: string;
    min_score?: string;
    min_subscription?: string;
    min_gmp?: string;
    include_unpriced?: string;
    page?: string;
    limit?: string;
    sort_by?: string;
    sort_dir?: string;
  }>;
}

export default async function IpoScreenerPage({ searchParams }: IpoScreenerPageProps) {
  const resolvedParams = await searchParams;

  const filters: ScreenerFilterPayload = {
    searchQuery: resolvedParams.query,
    category: resolvedParams.issue_type && resolvedParams.issue_type !== 'all' ? [resolvedParams.issue_type] : undefined,
    status: resolvedParams.status && resolvedParams.status !== 'all' ? [resolvedParams.status] : undefined,
    issueSizeMinCr: resolvedParams.min_issue_size ? Number(resolvedParams.min_issue_size) : undefined,
    issueSizeMaxCr: resolvedParams.max_issue_size ? Number(resolvedParams.max_issue_size) : undefined,
    peRatioMin: resolvedParams.min_pe ? Number(resolvedParams.min_pe) : undefined,
    peRatioMax: resolvedParams.max_pe ? Number(resolvedParams.max_pe) : undefined,
    roeMinPct: resolvedParams.min_roe ? Number(resolvedParams.min_roe) : undefined,
    overallScoreMin: resolvedParams.min_score ? Number(resolvedParams.min_score) : undefined,
    subscriptionMinX: resolvedParams.min_subscription ? Number(resolvedParams.min_subscription) : undefined,
    gmpGainMinPct: resolvedParams.min_gmp ? Number(resolvedParams.min_gmp) : undefined,
    includeUnpriced: resolvedParams.include_unpriced === 'true',
    page: resolvedParams.page ? Number(resolvedParams.page) : 1,
    limit: resolvedParams.limit ? Number(resolvedParams.limit) : 25,
    sortBy: resolvedParams.sort_by || 'overall_score',
    sortDirection: (resolvedParams.sort_dir as 'asc' | 'desc') || 'desc',
  };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Load initial records from screener query
  const queryResult = await IpoScreenerService.queryScreener(filters);

  // Load presets & user saved screens
  const presets = SavedScreenService.getSystemPresets();
  const userScreens = user ? await SavedScreenService.getUserSavedScreens(user.id) : [];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <PageHeader
        title="Multi-Factor IPO Screener"
        description="Institutional-grade screening engine across valuation multiples, subscription traction, composite opportunity scores, and unofficial GMP metrics."
      />

      <ScreenerClientContainer
        initialRecords={queryResult.records}
        initialFilters={filters}
        presets={presets}
        userScreens={userScreens}
      />
    </div>
  );
}
