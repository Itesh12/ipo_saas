/**
 * config/cronSchedules.ts
 *
 * Phase 9 Stage 3A.7: Single Shared Schedule Source of Truth.
 *
 * Authoritative schedule definitions for Indian financial market operations:
 * - IST is fixed year-round at UTC+5:30 (zero daylight saving shifts).
 * - Vercel Cron evaluates cron expressions strictly in UTC.
 *
 * Schedule Mapping:
 * 1. NSE Current Issues:
 *    - UTC: 0 3-12 * * 1-5
 *    - IST: 08:30–17:30 IST (Hourly, Monday through Friday)
 * 2. SEBI Regulatory Filings:
 *    - UTC: 0 2,6,10,14 * * 1-5
 *    - IST: 07:30, 11:30, 15:30, 19:30 IST (Monday through Friday)
 * 3. Master Reconciliation:
 *    - UTC: 30 2,12 * * *
 *    - IST: 08:00 & 17:30 IST (Daily, 7 days/week)
 */

export interface CronScheduleDefinition {
  jobKey: 'nse' | 'sebi' | 'master';
  jobName: string;
  path: string;
  targetSource: 'nse' | 'sebi' | 'all';
  utcCron: string;
  istDescription: string;
  intervalMinutes: number;
  gracePeriodMinutes: number;
  activeHoursIST: {
    start: string; // '08:30'
    end: string;   // '17:30'
  };
  isWeekdayOnly: boolean;
}

export const IPO_CRON_SCHEDULES: Record<'nse' | 'sebi' | 'master', CronScheduleDefinition> = {
  nse: {
    jobKey: 'nse',
    jobName: 'NSE Active Trading Sync',
    path: '/api/admin/ipo-sync/run?source=nse',
    targetSource: 'nse',
    utcCron: '0 3-12 * * 1-5',
    istDescription: '08:30–17:30 IST (Hourly, Mon–Fri)',
    intervalMinutes: 60,
    gracePeriodMinutes: 15,
    activeHoursIST: { start: '08:30', end: '17:30' },
    isWeekdayOnly: true,
  },
  sebi: {
    jobKey: 'sebi',
    jobName: 'SEBI Regulatory Filings Sync',
    path: '/api/admin/ipo-sync/run?source=sebi',
    targetSource: 'sebi',
    utcCron: '0 2,6,10,14 * * 1-5',
    istDescription: '07:30, 11:30, 15:30, 19:30 IST (Mon–Fri)',
    intervalMinutes: 240,
    gracePeriodMinutes: 15,
    activeHoursIST: { start: '07:30', end: '19:30' },
    isWeekdayOnly: true,
  },
  master: {
    jobKey: 'master',
    jobName: 'Master Universe Reconciliation',
    path: '/api/admin/ipo-sync/run?source=all',
    targetSource: 'all',
    utcCron: '30 2,12 * * *',
    istDescription: '08:00 & 17:30 IST (Daily)',
    intervalMinutes: 720,
    gracePeriodMinutes: 15,
    activeHoursIST: { start: '08:00', end: '17:30' },
    isWeekdayOnly: false,
  },
};

/**
 * Formats a Date object or ISO string in Indian Standard Time (IST).
 */
export function formatInIST(dateInput: Date | string | null | undefined): string {
  if (!dateInput) return '—';
  const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (isNaN(d.getTime())) return 'Invalid Date';

  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(d) + ' IST';
}

/**
 * Calculates the next expected execution date (UTC Date object) for a given job schedule.
 */
export function calculateNextScheduledRun(
  jobKey: 'nse' | 'sebi' | 'master',
  referenceDate: Date = new Date()
): Date {
  const schedule = IPO_CRON_SCHEDULES[jobKey];
  const nowUtc = referenceDate;

  if (jobKey === 'nse') {
    // 0 3-12 * * 1-5 (UTC hours 3, 4, 5, 6, 7, 8, 9, 10, 11, 12 at min 0)
    const validHoursUtc = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    const candidate = new Date(nowUtc);
    candidate.setUTCMinutes(0, 0, 0);

    for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
      const checkDate = new Date(candidate.getTime() + dayOffset * 86400000);
      const dayOfWeek = checkDate.getUTCDay();
      if (dayOfWeek >= 1 && dayOfWeek <= 5) {
        for (const h of validHoursUtc) {
          const runDate = new Date(checkDate);
          runDate.setUTCHours(h, 0, 0, 0);
          if (runDate.getTime() > nowUtc.getTime()) {
            return runDate;
          }
        }
      }
    }
  } else if (jobKey === 'sebi') {
    // 0 2,6,10,14 * * 1-5 (UTC hours 2, 6, 10, 14 at min 0)
    const validHoursUtc = [2, 6, 10, 14];
    const candidate = new Date(nowUtc);
    candidate.setUTCMinutes(0, 0, 0);

    for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
      const checkDate = new Date(candidate.getTime() + dayOffset * 86400000);
      const dayOfWeek = checkDate.getUTCDay();
      if (dayOfWeek >= 1 && dayOfWeek <= 5) {
        for (const h of validHoursUtc) {
          const runDate = new Date(checkDate);
          runDate.setUTCHours(h, 0, 0, 0);
          if (runDate.getTime() > nowUtc.getTime()) {
            return runDate;
          }
        }
      }
    }
  } else if (jobKey === 'master') {
    // 30 2,12 * * * (UTC hours 2:30, 12:30 daily)
    for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
      const checkDate = new Date(nowUtc.getTime() + dayOffset * 86400000);
      for (const h of [2, 12]) {
        const runDate = new Date(checkDate);
        runDate.setUTCHours(h, 30, 0, 0);
        if (runDate.getTime() > nowUtc.getTime()) {
          return runDate;
        }
      }
    }
  }

  // Fallback: interval addition
  return new Date(nowUtc.getTime() + schedule.intervalMinutes * 60000);
}

/**
 * Calculates the most recent scheduled execution date (UTC Date object) that should have run before referenceDate.
 */
export function calculateExpectedLastRun(
  jobKey: 'nse' | 'sebi' | 'master',
  referenceDate: Date = new Date()
): Date {
  const schedule = IPO_CRON_SCHEDULES[jobKey];
  const nowUtc = referenceDate;

  if (jobKey === 'nse') {
    const validHoursUtc = [12, 11, 10, 9, 8, 7, 6, 5, 4, 3];
    for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
      const checkDate = new Date(nowUtc.getTime() - dayOffset * 86400000);
      const dayOfWeek = checkDate.getUTCDay();
      if (dayOfWeek >= 1 && dayOfWeek <= 5) {
        for (const h of validHoursUtc) {
          const runDate = new Date(checkDate);
          runDate.setUTCHours(h, 0, 0, 0);
          if (runDate.getTime() <= nowUtc.getTime()) {
            return runDate;
          }
        }
      }
    }
  } else if (jobKey === 'sebi') {
    const validHoursUtc = [14, 10, 6, 2];
    for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
      const checkDate = new Date(nowUtc.getTime() - dayOffset * 86400000);
      const dayOfWeek = checkDate.getUTCDay();
      if (dayOfWeek >= 1 && dayOfWeek <= 5) {
        for (const h of validHoursUtc) {
          const runDate = new Date(checkDate);
          runDate.setUTCHours(h, 0, 0, 0);
          if (runDate.getTime() <= nowUtc.getTime()) {
            return runDate;
          }
        }
      }
    }
  } else if (jobKey === 'master') {
    for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
      const checkDate = new Date(nowUtc.getTime() - dayOffset * 86400000);
      for (const h of [12, 2]) {
        const runDate = new Date(checkDate);
        runDate.setUTCHours(h, 30, 0, 0);
        if (runDate.getTime() <= nowUtc.getTime()) {
          return runDate;
        }
      }
    }
  }

  return new Date(nowUtc.getTime() - schedule.intervalMinutes * 60000);
}
