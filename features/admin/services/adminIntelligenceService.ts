/**
 * features/admin/services/adminIntelligenceService.ts
 *
 * Consumes global administrative intelligence and operational metrics
 * through controlled SECURITY DEFINER database gateways.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import {
  IpoDataQualityItem,
  IpoPipelineOverview,
  SystemHealthMetrics,
} from "../types/intelligence.types";

export class AdminIntelligenceService {
  /**
   * Fetches global platform operational metrics via the controlled RPC.
   */
  public static async getSystemHealth(): Promise<SystemHealthMetrics> {
    const adminClient = createAdminClient();
    const { data, error } = await adminClient.rpc("get_admin_system_health");

    if (error) {
      console.error("Failed to fetch system health:", error);
      throw new Error(`Failed to fetch system health: ${error.message}`);
    }

    return data as SystemHealthMetrics;
  }

  /**
   * Fetches structural data quality and completeness scorecards for all IPOs.
   */
  public static async getIpoDataQualityReport(): Promise<IpoDataQualityItem[]> {
    const adminClient = createAdminClient();
    const { data, error } = await adminClient.rpc("get_ipo_data_quality_report");

    if (error) {
      console.error("Failed to fetch IPO data quality report:", error);
      throw new Error(`Failed to fetch data quality report: ${error.message}`);
    }

    return (data || []) as IpoDataQualityItem[];
  }

  /**
   * Aggregates IPO issues across their lifecycle pipeline stages.
   */
  public static async getIpoPipelineOverview(): Promise<IpoPipelineOverview> {
    const adminClient = createAdminClient();
    const { data, error } = await adminClient
      .from("ipos")
      .select("status");

    if (error) {
      console.error("Failed to fetch IPO pipeline overview:", error);
      throw new Error(`Failed to fetch IPO pipeline: ${error.message}`);
    }

    const counts: IpoPipelineOverview = {
      total_ipos: data?.length || 0,
      announced: 0,
      upcoming: 0,
      open: 0,
      closed: 0,
      allotment_pending: 0,
      listing_soon: 0,
      listed: 0,
    };

    if (data) {
      for (const row of data) {
        const s = row.status as keyof Omit<IpoPipelineOverview, "total_ipos">;
        if (s in counts) {
          counts[s]++;
        }
      }
    }

    return counts;
  }
}
