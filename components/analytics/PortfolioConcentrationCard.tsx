import React from 'react';
import type { PortfolioConcentrationReport } from '@/features/analytics/types/analytics.types';

interface PortfolioConcentrationCardProps {
  report: PortfolioConcentrationReport;
}

export const PortfolioConcentrationCard: React.FC<PortfolioConcentrationCardProps> = ({ report }) => {
  const getBadgeStyle = (level: 'low' | 'moderate' | 'high') => {
    switch (level) {
      case 'low':
        return {
          background: 'rgba(34, 197, 94, 0.12)',
          color: '#22c55e',
          border: '1px solid rgba(34, 197, 94, 0.25)',
          label: 'Low Concentration (Well Diversified)',
        };
      case 'moderate':
        return {
          background: 'rgba(234, 179, 8, 0.12)',
          color: '#eab308',
          border: '1px solid rgba(234, 179, 8, 0.25)',
          label: 'Moderate Concentration',
        };
      case 'high':
        return {
          background: 'rgba(239, 68, 68, 0.12)',
          color: '#ef4444',
          border: '1px solid rgba(239, 68, 68, 0.25)',
          label: 'High Concentration (Sector Clustered)',
        };
    }
  };

  const badge = getBadgeStyle(report.concentrationClassification);
  const isMarketValueActive = report.primaryHhiMarketValue !== null && report.marketValueCoveragePct >= 70;
  const activeHhi = isMarketValueActive ? report.primaryHhiMarketValue! : report.fallbackHhiInvestedCost;

  return (
    <div
      style={{
        background: 'var(--color-bg-surface, #18181b)',
        border: '1px solid var(--color-border, #27272a)',
        borderRadius: '12px',
        padding: '24px',
        display: 'flex',
        flexDirection: 'column',
        gap: '18px',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--color-text-primary, #fafafa)', margin: 0 }}>
            Portfolio Concentration Index (HHI)
          </h3>
          <p style={{ fontSize: '0.82rem', color: 'var(--color-text-secondary, #a1a1aa)', margin: '4px 0 0 0' }}>
            Herfindahl-Hirschman Index across sector allocations ({report.ownershipScope.toUpperCase()})
          </p>
        </div>
        <span
          style={{
            fontSize: '0.75rem',
            fontWeight: 600,
            padding: '4px 10px',
            borderRadius: '9999px',
            background: badge.background,
            color: badge.color,
            border: badge.border,
          }}
        >
          {badge.label}
        </span>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
          gap: '16px',
          background: 'var(--color-bg-elevated, #202024)',
          padding: '16px',
          borderRadius: '8px',
        }}
      >
        <div>
          <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary, #a1a1aa)' }}>Active HHI Score</div>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: badge.color }}>
            {activeHhi}
            <span style={{ fontSize: '0.8rem', fontWeight: 400, color: 'var(--color-text-secondary, #a1a1aa)' }}>
              {' '}
              / 10000
            </span>
          </div>
        </div>

        <div>
          <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary, #a1a1aa)' }}>Sectors Exposed</div>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--color-text-primary, #fafafa)' }}>
            {report.sectorBreakdown.length}
          </div>
        </div>

        <div>
          <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary, #a1a1aa)' }}>Top Sector Share</div>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--color-text-primary, #fafafa)' }}>
            {report.topSectorWeightPct.toFixed(1)}%
          </div>
        </div>

        <div>
          <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary, #a1a1aa)' }}>Valuation Coverage</div>
          <div
            style={{
              fontSize: '1.75rem',
              fontWeight: 700,
              color: report.marketValueCoveragePct >= 70 ? '#22c55e' : '#eab308',
            }}
          >
            {report.marketValueCoveragePct.toFixed(0)}%
          </div>
        </div>
      </div>

      <div
        style={{
          fontSize: '0.78rem',
          color: 'var(--color-text-secondary, #a1a1aa)',
          lineHeight: 1.5,
          background: 'rgba(255, 255, 255, 0.03)',
          padding: '12px',
          borderRadius: '6px',
          border: '1px dashed var(--color-border, #27272a)',
        }}
      >
        <strong style={{ color: 'var(--color-text-primary, #fafafa)' }}>Dual-Methodology Disclosure: </strong>
        {isMarketValueActive ? (
          <>
            Primary index evaluated on <strong>Market-Value basis</strong> ({report.marketValueCoveragePct.toFixed(0)}% of holdings have active market quotes). Fallback cost HHI is {report.fallbackHhiInvestedCost}.
          </>
        ) : (
          <>
            Evaluated on <strong>Invested-Cost fallback basis</strong> ({report.fallbackHhiInvestedCost}) because active market price coverage is {report.marketValueCoveragePct.toFixed(0)}% (&lt;70% threshold).
          </>
        )}
        {report.isMarketValuePartial && (
          <span style={{ display: 'block', marginTop: '4px', color: '#eab308' }}>
            ⚠️ Partial valuation coverage: some unlisted or unpriced holdings use cost-basis weights.
          </span>
        )}
      </div>
    </div>
  );
};
