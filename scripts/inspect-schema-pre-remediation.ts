import { createAdminClient } from "../lib/supabase/admin";

async function inspectPreRemediation() {
  const sb = createAdminClient();

  // 1. Live Test IPO Ltd
  const { data: testIpo } = await sb.from("ipos").select("*").eq("id", "f0b3bb96-6d6f-4ca6-a5ca-19e4913c9e33").single();
  console.log("Live Test IPO current record:", {
    id: testIpo?.id,
    name: testIpo?.company_name,
    status: testIpo?.status,
    publication_status: testIpo?.publication_status,
  });

  // 2. Sonaselection
  const { data: sonaIpo } = await sb.from("ipos").select("*").eq("id", "ff4b99f2-a254-42b7-9cea-762b3a300ddb").single();
  const { data: sonaInbox } = await sb.from("ipo_ingestion_inbox").select("*").eq("promoted_ipo_id", "ff4b99f2-a254-42b7-9cea-762b3a300ddb");
  console.log("Sonaselection current record:", {
    id: sonaIpo?.id,
    name: sonaIpo?.company_name,
    issue_size_cr: sonaIpo?.issue_size_cr,
    lot_size: sonaIpo?.lot_size,
    lot_size_status: sonaIpo?.lot_size_status,
    inboxCount: sonaInbox?.length,
  });

  // 3. Veegaland
  const { data: veegaIpo } = await sb.from("ipos").select("*").eq("id", "ed038a2d-f59a-4dce-b91f-675cd5b1b93d").single();
  console.log("Veegaland current record:", {
    id: veegaIpo?.id,
    name: veegaIpo?.company_name,
    issue_size_cr: veegaIpo?.issue_size_cr,
    lot_size: veegaIpo?.lot_size,
  });

  // 4. MV Electrosystems
  const { data: mvIpos } = await sb.from("ipos").select("id, company_name, symbol").ilike("company_name", "%Electrosystems%");
  console.log("MV Electrosystems records:", mvIpos);

  // 5. 14 pending_verification lot size records
  const { data: pendingLots } = await sb.from("ipos").select("id, company_name, lot_size, lot_size_status").eq("lot_size", 1).eq("lot_size_status", "pending_verification");
  console.log("Pending verification lot_size = 1 count:", pendingLots?.length);
  if (pendingLots) {
    console.log("Pending verification IDs:", pendingLots.map(p => ({ id: p.id, name: p.company_name })));
  }

  // 6. Quota check
  const { count: quotaCount } = await sb.from("ipos").select("*", { count: "exact", head: true }).eq("retail_quota_pct", 35);
  console.log("Total rows with retail_quota_pct = 35:", quotaCount);
}

inspectPreRemediation().catch(console.error);
