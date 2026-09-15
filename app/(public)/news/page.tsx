import React from "react";
import { Metadata } from "next";
import { PageHeader } from "@/components/ui/PageHeader";
import { NewsHubClient, NewsHubItem } from "@/components/news/NewsHubClient";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "IPO News & Regulatory Circulars | IPO OS",
  description:
    "Live SEBI regulatory circulars, BSE/NSE corporate notices, price band revisions, and verified capital markets intelligence.",
};

export const revalidate = 60; // ISR cache revalidation every 60 seconds

export default async function NewsPage() {
  const supabase = await createClient();

  // Fetch verified news items ordered by publication timestamp
  const { data: rawNews } = await supabase
    .from("ipo_news")
    .select(`
      id,
      ipo_id,
      headline,
      summary,
      source,
      source_url,
      sentiment,
      published_at,
      category,
      authoritativeness,
      verification_status,
      is_price_sensitive,
      structured_event_type,
      story_cluster_id,
      publisher_id,
      ipos (
        company_name,
        symbol,
        slug
      )
    `)
    .order("published_at", { ascending: false })
    .limit(100);

  // Cast properly
  const initialNews: NewsHubItem[] = ((rawNews as unknown) as NewsHubItem[]) || [];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <PageHeader
        title="IPO News & Market Circulars"
        description="SEBI regulatory circulars, exchange updates (NSE/BSE), DRHP/RHP filings, and licensed market commentary."
      />

      <NewsHubClient initialNews={initialNews} />
    </div>
  );
}
