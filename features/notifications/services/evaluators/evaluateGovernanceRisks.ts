/**
 * features/notifications/services/evaluators/evaluateGovernanceRisks.ts
 *
 * Phase 7B: Governance Risk Alert Evaluator
 * Evaluates ipo_risks using verified schema:
 * - severity (enum ipo_risk_severity: 'low', 'medium', 'high')
 * - title, description, category, ipo_id
 *
 * Emits governance_risk_alert strictly for severity = 'high' entries.
 */

export interface IPORiskRecord {
  id: string;
  ipoId: string;
  title: string;
  description?: string | null;
  severity: 'low' | 'medium' | 'high';
  category?: string | null;
  companyName?: string;
  symbol?: string | null;
  slug?: string;
}

export class GovernanceRiskEvaluator {
  /**
   * Evaluates an array of risks, emitting governance_risk_alert for high severity items.
   */
  static evaluateRisks(risks: IPORiskRecord[]) {
    const highRisks = risks.filter((r) => r.severity === 'high');

    return highRisks.map((risk) => ({
      eventType: 'governance_risk_alert',
      eventClass: 'condition_driven' as const,
      idempotencyKey: `risk:high:${risk.id}`,
      aggregateType: 'ipo_risks' as const,
      aggregateId: risk.id,
      payload: {
        risk_id: risk.id,
        ipo_id: risk.ipoId,
        company_name: risk.companyName || 'IPO Candidate',
        symbol: risk.symbol,
        slug: risk.slug,
        risk_title: risk.title,
        severity: risk.severity,
        risk_category: risk.category || 'Governance',
      },
    }));
  }
}
