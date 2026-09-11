import React from 'react';
import Link from 'next/link';
import type { OpportunityRankingCard, FreshnessStatus } from '@/features/analytics/types/analytics.types';

interface OpportunityRankingWidgetProps {
  opportunities: OpportunityRankingCard[];
  onCompareSelect?: (slug: string) => void;
  selectedCompareSlugs?: string[];
}

export const OpportunityRankingWidget: React.FC<OpportunityRankingWidgetProps> = ({
  opportunities,
  onCompareSelect,
  selectedCompareSlugs = [],
}) => {
  const getScoreBadgeColor = (score: number) => {
    if (score >= 80) return '#22c55e';
    if (score >= 65) return '#3b82f6';
    if (score >= 50) return '#eab308';
    return '#ef4444';
  };

  const getFreshnessColor = (freshness: FreshnessStatus) => {
    switch (freshness) {
      case 'fresh':
        return { label: 'Fresh (<24h)', color: '#22c55e', bg: 'rgba(34, 197, 94, 0.12)', border: '1px solid rgba(34, 197, 94, 0.25)' };
      case 'recent':
        return { label: 'Recent (<7d)', color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.12)', border: '1px solid rgba(59, 130, 246, 0.25)' };
      case 'stale':
      default:
        return { label: 'Stale (>7d)', color: '#eab308', bg: 'rgba(234, 179, 8, 0.12)', border: '1px solid rgba(234, 179, 8, 0.25)' };
    }
  };

  if (!opportunities || opportunities.length === 0) {
    return (
      <div
        style={{
          padding: '32px',
          textAlign: 'center',
          background: 'var(--color-bg-surface, #18181b)',
          border: '1px solid var(--color-border, #27272a)',
          borderRadius: '12px',
          color: 'var(--color-text-secondary, #a1a1aa)',
        }}
      >
        No ranked IPO opportunities found for the selected criteria.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h3 style={{ fontSize: '1.2rem', fontWeight: 600, color: 'var(--color-text-primary, #fafafa)', margin: 0 }}>
            Explainable Opportunity Rankings
          </h3>
          <p style={{ fontSize: '0.82rem', color: 'var(--color-text-secondary, #a1a1aa)', margin: '4px 0 0 0' }}>
            Multi-factor quantitative composite scores with transparent positive drivers and risk flags
          </p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '16px' }}>
        {opportunities.map((opp) => {
          const isSelected = selectedCompareSlugs.includes(opp.slug);
          const freshnessBadge = getFreshnessColor(opp.freshnessStatus);
          return (
            <div
              key={opp.ipoId}
              style={{
                background: 'var(--color-bg-surface, #18181b)',
                border: isSelected ? '1px solid var(--primary, #3b82f6)' : '1px solid var(--color-border, #27272a)',
                borderRadius: '12px',
                padding: '20px',
                display: 'flex',
                flexDirection: 'column',
                gap: '14px',
                boxShadow: isSelected ? '0 0 12px rgba(59, 130, 246, 0.2)' : 'none',
                position: 'relative',
              }}
            >
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span
                    style={{
                      width: '26px',
                      height: '26px',
                      borderRadius: '50%',
                      background: 'var(--color-bg-elevated, #27272a)',
                      color: 'var(--color-text-secondary, #a1a1aa)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '0.78rem',
                      fontWeight: 700,
                    }}
                  >
                    #{opp.rank}
                  </span>
                  <div>
                    <Link
                      href={`/ipos/${opp.slug}`}
                      style={{
                        fontWeight: 600,
                        fontSize: '1rem',
                        color: 'var(--color-text-primary, #fafafa)',
                        textDecoration: 'none',
                      }}
                    >
                      {opp.companyName}
                    </Link>
                    <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary, #a1a1aa)' }}>
                      {opp.symbol} • {opp.category.toUpperCase()} • {opp.status.toUpperCase()}
                    </div>
                  </div>
                </div>

                <div style={{ textAlign: 'right' }}>
                  <div
                    style={{
                      fontSize: '1.25rem',
                      fontWeight: 800,
                      color: getScoreBadgeColor(opp.overallScore),
                    }}
                  >
                    {opp.overallScore}
                    <span style={{ fontSize: '0.75rem', fontWeight: 400, color: 'var(--color-text-secondary, #a1a1aa)' }}>
                      /100
                    </span>
                  </div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--color-text-secondary, #a1a1aa)' }}>Research Score</div>
                </div>
              </div>

              {/* Data Completeness & Metric Freshness */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  fontSize: '0.72rem',
                  padding: '6px 10px',
                  background: 'var(--color-bg-elevated, #202024)',
                  borderRadius: '6px',
                }}
              >
                <div>
                  <span style={{ color: 'var(--color-text-secondary, #a1a1aa)' }}>Prospectus Completeness: </span>
                  <strong style={{ color: opp.dataCompletenessPct >= 80 ? '#22c55e' : '#eab308' }}>
                    {opp.dataCompletenessPct}%
                  </strong>
                </div>
                <div
                  style={{
                    padding: '2px 6px',
                    borderRadius: '4px',
                    background: freshnessBadge.bg,
                    color: freshnessBadge.color,
                    border: freshnessBadge.border,
                    fontWeight: 600,
                  }}
                  title="Intelligence update freshness"
                >
                  {freshnessBadge.label}
                </div>
              </div>

              {/* Positive Drivers */}
              <div>
                <div style={{ fontSize: '0.72rem', fontWeight: 600, color: '#22c55e', marginBottom: '4px' }}>
                  POSITIVE DRIVERS
                </div>
                {opp.positiveDrivers.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                    {opp.positiveDrivers.map((driver, dIdx) => (
                      <div
                        key={dIdx}
                        style={{
                          fontSize: '0.75rem',
                          color: 'var(--color-text-primary, #fafafa)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                        }}
                      >
                        <span style={{ color: '#22c55e', fontSize: '0.8rem' }}>✓</span> {driver}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary, #71717a)' }}>Standard disclosures</div>
                )}
              </div>

              {/* Risk Flags */}
              <div>
                <div style={{ fontSize: '0.72rem', fontWeight: 600, color: '#ef4444', marginBottom: '4px' }}>
                  RISK FACTORS
                </div>
                {opp.riskWarnings.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                    {opp.riskWarnings.map((flag, fIdx) => (
                      <div
                        key={fIdx}
                        style={{
                          fontSize: '0.75rem',
                          color: '#fca5a5',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                        }}
                      >
                        <span style={{ color: '#ef4444', fontSize: '0.8rem' }}>⚠️</span> {flag}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary, #71717a)' }}>None flagged</div>
                )}
              </div>

              {/* Footer Actions */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginTop: 'auto',
                  paddingTop: '10px',
                  borderTop: '1px solid var(--color-border, #27272a)',
                }}
              >
                <Link
                  href={`/ipos/${opp.slug}`}
                  style={{
                    fontSize: '0.78rem',
                    color: 'var(--color-brand-primary, #3b82f6)',
                    textDecoration: 'none',
                    fontWeight: 500,
                  }}
                >
                  View Full Research →
                </Link>

                {onCompareSelect && (
                  <button
                    type="button"
                    onClick={() => onCompareSelect(opp.slug)}
                    style={{
                      fontSize: '0.75rem',
                      padding: '4px 10px',
                      borderRadius: '6px',
                      border: isSelected ? '1px solid #3b82f6' : '1px solid var(--color-border, #3f3f46)',
                      background: isSelected ? 'rgba(59, 130, 246, 0.2)' : 'transparent',
                      color: isSelected ? '#60a5fa' : 'var(--color-text-primary, #fafafa)',
                      cursor: 'pointer',
                    }}
                  >
                    {isSelected ? '✓ Selected' : '+ Compare'}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary, #a1a1aa)', textAlign: 'center', marginTop: '8px' }}>
        * Quantitative composite opportunity rankings based on public prospectus disclosures and market demand. Non-advisory only.
      </div>
    </div>
  );
};
