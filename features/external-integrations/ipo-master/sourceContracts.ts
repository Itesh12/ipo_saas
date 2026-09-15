/**
 * features/external-integrations/ipo-master/sourceContracts.ts
 *
 * Phase 9 Stage 3A.5: Explicit Source Acquisition Contracts.
 * Defines separate, strictly bounded interfaces for:
 * 1. Current Active IPOs (NSE/BSE active bidding windows)
 * 2. Upcoming IPOs (Forthcoming exchange schedules & priced RHPs)
 * 3. Announced / Pre-Issue IPOs (SEBI regulatory offer filings: DRHP, draft papers)
 * 4. Historical IPOs (NSE/BSE official exchange archive batches)
 *
 * No single source feed is permitted to pretend it covers all four.
 */

import { IngestionExtractionResult, IngestionSource } from './ipoMasterTypes';

export type IpoUniverseSlice = 'current' | 'upcoming' | 'announced' | 'historical';

export interface BaseIpoSourceContract {
  readonly universeSlice: IpoUniverseSlice;
  readonly sourceName: IngestionSource;
  fetchObservations(): Promise<IngestionExtractionResult[]>;
  isAvailable(): Promise<boolean>;
  getHealthStatus(): Promise<'healthy' | 'degraded' | 'unreachable'>;
}

/**
 * Contract 1: Current Active IPOs
 * Real-time operational exchange data for issues currently in active bidding window.
 */
export interface CurrentIpoSourceContract extends BaseIpoSourceContract {
  readonly universeSlice: 'current';
}

/**
 * Contract 2: Upcoming IPOs
 * Confirmed forthcoming public issues with published issue dates and price bands.
 */
export interface UpcomingIpoSourceContract extends BaseIpoSourceContract {
  readonly universeSlice: 'upcoming';
}

/**
 * Contract 3: Announced / Pre-Issue IPOs
 * Official regulatory disclosure papers filed with SEBI (DRHP, draft prospectus)
 * awaiting ROC approval, price band discovery, and exchange slot allocation.
 */
export interface AnnouncedIpoSourceContract extends BaseIpoSourceContract {
  readonly universeSlice: 'announced';
}

/**
 * Contract 4: Historical IPOs
 * Official exchange archive batches of past listed issues with listing dates,
 * listing prices, and issue size reconciliations.
 */
export interface HistoricalIpoSourceContract extends BaseIpoSourceContract {
  readonly universeSlice: 'historical';
  fetchArchiveBatch(batchIdOrYear?: string | number): Promise<IngestionExtractionResult[]>;
}
