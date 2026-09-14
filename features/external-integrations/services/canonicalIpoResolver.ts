/**
 * features/external-integrations/services/canonicalIpoResolver.ts
 *
 * Phase 9 Stage 3A: Canonical IPO Resolver & Conflict Detection Engine.
 * Reconciles multi-source observations (SEBI, NSE, BSE, Upstox), resolves identity,
 * detects discrepancies, and applies field-level authority precedence.
 */

import {
  IngestionExtractionResult,
  NormalizedIpoMasterPayload,
  IpoProvenanceMap,
  IngestionConflictDetail,
  FreshnessGrade,
  RecordFreshnessMeta,
} from '../ipo-master/ipoMasterTypes';
import { deriveExplainableIPOStatus, LifecycleDerivationResult } from '@/features/ipo/services/ipoLifecycle';

export interface ResolutionOutcome {
  canonical_name: string;
  symbol: string | null;
  isin: string | null;
  has_conflict: boolean;
  conflict_details: IngestionConflictDetail[];
  resolved_payload: NormalizedIpoMasterPayload;
  resolved_provenance: IpoProvenanceMap;
  lifecycle: LifecycleDerivationResult;
  freshness: RecordFreshnessMeta;
}

export class CanonicalIpoResolver {
  /**
   * Evaluates identity match between an incoming extraction and an existing canonical inbox candidate.
   * Checks ISIN first, then trading symbol, then cleaned company name similarity.
   */
  public static isIdentityMatch(
    incoming: NormalizedIpoMasterPayload,
    existing: { canonical_name: string; symbol?: string | null; isin?: string | null }
  ): boolean {
    // Contradiction Guard: If both have ISIN and they differ, NEVER match
    if (incoming.isin && existing.isin && incoming.isin.toUpperCase() !== existing.isin.toUpperCase()) {
      return false;
    }

    // Contradiction Guard: If both have Symbol and they differ, NEVER match
    if (incoming.symbol && existing.symbol && incoming.symbol.toUpperCase() !== existing.symbol.toUpperCase()) {
      return false;
    }

    // 1. ISIN exact match (12-char global identifier)
    if (incoming.isin && existing.isin && incoming.isin.toUpperCase() === existing.isin.toUpperCase()) {
      return true;
    }

    // 2. Trading symbol exact match
    if (incoming.symbol && existing.symbol && incoming.symbol.toUpperCase() === existing.symbol.toUpperCase()) {
      return true;
    }

    // 3. Cleaned Company Name similarity (only evaluated if no contradictory identifier)
    const cleanIncoming = this.sanitizeCompanyName(incoming.company_name);
    const cleanExisting = this.sanitizeCompanyName(existing.canonical_name);

    if (cleanIncoming === cleanExisting) return true;

    // Substring or high similarity
    if (cleanIncoming.includes(cleanExisting) || cleanExisting.includes(cleanIncoming)) {
      return true;
    }

    return this.calculateSimilarity(cleanIncoming, cleanExisting) >= 0.85;
  }

  /**
   * Merges an incoming observation into existing normalized payload using field-level authority.
   * Guardrail 2: Freezes and flags for admin review when two Tier-1 sources conflict.
   */
  public static resolveObservation(
    existingPayload: NormalizedIpoMasterPayload,
    existingProvenance: IpoProvenanceMap,
    incoming: IngestionExtractionResult,
    options?: { nowIST?: string }
  ): ResolutionOutcome {
    const resolved: NormalizedIpoMasterPayload = { ...existingPayload };
    const resolvedProvenance: IpoProvenanceMap = { ...existingProvenance };
    const conflicts: IngestionConflictDetail[] = [];

    const incomingPayload = incoming.normalized_payload;
    const incomingProv = incoming.provenance;
    const incomingSource = incoming.source;

    // Iterate through incoming fields
    for (const key of Object.keys(incomingPayload) as Array<keyof NormalizedIpoMasterPayload>) {
      const incVal = incomingPayload[key];
      if (incVal === undefined || incVal === null) continue;

      const exVal = existingPayload[key];
      const exProv = existingProvenance[key];
      const exSource = exProv ? exProv.source : existingProvenance.company_name?.source;

      // If field is currently empty, adopt incoming value
      if (exVal === undefined || exVal === null) {
        (resolved as unknown as Record<string, unknown>)[key] = incVal;
        if (incomingProv[key]) {
          (resolvedProvenance as unknown as Record<string, unknown>)[key] = incomingProv[key];
        }
        continue;
      }

      // If values match, no conflict
      if (JSON.stringify(exVal) === JSON.stringify(incVal)) {
        continue;
      }

      // If incoming is from the SAME source, it is a chronological amendment/version update, not an inter-source conflict
      if (incomingSource === exSource) {
        (resolved as unknown as Record<string, unknown>)[key] = incVal;
        if (incomingProv[key]) {
          (resolvedProvenance as unknown as Record<string, unknown>)[key] = incomingProv[key];
        }
        continue;
      }

      // Cross-source discrepancy detected! Apply field-specific authority rules with Tier-1 Conflict Freeze
      const { shouldOverride, rule } = this.evaluateFieldAuthority(key, incomingSource, exSource);

      const conflict: IngestionConflictDetail = {
        field: key,
        existing_value: exVal,
        existing_source: exSource || 'sebi',
        incoming_value: incVal,
        incoming_source: incomingSource,
        resolved_value: shouldOverride ? incVal : exVal,
        resolution_rule: rule,
      };

      conflicts.push(conflict);

      if (shouldOverride) {
        (resolved as unknown as Record<string, unknown>)[key] = incVal;
        if (incomingProv[key]) {
          (resolvedProvenance as unknown as Record<string, unknown>)[key] = incomingProv[key];
        }
      }
    }

    // Derive deterministic, explainable business lifecycle
    const lifecycle = deriveExplainableIPOStatus({
      open_date: resolved.open_date,
      close_date: resolved.close_date,
      allotment_date: resolved.allotment_date,
      listing_date: resolved.listing_date,
      status: resolved.business_status,
      nowIST: options?.nowIST,
    });
    resolved.business_status = lifecycle.finalStatus as NormalizedIpoMasterPayload['business_status'];

    // Calculate freshness
    const latestObsTime = incomingProv.company_name?.observed_at || new Date().toISOString();
    const freshnessGrade = this.calculateFreshness(latestObsTime);
    const freshness: RecordFreshnessMeta = {
      last_observed_at: latestObsTime,
      last_authoritative_observed_at: latestObsTime,
      data_freshness: freshnessGrade,
      field_freshness: {
        price_band: freshnessGrade,
        dates: freshnessGrade,
        listing_status: freshnessGrade,
      },
      source_health: 'healthy',
    };

    return {
      canonical_name: resolved.company_name,
      symbol: resolved.symbol || null,
      isin: resolved.isin || null,
      has_conflict: conflicts.length > 0,
      conflict_details: conflicts,
      resolved_payload: resolved,
      resolved_provenance: resolvedProvenance,
      lifecycle,
      freshness,
    };
  }

  private static isTier1Source(source?: string): boolean {
    return source === 'sebi' || source === 'nse' || source === 'bse';
  }

  /**
   * Field-level authority precedence evaluation.
   * Guardrail 2: If both sources are Tier-1 and conflict, DO NOT AUTO-OVERWRITE.
   */
  public static evaluateFieldAuthority(
    field: keyof NormalizedIpoMasterPayload,
    incomingSource: string,
    existingSource?: string
  ): { shouldOverride: boolean; rule: string; isTier1Conflict: boolean } {
    if (!existingSource) {
      return { shouldOverride: true, rule: 'initial_value_adopted', isTier1Conflict: false };
    }

    const incomingIsTier1 = this.isTier1Source(incomingSource);
    const existingIsTier1 = this.isTier1Source(existingSource);

    // Guardrail 2: Tier-1 vs Tier-1 Conflict Freeze
    if (incomingIsTier1 && existingIsTier1 && incomingSource !== existingSource) {
      return {
        shouldOverride: false,
        rule: `TIER1_CONFLICT_FROZEN: Disagreement between ${existingSource} and ${incomingSource} on ${field} requires administrator review`,
        isTier1Conflict: true,
      };
    }

    // 1. Legal Name and Regulatory Offer Documents: SEBI is Tier 1 Authoritative
    if (field === 'company_name' || field === 'drhp_url' || field === 'rhp_url' || field === 'prospectus_url') {
      if (incomingSource === 'sebi') {
        return { shouldOverride: true, rule: 'sebi_legal_document_authority', isTier1Conflict: false };
      }
      if (existingSource === 'sebi') {
        return { shouldOverride: false, rule: 'sebi_legal_document_retained', isTier1Conflict: false };
      }
    }

    // 2. Operational Parameters (Price Band, Lot Size, Dates, Symbol, Exchange): Exchange overrules all
    if (
      field === 'price_band_low' ||
      field === 'price_band_high' ||
      field === 'lot_size' ||
      field === 'open_date' ||
      field === 'close_date' ||
      field === 'listing_date' ||
      field === 'symbol' ||
      field === 'exchange'
    ) {
      if (incomingSource === 'nse' || incomingSource === 'bse') {
        return { shouldOverride: true, rule: `${incomingSource}_exchange_authority_over_${existingSource}`, isTier1Conflict: false };
      }
      if (existingSource === 'nse' || existingSource === 'bse') {
        return { shouldOverride: false, rule: `${existingSource}_exchange_authority_retained_over_${incomingSource}`, isTier1Conflict: false };
      }
      // SEBI has regulatory document authority but not live operational trading parameters
      if (existingSource === 'sebi') {
        return { shouldOverride: true, rule: `${incomingSource}_operational_parameter_over_sebi_regulatory`, isTier1Conflict: false };
      }
    }

    // Tier 1 over Tier 2/3
    if (incomingIsTier1 && !existingIsTier1) {
      return { shouldOverride: true, rule: `tier1_${incomingSource}_overrules_tier2_${existingSource}`, isTier1Conflict: false };
    }
    if (!incomingIsTier1 && existingIsTier1) {
      return { shouldOverride: false, rule: `tier1_${existingSource}_retained_over_tier2_${incomingSource}`, isTier1Conflict: false };
    }

    return { shouldOverride: false, rule: 'default_retain_existing', isTier1Conflict: false };
  }

  public static calculateFreshness(lastObservedAt: string, now: Date = new Date()): FreshnessGrade {
    const observedTime = new Date(lastObservedAt).getTime();
    if (isNaN(observedTime)) return 'stale';
    const diffHours = (now.getTime() - observedTime) / (1000 * 60 * 60);

    if (diffHours < 6) return 'fresh';
    if (diffHours < 24) return 'aging';
    if (diffHours < 72) return 'stale';
    return 'very_stale';
  }

  public static sanitizeCompanyName(name: string): string {
    return name
      .toLowerCase()
      .replace(/\b(limited|ltd|pvt|private|corporation|corp|inc|india)\b/gi, '')
      .replace(/[^a-z0-9]/g, '')
      .trim();
  }

  private static calculateSimilarity(s1: string, s2: string): number {
    if (s1 === s2) return 1.0;
    if (s1.length === 0 || s2.length === 0) return 0.0;

    const longer = s1.length > s2.length ? s1 : s2;
    const shorter = s1.length > s2.length ? s2 : s1;

    // Levenshtein distance
    const costs: number[] = [];
    for (let i = 0; i <= shorter.length; i++) costs[i] = i;

    for (let i = 1; i <= longer.length; i++) {
      costs[0] = i;
      let nw = i - 1;
      for (let j = 1; j <= shorter.length; j++) {
        const cj = Math.min(
          1 + Math.min(costs[j], costs[j - 1]),
          longer.charAt(i - 1) === shorter.charAt(j - 1) ? nw : nw + 1
        );
        nw = costs[j];
        costs[j] = cj;
      }
    }

    return (longer.length - costs[shorter.length]) / longer.length;
  }
}
