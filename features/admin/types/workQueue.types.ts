/**
 * features/admin/types/workQueue.types.ts
 *
 * Authoritative TypeScript definitions for Phase 8 Admin Work Queue.
 */

export type WorkItemSeverity = "critical" | "high" | "medium" | "low";

export type WorkItemStatus = "open" | "investigating" | "resolved" | "dismissed";

export type WorkItemCategory =
  | "ipo_data_gap"
  | "stale_market_data"
  | "application_anomaly"
  | "allotment_discrepancy"
  | "finance_reconciliation"
  | "notification_dead_letter"
  | "system_health";

export interface AdminWorkItem {
  id: string;
  fingerprint: string;
  severity: WorkItemSeverity;
  category: WorkItemCategory;
  entity_type: string;
  entity_id: string;
  title: string;
  description: string;
  metadata: Record<string, unknown>;
  status: WorkItemStatus;
  assigned_to: string | null;
  assigned_at: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  resolution_notes: string | null;
  due_date: string | null;
  created_at: string;
  updated_at: string;
  // Joins
  assigned_profile?: {
    id: string;
    full_name: string | null;
    email: string;
    role: string;
  } | null;
  resolved_profile?: {
    id: string;
    full_name: string | null;
    email: string;
  } | null;
}

export interface AdminWorkItemHistory {
  id: string;
  work_item_id: string;
  actor_id: string | null;
  actor_type: "user" | "system";
  previous_status: WorkItemStatus | null;
  new_status: WorkItemStatus;
  action: "created" | "status_change" | "assignment_change" | "reopened";
  notes: string | null;
  created_at: string;
  actor_profile?: {
    id: string;
    full_name: string | null;
    email: string;
    role: string;
  } | null;
}

export interface WorkQueueFilterOptions {
  status?: WorkItemStatus | "all";
  severity?: WorkItemSeverity | "all";
  category?: WorkItemCategory | "all";
  assignedTo?: string | "all" | "unassigned";
  search?: string;
  page?: number;
  pageSize?: number;
}
