/**
 * features/external-integrations/providers/providerRegistry.ts
 *
 * Central registry for external financial infrastructure providers.
 * Enforces dual-layer capability authorization:
 * 1. TypeScript registry static contract definition
 * 2. Database capabilities JSONB operational state
 *
 * Execution requires BOTH to permit capability. Fail closed on any mismatch.
 */

import {
  IExternalProvider,
  ExternalProviderType,
  ExternalProviderCapabilities,
  CapabilityState,
  CapabilityNotAvailableError,
} from './providerTypes';

export interface DatabaseProviderRecord {
  id: string;
  name: string;
  enabled: boolean;
  capabilities: Record<string, string>;
  configuration?: Record<string, unknown>;
}

class ExternalProviderRegistry {
  private providers: Map<string, IExternalProvider> = new Map();

  /**
   * Register an external provider with the registry.
   */
  public registerProvider(provider: IExternalProvider): void {
    if (this.providers.has(provider.providerId)) {
      throw new Error(`Provider with id '${provider.providerId}' is already registered.`);
    }
    this.providers.set(provider.providerId, provider);
  }

  /**
   * Look up a provider by its unique identifier.
   */
  public getProvider(providerId: string): IExternalProvider | undefined {
    return this.providers.get(providerId);
  }

  /**
   * Get a provider or throw an error if not found.
   */
  public requireProvider(providerId: string): IExternalProvider {
    const provider = this.getProvider(providerId);
    if (!provider) {
      throw new Error(`External provider '${providerId}' not found in registry.`);
    }
    return provider;
  }

  /**
   * List all registered providers, optionally filtering by provider type.
   */
  public listProviders(filterType?: ExternalProviderType): IExternalProvider[] {
    const all = Array.from(this.providers.values());
    if (filterType) {
      return all.filter((p) => p.providerType === filterType);
    }
    return all;
  }

  /**
   * Assert that a provider exists, is enabled, and has the specified capability in 'enabled' state.
   * Throws CapabilityNotAvailableError if not enabled in TypeScript contract.
   */
  public assertCapability(
    providerId: string,
    capability: keyof ExternalProviderCapabilities
  ): IExternalProvider {
    const provider = this.requireProvider(providerId);
    const state = provider.capabilities[capability] ?? 'unsupported';

    if (state !== 'enabled') {
      throw new CapabilityNotAvailableError(providerId, capability, state);
    }

    if (!provider.enabled) {
      throw new CapabilityNotAvailableError(providerId, capability, 'disabled');
    }

    return provider;
  }

  /**
   * Dual-Layer Operational Gating:
   * Validates both TypeScript static contract AND database operational capability state.
   * Fails closed on any mismatch.
   */
  public assertOperationalCapability(
    providerId: string,
    capability: keyof ExternalProviderCapabilities,
    dbRecord?: DatabaseProviderRecord
  ): IExternalProvider {
    // 1. Validate TypeScript contract layer
    const provider = this.assertCapability(providerId, capability);

    // 2. Validate DB operational state layer
    if (dbRecord) {
      if (!dbRecord.enabled) {
        throw new CapabilityNotAvailableError(providerId, capability, 'disabled');
      }

      const dbCapabilityState = (dbRecord.capabilities?.[capability] ?? 'unsupported') as CapabilityState;
      if (dbCapabilityState !== 'enabled') {
        throw new CapabilityNotAvailableError(
          providerId,
          capability,
          dbCapabilityState
        );
      }
    }

    return provider;
  }

  /**
   * Clear registry (used strictly for test isolation).
   */
  public clear(): void {
    this.providers.clear();
  }
}

export const providerRegistry = new ExternalProviderRegistry();
