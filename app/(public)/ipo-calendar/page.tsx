import React from "react";
import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { getIPOCalendarEvents } from "@/features/ipo/services/ipoService";
import { formatDate } from "@/lib/utils";
import {
  CalendarDays,
  Flame,
  Clock,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ArrowRight,
} from "lucide-react";

interface PageProps {
  searchParams: Promise<{
    year?: string;
    month?: string;
  }>;
}

export default async function IPOCalendarPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const now = new Date();
  const currentYear = params.year ? parseInt(params.year, 10) : now.getFullYear();
  const currentMonth = params.month ? parseInt(params.month, 10) : now.getMonth() + 1;

  const events = await getIPOCalendarEvents(currentYear, currentMonth);

  // Month navigation helpers
  const prevMonth = currentMonth === 1 ? 12 : currentMonth - 1;
  const prevYear = currentMonth === 1 ? currentYear - 1 : currentYear;
  const nextMonth = currentMonth === 12 ? 1 : currentMonth + 1;
  const nextYear = currentMonth === 12 ? currentYear + 1 : currentYear;

  const monthName = new Intl.DateTimeFormat("en-IN", { month: "long" }).format(
    new Date(currentYear, currentMonth - 1, 1)
  );

  // Group events by date
  const eventsByDate: Record<string, typeof events> = {};
  events.forEach((event) => {
    if (!eventsByDate[event.eventDate]) {
      eventsByDate[event.eventDate] = [];
    }
    eventsByDate[event.eventDate].push(event);
  });

  const sortedDates = Object.keys(eventsByDate).sort();

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Header */}
      <PageHeader
        title="Indian IPO Event Calendar"
        description="Chronological schedule of bidding openings, closings, basis of allotment, refunds, and exchange listings."
        actions={
          <div className="flex items-center gap-2">
            <Link
              href={`/ipo-calendar?year=${prevYear}&month=${prevMonth}`}
              className="p-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)] transition-colors text-[var(--text-secondary)]"
              aria-label="Previous Month"
            >
              <ChevronLeft className="w-4 h-4" />
            </Link>

            <span className="text-xs font-bold text-[var(--text-primary)] px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] min-w-[140px] text-center">
              {monthName} {currentYear}
            </span>

            <Link
              href={`/ipo-calendar?year=${nextYear}&month=${nextMonth}`}
              className="p-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)] transition-colors text-[var(--text-secondary)]"
              aria-label="Next Month"
            >
              <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
        }
      />

      {/* Events List / Timeline */}
      {sortedDates.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title={`No IPO events scheduled in ${monthName} ${currentYear}`}
          description="Check neighboring months or explore the complete IPO directory."
          actionLabel="Explore IPO Directory"
          actionHref="/ipos"
        />
      ) : (
        <div className="space-y-6">
          {sortedDates.map((dateStr) => {
            const dateEvents = eventsByDate[dateStr];
            const dateObj = new Date(dateStr);
            const dayName = new Intl.DateTimeFormat("en-IN", { weekday: "short" }).format(dateObj);
            const dayNum = dateObj.getDate();

            return (
              <div key={dateStr} className="grid grid-cols-1 md:grid-cols-12 gap-4 items-start">
                {/* Date Left Badge */}
                <div className="md:col-span-3 flex md:flex-col items-center md:items-start gap-2 p-3 rounded-xl bg-[var(--bg-surface-elevated)] border border-[var(--border-subtle)]">
                  <div className="text-xl sm:text-2xl font-extrabold text-[var(--brand-primary)] leading-none">
                    {dayNum}
                  </div>
                  <div>
                    <div className="text-xs font-bold text-[var(--text-primary)]">{dayName}</div>
                    <div className="text-[11px] text-[var(--text-muted)]">{formatDate(dateStr)}</div>
                  </div>
                </div>

                {/* Event Cards */}
                <div className="md:col-span-9 space-y-3">
                  {dateEvents.map((event) => {
                    const isOpening = event.eventType === "open";
                    const isClosing = event.eventType === "close";
                    const isListing = event.eventType === "listing";

                    return (
                      <Card
                        key={event.id}
                        className="p-4 hover:border-[var(--border-strong)] transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <Badge
                              variant={
                                isOpening ? "danger" : isClosing ? "warning" : isListing ? "success" : "info"
                              }
                              size="sm"
                              className="capitalize gap-1 font-semibold"
                            >
                              {isOpening && <Flame className="w-3 h-3 text-white" />}
                              {isClosing && <Clock className="w-3 h-3" />}
                              {isListing && <CheckCircle2 className="w-3 h-3" />}
                              <span>{event.eventType}</span>
                            </Badge>
                            <span className="text-[10px] uppercase font-mono text-[var(--text-muted)]">
                              {event.category.replace(/_/g, " ")}
                            </span>
                          </div>

                          <h4 className="text-sm font-bold text-[var(--text-primary)]">
                            {event.companyName}
                          </h4>

                          {event.priceBand && (
                            <p className="text-xs text-[var(--text-muted)]">
                              Price Band: <span className="font-semibold text-[var(--text-secondary)]">{event.priceBand}</span>
                            </p>
                          )}
                        </div>

                        <Link href={`/ipos/${event.slug}`} className="shrink-0">
                          <Button size="sm" variant="ghost" rightIcon={<ArrowRight className="w-3.5 h-3.5" />}>
                            View Details
                          </Button>
                        </Link>
                      </Card>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
