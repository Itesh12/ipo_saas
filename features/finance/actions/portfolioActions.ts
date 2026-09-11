/**
 * features/finance/actions/portfolioActions.ts
 *
 * Phase 5 Stage 2: Server Actions for Portfolio queries, valuation, and security price records.
 */

'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { PortfolioValuationService, type OwnershipScope } from '../services/portfolioValuationService';
import { DefaultMarketDataProvider } from '../services/marketDataProvider';
import { securityPriceSchema } from '../schemas/finance.schemas';

/**
 * Fetch portfolio holdings according to requested ownership scope
 */
export async function getPortfolioHoldingsAction(scope: OwnershipScope = 'personal', applicantId?: string) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'Authentication required' };
    }
    const userId = user.id;

    const result = await PortfolioValuationService.getUserPortfolioHoldings(userId, scope, applicantId);
    return { success: true, data: result };
  } catch (err) {
    console.error('[getPortfolioHoldingsAction] error:', err);
    return { success: false, error: err instanceof Error ? err.message : 'Failed to fetch holdings' };
  }
}

/**
 * Fetch capital and liquidity breakdown (Available Cash, ASBA Lien, IPO Allotted Cost)
 */
export async function getCapitalBreakdownAction() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'Authentication required' };
    }
    const userId = user.id;

    const result = await PortfolioValuationService.getUserCapitalBreakdown(userId);
    return { success: true, data: result };
  } catch (err) {
    console.error('[getCapitalBreakdownAction] error:', err);
    return { success: false, error: err instanceof Error ? err.message : 'Failed to fetch capital breakdown' };
  }
}

/**
 * Record a verified security price snapshot (Admin / System / Integration feed)
 * Strictly flags source, price, and missing-price fallback.
 */
export async function recordSecurityPriceAction(formData: FormData) {
  try {
    const rawData = {
      securityId: formData.get('securityId'),
      price: formData.get('price'),
      priceDate: formData.get('priceDate') || new Date().toISOString(),
      source: formData.get('source') || 'bse_nse_feed',
    };

    const validated = securityPriceSchema.parse(rawData);

    await DefaultMarketDataProvider.recordPrice({
      securityId: validated.securityId,
      price: validated.price,
      priceDate: validated.priceDate,
      source: validated.source,
    });

    revalidatePath('/portfolio');
    return { success: true };
  } catch (err) {
    console.error('[recordSecurityPriceAction] error:', err);
    return { success: false, error: err instanceof Error ? err.message : 'Failed to record price' };
  }
}
