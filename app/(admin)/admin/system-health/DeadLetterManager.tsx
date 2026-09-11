"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { AlertOctagon, RotateCcw, CheckCircle2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

interface DeadLetterItem {
  id: string;
  event_type: string;
  aggregate_type: string;
  aggregate_id: string;
  attempt_count: number;
  last_error: string | null;
  created_at: string;
  available_at: string;
}

interface DeadLetterManagerProps {
  deadLetters: DeadLetterItem[];
}

export function DeadLetterManager({ deadLetters }: DeadLetterManagerProps) {
  const router = useRouter();
  const [replayingId, setReplayingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function handleReplay(eventId: string) {
    setReplayingId(eventId);
    setMessage(null);

    try {
      // Replay via Phase 7B RPC
      const supabase = createClient();
      type RpcCaller = (fn: string, args: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
      const { error } = await (supabase.rpc as unknown as RpcCaller)("replay_dead_letter_event", {
        p_event_id: eventId,
        p_reason: "Manual operator recovery from Admin System Health portal",
      });

      if (error) {
        throw new Error(error.message);
      }

      setMessage(`Event ${eventId.slice(0, 8)} replayed successfully!`);
      router.refresh();
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : "Replay failed");
    } finally {
      setReplayingId(null);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <AlertOctagon className="w-4 h-4 text-red-400" />
            <span>Dead-Letter Exceptions (Phase 7B)</span>
          </CardTitle>
          <CardDescription>
            Events that exceeded maximum retry attempts ({deadLetters.length} total). Operators can trigger authorized replay.
          </CardDescription>
        </div>
        {message && (
          <span className="text-xs text-emerald-400 font-medium flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" />
            {message}
          </span>
        )}
      </CardHeader>
      <CardContent>
        {deadLetters.length === 0 ? (
          <div className="py-8 text-center text-xs text-[var(--text-muted)] space-y-1">
            <div className="text-emerald-400 font-semibold flex items-center justify-center gap-1.5">
              <CheckCircle2 className="w-4 h-4" /> Zero Dead-Letter Events
            </div>
            <p>All notification events were dispatched successfully or retried cleanly.</p>
          </div>
        ) : (
          <div className="divide-y divide-[var(--border-subtle)] text-xs">
            {deadLetters.map((ev) => (
              <div key={ev.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-red-400 font-mono text-[11px] px-2 py-0.5 rounded bg-red-500/10 border border-red-500/20">
                      {ev.event_type}
                    </span>
                    <span className="font-mono text-[11px] text-[var(--text-muted)]">
                      {ev.aggregate_type}:{ev.aggregate_id.slice(0, 8)}...
                    </span>
                    <span className="text-[10px] text-[var(--text-muted)]">
                      Attempts: {ev.attempt_count}
                    </span>
                  </div>
                  <p className="text-[11px] text-[var(--text-muted)] font-mono line-clamp-1">
                    Error: {ev.last_error || "Unknown fatal error"}
                  </p>
                </div>

                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleReplay(ev.id)}
                  isLoading={replayingId === ev.id}
                  className="text-xs shrink-0 text-blue-400 border-blue-500/30 hover:bg-blue-500/10"
                  leftIcon={<RotateCcw className="w-3 h-3" />}
                >
                  Replay Event
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
