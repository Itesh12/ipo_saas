/**
 * features/external-integrations/documents/documentIpoReconciler.ts
 *
 * Document-to-IPO Reconciliation Engine.
 * Extracts issuer identity from regulatory filing title/context,
 * scores candidate matches in canonical public.ipos, and enforces confidence threshold (>=0.95).
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { DocumentReconciliationResult } from './documentTypes';

export class DocumentIpoReconciler {
  /**
   * Reconciles a document with a canonical IPO in public.ipos.
   */
  public async reconcileDocument(
    supabase: SupabaseClient,
    filingTitle: string,
    options?: {
      isin?: string | null;
      symbol?: string | null;
      companyNameHint?: string | null;
    }
  ): Promise<DocumentReconciliationResult> {
    const extractedName = this.extractIssuerName(filingTitle, options?.companyNameHint);

    // 1. Check ISIN match (Confidence 1.0) via ingestion inbox binding
    if (options?.isin) {
      const { data: inboxMatch } = await supabase
        .from('ipo_ingestion_inbox')
        .select('promoted_ipo_id, canonical_name')
        .eq('isin', options.isin.trim().toUpperCase())
        .not('promoted_ipo_id', 'is', null)
        .maybeSingle();

      if (inboxMatch && inboxMatch.promoted_ipo_id) {
        return {
          ipoId: inboxMatch.promoted_ipo_id,
          canonicalName: inboxMatch.canonical_name,
          score: 1.0,
          reason: `Exact ISIN match (${options.isin}) resolved via canonical inbox.`,
          isAssociated: true,
        };
      }
    }

    // 2. Check Trading Symbol match (Confidence 0.98)
    if (options?.symbol) {
      const { data: symbolMatch } = await supabase
        .from('ipos')
        .select('id, company_name, symbol')
        .eq('symbol', options.symbol.trim().toUpperCase())
        .maybeSingle();

      if (symbolMatch) {
        return {
          ipoId: symbolMatch.id,
          canonicalName: symbolMatch.company_name,
          score: 0.98,
          reason: `Exact Symbol match (${options.symbol}).`,
          isAssociated: true,
        };
      }
    }

    // 3. Normalized Company Name Match (Confidence 0.95+)
    if (extractedName) {
      const normalizedTarget = this.normalizeCompanyName(extractedName);

      // Query all candidate IPOs
      const { data: allIpos } = await supabase
        .from('ipos')
        .select('id, company_name, symbol');

      if (allIpos && allIpos.length > 0) {
        const matches: Array<{ id: string; companyName: string; score: number }> = [];

        for (const ipo of allIpos) {
          const normIpo = this.normalizeCompanyName(ipo.company_name);
          if (normIpo === normalizedTarget) {
            matches.push({ id: ipo.id, companyName: ipo.company_name, score: 0.96 });
          } else if (normIpo.length > 5 && (normalizedTarget.startsWith(normIpo) || normIpo.startsWith(normalizedTarget))) {
            matches.push({ id: ipo.id, companyName: ipo.company_name, score: 0.85 });
          }
        }

        // If single high-confidence match
        if (matches.length === 1 && matches[0].score >= 0.95) {
          return {
            ipoId: matches[0].id,
            canonicalName: matches[0].companyName,
            score: matches[0].score,
            reason: `Exact normalized company name match ("${extractedName}" ~ "${matches[0].companyName}").`,
            isAssociated: true,
          };
        }

        // If multiple matches or ambiguity
        if (matches.length > 1) {
          return {
            score: 0.60,
            reason: `Ambiguous match: ${matches.length} candidate IPOs matched ("${matches.map(m => m.companyName).join(', ')}").`,
            isAssociated: false,
            candidateIpoIds: matches.map(m => m.id),
          };
        }

        // If partial match below 0.95
        if (matches.length === 1 && matches[0].score < 0.95) {
          return {
            score: matches[0].score,
            reason: `Partial name match below confidence threshold (${matches[0].score} < 0.95).`,
            isAssociated: false,
            candidateIpoIds: [matches[0].id],
          };
        }
      }
    }

    return {
      score: 0.0,
      reason: `No canonical IPO in public.ipos matched filing title "${filingTitle}".`,
      isAssociated: false,
    };
  }

  /**
   * Extracts clean issuer name from regulatory filing title patterns.
   * e.g. "Draft Red Herring Prospectus of Hero Motors Limited" -> "Hero Motors Limited"
   * e.g. "Addendum to the RHP of Jindal Supreme India Limited" -> "Jindal Supreme India Limited"
   */
  public extractIssuerName(filingTitle: string, fallbackHint?: string | null): string {
    if (fallbackHint && fallbackHint.trim().length > 2) {
      return fallbackHint.trim();
    }

    if (!filingTitle) return '';

    const clean = filingTitle.replace(/[\r\n\t]+/g, ' ').trim();

    // Pattern: "... of <Company Name>"
    const ofMatch = clean.match(/(?:of|for)\s+([A-Za-z0-9\s&.,'-]+?)(?:\s+dated|\s+filed|\s+approved|\s+available|\s*\.pdf|$)/i);
    if (ofMatch && ofMatch[1] && ofMatch[1].trim().length > 3) {
      return ofMatch[1].trim();
    }

    // Pattern: "<Company Name> - DRHP" or "<Company Name> DRHP"
    const prefixMatch = clean.match(/^([A-Za-z0-9\s&.,'-]+?)\s*[-–—:]\s*(?:DRHP|RHP|Prospectus|Draft)/i);
    if (prefixMatch && prefixMatch[1] && prefixMatch[1].trim().length > 3) {
      return prefixMatch[1].trim();
    }

    return clean;
  }

  /**
   * Normalizes legal company name for deterministic matching.
   */
  public normalizeCompanyName(name: string): string {
    if (!name) return '';
    return name
      .toLowerCase()
      .replace(/\b(limited|ltd|private|pvt|corp|corporation|inc|incorporated|llp)\b/gi, '')
      .replace(/[^a-z0-9]/gi, '')
      .trim();
  }
}

export const documentIpoReconciler = new DocumentIpoReconciler();
