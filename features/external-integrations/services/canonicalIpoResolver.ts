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
} from '../ipo-master/ipoMasterTypes';

export interface ResolutionOutcome {
  canonical_name: string;
  symbol: string | null;
  isin: string | null;
  has_conflict: boolean;
  conflict_details: IngestionConflictDetail[];
  resolved_payload: NormalizedIpoMasterPayload;
  resolved_provenance: IpoProvenanceMap;
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
    // 1. ISIN exact match (12-char global identifier)
    if (incoming.isin && existing.isin && incoming.isin.toUpperCase() === existing.isin.toUpperCase()) {
      return true;
    }

    // 2. Trading symbol exact match
    if (incoming.symbol && existing.symbol && incoming.symbol.toUpperCase() === existing.symbol.toUpperCase()) {
      return true;
    }

    // 3. Cleaned Company Name similarity
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
   */
  public static resolveObservation(
    existingPayload: NormalizedIpoMasterPayload,
    existingProvenance: IpoProvenanceMap,
    incoming: IngestionExtractionResult
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
      const exSource = exProv ? exProv.source : undefined;

      // If field is currently empty, simply adopt incoming value
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

      // Conflict detected! Apply field-specific authority rules:
      const shouldIncomingOverride = this.shouldOverrideField(key, incomingSource, exSource);

      const conflict: IngestionConflictDetail = {
        field: key,
        existing_value: exVal,
        existing_source: exSource || 'sebi',
        incoming_value: incVal,
        incoming_source: incomingSource,
        resolved_value: shouldIncomingOverride ? incVal : exVal,
        resolution_rule: shouldIncomingOverride
          ? `${incomingSource} overrules ${exSource || 'current'} for ${key}`
          : `${exSource || 'current'} retained over ${incomingSource} for ${key}`,
      };

      conflicts.push(conflict);

      if (shouldIncomingOverride) {
        (resolved as unknown as Record<string, unknown>)[key] = incVal;
        if (incomingProv[key]) {
          (resolvedProvenance as unknown as Record<string, unknown>)[key] = incomingProv[key];
        }
      }
    }

    return {
      canonical_name: resolved.company_name,
      symbol: resolved.symbol || null,
      isin: resolved.isin || null,
      has_conflict: conflicts.length > 0,
      conflict_details: conflicts,
      resolved_payload: resolved,
      resolved_provenance: resolvedProvenance,
    };
  }

  /**
   * Field-level authority precedence evaluation.
   */
  private static shouldOverrideField(
    field: keyof NormalizedIpoMasterPayload,
    incomingSource: string,
    existingSource?: string
  ): boolean {
    // 1. Legal Name and Regulatory Offer Documents: SEBI is Tier 1 Authoritative
    if (field === 'company_name' || field === 'drhp_url' || field === 'rhp_url' || field === 'prospectus_url') {
      if (incomingSource === 'sebi') return true;
      if (existingSource === 'sebi') return false;
    }

    // 2. Operational Parameters (Price Band, Lot Size, Dates, Symbol, Exchange): Exchange overrules all
    if (
      field === 'price_band_low' ||
      field === 'price_band_high' ||
      field === 'lot_size' ||
      field === 'open_date' ||
      field === 'close_date' ||
      field === 'symbol' ||
      field === 'exchange'
    ) {
      if (incomingSource === 'nse' || incomingSource === 'bse') return true;
      if (existingSource === 'nse' || existingSource === 'bse') return false;
      if (incomingSource === 'upstox') return true; // Upstox provides operational over SEBI doc
    }

    // Default: retain existing unless incoming is higher tier
    return false;
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
