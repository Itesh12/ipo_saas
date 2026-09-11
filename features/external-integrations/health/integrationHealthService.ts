/**
 * features/external-integrations/health/integrationHealthService.ts
 *
 * Integration health monitor and telemetry aggregation.
 * Enforces strict 6-state health precedence.
 *
 * Precedence Waterfall:
 * 1. planned provider/capabilities -> 'planned'
 * 2. disabled by admin -> 'disabled'
 * 3. configuration missing -> 'not_configured'
 * 4. configured but no live external connectivity -> 'standby' (STAGE 2 BASELINE)
 * 5. external connectivity unhealthy -> 'degraded'
 * 6. external connectivity verified -> 'healthy' (UNREACHABLE IN STAGE 2)
 */

import { providerRegistry } from '../providers/providerRegistry';
import { ProviderHealth, ProviderHealthStatus } from '../providers/providerTypes';

export interface IntegrationTelemetrySnapshot {
  timestamp: string;
  totalProviders: number;
  healthyCount: number;
  standbyCount: number;
  disabledCount: number;
  plannedCount: number;
  notConfiguredCount: number;
  unhealthyCount: number;
  providers: ProviderHealth[];
}

export class IntegrationHealthService {
  /**
   * Resolves health status strictly adhering to the 6-state precedence model.
   */
  public resolveHealthState(
    hasLiveConnection: boolean,
    isOperational: boolean,
    configComplete: boolean,
    adminEnabled: boolean,
    isPlannedOnly: boolean
  ): ProviderHealthStatus {
    // 1. Planned
    if (isPlannedOnly) return 'planned';
    // 2. Disabled
    if (!adminEnabled) return 'disabled';
    // 3. Not Configured
    if (!configComplete) return 'not_configured';
    // 4. Standby (Configured and operational locally, but zero external connectivity)
    if (!hasLiveConnection) return 'standby';
    // 5. Degraded / Healthy (Requires real external connectivity)
    return isOperational ? 'healthy' : 'degraded';
  }

  /**
   * Evaluates the aggregated health across all registered providers.
   */
  public async getAggregatedHealth(): Promise<IntegrationTelemetrySnapshot> {
    const providers = providerRegistry.listProviders();
    const healthResults: ProviderHealth[] = [];

    for (const provider of providers) {
      try {
        const health = await provider.getHealth();
        // Invariant: Stage 2 providers have zero external connectivity, so 'healthy' is normalized to 'standby'
        const safeStatus = health.status === 'healthy' ? 'standby' : health.status;
        healthResults.push({
          ...health,
          status: safeStatus,
        });
      } catch (err: unknown) {
        healthResults.push({
          providerId: provider.providerId,
          status: 'unhealthy',
          latencyMs: 0,
          lastCheckedAt: new Date().toISOString(),
          errorRatePercent: 100,
          details: err instanceof Error ? err.message : 'Health check failed.',
        });
      }
    }

    const healthyCount = healthResults.filter((h) => h.status === 'healthy').length;
    const standbyCount = healthResults.filter((h) => h.status === 'standby').length;
    const disabledCount = healthResults.filter((h) => h.status === 'disabled').length;
    const plannedCount = healthResults.filter((h) => h.status === 'planned').length;
    const notConfiguredCount = healthResults.filter((h) => h.status === 'not_configured').length;
    const unhealthyCount = healthResults.filter(
      (h) => h.status === 'unhealthy' || h.status === 'degraded'
    ).length;

    return {
      timestamp: new Date().toISOString(),
      totalProviders: providers.length,
      healthyCount,
      standbyCount,
      disabledCount,
      plannedCount,
      notConfiguredCount,
      unhealthyCount,
      providers: healthResults,
    };
  }
}

export const integrationHealthService = new IntegrationHealthService();
