/**
 * Application Lifecycle State Machine
 * Deterministic transition engine and domain event orchestrator.
 *
 * Flow:
 * Draft -> Applied -> Mandate Pending -> Mandate Approved -> Funds Blocked ->
 * Bidding Closed -> Allotment Pending ->
 *   - Allotted (full) -> Completed
 *   - Partially Allotted -> Refund Pending -> Refund Completed -> Funds Unblocked -> Completed
 *   - Not Allotted -> Refund Pending -> Refund Completed -> Funds Unblocked -> Completed
 * Cancellations permitted from early stages (Draft, Applied, Mandate Pending, Mandate Approved).
 */

export type ApplicationStatus =
  | "draft"
  | "applied"
  | "mandate_pending"
  | "mandate_approved"
  | "funds_blocked"
  | "bidding_closed"
  | "allotment_pending"
  | "allotted"
  | "partially_allotted"
  | "not_allotted"
  | "refund_pending"
  | "refund_completed"
  | "funds_unblocked"
  | "completed"
  | "cancelled";

export type ApplicationEventType =
  | "application_created"
  | "bid_added"
  | "bid_updated"
  | "mandate_pending"
  | "mandate_requested"
  | "mandate_approved"
  | "mandate_rejected"
  | "funds_blocked"
  | "bidding_closed"
  | "allotment_pending"
  | "allotment_processed"
  | "allotted"
  | "partially_allotted"
  | "not_allotted"
  | "refund_pending"
  | "refund_completed"
  | "funds_unblocked"
  | "completed"
  | "cancelled";

/**
 * Directed transitions mapping valid paths.
 */
const VALID_TRANSITIONS: Record<ApplicationStatus, ApplicationStatus[]> = {
  draft: ["applied", "cancelled"],
  applied: ["mandate_pending", "cancelled"],
  mandate_pending: ["mandate_approved", "cancelled"],
  mandate_approved: ["funds_blocked", "cancelled"],
  funds_blocked: ["bidding_closed", "cancelled"],
  bidding_closed: ["allotment_pending"],
  allotment_pending: ["allotted", "partially_allotted", "not_allotted"],
  allotted: ["completed", "refund_pending"], // full allotment can complete directly, or refund if price < cap
  partially_allotted: ["refund_pending"],
  not_allotted: ["refund_pending"],
  refund_pending: ["refund_completed"],
  refund_completed: ["funds_unblocked"],
  funds_unblocked: ["completed"], // Guaranteed linear terminal progression
  completed: [], // Terminal
  cancelled: [], // Terminal
};

/**
 * Validates whether a state transition is permitted.
 */
export function isValidApplicationTransition(
  current: ApplicationStatus,
  next: ApplicationStatus
): boolean {
  if (current === next) return true;
  const allowed = VALID_TRANSITIONS[current] || [];
  return allowed.includes(next);
}

/**
 * Returns human-readable label and UI styling variants for each status.
 */
export function getApplicationStatusMeta(status: ApplicationStatus): {
  label: string;
  variant: "default" | "secondary" | "success" | "warning" | "danger" | "info";
  description: string;
  stepIndex: number;
} {
  switch (status) {
    case "draft":
      return {
        label: "Draft",
        variant: "secondary",
        description: "Application details created but not yet submitted.",
        stepIndex: 0,
      };
    case "applied":
      return {
        label: "Applied",
        variant: "info",
        description: "Application submitted. Awaiting UPI mandate request generation.",
        stepIndex: 1,
      };
    case "mandate_pending":
      return {
        label: "Mandate Pending",
        variant: "warning",
        description: "UPI Mandate request sent to your UPI app. Please approve the mandate.",
        stepIndex: 2,
      };
    case "mandate_approved":
      return {
        label: "Mandate Approved",
        variant: "info",
        description: "Mandate authorization recorded. Bank lien block in process.",
        stepIndex: 3,
      };
    case "funds_blocked":
      return {
        label: "Funds Blocked",
        variant: "success",
        description: "Application funds successfully lien-blocked in bank account.",
        stepIndex: 4,
      };
    case "bidding_closed":
      return {
        label: "Bidding Closed",
        variant: "secondary",
        description: "Issue bidding window closed. Awaiting registrar basis of allotment.",
        stepIndex: 5,
      };
    case "allotment_pending":
      return {
        label: "Allotment Pending",
        variant: "warning",
        description: "Registrar is finalizing share allotment results.",
        stepIndex: 6,
      };
    case "allotted":
      return {
        label: "Allotted",
        variant: "success",
        description: "Congratulations! Full share allotment received.",
        stepIndex: 7,
      };
    case "partially_allotted":
      return {
        label: "Partially Allotted",
        variant: "info",
        description: "Partial allotment received. Remaining blocked funds queued for refund.",
        stepIndex: 7,
      };
    case "not_allotted":
      return {
        label: "Not Allotted",
        variant: "danger",
        description: "No shares allotted in this issue. Full fund unblocking initiated.",
        stepIndex: 7,
      };
    case "refund_pending":
      return {
        label: "Refund Pending",
        variant: "warning",
        description: "Registrar instructions sent to bank for fund lien release.",
        stepIndex: 8,
      };
    case "refund_completed":
      return {
        label: "Refund Processed",
        variant: "info",
        description: "Refund instructions processed by bank / sponsor institution.",
        stepIndex: 9,
      };
    case "funds_unblocked":
      return {
        label: "Funds Unblocked",
        variant: "success",
        description: "Lien removed. Bank balance restored.",
        stepIndex: 10,
      };
    case "completed":
      return {
        label: "Completed",
        variant: "success",
        description: "Application lifecycle concluded successfully.",
        stepIndex: 11,
      };
    case "cancelled":
      return {
        label: "Cancelled",
        variant: "danger",
        description: "Application was withdrawn or cancelled prior to allotment.",
        stepIndex: -1,
      };
  }
}

/**
 * Domain Event Structure for future Phase 5 (Finance) and Phase 7 (Notifications).
 */
export interface ApplicationDomainEvent {
  eventId: string;
  applicationId: string;
  eventType: ApplicationEventType;
  timestamp: string;
  actorId?: string | null;
  payload: Record<string, unknown>;
}

/**
 * Dispatches domain event hook.
 * Pure logging stub for client components; server actions use domainEventDispatcher.
 */
export function dispatchApplicationDomainEvent(event: ApplicationDomainEvent): void {
  if (process.env.NODE_ENV !== "test") {
    console.info(`[DomainEvent][${event.eventType}] Application: ${event.applicationId}`, event.payload);
  }
}

