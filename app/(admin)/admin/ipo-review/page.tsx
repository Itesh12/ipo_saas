import React from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { IpoReviewQueueClient } from '@/features/external-integrations/components/IpoReviewQueueClient';
import { getCanonicalReviewQueueAction } from '@/features/external-integrations/actions/ingestionActions';

export const dynamic = 'force-dynamic';

export default async function AdminIpoReviewPage() {
  const items = await getCanonicalReviewQueueAction();

  return (
    <div className="space-y-6">
      <PageHeader
        title="IPO Ingestion Review & Editorial Gate"
        description="Verify 7-field canonical gatekeeper compliance, inspect source provenance, resolve lifecycle parameters, and approve live activation."
        badge={
          <span className="text-xs uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            {items.length} Staged Candidates
          </span>
        }
      />

      <IpoReviewQueueClient initialItems={items} />
    </div>
  );
}
