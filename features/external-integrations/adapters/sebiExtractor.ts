/**
 * features/external-integrations/adapters/sebiExtractor.ts
 *
 * Phase 9 Stage 3A: SEBI Public Issues Extractor (Tier 1 Regulatory Authority).
 * Extracts official public issue filings from sebi.gov.in/filings/public-issues.html.
 * Classifies DRHP, RHP, Final Prospectus, and Addendum/Corrigendum amendments.
 */

import {
  IngestionExtractionResult,
  IngestionDocumentType,
  NormalizedIpoMasterPayload,
  IpoProvenanceMap,
} from '../ipo-master/ipoMasterTypes';

export interface SebiRawRow {
  filingDate: string;
  companyName: string;
  documentTitle: string;
  documentUrl: string;
  leadManager?: string;
}

export class SebiPublicIssuesExtractor {
  public static readonly SOURCE_NAME = 'sebi' as const;
  public static readonly BASE_URL = 'https://www.sebi.gov.in/filings/public-issues.html';

  /**
   * Classifies the document subtype based on official SEBI document titles.
   * Addendums and Corrigenda are explicitly classified as amendments.
   */
  public static classifyDocumentType(title: string): IngestionDocumentType {
    const upper = title.toUpperCase();
    if (upper.includes('ADDENDUM')) return 'ADDENDUM';
    if (upper.includes('CORRIGENDUM')) return 'CORRIGENDUM';
    if (upper.includes('UDRHP') || upper.includes('UPDATED DRAFT')) return 'UDRHP';
    if (upper.includes('RED HERRING') || upper.includes('RHP')) return 'RHP';
    if (upper.includes('PROSPECTUS') && !upper.includes('DRAFT')) return 'PROSPECTUS';
    return 'DRHP';
  }

  /**
   * Normalizes a raw SEBI table row into the canonical IPO master payload.
   */
  public static normalizeRow(row: SebiRawRow): IngestionExtractionResult {
    const documentType = this.classifyDocumentType(row.documentTitle);
    const cleanedName = this.cleanCompanyName(row.companyName);
    const externalId = this.generateExternalId(cleanedName, row.filingDate);

    const normalized: NormalizedIpoMasterPayload = {
      company_name: cleanedName,
      lead_managers: row.leadManager ? [row.leadManager.trim()] : undefined,
    };

    if (documentType === 'DRHP' || documentType === 'UDRHP') {
      normalized.drhp_url = row.documentUrl;
    } else if (documentType === 'RHP') {
      normalized.rhp_url = row.documentUrl;
    } else if (documentType === 'PROSPECTUS') {
      normalized.prospectus_url = row.documentUrl;
    }

    const observedAt = new Date().toISOString();
    const provenance: IpoProvenanceMap = {
      company_name: {
        value: cleanedName,
        source: 'sebi',
        source_url: row.documentUrl || this.BASE_URL,
        observed_at: observedAt,
        confidence: 'official_regulatory',
        is_official: true,
      },
    };

    if (normalized.drhp_url) {
      provenance.drhp_url = {
        value: normalized.drhp_url,
        source: 'sebi',
        source_url: row.documentUrl,
        observed_at: observedAt,
        confidence: 'official_regulatory',
        is_official: true,
      };
    }
    if (normalized.rhp_url) {
      provenance.rhp_url = {
        value: normalized.rhp_url,
        source: 'sebi',
        source_url: row.documentUrl,
        observed_at: observedAt,
        confidence: 'official_regulatory',
        is_official: true,
      };
    }
    if (normalized.prospectus_url) {
      provenance.prospectus_url = {
        value: normalized.prospectus_url,
        source: 'sebi',
        source_url: row.documentUrl,
        observed_at: observedAt,
        confidence: 'official_regulatory',
        is_official: true,
      };
    }

    return {
      source: 'sebi',
      external_id: externalId,
      document_type: documentType,
      raw_payload: row as unknown as Record<string, unknown>,
      normalized_payload: normalized,
      provenance,
    };
  }

  /**
   * Parses standard SEBI Public Issues HTML table rows.
   */
  public static parseHtml(htmlContent: string): IngestionExtractionResult[] {
    const results: IngestionExtractionResult[] = [];
    
    // Regular expression extraction for table rows to avoid heavy DOM parser dependency
    // Matches <tr>...<td>Date</td>...<td><a href="...">Title</a></td>...</tr>
    const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let match;

    while ((match = rowRegex.exec(htmlContent)) !== null) {
      const rowHtml = match[1];
      if (rowHtml.includes('<th') || !rowHtml.includes('<td')) {
        continue; // Skip header row
      }

      const cells: string[] = [];
      const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
      let cellMatch;
      while ((cellMatch = cellRegex.exec(rowHtml)) !== null) {
        cells.push(cellMatch[1].trim());
      }

      if (cells.length >= 2) {
        const dateText = cells[0].replace(/<[^>]+>/g, '').trim();
        const contentCell = cells[1];

        // Extract anchor tag and title
        const anchorMatch = /<a\s+(?:[^>]*?\s+)?href=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/i.exec(contentCell);
        if (anchorMatch) {
          const href = anchorMatch[1].trim();
          const title = anchorMatch[2].replace(/<[^>]+>/g, '').trim();
          const leadManager = cells[2] ? cells[2].replace(/<[^>]+>/g, '').trim() : undefined;

          // Normalize relative URLs to absolute SEBI domain
          const fullUrl = href.startsWith('http')
            ? href
            : `https://www.sebi.gov.in${href.startsWith('/') ? '' : '/'}${href}`;

          const extracted = this.normalizeRow({
            filingDate: dateText,
            companyName: title,
            documentTitle: title,
            documentUrl: fullUrl,
            leadManager,
          });

          results.push(extracted);
        }
      }
    }

    return results;
  }

  private static cleanCompanyName(raw: string): string {
    return raw
      .replace(/\s*-\s*(Draft\s+Offer\s+Document|Red\s+Herring\s+Prospectus|Prospectus|Addendum|Corrigendum|UDRHP).*$/i, '')
      .replace(/\s*-\s*filed\s+with\s+(SEBI|ROC).*$/i, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private static generateExternalId(companyName: string, date: string): string {
    const slug = companyName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    const cleanDate = date.replace(/[^0-9a-zA-Z]+/g, '-');
    return `sebi-${slug}-${cleanDate}`;
  }
}
