/**
 * features/finance/services/taxClassificationService.ts
 *
 * Candidate E: Versioned, Config-Driven Tax Classification Policy (E20).
 * 
 * ARCHITECTURAL MANDATE:
 * Tax classification rules are completely externalized from exit logic into
 * immutable, versioned configuration policies. 
 * Classification is explicitly an internal accounting classification, not a legal tax-filing determination.
 */

export interface TaxRulePolicy {
  version: string;
  instrumentScope: 'LISTED_EQUITY';
  effectiveFrom: string;
  effectiveTo?: string | null;
  shortTermThresholdDays: number;
  description: string;
  disclaimer: string;
}

export const TAX_RULE_REGISTRY: Record<string, TaxRulePolicy> = {
  'IN_EQUITY_2024_V1': {
    version: 'IN_EQUITY_2024_V1',
    instrumentScope: 'LISTED_EQUITY',
    effectiveFrom: '2024-04-01',
    effectiveTo: null,
    shortTermThresholdDays: 365,
    description: 'Indian listed equity holding period: < 365 days = STCG, >= 365 days = LTCG',
    disclaimer: 'ACCOUNTING_CLASSIFICATION_ONLY: For portfolio accounting tracking, not statutory tax filing advice.',
  },
};

export const DEFAULT_TAX_RULE_VERSION = 'IN_EQUITY_2024_V1';

export interface LotClassificationResult {
  holdingPeriodDays: number;
  taxClassification: 'STCG' | 'LTCG';
  taxRuleVersion: string;
  disclaimer: string;
}

export class TaxClassificationService {
  /**
   * Retrieves an immutable tax rule policy by version.
   */
  public static getPolicy(version: string = DEFAULT_TAX_RULE_VERSION): TaxRulePolicy {
    const policy = TAX_RULE_REGISTRY[version];
    if (!policy) {
      throw new Error(`UNKNOWN_TAX_RULE_VERSION: Policy version '${version}' is not registered.`);
    }
    return policy;
  }

  /**
   * Classifies an acquisition lot slice based on calendar holding period.
   * E20: Fully deterministic, versioned, and policy-driven.
   */
  public static classifyHolding(
    acquisitionDate: string | Date,
    executionDate: string | Date = new Date(),
    policyVersion: string = DEFAULT_TAX_RULE_VERSION
  ): LotClassificationResult {
    const policy = this.getPolicy(policyVersion);
    
    const acqMs = new Date(acquisitionDate).getTime();
    const execMs = new Date(executionDate).getTime();

    if (isNaN(acqMs) || isNaN(execMs)) {
      throw new Error('INVALID_DATE: acquisitionDate and executionDate must be valid ISO date strings or Date objects.');
    }

    if (execMs < acqMs) {
      throw new Error('CHRONOLOGY_VIOLATION: executionDate cannot be earlier than acquisitionDate.');
    }

    // Difference in whole calendar days (24 hours = 86,400,000 ms)
    const diffMs = execMs - acqMs;
    const holdingPeriodDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    const taxClassification: 'STCG' | 'LTCG' = 
      holdingPeriodDays < policy.shortTermThresholdDays ? 'STCG' : 'LTCG';

    return {
      holdingPeriodDays,
      taxClassification,
      taxRuleVersion: policy.version,
      disclaimer: policy.disclaimer,
    };
  }

  /**
   * Aggregates lot-level allocations into the overall exit tax classification.
   * E7: If all allocations are STCG => STCG. If all LTCG => LTCG. If mixed => MIXED.
   */
  public static aggregateClassification(
    allocations: Array<{ taxClassification: 'STCG' | 'LTCG' }>
  ): 'STCG' | 'LTCG' | 'MIXED' {
    if (!allocations || allocations.length === 0) {
      return 'STCG';
    }

    const hasStcg = allocations.some((a) => a.taxClassification === 'STCG');
    const hasLtcg = allocations.some((a) => a.taxClassification === 'LTCG');

    if (hasStcg && hasLtcg) return 'MIXED';
    if (hasLtcg) return 'LTCG';
    return 'STCG';
  }
}
