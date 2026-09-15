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
  IPOInstrumentType,
  IPODataQuality,
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
   * Classifies instrument type to strictly separate IPOs/SME IPOs from FPOs, Rights, Debt, REITs, etc.
   */
  public static classifyInstrumentType(title: string): IPOInstrumentType {
    const upper = title.toUpperCase();
    if (upper.includes('RIGHTS') || upper.includes('RIGHT ISSUE')) return 'RIGHTS';
    if (upper.includes('DEBT') || upper.includes('NCD') || upper.includes('BOND')) return 'DEBT';
    if (upper.includes('BUYBACK')) return 'BUYBACK';
    if (upper.includes('REIT')) return 'REIT';
    if (upper.includes('INVIT')) return 'INVIT';
    if (upper.includes('FPO') || upper.includes('FOLLOW-ON') || upper.includes('FURTHER PUBLIC')) return 'FPO';
    if (upper.includes('OFS') && !upper.includes('IPO')) return 'OFFER_FOR_SALE';
    if (upper.includes('SME') || upper.includes('EMERGE') || upper.includes('INNOVATORS')) return 'SME_IPO';
    return 'IPO';
  }

  /**
   * Normalizes a raw SEBI table row into the canonical IPO master payload.
   */
  public static normalizeRow(row: SebiRawRow): IngestionExtractionResult {
    const documentType = this.classifyDocumentType(row.documentTitle);
    const instrumentType = this.classifyInstrumentType(row.documentTitle);
    const cleanedName = this.cleanCompanyName(row.companyName);
    const externalId = this.generateExternalId(cleanedName, row.filingDate);

    const yearMatch = row.filingDate.match(/\d{4}/);
    const offeringYear = yearMatch ? parseInt(yearMatch[0], 10) : new Date().getFullYear();

    const cleanSlug = cleanedName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    const issueIdentity = `${cleanSlug}-${instrumentType.toLowerCase()}-${offeringYear}`;

    let dataQuality: IPODataQuality = 'partial';
    if (documentType === 'PROSPECTUS') {
      dataQuality = 'verified';
    } else if (documentType === 'RHP') {
      dataQuality = 'partial';
    } else {
      dataQuality = 'discovered';
    }

    const normalized: NormalizedIpoMasterPayload = {
      company_name: cleanedName,
      lead_managers: row.leadManager ? [row.leadManager.trim()] : undefined,
      instrument_type: instrumentType,
      data_quality: dataQuality,
      issue_identity: issueIdentity,
      offering_year: offeringYear,
      business_status: documentType === 'PROSPECTUS' ? 'listed' : 'announced',
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
      const cellRegex = /<td[^>]*>([\s\S]*?)(?:<\/td>|(?=<td)|$)/gi;
      let cellMatch;
      while ((cellMatch = cellRegex.exec(rowHtml)) !== null) {
        cells.push(cellMatch[1].trim());
      }

      if (cells.length >= 2) {
        const dateText = cells[0].replace(/<[^>]+>/g, '').trim();
        const contentCell = cells[1];

        const hrefMatch = /href=["']([^"']+)["']/i.exec(contentCell);
        if (hrefMatch) {
          const href = hrefMatch[1].trim();
          let title = '';

          const pointsMatch = /class=["']points["'][^>]*>([\s\S]*)/i.exec(contentCell);
          if (pointsMatch) {
            title = pointsMatch[1].split(/<br\s*\/?>/i)[0].replace(/<[^>]+>/g, '').trim();
          } else {
            const generalMatch = /<a[^>]*>([\s\S]*)/i.exec(contentCell);
            title = generalMatch ? generalMatch[1].split(/<br\s*\/?>/i)[0].replace(/<[^>]+>/g, '').trim() : '';
          }

          if (title) {
            const leadManager = cells[2] ? cells[2].replace(/<[^>]+>/g, '').trim() : undefined;
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
    }

    return results;
  }

  private static cleanCompanyName(raw: string): string {
    return raw
      .split(/<br\s*\/?>/i)[0]
      .replace(/\s*[-–—:]\s*(Draft\s+Offer\s+Document|Draft\s+Abridged\s+Prospectus|Abridged\s+Prospectus|Red\s+Herring\s+Prospectus|Prospectus|Addendum\s+to\s+RHP|Addendum|Corrigendum|UDRHP|RHP|DRHP|Notice|Errata).*$/i, '')
      .replace(/\s*-\s*filed\s+with\s+(SEBI|ROC).*$/i, '')
      .replace(/<[^>]+>/g, '')
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
