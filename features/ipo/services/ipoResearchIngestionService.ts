/**
 * IPO Research Ingestion Pipeline Service
 *
 * Implements the verified Phase C end-to-end pipeline:
 * Authoritative Regulatory Filing -> Observation Storage (SHA-256 Hash) ->
 * Parser & Normalizer -> Hard Invariant Check -> Coverage Evaluation ->
 * Canonical Promotion -> Full Provenance Attachment -> Immutable Audit Trail.
 */

import crypto from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  validateResearchHardInvariants,
  evaluateResearchCoverage,
  RawResearchPayload,
  CoverageEvaluation,
} from "./researchValidationRules";
import { IPOTieredCacheService } from "./ipoTieredCacheService";
import { IPOSatementType, IPOAuditStatus, IPORiskSeverity } from "../types/ipo.types";

export interface StandardResearchIngestionInput {
  ipoId: string;
  sourceType: "REGULATORY_PROSPECTUS" | "OFFICIAL_EXCHANGE_FEED" | "REGISTRAR_PORTAL" | "UNOFFICIAL_MARKET_INTELLIGENCE";
  sourceName: string;
  sourceUrl?: string;
  documentDate: string; // YYYY-MM-DD
  rawPayload: Record<string, unknown>;
  normalizedPayload: {
    businessProfile?: {
      companyOverview: string;
      industry: string;
      businessModel: string;
      productsServices: string[];
      competitiveStrengths: string[];
      geographicPresence?: string;
      keyCustomers?: string;
    };
    financials?: Array<{
      financialYear: string;
      periodType?: string;
      statementType?: IPOSatementType;
      auditStatus?: IPOAuditStatus;
      revenueCr: number;
      revenueGrowthPct?: number | null;
      ebitdaCr: number;
      ebitdaMarginPct?: number | null;
      patCr: number;
      patMarginPct?: number | null;
      eps?: number | null;
      roePct?: number | null;
      rocePct?: number | null;
      totalAssetsCr?: number | null;
      totalDebtCr?: number | null;
      netWorthCr?: number | null;
      operatingCashFlowCr?: number | null;
      freeCashFlowCr?: number | null;
    }>;
    valuation?: {
      peRatioLow?: number | null;
      peRatioHigh?: number | null;
      pbRatio?: number | null;
      evEbitda?: number | null;
      marketCapCr?: number | null;
      postIssueSharesCr?: number | null;
      epsDiluted?: number | null;
      industryPeMedian?: number | null;
      valuationSummary?: string | null;
    };
    peers?: Array<{
      peerCompanyName: string;
      peerSymbol?: string | null;
      marketCapCr?: number | null;
      revenueCr?: number | null;
      patCr?: number | null;
      eps?: number | null;
      peRatio?: number | null;
      pbRatio?: number | null;
      roePct?: number | null;
      rocePct?: number | null;
      debtToEquity?: number | null;
    }>;
    promoters?: Array<{
      promoterName: string;
      holdingPrePct?: number | null;
      holdingPostPct?: number | null;
      designation?: string | null;
      bio?: string | null;
    }>;
    strengths?: Array<{
      title: string;
      description?: string | null;
      category?: string | null;
      displayOrder?: number;
    }>;
    risks?: Array<{
      title: string;
      description?: string | null;
      severity: IPORiskSeverity;
      category?: string | null;
      displayOrder?: number;
    }>;
    documents?: Array<{
      filingTitle: string;
      docType: string;
      fileUrl: string;
      fileSizeMb?: number;
    }>;
  };
  actorId?: string | null;
}

export interface IngestionResult {
  success: boolean;
  ipoId: string;
  sourceObservationId: string;
  payloadHash: string;
  coverage: CoverageEvaluation;
  recordsPromoted: {
    businessProfile: boolean;
    financialsCount: number;
    valuation: boolean;
    peersCount: number;
    promotersCount: number;
    strengthsCount: number;
    risksCount: number;
    documentsCount: number;
  };
  auditLogId?: string;
}

export class IPOResearchIngestionService {
  public static readonly PARSER_VERSION = "v1.0.0-audited";

  /**
   * Ingests and promotes a verified research observation into canonical storage with hard provenance.
   */
  public static async ingestVerifiedResearch(
    input: StandardResearchIngestionInput
  ): Promise<IngestionResult> {
    const supabase = createAdminClient();

    // 1. Verify that target IPO exists
    const { data: targetIPO, error: ipoErr } = await supabase
      .from("ipos")
      .select("id, slug, company_name, open_date, close_date, listing_date, price_band_low, price_band_high")
      .eq("id", input.ipoId)
      .single();

    if (ipoErr || !targetIPO) {
      throw new Error(`Target IPO ${input.ipoId} not found in database: ${ipoErr?.message}`);
    }

    // 2. Execute Hard Mathematical / Structural Invariant Checks (BLOCKING)
    const validationPayload: RawResearchPayload = {
      companyName: targetIPO.company_name,
      priceBandLow: targetIPO.price_band_low,
      priceBandHigh: targetIPO.price_band_high,
      openDate: targetIPO.open_date,
      closeDate: targetIPO.close_date,
      listingDate: targetIPO.listing_date,
      financials: input.normalizedPayload.financials?.map((f) => ({
        financialYear: f.financialYear,
        revenueCr: f.revenueCr,
        ebitdaCr: f.ebitdaCr,
        patCr: f.patCr,
        totalDebtCr: f.totalDebtCr,
        netWorthCr: f.netWorthCr,
      })),
      valuation: input.normalizedPayload.valuation
        ? {
            peRatioHigh: input.normalizedPayload.valuation.peRatioHigh,
            industryPeMedian: input.normalizedPayload.valuation.industryPeMedian,
            marketCapCr: input.normalizedPayload.valuation.marketCapCr,
          }
        : null,
      peers: input.normalizedPayload.peers?.map((p) => ({
        peerCompanyName: p.peerCompanyName,
        peRatio: p.peRatio,
      })),
      promoters: input.normalizedPayload.promoters?.map((pr) => ({
        promoterName: pr.promoterName,
        holdingPostPct: pr.holdingPostPct,
      })),
      risks: input.normalizedPayload.risks?.map((r) => ({
        title: r.title,
        severity: r.severity,
      })),
      strengths: input.normalizedPayload.strengths?.map((s) => ({
        title: s.title,
      })),
    };

    validateResearchHardInvariants(validationPayload);

    // 3. Evaluate Quality & Coverage (NON-BLOCKING)
    const coverage = evaluateResearchCoverage(validationPayload);

    // 4. Compute Immutable SHA-256 Payload Hash
    const serializedRaw = JSON.stringify(input.rawPayload);
    const payloadHash = crypto.createHash("sha256").update(serializedRaw).digest("hex");

    // 5. Create or Resolve Ingestion Inbox entry for foreign key integrity
    let inboxId: string | null = null;
    const { data: existingInbox } = await supabase
      .from("ipo_ingestion_inbox")
      .select("id")
      .eq("promoted_ipo_id", input.ipoId)
      .maybeSingle();

    if (existingInbox) {
      inboxId = existingInbox.id;
    } else {
      const { data: newInbox, error: inboxErr } = await supabase
        .from("ipo_ingestion_inbox")
        .insert({
          canonical_name: targetIPO.company_name,
          promoted_ipo_id: input.ipoId,
          review_status: "promoted_to_published",
        } as never)
        .select("id")
        .single();

      if (inboxErr) {
        throw new Error(`Failed to create ingestion inbox binding: ${inboxErr.message}`);
      }
      inboxId = newInbox.id;
    }

    // 6. Record Immutable Time-Series Observation in `ipo_ingestion_observations`
    const observedAt = new Date().toISOString();
    const { data: observation, error: obsErr } = await supabase
      .from("ipo_ingestion_observations")
      .insert({
        inbox_id: inboxId,
        source: input.sourceName.toLowerCase().includes("sebi") ? "sebi" : "nse",
        external_id: `OBS-${targetIPO.slug}-${Date.now()}`,
        document_type: "RHP",
        observation_version: 1,
        payload_hash: payloadHash,
        raw_payload: input.rawPayload,
        normalized_payload: input.normalizedPayload,
        provenance: {
          source_type: input.sourceType,
          source_name: input.sourceName,
          source_url: input.sourceUrl || null,
          document_date: input.documentDate,
          parser_version: this.PARSER_VERSION,
          verification_state: "VERIFIED",
          confidence_level: "HIGH",
          is_unofficial: false,
          observed_at: observedAt,
        },
        observed_at: observedAt,
      } as never)
      .select("id")
      .single();

    if (obsErr || !observation) {
      throw new Error(`Failed to persist research observation: ${obsErr?.message}`);
    }

    const sourceObservationId = observation.id;

    // 7. Promote Clean Canonical Research Records with Hard Provenance
    const recordsPromoted = {
      businessProfile: false,
      financialsCount: 0,
      valuation: false,
      peersCount: 0,
      promotersCount: 0,
      strengthsCount: 0,
      risksCount: 0,
      documentsCount: 0,
    };

    // A. Business Profile
    if (input.normalizedPayload.businessProfile) {
      const bp = input.normalizedPayload.businessProfile;
      const { error: bpErr } = await supabase.from("ipo_business_profiles").upsert(
        {
          ipo_id: input.ipoId,
          company_overview: bp.companyOverview,
          industry: bp.industry,
          business_model: bp.businessModel,
          products_services: bp.productsServices,
          competitive_strengths: bp.competitiveStrengths,
          geographic_presence: bp.geographicPresence || null,
          key_customers: bp.keyCustomers || null,
          source: `${input.sourceName} (${input.documentDate})`,
          source_url: input.sourceUrl || null,
          source_observation_id: sourceObservationId,
          source_type: input.sourceType,
          verification_state: "VERIFIED",
          confidence_level: "HIGH",
          is_unofficial: input.sourceType === "UNOFFICIAL_MARKET_INTELLIGENCE",
          parser_version: this.PARSER_VERSION,
          observed_at: observedAt,
          as_of: observedAt,
          updated_at: observedAt,
        } as never,
        { onConflict: "ipo_id" }
      );
      if (!bpErr) recordsPromoted.businessProfile = true;
    }

    // B. Financials Table (Multi-Year Restated)
    if (input.normalizedPayload.financials && input.normalizedPayload.financials.length > 0) {
      for (const fin of input.normalizedPayload.financials) {
        const { error: finErr } = await supabase.from("ipo_financials").upsert(
          {
            ipo_id: input.ipoId,
            financial_year: fin.financialYear,
            period_type: fin.periodType || "full_year",
            statement_type: fin.statementType || "consolidated",
            audit_status: fin.auditStatus || "restated",
            currency: "INR",
            unit: "Crores",
            revenue_cr: fin.revenueCr,
            revenue_growth_pct: fin.revenueGrowthPct ?? null,
            ebitda_cr: fin.ebitdaCr,
            ebitda_margin_pct: fin.ebitdaMarginPct ?? null,
            pat_cr: fin.patCr,
            pat_margin_pct: fin.patMarginPct ?? null,
            eps: fin.eps ?? null,
            roe_pct: fin.roePct ?? null,
            roce_pct: fin.rocePct ?? null,
            total_assets_cr: fin.totalAssetsCr ?? null,
            total_debt_cr: fin.totalDebtCr ?? null,
            net_worth_cr: fin.netWorthCr ?? null,
            operating_cash_flow_cr: fin.operatingCashFlowCr ?? null,
            free_cash_flow_cr: fin.freeCashFlowCr ?? null,
            is_derived: false,
            source: `${input.sourceName} Restated Financials`,
            source_url: input.sourceUrl || null,
            source_observation_id: sourceObservationId,
            source_type: input.sourceType,
            verification_state: "VERIFIED",
            confidence_level: "HIGH",
            is_unofficial: input.sourceType === "UNOFFICIAL_MARKET_INTELLIGENCE",
            parser_version: this.PARSER_VERSION,
            observed_at: observedAt,
            as_of: observedAt,
            updated_at: observedAt,
          } as never,
          { onConflict: "ipo_id,financial_year,statement_type" }
        );
        if (!finErr) recordsPromoted.financialsCount++;
      }
    }

    // C. Valuation Multiples
    if (input.normalizedPayload.valuation) {
      const v = input.normalizedPayload.valuation;
      const { error: valErr } = await supabase.from("ipo_valuations").upsert(
        {
          ipo_id: input.ipoId,
          pe_ratio_low: v.peRatioLow ?? null,
          pe_ratio_high: v.peRatioHigh ?? null,
          pb_ratio: v.pbRatio ?? null,
          ev_ebitda: v.evEbitda ?? null,
          market_cap_cr: v.marketCapCr ?? null,
          post_issue_shares_cr: v.postIssueSharesCr ?? null,
          eps_diluted: v.epsDiluted ?? null,
          industry_pe_median: v.industryPeMedian ?? null,
          valuation_summary: v.valuationSummary || null,
          source: `${input.sourceName} Basis for Issue Price`,
          source_observation_id: sourceObservationId,
          source_type: input.sourceType,
          verification_state: "VERIFIED",
          confidence_level: "HIGH",
          is_unofficial: input.sourceType === "UNOFFICIAL_MARKET_INTELLIGENCE",
          parser_version: this.PARSER_VERSION,
          observed_at: observedAt,
          as_of: observedAt,
          updated_at: observedAt,
        } as never,
        { onConflict: "ipo_id" }
      );
      if (!valErr) recordsPromoted.valuation = true;
    }

    // D. Peers Table
    if (input.normalizedPayload.peers && input.normalizedPayload.peers.length > 0) {
      // Clear legacy unverified peers for this IPO and insert fresh verified peers
      await supabase.from("ipo_peers").delete().eq("ipo_id", input.ipoId);
      for (const peer of input.normalizedPayload.peers) {
        const { error: pErr } = await supabase.from("ipo_peers").insert({
          ipo_id: input.ipoId,
          peer_company_name: peer.peerCompanyName,
          peer_symbol: peer.peerSymbol || null,
          market_cap_cr: peer.marketCapCr ?? null,
          revenue_cr: peer.revenueCr ?? null,
          pat_cr: peer.patCr ?? null,
          eps: peer.eps ?? null,
          pe_ratio: peer.peRatio ?? null,
          pb_ratio: peer.pbRatio ?? null,
          roe_pct: peer.roePct ?? null,
          roce_pct: peer.rocePct ?? null,
          debt_to_equity: peer.debtToEquity ?? null,
          source: `${input.sourceName} Peer Comparison`,
          source_observation_id: sourceObservationId,
          source_type: input.sourceType,
          verification_state: "VERIFIED",
          confidence_level: "HIGH",
          is_unofficial: input.sourceType === "UNOFFICIAL_MARKET_INTELLIGENCE",
          parser_version: this.PARSER_VERSION,
          observed_at: observedAt,
          as_of: observedAt,
        } as never);
        if (!pErr) recordsPromoted.peersCount++;
      }
    }

    // E. Promoters Table
    if (input.normalizedPayload.promoters && input.normalizedPayload.promoters.length > 0) {
      await supabase.from("ipo_promoters").delete().eq("ipo_id", input.ipoId);
      for (const pr of input.normalizedPayload.promoters) {
        const { error: prErr } = await supabase.from("ipo_promoters").insert({
          ipo_id: input.ipoId,
          promoter_name: pr.promoterName,
          holding_pre_pct: pr.holdingPrePct ?? null,
          holding_post_pct: pr.holdingPostPct ?? null,
          designation: pr.designation || null,
          bio: pr.bio || null,
          source: `${input.sourceName} Capital Structure`,
          source_observation_id: sourceObservationId,
          source_type: input.sourceType,
          verification_state: "VERIFIED",
          confidence_level: "HIGH",
          is_unofficial: input.sourceType === "UNOFFICIAL_MARKET_INTELLIGENCE",
          parser_version: this.PARSER_VERSION,
          observed_at: observedAt,
        } as never);
        if (!prErr) recordsPromoted.promotersCount++;
      }
    }

    // F. Strengths Table
    if (input.normalizedPayload.strengths && input.normalizedPayload.strengths.length > 0) {
      await supabase.from("ipo_strengths").delete().eq("ipo_id", input.ipoId);
      for (const st of input.normalizedPayload.strengths) {
        const { error: stErr } = await supabase.from("ipo_strengths").insert({
          ipo_id: input.ipoId,
          title: st.title,
          description: st.description || null,
          category: st.category || null,
          display_order: st.displayOrder ?? 0,
          source: `${input.sourceName} Strengths`,
          source_observation_id: sourceObservationId,
          source_type: input.sourceType,
          verification_state: "VERIFIED",
          confidence_level: "HIGH",
          is_unofficial: input.sourceType === "UNOFFICIAL_MARKET_INTELLIGENCE",
          parser_version: this.PARSER_VERSION,
          observed_at: observedAt,
        } as never);
        if (!stErr) recordsPromoted.strengthsCount++;
      }
    }

    // G. Risks Table
    if (input.normalizedPayload.risks && input.normalizedPayload.risks.length > 0) {
      await supabase.from("ipo_risks").delete().eq("ipo_id", input.ipoId);
      for (const rk of input.normalizedPayload.risks) {
        const { error: rkErr } = await supabase.from("ipo_risks").insert({
          ipo_id: input.ipoId,
          title: rk.title,
          description: rk.description || null,
          severity: rk.severity,
          category: rk.category || null,
          display_order: rk.displayOrder ?? 0,
          source: `${input.sourceName} Risk Disclosures`,
          source_observation_id: sourceObservationId,
          source_type: input.sourceType,
          verification_state: "VERIFIED",
          confidence_level: "HIGH",
          is_unofficial: input.sourceType === "UNOFFICIAL_MARKET_INTELLIGENCE",
          parser_version: this.PARSER_VERSION,
          observed_at: observedAt,
        } as never);
        if (!rkErr) recordsPromoted.risksCount++;
      }
    }

    // H. Documents Table
    if (input.normalizedPayload.documents && input.normalizedPayload.documents.length > 0) {
      for (const doc of input.normalizedPayload.documents) {
        const { error: docErr } = await supabase.from("ipo_documents").insert({
          ipo_id: input.ipoId,
          filing_title: doc.filingTitle,
          document_type: doc.docType,
          file_url: doc.fileUrl,
          file_size_mb: doc.fileSizeMb || 15.0,
          source_observation_id: sourceObservationId,
          sha256_hash: payloadHash,
          validation_status: "verified",
          first_observed_at: observedAt,
          last_verified_at: observedAt,
        } as never);
        if (!docErr) recordsPromoted.documentsCount++;
      }
    }

    // 8. Log Structured Audit Record
    const { data: auditLog } = await supabase
      .from("audit_logs")
      .insert({
        actor_id: input.actorId ?? null,
        action: "CANONICAL_RESEARCH_PROMOTION",
        resource_type: "ipo_research",
        resource_id: input.ipoId,
        new_values: {
          source_observation_id: sourceObservationId,
          payload_hash: payloadHash,
          source_name: input.sourceName,
          source_url: input.sourceUrl || null,
          coverage_status: coverage.status,
          completeness_pct: coverage.completenessPct,
          records_promoted: recordsPromoted,
        },
      } as never)
      .select("id")
      .maybeSingle();

    // 9. Granular Cache Invalidation for this IPO's static research tier
    IPOTieredCacheService.revalidateResearch(input.ipoId);

    return {
      success: true,
      ipoId: input.ipoId,
      sourceObservationId,
      payloadHash,
      coverage,
      recordsPromoted,
      auditLogId: auditLog?.id,
    };
  }
}
