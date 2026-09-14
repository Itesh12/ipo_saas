/**
 * features/external-integrations/documents/documentClassifier.ts
 *
 * Multi-Signal Regulatory Document Classifier.
 * Analyzes Title, URL path, and Source Category.
 * Produces structured classification, confidence score, and triggers conflict freeze if signals contradict.
 */

import { IPODocType } from "@/types/database.types";
import { DocumentClassificationResult } from "./documentTypes";
import { documentSourceRegistry } from "./documentSourceRegistry";

export class DocumentClassifier {
  /**
   * Classifies a discovered document using multiple signals.
   */
  public classify(
    title: string,
    url: string,
    source: string = 'sebi',
    rawCategory?: string | null
  ): DocumentClassificationResult {
    const cleanTitle = (title || '').toLowerCase().trim();
    const cleanUrl = (url || '').toLowerCase().trim();
    const cleanCategory = (rawCategory || '').toLowerCase().trim();

    let hostname = '';
    try {
      hostname = new URL(url).hostname;
    } catch {}
    const sourceLabel = documentSourceRegistry.getDisplayName(hostname, source);

    // 1. Detect Document Type from Title
    const titleType = this.detectTypeFromText(cleanTitle);

    // 2. Detect Document Type from URL Path
    const urlType = this.detectTypeFromUrl(cleanUrl);

    // 3. Signal Conflict Check: If title and URL strongly disagree on critical offer documents
    if (titleType && urlType && titleType !== urlType) {
      // Conflict: e.g. Title says Prospectus/RHP, but URL contains /drhp/
      const isCriticalMismatch =
        (titleType === 'drhp' && (urlType === 'rhp' || urlType === 'prospectus')) ||
        (titleType === 'rhp' && (urlType === 'drhp' || urlType === 'prospectus')) ||
        (titleType === 'prospectus' && (urlType === 'drhp' || urlType === 'rhp'));

      if (isCriticalMismatch) {
        return {
          documentType: 'other',
          subType: 'classification_conflict',
          confidence: 0.0,
          classificationReason: `Contradiction detected: Title indicates "${titleType.toUpperCase()}" while URL path indicates "${urlType.toUpperCase()}".`,
          sourceLabel,
          hasConflict: true,
          conflictDetails: `Title: "${title}" vs URL: "${url}"`,
        };
      }
    }

    // 4. Resolve Final Document Type
    let finalType: IPODocType = 'other';
    let subType = 'general_filing';
    let confidence = 0.7;
    let reason = 'Default classification';

    if (titleType) {
      finalType = titleType;
      subType = `${titleType}_filing`;
      confidence = urlType === titleType ? 0.98 : 0.90;
      reason = urlType === titleType
        ? `Both title and URL path confirm ${titleType.toUpperCase()}.`
        : `Title strongly indicates ${titleType.toUpperCase()}.`;
    } else if (urlType) {
      finalType = urlType;
      subType = `${urlType}_path`;
      confidence = 0.85;
      reason = `URL path indicates ${urlType.toUpperCase()}.`;
    } else if (cleanCategory.includes('drhp')) {
      finalType = 'drhp';
      subType = 'category_drhp';
      confidence = 0.80;
      reason = 'Source category designates DRHP filing.';
    }

    return {
      documentType: finalType,
      subType,
      confidence,
      classificationReason: reason,
      sourceLabel,
      hasConflict: false,
    };
  }

  private detectTypeFromText(text: string): IPODocType | null {
    if (!text) return null;

    // Anchor Allocation
    if (
      text.includes('anchor investor') ||
      text.includes('anchor allocation') ||
      text.includes('anchor allotment')
    ) {
      return 'anchor_allocation';
    }

    // Basis of Allotment
    if (
      text.includes('basis of allotment') ||
      text.includes('allotment basis')
    ) {
      return 'basis_of_allotment';
    }

    // Corrigendum
    if (
      text.includes('corrigendum') ||
      text.includes('errata')
    ) {
      return 'corrigendum';
    }

    // Addendum
    if (
      text.includes('addendum') ||
      text.includes('supplement')
    ) {
      return 'addendum';
    }

    // Abridged Prospectus
    if (
      text.includes('abridged prospectus') ||
      text.includes('draft abridged prospectus')
    ) {
      return 'abridged_prospectus';
    }

    // Draft Red Herring Prospectus (DRHP) - Checked before RHP
    if (
      text.includes('draft red herring') ||
      text.includes('drhp') ||
      text.includes('draft offer document')
    ) {
      return 'drhp';
    }

    // Red Herring Prospectus (RHP)
    if (
      text.includes('red herring prospectus') ||
      text.includes('rhp')
    ) {
      return 'rhp';
    }

    // Final Prospectus
    if (
      text.includes('prospectus') ||
      text.includes('offer document')
    ) {
      return 'prospectus';
    }

    // Investor Presentation
    if (
      text.includes('investor presentation') ||
      text.includes('roadshow presentation') ||
      text.includes('corporate presentation')
    ) {
      return 'presentation';
    }

    // Financials
    if (
      text.includes('financial statement') ||
      text.includes('restated financial')
    ) {
      return 'financials';
    }

    // Notice
    if (
      text.includes('public notice') ||
      text.includes('statutory notice') ||
      text.includes('price band announcement')
    ) {
      return 'notice';
    }

    return null;
  }

  private detectTypeFromUrl(url: string): IPODocType | null {
    if (!url) return null;

    if (url.includes('/drhp/') || url.includes('-drhp.') || url.includes('_drhp.') || url.includes('drhp.pdf')) {
      return 'drhp';
    }
    if (url.includes('/rhp/') || url.includes('-rhp.') || url.includes('_rhp.') || url.includes('rhp.pdf')) {
      return 'rhp';
    }
    if (url.includes('/prospectus/') || url.includes('-prospectus.') || url.includes('prospectus.pdf')) {
      return 'prospectus';
    }
    if (url.includes('anchor') && (url.includes('allocation') || url.includes('allotment'))) {
      return 'anchor_allocation';
    }
    if (url.includes('basis-of-allotment') || url.includes('basis_of_allotment')) {
      return 'basis_of_allotment';
    }
    if (url.includes('addendum')) {
      return 'addendum';
    }
    if (url.includes('corrigendum')) {
      return 'corrigendum';
    }
    if (url.includes('abridged')) {
      return 'abridged_prospectus';
    }

    return null;
  }
}

export const documentClassifier = new DocumentClassifier();
