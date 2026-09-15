/**
 * features/external-integrations/news/newsEntityResolver.ts
 *
 * Phase 9 Stage 3E: 5-Tier Deterministic IPO Entity Resolution Engine.
 *
 * Identity Hierarchy:
 * 1. Tier 1: External Issue / Security ID (confidence 1.00)
 * 2. Tier 2: ISIN (12-char alphanumeric, confidence 0.98)
 * 3. Tier 3: Exchange Symbol (exact match, confidence 0.95)
 * 4. Tier 4: Issuer Legal Name & Normalized Aliases (confidence 0.85–0.90)
 * 5. Tier 5: Ambiguous Quarantine (<0.85 or multi-match -> quarantined_unmatched)
 *
 * Preserves resolution_method, resolution_confidence, matched_identifiers, and resolver_version.
 */

import { EntityResolutionResult } from './newsTypes';

export interface CanonicalIPOCandidate {
  id: string;
  symbol: string | null;
  isin?: string | null;
  companyName: string;
  aliases?: string[];
  externalIssueId?: string | null;
}

export class NewsEntityResolver {
  public static readonly RESOLVER_VERSION = 'ENTITY_RESOLVER_V1_2026_09';

  /**
   * Resolves a headline/content/hints to a single canonical IPO using the 5-tier hierarchy.
   */
  public resolveEntity(params: {
    headline: string;
    rawContent?: string | null;
    identifierHints?: {
      symbol?: string;
      isin?: string;
      externalIssueId?: string;
      companyName?: string;
    };
    candidates: CanonicalIPOCandidate[];
  }): EntityResolutionResult {
    const { headline, rawContent = '', identifierHints, candidates } = params;
    const textCorpus = `${headline} ${rawContent || ''}`.toUpperCase();

    // -------------------------------------------------------------------------
    // Tier 1: External Issue / Security ID (Exact Match)
    // -------------------------------------------------------------------------
    if (identifierHints?.externalIssueId) {
      const match = candidates.find(
        (c) => c.externalIssueId && c.externalIssueId === identifierHints.externalIssueId
      );
      if (match) {
        return {
          ipoId: match.id,
          method: 'external_issue_id',
          confidence: 1.0,
          matchedIdentifiers: { externalIssueId: identifierHints.externalIssueId },
          resolverVersion: NewsEntityResolver.RESOLVER_VERSION,
        };
      }
    }

    // -------------------------------------------------------------------------
    // Tier 2: ISIN (12-Character Standard Format Match)
    // -------------------------------------------------------------------------
    const isinRegex = /\bINE[A-Z0-9]{9}\b/g;
    const isinMatches = textCorpus.match(isinRegex);
    const candidateIsin = identifierHints?.isin?.toUpperCase() || (isinMatches ? isinMatches[0] : null);

    if (candidateIsin) {
      const match = candidates.find((c) => c.isin && c.isin.toUpperCase() === candidateIsin);
      if (match) {
        return {
          ipoId: match.id,
          method: 'isin',
          confidence: 0.98,
          matchedIdentifiers: { isin: candidateIsin },
          resolverVersion: NewsEntityResolver.RESOLVER_VERSION,
        };
      }
    }

    // -------------------------------------------------------------------------
    // Tier 3: Exchange Symbol (Exact Boundary Match)
    // -------------------------------------------------------------------------
    if (identifierHints?.symbol) {
      const sym = identifierHints.symbol.trim().toUpperCase();
      const match = candidates.find((c) => c.symbol && c.symbol.toUpperCase() === sym);
      if (match) {
        return {
          ipoId: match.id,
          method: 'symbol',
          confidence: 0.95,
          matchedIdentifiers: { symbol: sym },
          resolverVersion: NewsEntityResolver.RESOLVER_VERSION,
        };
      }
    }

    // Search for symbol in text boundaries e.g. "(TECHCORP)" or "TECHCORP IPO"
    const matchedBySymbol = candidates.filter((c) => {
      if (!c.symbol || c.symbol.length < 3) return false;
      const sym = c.symbol.toUpperCase();
      const regex = new RegExp(`\\b${sym}\\b`);
      return regex.test(textCorpus);
    });

    if (matchedBySymbol.length === 1) {
      return {
        ipoId: matchedBySymbol[0].id,
        method: 'symbol',
        confidence: 0.92,
        matchedIdentifiers: { symbol: matchedBySymbol[0].symbol! },
        resolverVersion: NewsEntityResolver.RESOLVER_VERSION,
      };
    } else if (matchedBySymbol.length > 1) {
      // Multiple symbol collision -> Tier 5 Quarantine
      return {
        ipoId: null,
        method: 'unresolved',
        confidence: 0.4,
        matchedIdentifiers: { ambiguousSymbols: matchedBySymbol.map((m) => m.symbol!).join(', ') },
        resolverVersion: NewsEntityResolver.RESOLVER_VERSION,
      };
    }

    // -------------------------------------------------------------------------
    // Tier 4: Legal Name & Normalized Company Name Match
    // -------------------------------------------------------------------------
    const matchedByName: { candidate: CanonicalIPOCandidate; score: number }[] = [];

    for (const c of candidates) {
      const cleanTarget = this.normalizeCompanyName(c.companyName);
      if (cleanTarget.length < 4) continue;

      if (textCorpus.includes(cleanTarget)) {
        matchedByName.push({ candidate: c, score: 0.9 });
      } else if (c.aliases) {
        for (const alias of c.aliases) {
          const cleanAlias = this.normalizeCompanyName(alias);
          if (cleanAlias.length >= 4 && textCorpus.includes(cleanAlias)) {
            matchedByName.push({ candidate: c, score: 0.85 });
            break;
          }
        }
      }
    }

    if (matchedByName.length === 1) {
      return {
        ipoId: matchedByName[0].candidate.id,
        method: 'legal_name',
        confidence: matchedByName[0].score,
        matchedIdentifiers: { companyName: matchedByName[0].candidate.companyName },
        resolverVersion: NewsEntityResolver.RESOLVER_VERSION,
      };
    }

    // -------------------------------------------------------------------------
    // Tier 5: Ambiguous Quarantine (Multiple matches or no confident match)
    // -------------------------------------------------------------------------
    return {
      ipoId: null,
      method: 'unresolved',
      confidence: matchedByName.length > 1 ? 0.3 : 0.0,
      matchedIdentifiers: {
        matches: matchedByName.map((m) => m.candidate.companyName).join(' | '),
      },
      resolverVersion: NewsEntityResolver.RESOLVER_VERSION,
    };
  }

  private normalizeCompanyName(name: string): string {
    return name
      .toUpperCase()
      .replace(/\b(LIMITED|LTD|PRIVATE|PVT|CORPORATION|CORP|INC|LLP)\b/g, '')
      .replace(/[^A-Z0-9 ]/g, '')
      .trim();
  }
}

export const newsEntityResolver = new NewsEntityResolver();
