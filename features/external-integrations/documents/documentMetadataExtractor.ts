/**
 * features/external-integrations/documents/documentMetadataExtractor.ts
 *
 * Extracts structured offer metadata (BRLMs, Registrar, Fresh Issue vs OFS, Issue Objects)
 * from offer document summaries or text snippets.
 *
 * CRITICAL ARCHITECTURAL INVARIANT:
 * Extracted values are stored strictly in `ipo_documents.metadata`.
 * Merchant bankers are intermediaries, NEVER promoters.
 * ZERO mutation of `ipo_promoters` or canonical research tables.
 */

import { ExtractedOfferMetadata } from './documentTypes';

export class DocumentMetadataExtractor {
  // Authoritative Indian Merchant Banking & Lead Manager Entities
  private readonly KNOWN_BRLMS = [
    'Kotak Mahindra Capital',
    'ICICI Securities',
    'Axis Capital',
    'JM Financial',
    'SBI Capital Markets',
    'Dam Capital Advisors',
    'IIFL Securities',
    'Jefferies India',
    'Morgan Stanley India',
    'Citigroup Global Markets India',
    'Nomura Financial Advisory',
    'Motilal Oswal Investment Banking',
    'Nuvama Wealth Management',
    'Edelweiss Financial Services',
    'Equirus Capital',
    'Anand Rathi Advisors',
    'InCred Capital Wealth',
  ];

  // Authoritative Indian Registrars
  private readonly KNOWN_REGISTRARS = [
    'Link Intime India Private Limited',
    'KFin Technologies Limited',
    'Bigshare Services Private Limited',
    'Cameo Corporate Services Limited',
    'MAS Services Limited',
    'Skyline Financial Services Private Limited',
    'Purva Sharegistry India Private Limited',
  ];

  /**
   * Extracts metadata from text content or regulatory payload.
   */
  public extractMetadata(textContent: string): ExtractedOfferMetadata {
    if (!textContent || typeof textContent !== 'string') {
      return { brlms: [] };
    }

    const brlms = this.extractBrlms(textContent);
    const registrarName = this.extractRegistrar(textContent);
    const { freshIssueCr, ofsCr } = this.extractIssueComponents(textContent);
    const faceValue = this.extractFaceValue(textContent);
    const issueObjects = this.extractObjectsOfIssue(textContent);

    return {
      brlms,
      registrarName,
      freshIssueCr,
      ofsCr,
      faceValue,
      issueObjects,
      extractionSource: 'regulatory_document_analysis',
    };
  }

  private extractBrlms(text: string): string[] {
    const matched: string[] = [];
    for (const brlm of this.KNOWN_BRLMS) {
      const regex = new RegExp(brlm.replace(/\s+/g, '\\s+'), 'i');
      if (regex.test(text)) {
        matched.push(brlm);
      }
    }
    return matched;
  }

  private extractRegistrar(text: string): string | null {
    for (const reg of this.KNOWN_REGISTRARS) {
      const regex = new RegExp(reg.replace(/\s+/g, '\\s+'), 'i');
      if (regex.test(text)) {
        return reg;
      }
    }

    // Pattern: Registrar: <Name>
    const match = text.match(/(?:registrar\s+to\s+the\s+issue|registrar)[\s:]+([A-Za-z0-9\s&.,'-]+?(?:limited|pvt|ltd))/i);
    if (match && match[1]) {
      return match[1].trim();
    }

    return null;
  }

  private extractIssueComponents(text: string): { freshIssueCr?: number | null; ofsCr?: number | null } {
    let freshIssueCr: number | null = null;
    let ofsCr: number | null = null;

    // Fresh Issue pattern: handles "Fresh Issue aggregating up to Rs. X Crores", "Fresh Issue of Rs. X Cr", etc.
    const freshMatch = text.match(/fresh\s+issue[\s\w]*?(?:rs\.?|inr|₹)\s*([\d,.]+)\s*(?:cr|crore|crores)/i);
    if (freshMatch && freshMatch[1]) {
      const val = parseFloat(freshMatch[1].replace(/,/g, ''));
      if (!isNaN(val) && val > 0) freshIssueCr = val;
    }

    // Offer for Sale pattern: handles "Offer for Sale aggregating up to Rs. Y Crores", "OFS of Rs. Y Cr", etc.
    const ofsMatch = text.match(/(?:offer\s+for\s+sale|ofs)[\s\w]*?(?:rs\.?|inr|₹)\s*([\d,.]+)\s*(?:cr|crore|crores)/i);
    if (ofsMatch && ofsMatch[1]) {
      const val = parseFloat(ofsMatch[1].replace(/,/g, ''));
      if (!isNaN(val) && val > 0) ofsCr = val;
    }

    return { freshIssueCr, ofsCr };
  }

  private extractFaceValue(text: string): number | null {
    const fvMatch = text.match(/face\s+value\s+of\s*(?:rs\.?|inr|₹)?\s*(\d+(?:\.\d+)?)\s*(?:each|per)/i);
    if (fvMatch && fvMatch[1]) {
      const val = parseFloat(fvMatch[1]);
      if (!isNaN(val) && val > 0) return val;
    }
    return null;
  }

  private extractObjectsOfIssue(text: string): string[] {
    const objects: string[] = [];
    const lower = text.toLowerCase();

    if (lower.includes('debt') || lower.includes('repayment') || lower.includes('pre-payment')) {
      objects.push('Repayment or prepayment of outstanding borrowings');
    }
    if (lower.includes('capex') || lower.includes('capital expenditure') || lower.includes('manufacturing facility')) {
      objects.push('Funding capital expenditure requirements');
    }
    if (lower.includes('general corporate') || lower.includes('gcp')) {
      objects.push('General corporate purposes');
    }
    if (lower.includes('working capital')) {
      objects.push('Funding working capital requirements');
    }

    return objects;
  }
}

export const documentMetadataExtractor = new DocumentMetadataExtractor();
