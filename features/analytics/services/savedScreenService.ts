/**
 * features/analytics/services/savedScreenService.ts
 *
 * Phase 6: Saved Screens Service
 * Manages user-owned custom screens with RLS isolation,
 * provides standard non-advisory presets, and enforces public screen privacy.
 */

import { createClient } from '@/lib/supabase/server';
import { SavedScreenPreset, SavedScreenRow, ScreenerFilterPayload } from '../types/analytics.types';
import { savedScreenSchema, SavedScreenInput } from '../schemas/screener.schemas';

export const STANDARD_SCREEN_PRESETS: SavedScreenPreset[] = [
  {
    id: 'preset-high-quality',
    name: 'High Fundamental Quality',
    description: 'Companies exhibiting robust balance sheets, strong profitability margins, and superior return on equity.',
    badgeText: 'Quality Focus',
    filterConfig: {
      overallScoreMin: 70,
      roeMinPct: 15,
      debtToEquityMax: 0.8,
      revenueGrowthMinPct: 12,
    },
    sortBy: 'overall_score',
    sortDirection: 'desc',
  },
  {
    id: 'preset-low-valuation',
    name: 'Low Relative Valuation',
    description: 'IPOs priced with favorable multiples relative to historical sector peers.',
    badgeText: 'Valuation Discount',
    filterConfig: {
      peRatioMax: 30,
      overallScoreMin: 65,
    },
    sortBy: 'pe_ratio_high',
    sortDirection: 'asc',
  },
  {
    id: 'preset-high-momentum',
    name: 'High Retail & HNI Momentum',
    description: 'Issues displaying elevated bidding interest across Retail and Non-Institutional categories.',
    badgeText: 'Retail Momentum',
    filterConfig: {
      subscriptionMinX: 5.0,
      retailSubMinX: 3.0,
      gmpGainMinPct: 15.0,
    },
    sortBy: 'latest_subscription_x',
    sortDirection: 'desc',
  },
  {
    id: 'preset-high-qib',
    name: 'High QIB Subscription',
    description: 'Large-cap and mainboard issues with strong institutional anchor participation.',
    badgeText: 'Institutional Demand',
    filterConfig: {
      qibSubMinX: 10.0,
      category: ['mainboard'],
      issueSizeMinCr: 500,
    },
    sortBy: 'latest_qib_sub_x',
    sortDirection: 'desc',
  },
];

export class SavedScreenService {
  /**
   * Returns standard system presets.
   */
  static getSystemPresets(): SavedScreenPreset[] {
    return STANDARD_SCREEN_PRESETS;
  }

  /**
   * Fetches saved screens visible to the user (owned or public).
   */
  static async getUserSavedScreens(userId: string): Promise<SavedScreenRow[]> {
    try {
      const supabase = await createClient();
      const { data, error } = await supabase
        .from('saved_screens')
        .select('*')
        .or(`user_id.eq.${userId},is_public.eq.true`)
        .order('is_pinned', { ascending: false })
        .order('created_at', { ascending: false });

      if (error || !data) {
        return [];
      }

      return data as unknown as SavedScreenRow[];
    } catch {
      return [];
    }
  }

  /**
   * Saves or updates a custom screen.
   * Enforces Public Screen Privacy Invariant:
   * Public screens cannot contain personal portfolio, applicant, or private capital parameters.
   */
  static async saveScreen(
    userId: string,
    payload: SavedScreenInput
  ): Promise<{ success: boolean; screenId?: string; error?: string }> {
    const validated = savedScreenSchema.safeParse(payload);
    if (!validated.success) {
      return { success: false, error: validated.error.issues[0]?.message || 'Invalid screen parameters' };
    }

    // Additional privacy check for public screens
    if (validated.data.isPublic) {
      const raw = validated.data.filterConfig as Record<string, unknown>;
      if (raw.applicantId || raw.userPortfolioOnly || raw.myAvailableCashOnly) {
        return {
          success: false,
          error: 'Public screens cannot contain personal portfolio, applicant, or private capital parameters.',
        };
      }
    }

    try {
      const supabase = await createClient();
      const { data, error } = await supabase
        .from('saved_screens')
        .insert({
          user_id: userId,
          name: validated.data.name,
          description: validated.data.description || null,
          filter_config: validated.data.filterConfig,
          sort_by: validated.data.sortBy,
          sort_direction: validated.data.sortDirection,
          selected_columns: validated.data.selectedColumns,
          is_pinned: validated.data.isPinned,
          is_public: validated.data.isPublic,
        } as never)
        .select('id')
        .single();

      if (error || !data) {
        return { success: false, error: error?.message || 'Failed to save screen' };
      }

      const row = data as unknown as { id: string };
      return { success: true, screenId: row.id };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Database error' };
    }
  }

  /**
   * Deletes a user's custom saved screen.
   */
  static async deleteScreen(userId: string, screenId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const supabase = await createClient();
      const { error } = await supabase
        .from('saved_screens')
        .delete()
        .eq('id', screenId)
        .eq('user_id', userId);

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Database error' };
    }
  }

  /**
   * Serializes filter configuration into shareable URL search parameters.
   */
  static serializeToSearchParams(filters: ScreenerFilterPayload): string {
    const params = new URLSearchParams();

    if (filters.status && filters.status.length > 0) params.set('status', filters.status.join(','));
    if (filters.category && filters.category.length > 0) params.set('category', filters.category.join(','));
    if (filters.peRatioMax !== undefined) params.set('pe_max', String(filters.peRatioMax));
    if (filters.overallScoreMin !== undefined) params.set('score_min', String(filters.overallScoreMin));
    if (filters.subscriptionMinX !== undefined) params.set('sub_min', String(filters.subscriptionMinX));
    if (filters.sortBy) params.set('sort_by', filters.sortBy);
    if (filters.sortDirection) params.set('sort_dir', filters.sortDirection);
    if (filters.includeUnpriced) params.set('unpriced', 'true');

    return params.toString();
  }
}
