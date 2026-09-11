/**
 * features/admin/types/audit.types.ts
 *
 * Types for Hardened Audit Logging & Governance Explorer.
 */

export interface AuditLogRow {
  id: string;
  actor_id: string | null;
  actor_type: "user" | "system";
  action: string;
  resource_type: string;
  resource_id: string | null;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
  actor_profile?: {
    id: string;
    full_name: string | null;
    email: string;
    role: string;
  } | null;
}

export interface AuditLogQueryParams {
  resource_type?: string;
  resource_id?: string;
  actor_id?: string;
  action?: string;
  fromDate?: string;
  toDate?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}
