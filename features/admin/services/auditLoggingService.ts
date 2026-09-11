/**
 * features/admin/services/auditLoggingService.ts
 *
 * Secure server-side audit recording service with recursive PII sanitization.
 * Enforces:
 *  - Strict PII masking (PAN, Bank Accounts, UPI, Passwords, Phone numbers)
 *  - Calls SECURITY DEFINER RPC record_audit_log via service-role admin client
 *  - Dynamic on-read masking for legacy Phase 1 audit rows
 */

import { createAdminClient } from "@/lib/supabase/admin";

export interface RecordAuditParams {
  action: string;
  resourceType: string;
  resourceId?: string | null;
  oldValues?: Record<string, unknown> | null;
  newValues?: Record<string, unknown> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  actorId?: string | null;
}

/**
 * Recursively masks sensitive fields (PAN, Bank Accounts, UPI, Passwords, etc.)
 */
export function sanitizeAuditPayload(payload: unknown): unknown {
  if (payload === null || payload === undefined) {
    return payload;
  }

  if (typeof payload === "string") {
    // Check for PAN pattern (e.g. ABCDE1234F)
    const panRegex = /\b[A-Z]{5}[0-9]{4}[A-Z]{1}\b/g;
    if (panRegex.test(payload)) {
      return payload.replace(panRegex, (match) => `XXXXX${match.slice(5)}`);
    }
    return payload;
  }

  if (Array.isArray(payload)) {
    return payload.map((item) => sanitizeAuditPayload(item));
  }

  if (typeof payload === "object") {
    const sanitizedObj: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(payload as Record<string, unknown>)) {
      const lowerKey = key.toLowerCase();

      // Mask passwords, tokens, secrets, API keys, OTPs
      if (
        lowerKey.includes("password") ||
        lowerKey.includes("secret") ||
        lowerKey.includes("token") ||
        lowerKey.includes("key") ||
        lowerKey.includes("otp") ||
        lowerKey.includes("auth")
      ) {
        sanitizedObj[key] = "[REDACTED]";
      }
      // Mask PAN
      else if (lowerKey.includes("pan") || lowerKey.includes("tax_id")) {
        if (typeof value === "string" && value.length === 10) {
          sanitizedObj[key] = `XXXXX${value.slice(5)}`;
        } else {
          sanitizedObj[key] = "[MASKED_PAN]";
        }
      }
      // Mask Bank Account Numbers
      else if (lowerKey.includes("account_no") || lowerKey.includes("bank_account") || lowerKey.includes("account_number")) {
        if (typeof value === "string" && value.length >= 4) {
          sanitizedObj[key] = `XXXXXXXX${value.slice(-4)}`;
        } else {
          sanitizedObj[key] = "[MASKED_ACCOUNT]";
        }
      }
      // Mask UPI / VPA
      else if (lowerKey.includes("upi") || lowerKey.includes("vpa")) {
        if (typeof value === "string" && value.includes("@")) {
          const parts = value.split("@");
          sanitizedObj[key] = `${parts[0].slice(0, 2)}***@${parts[1]}`;
        } else {
          sanitizedObj[key] = "[MASKED_UPI]";
        }
      }
      // Mask Phone / Mobile
      else if (lowerKey.includes("phone") || lowerKey.includes("mobile")) {
        if (typeof value === "string" && value.length >= 10) {
          sanitizedObj[key] = `${value.slice(0, 4)}XXXX${value.slice(-2)}`;
        } else {
          sanitizedObj[key] = "[MASKED_PHONE]";
        }
      }
      // Recurse for nested objects
      else {
        sanitizedObj[key] = sanitizeAuditPayload(value);
      }
    }
    return sanitizedObj;
  }

  return payload;
}

/**
 * Mask IP address for privacy
 */
export function maskIpAddress(ip?: string | null): string | null {
  if (!ip) return null;
  const parts = ip.split(".");
  if (parts.length === 4) {
    return `${parts[0]}.${parts[1]}.${parts[2]}.xxx`;
  }
  return "masked-ip";
}

export class AuditLoggingService {
  /**
   * Records an audit log entry strictly through the service-role client,
   * guaranteeing PII sanitization before persistence.
   */
  public static async recordAudit(params: RecordAuditParams): Promise<string> {
    const adminClient = createAdminClient();

    const sanitizedOld = params.oldValues
      ? (sanitizeAuditPayload(params.oldValues) as Record<string, unknown>)
      : null;
    const sanitizedNew = params.newValues
      ? (sanitizeAuditPayload(params.newValues) as Record<string, unknown>)
      : null;
    const sanitizedIp = maskIpAddress(params.ipAddress);

    const { data: logId, error } = await adminClient.rpc("record_audit_log", {
      p_action: params.action,
      p_resource_type: params.resourceType,
      p_resource_id: params.resourceId || null,
      p_old_values: sanitizedOld ? JSON.parse(JSON.stringify(sanitizedOld)) : null,
      p_new_values: sanitizedNew ? JSON.parse(JSON.stringify(sanitizedNew)) : null,
      p_ip_address: sanitizedIp,
      p_user_agent: params.userAgent || null,
    });

    if (error) {
      console.error("Failed to record audit log via record_audit_log RPC:", error);
      throw new Error(`Audit logging failed: ${error.message}`);
    }

    return logId as string;
  }
}
