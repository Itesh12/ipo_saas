"use client";

import React from "react";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { IPOApplicationEventRow } from "@/features/application/types/application.types";
import { History } from "lucide-react";

interface ApplicationEventsTableProps {
  events: IPOApplicationEventRow[];
}

export function ApplicationEventsTable({ events }: ApplicationEventsTableProps) {
  if (!events || events.length === 0) {
    return null;
  }

  const formatEventName = (ev: string) => {
    return ev
      .split("_")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  };

  return (
    <Card className="border-[var(--border-subtle)] overflow-hidden">
      <CardHeader className="py-3 px-5 bg-[var(--bg-surface-elevated)]/30 border-b border-[var(--border-subtle)] flex flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <History className="w-4 h-4 text-[var(--brand-primary)]" />
          <CardTitle className="text-sm">Audit Trail & Event Timeline</CardTitle>
        </div>
        <span className="text-xs text-[var(--text-muted)]">{events.length} Recorded Events</span>
      </CardHeader>

      <div className="divide-y divide-[var(--border-subtle)]/60 text-xs">
        {events.map((event) => (
          <div
            key={event.id}
            className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-[var(--bg-surface-elevated)]/20 transition-colors"
          >
            <div className="flex items-start gap-3">
              <div className="w-2 h-2 rounded-full bg-[var(--brand-primary)] mt-1.5 shrink-0" />
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-[var(--text-primary)]">
                    {formatEventName(event.event_type)}
                  </span>
                  <Badge variant="secondary" size="sm">
                    {event.event_type}
                  </Badge>
                </div>
                <p className="text-[var(--text-secondary)] mt-0.5">{event.description}</p>
              </div>
            </div>

            <div className="text-[11px] text-[var(--text-muted)] shrink-0 sm:text-right font-mono">
              {new Date(event.created_at).toLocaleString("en-IN", {
                dateStyle: "medium",
                timeStyle: "short",
              })}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
