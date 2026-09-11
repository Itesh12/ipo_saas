/**
 * features/analytics/types/analyticsEvents.ts
 *
 * Phase 6: Domain Event Contract Definitions
 * Strictly typed interfaces for future Phase 7 notification consumers.
 * Phase 6 defines contracts ONLY; no background execution or message delivery is implemented.
 */

export interface ScreenMatchDetectedEvent {
  eventId: string;
  eventType: 'screen_match_detected';
  screenId: string;
  screenName: string;
  userId: string;
  matchedIpoIds: string[];
  matchedCount: number;
  evaluatedAt: string;
}

export interface IpoScoreThresholdCrossedEvent {
  eventId: string;
  eventType: 'ipo_score_threshold_crossed';
  ipoId: string;
  symbol: string;
  previousScore: number | null;
  newScore: number;
  threshold: number;
  crossedAt: string;
}

export interface IpoClosingWithin24hEvent {
  eventId: string;
  eventType: 'ipo_closing_within_24h';
  ipoId: string;
  symbol: string;
  companyName: string;
  closeDate: string;
  latestOverallSubscriptionX: number | null;
  notifiedAt: string;
}

export interface PortfolioConcentrationWarningEvent {
  eventId: string;
  eventType: 'portfolio_concentration_warning';
  userId: string;
  sector: string;
  concentrationPct: number;
  thresholdPct: number;
  hhiScore: number;
  observedAt: string;
}

export type Phase6AnalyticsEvent =
  | ScreenMatchDetectedEvent
  | IpoScoreThresholdCrossedEvent
  | IpoClosingWithin24hEvent
  | PortfolioConcentrationWarningEvent;
