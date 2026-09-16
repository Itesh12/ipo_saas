/**
 * features/allotment-verification/services/issueBindingResolver.ts
 *
 * Deterministic Issue Binding Resolver for Stage 4:
 * Maps an IPO to its registrar-specific internal issue ID (e.g. Link Intime '1042' or KFin 'KFIN_TATA_TECH').
 * Eliminates fragile company-name string matching at verification time.
 */

import { createAdminClient } from '@/lib/supabase/admin';
import { RegistrarIssueBinding } from '../types/verificationTypes';

export interface BindingResolutionResult {
  binding: RegistrarIssueBinding | null;
  registrarCode: string | null;
  status: 'bound' | 'unbound_no_registrar' | 'unbound_no_issue_id';
  message: string;
}

export class IssueBindingResolver {
  /**
   * Normalizes a human registrar name (e.g. from ipos.registrar_name) to a canonical registrar_code.
   */
  static normalizeRegistrarCode(rawName?: string | null): string | null {
    if (!rawName) return null;
    const lower = rawName.toLowerCase().trim();

    if (lower.includes('link intime') || lower.includes('linkintime')) {
      return 'link_intime';
    }
    if (lower.includes('kfin') || lower.includes('karvy')) {
      return 'kfintech';
    }
    if (lower.includes('bigshare')) {
      return 'bigshare';
    }
    if (lower.includes('cameo')) {
      return 'cameo';
    }
    if (lower.includes('mas ') || lower.includes('mas services') || lower.startsWith('mas')) {
      return 'mas';
    }
    return null;
  }

  /**
   * Resolves the active deterministic issue binding for a specific IPO.
   */
  static async resolveBinding(ipoId: string): Promise<BindingResolutionResult> {
    const supabase = createAdminClient();

    // 1. Check for an active deterministic issue binding
    const { data: bindingRow, error: bindingErr } = await supabase
      .from('ipo_registrar_issue_bindings')
      .select('*')
      .eq('ipo_id', ipoId)
      .eq('is_active', true)
      .maybeSingle();

    if (bindingErr) {
      console.error(`[IssueBindingResolver] DB query error for ipoId=${ipoId}:`, bindingErr);
    }

    if (bindingRow) {
      return {
        binding: bindingRow as RegistrarIssueBinding,
        registrarCode: bindingRow.registrar_code,
        status: 'bound',
        message: `Deterministic binding found: ${bindingRow.registrar_code} (issue: ${bindingRow.registrar_issue_id})`,
      };
    }

    // 2. If no binding, check ipos table to see what registrar is assigned to this IPO
    const { data: ipoRow, error: ipoErr } = await supabase
      .from('ipos')
      .select('id, company_name, registrar_name')
      .eq('id', ipoId)
      .single();

    if (ipoErr || !ipoRow) {
      return {
        binding: null,
        registrarCode: null,
        status: 'unbound_no_registrar',
        message: 'IPO not found in database.',
      };
    }

    const canonicalCode = this.normalizeRegistrarCode(ipoRow.registrar_name);
    if (!canonicalCode) {
      return {
        binding: null,
        registrarCode: null,
        status: 'unbound_no_registrar',
        message: `Unknown or unspecified registrar '${ipoRow.registrar_name}' for ${ipoRow.company_name}.`,
      };
    }

    return {
      binding: null,
      registrarCode: canonicalCode,
      status: 'unbound_no_issue_id',
      message: `Registrar '${canonicalCode}' is recognized for ${ipoRow.company_name}, but no deterministic issue binding is registered yet.`,
    };
  }

  /**
   * Admin/System helper to register or update an issue binding.
   */
  static async upsertBinding(params: {
    ipoId: string;
    registrarCode: string;
    registrarIssueId: string;
    companyNameAtSource: string;
    sourcePortalUrl: string;
    lookupParameters?: Record<string, unknown>;
  }): Promise<{ success: boolean; binding?: RegistrarIssueBinding; error?: string }> {
    const supabase = createAdminClient();

    const payload = {
      ipo_id: params.ipoId,
      registrar_code: params.registrarCode,
      registrar_issue_id: params.registrarIssueId,
      company_name_at_source: params.companyNameAtSource,
      source_portal_url: params.sourcePortalUrl,
      lookup_parameters: params.lookupParameters || {},
      is_active: true,
      verified_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('ipo_registrar_issue_bindings')
      .upsert(payload, { onConflict: 'ipo_id,registrar_code' })
      .select()
      .single();

    if (error) {
      console.error('[IssueBindingResolver] Upsert error:', error);
      return { success: false, error: error.message };
    }

    return { success: true, binding: data as RegistrarIssueBinding };
  }
}
