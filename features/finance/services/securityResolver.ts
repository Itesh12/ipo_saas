/**
 * features/finance/services/securityResolver.ts
 *
 * Phase 10 / Stage 5B: Deterministic Security Identity Hierarchy.
 *
 * Enforces hard architectural invariants:
 * 1. Resolution hierarchy:
 *    ISIN -> Exchange + Symbol -> Canonical Security ID -> IPO Master Binding -> AMBIGUOUS_SECURITY
 * 2. Hard invariant: NEVER auto-create securities from arbitrary company name strings.
 * 3. Halts processing on ambiguity without creating partial portfolio or journal state.
 */

import { createAdminClient } from '@/lib/supabase/admin';

export interface SecurityRecord {
  id: string;
  ipo_id: string | null;
  isin: string | null;
  symbol: string;
  exchange: string;
  company_name: string;
  face_value: number | null;
  lot_size: number;
}

export type SecurityResolutionResult =
  | { success: true; security: SecurityRecord; resolutionMethod: 'ISIN' | 'EXCHANGE_SYMBOL' | 'SECURITY_ID' | 'IPO_BINDING' }
  | { success: false; status: 'AMBIGUOUS_SECURITY'; reason: string };

export class SecurityResolver {
  /**
   * Resolves a security deterministically through the strict 4-step hierarchy.
   * Halts immediately if identity cannot be conclusively established.
   */
  public static async resolve(params: {
    securityId?: string | null;
    isin?: string | null;
    exchange?: string | null;
    symbol?: string | null;
    ipoId?: string | null;
  }): Promise<SecurityResolutionResult> {
    const admin = createAdminClient();
    const { securityId, isin, exchange = 'NSE', symbol, ipoId } = params;

    // 1. Resolution by Canonical Security ID
    if (securityId) {
      const { data: secById } = await admin
        .from('securities')
        .select('*')
        .eq('id', securityId)
        .maybeSingle();

      if (secById) {
        return {
          success: true,
          security: secById as SecurityRecord,
          resolutionMethod: 'SECURITY_ID',
        };
      }
    }

    // 2. Resolution by ISIN (Strict 12-char international identifier)
    if (isin && isin.trim().length === 12) {
      const cleanIsin = isin.trim().toUpperCase();
      const { data: secByIsin } = await admin
        .from('securities')
        .select('*')
        .eq('isin', cleanIsin)
        .maybeSingle();

      if (secByIsin) {
        return {
          success: true,
          security: secByIsin as SecurityRecord,
          resolutionMethod: 'ISIN',
        };
      }
    }

    // 3. Resolution by Exchange + Symbol
    if (symbol && symbol.trim().length > 0) {
      const cleanSymbol = symbol.trim().toUpperCase();
      const cleanExchange = (exchange || 'NSE').trim().toUpperCase();

      const { data: secBySymbol } = await admin
        .from('securities')
        .select('*')
        .eq('exchange', cleanExchange)
        .eq('symbol', cleanSymbol)
        .maybeSingle();

      if (secBySymbol) {
        return {
          success: true,
          security: secBySymbol as SecurityRecord,
          resolutionMethod: 'EXCHANGE_SYMBOL',
        };
      }
    }

    // 4. Resolution by IPO Master Binding
    if (ipoId) {
      // Check existing security linked to this ipo_id
      const { data: secByIpo } = await admin
        .from('securities')
        .select('*')
        .eq('ipo_id', ipoId)
        .maybeSingle();

      if (secByIpo) {
        return {
          success: true,
          security: secByIpo as SecurityRecord,
          resolutionMethod: 'IPO_BINDING',
        };
      }

      // Query the IPO record to check for verified symbol or ISIN
      const { data: rawIpo } = await admin
        .from('ipos')
        .select('id, symbol, company_name, lot_size, face_value')
        .eq('id', ipoId)
        .maybeSingle();

      const ipo = rawIpo as {
        id: string;
        symbol: string | null;
        company_name: string;
        lot_size: number | null;
        face_value: number | null;
      } | null;

      // Only allow auto-provisioning if IPO has an official, verified exchange symbol
      if (ipo && ipo.symbol && ipo.symbol.trim().length > 0) {
        const cleanSymbol = ipo.symbol.trim().toUpperCase();
        const cleanExchange = (exchange || 'NSE').trim().toUpperCase();

        const { data: newSec, error: insertErr } = await admin
          .from('securities')
          .insert({
            ipo_id: ipo.id,
            symbol: cleanSymbol,
            exchange: cleanExchange,
            company_name: ipo.company_name,
            face_value: ipo.face_value ?? null,
            lot_size: ipo.lot_size || 1,
          })
          .select('*')
          .maybeSingle();

        if (newSec && !insertErr) {
          return {
            success: true,
            security: newSec as SecurityRecord,
            resolutionMethod: 'IPO_BINDING',
          };
        }
      }
    }

    // 5. Hierarchy Exhausted -> AMBIGUOUS_SECURITY
    // Invariant: NEVER auto-create from arbitrary company name strings without verified symbol or ISIN
    return {
      success: false,
      status: 'AMBIGUOUS_SECURITY',
      reason: `Security cannot be resolved deterministically for symbol="${symbol || 'N/A'}", isin="${isin || 'N/A'}", ipoId="${ipoId || 'N/A'}". Halting financial execution for manual review.`,
    };
  }
}
