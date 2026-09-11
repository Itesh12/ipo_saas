/**
 * features/admin/services/dataQualityScannerService.ts
 *
 * Automated anomaly detection engine consuming Phase 2–7 authoritative data.
 * Adheres strictly to the Source-of-Truth invariant: observes and flags exceptions,
 * never recalculates or mutates authoritative business logic.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { AdminWorkQueueService, UpsertWorkItemParams } from "./adminWorkQueueService";

export interface AnomalyScanSummary {
  scannedAt: string;
  detectedCount: number;
  categories: Record<string, number>;
}

export class DataQualityScannerService {
  /**
   * Executes a full platform anomaly scan and synchronizes detected exceptions into the Admin Work Queue.
   */
  public static async runFullScan(): Promise<AnomalyScanSummary> {
    const adminClient = createAdminClient();
    const anomalies: UpsertWorkItemParams[] = [];
    const categories: Record<string, number> = {
      ipo_data_gap: 0,
      stale_market_data: 0,
      application_anomaly: 0,
      allotment_discrepancy: 0,
      finance_reconciliation: 0,
      notification_dead_letter: 0,
    };

    // ------------------------------------------------------------------------
    // 1. IPO DATA COMPLETENESS (Phase 2 & 3)
    // ------------------------------------------------------------------------
    const { data: activeIpos } = await adminClient
      .from("ipos")
      .select("id, symbol, company_name, status, price_band_low, price_band_high, lot_size, issue_size_cr, open_date, close_date, allotment_date")
      .in("status", ["upcoming", "open", "allotment_pending"]);

    if (activeIpos && activeIpos.length > 0) {
      for (const ipo of activeIpos) {
        // Basic details check
        if (!ipo.price_band_low || !ipo.price_band_high || !ipo.lot_size || !ipo.issue_size_cr) {
          anomalies.push({
            fingerprint: `ipo_data_gap:${ipo.id}:missing_pricing`,
            severity: ipo.status === "open" ? "critical" : "high",
            category: "ipo_data_gap",
            entityType: "ipos",
            entityId: ipo.id,
            title: `Incomplete Pricing / Lot Structure for ${ipo.company_name}`,
            description: `Active/Upcoming IPO is missing mandatory pricing bounds, lot size, or total issue size.`,
            metadata: {
              symbol: ipo.symbol,
              status: ipo.status,
              missing_fields: [
                !ipo.price_band_low && "price_band_low",
                !ipo.price_band_high && "price_band_high",
                !ipo.lot_size && "lot_size",
                !ipo.issue_size_cr && "issue_size_cr",
              ].filter(Boolean),
            },
          });
          categories.ipo_data_gap++;
        }

        // Prospectus document check
        const { count: docCount } = await adminClient
          .from("ipo_documents")
          .select("id", { count: "exact", head: true })
          .eq("ipo_id", ipo.id)
          .in("document_type", ["rhp", "drhp", "prospectus"]);

        if (!docCount || docCount === 0) {
          anomalies.push({
            fingerprint: `ipo_data_gap:${ipo.id}:missing_prospectus`,
            severity: ipo.status === "open" ? "high" : "medium",
            category: "ipo_data_gap",
            entityType: "ipos",
            entityId: ipo.id,
            title: `Missing Official Prospectus for ${ipo.company_name}`,
            description: `IPO status is ${ipo.status} but no official DRHP/RHP filing document is attached.`,
            metadata: { symbol: ipo.symbol, status: ipo.status },
          });
          categories.ipo_data_gap++;
        }

        // ------------------------------------------------------------------------
        // 2. STALE MARKET DATA (Phase 3 Authoritative Timestamps)
        // ------------------------------------------------------------------------
        if (ipo.status === "open") {
          // Check GMP freshness: observed_at within last 24h
          const { data: latestGmp } = await adminClient
            .from("ipo_gmp_entries")
            .select("id, observed_at, gmp_value")
            .eq("ipo_id", ipo.id)
            .order("observed_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          const now = Date.now();
          const oneDayMs = 24 * 60 * 60 * 1000;

          if (!latestGmp || now - new Date(latestGmp.observed_at).getTime() > oneDayMs) {
            anomalies.push({
              fingerprint: `stale_market_data:${ipo.id}:stale_gmp`,
              severity: "high",
              category: "stale_market_data",
              entityType: "ipos",
              entityId: ipo.id,
              title: `Stale Grey Market Premium (GMP) for ${ipo.company_name}`,
              description: `Bidding is active, but the latest recorded GMP observation is older than 24 hours.`,
              metadata: {
                symbol: ipo.symbol,
                last_observed_at: latestGmp?.observed_at || "NEVER",
                age_hours: latestGmp ? Math.round((now - new Date(latestGmp.observed_at).getTime()) / 3600000) : null,
              },
            });
            categories.stale_market_data++;
          }

          // Check Subscription snapshot freshness
          const { data: latestSub } = await adminClient
            .from("ipo_subscription_snapshots")
            .select("id, snapshot_time, overall_x")
            .eq("ipo_id", ipo.id)
            .order("snapshot_time", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (!latestSub || now - new Date(latestSub.snapshot_time).getTime() > oneDayMs) {
            anomalies.push({
              fingerprint: `stale_market_data:${ipo.id}:stale_subscription`,
              severity: "medium",
              category: "stale_market_data",
              entityType: "ipos",
              entityId: ipo.id,
              title: `Stale Subscription Figures for ${ipo.company_name}`,
              description: `Bidding is open, but cumulative bidding demand snapshot has not updated in >24 hours.`,
              metadata: {
                symbol: ipo.symbol,
                last_snapshot_at: latestSub?.snapshot_time || "NEVER",
              },
            });
            categories.stale_market_data++;
          }
        }
      }
    }

    // ------------------------------------------------------------------------
    // 3. APPLICATION & MANDATE ANOMALIES (Phase 4 Event Semantics)
    // ------------------------------------------------------------------------
    // Stalled Mandate Pending > 48h
    const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const { data: stalledMandates } = await adminClient
      .from("ipo_applications")
      .select("id, user_id, ipo_id, created_at, status")
      .eq("status", "mandate_pending")
      .lte("created_at", twoDaysAgo)
      .limit(20);

    if (stalledMandates && stalledMandates.length > 0) {
      for (const app of stalledMandates) {
        anomalies.push({
          fingerprint: `application_anomaly:${app.id}:stalled_mandate`,
          severity: "high",
          category: "application_anomaly",
          entityType: "ipo_applications",
          entityId: app.id,
          title: `Application Mandate Stalled > 48 Hours`,
          description: `Investor application is stuck in mandate_pending beyond UPI window threshold.`,
          metadata: {
            application_id: app.id,
            user_id: app.id,
            created_at: app.created_at,
          },
        });
        categories.application_anomaly++;
      }
    }

    // ------------------------------------------------------------------------
    // 4. FINANCIAL LEDGER INVARIANTS (Phase 5 Double-Entry Invariants)
    // ------------------------------------------------------------------------
    // Stale draft journals older than 24h
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: staleDrafts } = await adminClient
      .from("journal_entries")
      .select("id, entry_number, user_id, created_at")
      .eq("status", "draft")
      .lte("created_at", oneDayAgo)
      .limit(10);

    if (staleDrafts && staleDrafts.length > 0) {
      for (const je of staleDrafts) {
        anomalies.push({
          fingerprint: `finance_reconciliation:${je.id}:stale_draft_journal`,
          severity: "medium",
          category: "finance_reconciliation",
          entityType: "journal_entries",
          entityId: je.id,
          title: `Unposted Draft Journal Entry ${je.entry_number || je.id}`,
          description: `General ledger journal entry has remained unposted in draft state for over 24 hours.`,
          metadata: { entry_id: je.id, created_at: je.created_at },
        });
        categories.finance_reconciliation++;
      }
    }

    // Negative position invariant check
    const { data: negativePositions } = await adminClient
      .from("portfolio_positions")
      .select("id, user_id, security_id, quantity")
      .lt("quantity", 0)
      .limit(10);

    if (negativePositions && negativePositions.length > 0) {
      for (const pos of negativePositions) {
        anomalies.push({
          fingerprint: `finance_reconciliation:${pos.id}:negative_position`,
          severity: "critical",
          category: "finance_reconciliation",
          entityType: "portfolio_positions",
          entityId: pos.id,
          title: `Negative Quantity in Portfolio Position`,
          description: `Position invariant violation: quantity is negative (${pos.quantity}), indicating missing allotment or incorrect disposal.`,
          metadata: { position_id: pos.id, quantity: pos.quantity },
        });
        categories.finance_reconciliation++;
      }
    }

    // ------------------------------------------------------------------------
    // 5. NOTIFICATION PROCESSING HEALTH (Phase 7B Dead Letters)
    // ------------------------------------------------------------------------
    const { data: deadLetterEvents } = await adminClient
      .from("notification_events")
      .select("id, event_type, aggregate_type, aggregate_id, attempt_count, last_error")
      .eq("status", "dead_letter")
      .limit(10);

    if (deadLetterEvents && deadLetterEvents.length > 0) {
      for (const ev of deadLetterEvents) {
        anomalies.push({
          fingerprint: `notification_dead_letter:${ev.id}:exhausted_retries`,
          severity: "high",
          category: "notification_dead_letter",
          entityType: "notification_events",
          entityId: ev.id,
          title: `Notification Event Dead-Letter: ${ev.event_type}`,
          description: `Background notification processor exhausted retries (${ev.attempt_count}). Human inspection required.`,
          metadata: {
            event_id: ev.id,
            event_type: ev.event_type,
            aggregate_type: ev.aggregate_type,
            aggregate_id: ev.aggregate_id,
            last_error: ev.last_error?.slice(0, 200) || "Unknown error",
          },
        });
        categories.notification_dead_letter++;
      }
    }

    // ------------------------------------------------------------------------
    // SYNCHRONIZE DETECTED ANOMALIES INTO ADMIN WORK QUEUE
    // ------------------------------------------------------------------------
    for (const anomaly of anomalies) {
      try {
        await AdminWorkQueueService.upsertActiveWorkItem(anomaly);
      } catch (err) {
        console.error("Failed to upsert anomaly work item:", anomaly.fingerprint, err);
      }
    }

    return {
      scannedAt: new Date().toISOString(),
      detectedCount: anomalies.length,
      categories,
    };
  }
}
