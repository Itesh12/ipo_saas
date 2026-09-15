/**
 * features/external-integrations/services/canonicalIpoResolver.ts
 *
 * Phase 9 Stage 3A.5: Canonical IPO Resolver & Conflict Detection Engine.
 * Reconciles multi-source observations (SEBI, NSE, BSE, Archive), resolves identity,
 * detects discrepancies, maintains field-level truth tables, and applies authority precedence.
 *
 * Hard Gate 3 & Mandatory Correction 2:
 * - Canonical identity represents a specific public issue/offering (issuer_identity + issue_identity),
 *   not merely the legal company name.
 * - Multi-document filings (DRHP + RHP + Addendum + Corrigendum + Prospectus) resolve into 1 canonical IPO entity.
 * - Field-Level Truth Table constructed for every resolved canonical IPO entity.
 */

import {
  IngestionExtractionResult,
  NormalizedIpoMasterPayload,
  IpoProvenanceMap,
  IngestionConflictDetail,
  FreshnessGrade,
  RecordFreshnessMeta,
  IPOInstrumentType,
  IPODataQuality,
  FieldTruthTable,
} from '../ipo-master/ipoMasterTypes';
import { deriveExplainableIPOStatus, LifecycleDerivationResult } from '@/features/ipo/services/ipoLifecycle';

export interface ResolutionOutcome {
  canonical_name: string;
  symbol: string | null;
  isin: string | null;
  issue_identity: string | null;
  instrument_type: IPOInstrumentType;
  data_quality: IPODataQuality;
  has_conflict: boolean;
  conflict_details: IngestionConflictDetail[];
  resolved_payload: NormalizedIpoMasterPayload;
  resolved_provenance: IpoProvenanceMap;
  field_truth_table: FieldTruthTable;
  lifecycle: LifecycleDerivationResult;
  freshness: RecordFreshnessMeta;
}

export class CanonicalIpoResolver {
  /**
   * Evaluates identity match between an incoming extraction and an existing canonical inbox candidate.
   * Matches specific public issue/offering rather than bare legal company name.
   */
  public static isIdentityMatch(
    incoming: NormalizedIpoMasterPayload,
    existing: {
      canonical_name: string;
      symbol?: string | null;
      isin?: string | null;
      instrument_type?: string | null;
      issue_identity?: string | null;
      offering_year?: number | null;
    }
  ): boolean {
    // 0. Issue Identity Exact Match
    if (
      incoming.issue_identity &&
      existing.issue_identity &&
      incoming.issue_identity === existing.issue_identity
    ) {
      return true;
    }

    // Contradiction Guard 1: Contradictory Instrument Types (e.g. IPO vs DEBT vs RIGHTS)
    if (
      incoming.instrument_type &&
      existing.instrument_type &&
      incoming.instrument_type !== existing.instrument_type
    ) {
      // SME_IPO and IPO can be reconciled if exchange upgraded, but DEBT / RIGHTS never match equity IPO
      const isIncomingEquity = incoming.instrument_type === 'IPO' || incoming.instrument_type === 'SME_IPO';
      const isExistingEquity = existing.instrument_type === 'IPO' || existing.instrument_type === 'SME_IPO';
      if (!isIncomingEquity || !isExistingEquity) {
        return false;
      }
    }

    // Contradiction Guard 2: Contradictory ISINs
    if (incoming.isin && existing.isin && incoming.isin.toUpperCase() !== existing.isin.toUpperCase()) {
      return false;
    }

    // Contradiction Guard 3: Contradictory Symbols
    if (incoming.symbol && existing.symbol && incoming.symbol.toUpperCase() !== existing.symbol.toUpperCase()) {
      return false;
    }

    // Contradiction Guard 4: Distant Offering Years (> 2 years apart = distinct issue)
    if (
      incoming.offering_year &&
      existing.offering_year &&
      Math.abs(incoming.offering_year - existing.offering_year) > 2
    ) {
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

    // 3. Cleaned Company Name similarity (stripping document suffixes and legal entities)
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
   * Compiles the Field-Level Truth Table across all observed sources.
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

    // Merge document links & amendments
    if (incoming.document_type === 'ADDENDUM' || incoming.document_type === 'CORRIGENDUM') {
      const docUrl = incoming.raw_payload?.documentUrl ? String(incoming.raw_payload.documentUrl) : null;
      if (docUrl) {
        resolved.amendment_urls = Array.from(new Set([...(resolved.amendment_urls || []), docUrl]));
      }
    }
    if (incomingPayload.drhp_url && !resolved.drhp_url) {
      resolved.drhp_url = incomingPayload.drhp_url;
    }
    if (incomingPayload.rhp_url) {
      resolved.rhp_url = incomingPayload.rhp_url;
    }
    if (incomingPayload.prospectus_url) {
      resolved.prospectus_url = incomingPayload.prospectus_url;
    }

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

      // If company_name differs only by legal suffix (e.g. Ltd. vs Limited), treat as equivalent
      if (key === 'company_name' && typeof exVal === 'string' && typeof incVal === 'string') {
        if (this.sanitizeCompanyName(exVal) === this.sanitizeCompanyName(incVal)) {
          continue;
        }
      }

      // If incoming is from the SAME source, it is a chronological amendment/version update
      if (incomingSource === exSource) {
        (resolved as unknown as Record<string, unknown>)[key] = incVal;
        if (incomingProv[key]) {
          (resolvedProvenance as unknown as Record<string, unknown>)[key] = incomingProv[key];
        }
        continue;
      }

      // Cross-source discrepancy detected! Apply field-specific authority rules
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

    // Derive deterministic business lifecycle
    const lifecycle = deriveExplainableIPOStatus({
      open_date: resolved.open_date,
      close_date: resolved.close_date,
      allotment_date: resolved.allotment_date,
      listing_date: resolved.listing_date,
      status: resolved.business_status,
      nowIST: options?.nowIST,
    });
    resolved.business_status = lifecycle.finalStatus as NormalizedIpoMasterPayload['business_status'];

    // Instrument Type & Offering Year
    const instrumentType: IPOInstrumentType =
      resolved.instrument_type || incomingPayload.instrument_type || 'IPO';
    resolved.instrument_type = instrumentType;

    const offeringYear: number =
      resolved.offering_year || incomingPayload.offering_year || new Date().getFullYear();
    resolved.offering_year = offeringYear;

    const issueIdentity =
      resolved.issue_identity ||
      incomingPayload.issue_identity ||
      `${this.sanitizeCompanyName(resolved.company_name)}-${instrumentType.toLowerCase()}-${offeringYear}`;
    resolved.issue_identity = issueIdentity;

    // Derive 5-state Data Quality
    let dataQuality: IPODataQuality = 'partial';
    if (conflicts.length > 0) {
      dataQuality = 'conflicted';
    } else if (resolved.price_band_high && resolved.open_date && resolved.close_date && resolved.lot_size) {
      dataQuality = 'complete';
    } else if (resolved.price_band_high && resolved.open_date && resolved.close_date) {
      dataQuality = 'verified';
    } else if (resolved.company_name && (resolved.drhp_url || resolved.rhp_url || resolved.prospectus_url)) {
      dataQuality = 'partial';
    } else {
      dataQuality = 'discovered';
    }
    resolved.data_quality = dataQuality;

    // Build Field-Level Truth Table (Hard Gate Requirement)
    const fieldTruthTable = this.buildTruthTable(resolved, resolvedProvenance, incoming);

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
      issue_identity: issueIdentity,
      instrument_type: instrumentType,
      data_quality: dataQuality,
      has_conflict: conflicts.length > 0,
      conflict_details: conflicts,
      resolved_payload: resolved,
      resolved_provenance: resolvedProvenance,
      field_truth_table: fieldTruthTable,
      lifecycle,
      freshness,
    };
  }

  private static isTier1Source(source?: string): boolean {
    return source === 'sebi' || source === 'nse' || source === 'bse' || source === 'sebi_archive' || source === 'nse_archive';
  }

  /**
   * Field-level authority precedence evaluation.
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

    // Tier-1 vs Tier-1 Conflict Freeze
    if (incomingIsTier1 && existingIsTier1 && incomingSource !== existingSource) {
      // Exchange overrules SEBI on trading parameters (price band, lot size, dates, symbol)
      if (
        (incomingSource === 'nse' || incomingSource === 'bse') &&
        (existingSource === 'sebi' || existingSource === 'sebi_archive') &&
        (field === 'price_band_low' || field === 'price_band_high' || field === 'lot_size' || field === 'open_date' || field === 'close_date' || field === 'symbol' || field === 'exchange')
      ) {
        return {
          shouldOverride: true,
          rule: `${incomingSource}_operational_trading_authority_over_sebi_regulatory`,
          isTier1Conflict: false,
        };
      }

      // SEBI overrules Exchange on legal company name and official offer documents
      if (
        (incomingSource === 'sebi' || incomingSource === 'sebi_archive') &&
        (existingSource === 'nse' || existingSource === 'bse') &&
        (field === 'company_name' || field === 'drhp_url' || field === 'rhp_url' || field === 'prospectus_url')
      ) {
        return {
          shouldOverride: true,
          rule: `sebi_regulatory_document_authority_over_exchange_trading`,
          isTier1Conflict: false,
        };
      }

      return {
        shouldOverride: false,
        rule: `TIER1_CONFLICT_FROZEN: Disagreement between ${existingSource} and ${incomingSource} on ${field} requires administrator review`,
        isTier1Conflict: true,
      };
    }

    // Legal Name and Regulatory Offer Documents: SEBI is Tier 1 Authoritative
    if (field === 'company_name' || field === 'drhp_url' || field === 'rhp_url' || field === 'prospectus_url') {
      if (incomingSource === 'sebi' || incomingSource === 'sebi_archive') {
        return { shouldOverride: true, rule: 'sebi_legal_document_authority', isTier1Conflict: false };
      }
      if (existingSource === 'sebi' || existingSource === 'sebi_archive') {
        return { shouldOverride: false, rule: 'sebi_legal_document_retained', isTier1Conflict: false };
      }
    }

    // Operational Parameters: Exchange overrules
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

  /**
   * Constructs the field-level truth table explaining winning source and confidence for all fields.
   */
  public static buildTruthTable(
    payload: NormalizedIpoMasterPayload,
    provenance: IpoProvenanceMap,
    incoming: IngestionExtractionResult
  ): FieldTruthTable {
    const table: FieldTruthTable = {};
    const trackedFields: Array<keyof NormalizedIpoMasterPayload> = [
      'company_name',
      'instrument_type',
      'price_band_low',
      'price_band_high',
      'lot_size',
      'open_date',
      'close_date',
      'exchange',
      'listing_date',
    ];

    for (const field of trackedFields) {
      const prov = provenance[field];
      const val = payload[field];
      const incVal = incoming.normalized_payload[field];

      table[field] = {
        field,
        selected_value: val ?? null,
        selected_source: prov?.source || incoming.source,
        confidence: val !== undefined && val !== null ? 'high' : 'pending',
        rule_applied: prov?.is_official ? 'official_wire_precedence' : 'initial_observation_adopted',
        sebi_value: prov?.source === 'sebi' ? val : (incoming.source === 'sebi' ? incVal : null),
        nse_value: prov?.source === 'nse' ? val : (incoming.source === 'nse' ? incVal : null),
        bse_value: prov?.source === 'bse' ? val : (incoming.source === 'bse' ? incVal : null),
        archive_value: prov?.source === 'sebi_archive' ? val : (incoming.source === 'sebi_archive' ? incVal : null),
      };
    }

    return table;
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
      .replace(/\s*[-–—:]\s*(draft\s+offer\s+document|draft\s+abridged\s+prospectus|abridged\s+prospectus|red\s+herring\s+prospectus|prospectus|addendum\s+to\s+rhp|addendum|corrigendum|udrhp|rhp|drhp|notice|errata).*$/i, '')
      .replace(/\b(limited|ltd|pvt|private|corporation|corp|inc|india|addendum|corrigendum|rhp|drhp|udrhp|prospectus|abridged|notice|errata)\b/gi, '')
      .replace(/[^a-z0-9]/g, '')
      .trim();
  }

  private static calculateSimilarity(s1: string, s2: string): number {
    if (s1 === s2) return 1.0;
    if (s1.length === 0 || s2.length === 0) return 0.0;

    const longer = s1.length > s2.length ? s1 : s2;
    const shorter = s1.length > s2.length ? s2 : s1;

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
