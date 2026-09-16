/**
 * features/allotment-verification/services/registrarCapabilityRegistry.ts
 *
 * Dynamic Registrar Capability Configuration Registry for Stage 4:
 * Evaluates whether a registrar supports PAN/DP/AppNo lookups, headless API queries,
 * interactive challenges, and terms of service access.
 * Enforces fail-closed safety if a registrar endpoint is revoked, deactivated, or unverified.
 */

import { createAdminClient } from '@/lib/supabase/admin';
import { LookupType, RegistrarCapability } from '../types/verificationTypes';

export class RegistrarCapabilityRegistry {
  private static cachedCapabilities: Map<string, RegistrarCapability> = new Map();
  private static lastCacheFetch: number = 0;
  private static readonly CACHE_TTL_MS = 60 * 1000; // 1 minute in-memory cache

  /**
   * Fetches all active registrar capabilities with short-lived memory caching.
   */
  static async getAllCapabilities(forceRefresh = false): Promise<RegistrarCapability[]> {
    const now = Date.now();
    if (
      !forceRefresh &&
      this.cachedCapabilities.size > 0 &&
      now - this.lastCacheFetch < this.CACHE_TTL_MS
    ) {
      return Array.from(this.cachedCapabilities.values());
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('ipo_registrar_capabilities')
      .select('*')
      .order('registrar_code', { ascending: true });

    if (error) {
      console.error('[RegistrarCapabilityRegistry] Error fetching capabilities:', error);
      // Return cached fallback if available
      return Array.from(this.cachedCapabilities.values());
    }

    this.cachedCapabilities.clear();
    for (const cap of (data || []) as RegistrarCapability[]) {
      this.cachedCapabilities.set(cap.registrar_code, cap);
    }
    this.lastCacheFetch = now;

    return Array.from(this.cachedCapabilities.values());
  }

  /**
   * Retrieves the capability record for a given registrar code.
   */
  static async getCapability(registrarCode: string): Promise<RegistrarCapability | null> {
    await this.getAllCapabilities();
    return this.cachedCapabilities.get(registrarCode) || null;
  }

  /**
   * Evaluates whether a registrar supports a given lookup type (pan, dp_client_id, application_no).
   */
  static async canLookupWith(registrarCode: string, lookupType: LookupType): Promise<boolean> {
    const cap = await this.getCapability(registrarCode);
    if (!cap || !cap.is_active) return false;

    switch (lookupType) {
      case 'pan':
        return cap.supports_pan_lookup;
      case 'dp_client_id':
        return cap.supports_dp_client_id_lookup;
      case 'application_no':
        return cap.supports_application_no_lookup;
      default:
        return false;
    }
  }

  /**
   * Checks if an automated headless API query is allowed for this registrar.
   * If false or if interactive challenge is required, requires user-assisted mode.
   */
  static async isHeadlessAllowed(registrarCode: string): Promise<boolean> {
    const cap = await this.getCapability(registrarCode);
    if (!cap || !cap.is_active) return false;
    return cap.is_headless_api_available && !cap.requires_interactive_challenge;
  }

  /**
   * Checks if terms and access status is active and verified.
   * Enforces fail-closed: returns false if not 'verified'.
   */
  static async isAccessPermitted(registrarCode: string): Promise<boolean> {
    const cap = await this.getCapability(registrarCode);
    if (!cap || !cap.is_active) return false;
    return cap.terms_access_status === 'verified';
  }

  /**
   * Updates dynamic capability status (e.g. if an endpoint changes its challenge requirements).
   */
  static async updateCapability(
    registrarCode: string,
    updates: Partial<RegistrarCapability>
  ): Promise<boolean> {
    const supabase = createAdminClient();
    const { error } = await supabase
      .from('ipo_registrar_capabilities')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('registrar_code', registrarCode);

    if (error) {
      console.error(`[RegistrarCapabilityRegistry] Failed to update ${registrarCode}:`, error);
      return false;
    }

    // Invalidate cache
    this.lastCacheFetch = 0;
    return true;
  }
}
