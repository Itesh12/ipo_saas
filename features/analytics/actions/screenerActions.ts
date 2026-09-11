/**
 * features/analytics/actions/screenerActions.ts
 *
 * Phase 6: Server Actions for Screener & Saved Screens
 * Validates inputs with Zod, ensures authentication, and revalidates relevant paths.
 */

'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { SavedScreenService } from '../services/savedScreenService';
import { IpoScreenerService } from '../services/ipoScreenerService';
import { savedScreenSchema, screenerFilterSchema } from '../schemas/screener.schemas';
import type { ScreenerFilterPayload } from '../types/analytics.types';

export async function saveScreenAction(formData: FormData) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'Authentication required' };
    }
    const userId = user.id;

    const name = String(formData.get('name') || '').trim();
    const description = String(formData.get('description') || '').trim() || null;
    const filterConfigRaw = formData.get('filterConfig');
    const sortBy = String(formData.get('sortBy') || 'overall_score');
    const sortDirection = (formData.get('sortDirection') === 'asc' ? 'asc' : 'desc') as 'asc' | 'desc';
    const isPublic = formData.get('isPublic') === 'true';
    const isPinned = formData.get('isPinned') === 'true';

    let filterConfig = {};
    if (filterConfigRaw) {
      try {
        filterConfig = JSON.parse(String(filterConfigRaw));
      } catch {
        return { success: false, error: 'Malformed filter configuration' };
      }
    }

    const payload = {
      name,
      description,
      filterConfig,
      sortBy,
      sortDirection,
      isPublic,
      isPinned,
    };

    const validated = savedScreenSchema.safeParse(payload);
    if (!validated.success) {
      return { success: false, error: validated.error.issues[0]?.message || 'Invalid parameters' };
    }

    const res = await SavedScreenService.saveScreen(userId, validated.data);

    if (res.success) {
      revalidatePath('/ipo-screener');
      return { success: true, screenId: res.screenId };
    } else {
      return { success: false, error: res.error };
    }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to save screen' };
  }
}

export async function deleteScreenAction(screenId: string) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'Authentication required' };
    }
    const userId = user.id;

    const res = await SavedScreenService.deleteScreen(userId, screenId);

    if (res.success) {
      revalidatePath('/ipo-screener');
      return { success: true };
    } else {
      return { success: false, error: res.error };
    }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to delete screen' };
  }
}

export async function executeScreenerQueryAction(rawFilters: unknown) {
  try {
    const validated = screenerFilterSchema.safeParse(rawFilters);
    const filters: ScreenerFilterPayload = validated.success ? validated.data : {};
    const res = await IpoScreenerService.queryScreener(filters);
    return { success: true, data: res };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Screener query failed' };
  }
}
