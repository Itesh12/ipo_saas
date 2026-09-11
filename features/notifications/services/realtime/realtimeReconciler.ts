/**
 * features/notifications/services/realtime/realtimeReconciler.ts
 *
 * Monotonic State Reconciler & Canonical Unread Count Engine for Phase 7C.
 *
 * Enforces:
 *  1. Canonical unread count formula: notifications.filter(n => n.status === 'unread').length
 *  2. Monotonic status machine: archived > read > unread (stale/out-of-order events rejected)
 *  3. Keyed strictly by immutable notification.id (UUID)
 *  4. Handshake buffer drainage with reverse-chronological preservation
 */

import { NotificationRow, NotificationStatus } from "../../types/notification.types";

/**
 * Status precedence hierarchy for monotonic transitions.
 * Higher rank wins over lower rank. Reversals are impossible.
 */
const STATUS_PRECEDENCE: Record<NotificationStatus, number> = {
  expired: 0,
  unread: 1,
  read: 2,
  archived: 3,
};

/**
 * Authoritative canonical unread count formula.
 * Enforced across all components, hooks, services, and tests.
 */
export function computeUnreadCount(notifications: NotificationRow[]): number {
  return notifications.filter((notification) => notification.status === "unread").length;
}

/**
 * Determines whether a status transition from currentStatus to incomingStatus is allowed.
 * Monotonic rule: status can only advance or remain equal; never regress.
 */
export function isValidStatusTransition(
  currentStatus: NotificationStatus,
  incomingStatus: NotificationStatus
): boolean {
  return STATUS_PRECEDENCE[incomingStatus] >= STATUS_PRECEDENCE[currentStatus];
}

/**
 * Reconciles a single incoming notification with the existing client notification list.
 * Guarantees:
 *  - Identity keyed strictly by notification.id
 *  - Monotonic status machine (archived > read > unread)
 *  - Reverse-chronological order preserved
 *  - Zero duplicate records
 */
export function reconcileNotification(
  currentList: NotificationRow[],
  incoming: NotificationRow
): NotificationRow[] {
  if (!incoming || !incoming.id) {
    return currentList;
  }

  const existingIndex = currentList.findIndex((item) => item.id === incoming.id);

  if (existingIndex === -1) {
    // New item: Prepend to list to preserve reverse-chronological order
    return [incoming, ...currentList];
  }

  const existing = currentList[existingIndex];

  // If incoming event attempts an illegal status regression (e.g. archived -> unread),
  // reject the regression and preserve existing authoritative status and timestamps
  if (!isValidStatusTransition(existing.status, incoming.status)) {
    // Stale/out-of-order event ignored for status, but preserve existing object
    return currentList;
  }

  // Valid forward transition or same-state update
  const updatedItem: NotificationRow = {
    ...incoming,
    // Ensure read_at is preserved if item was read before moving to archived
    read_at: incoming.read_at ?? existing.read_at,
    archived_at: incoming.archived_at ?? (incoming.status === "archived" ? (existing.archived_at ?? new Date().toISOString()) : null),
  };

  const nextList = [...currentList];
  nextList[existingIndex] = updatedItem;
  return nextList;
}

/**
 * Drains a FIFO buffer of Realtime events collected during initial handshake/reconnection
 * into an authoritative HTTP snapshot.
 */
export function drainBufferedEvents(
  snapshot: NotificationRow[],
  bufferedEvents: NotificationRow[]
): NotificationRow[] {
  let reconciled = [...snapshot];
  for (const event of bufferedEvents) {
    reconciled = reconcileNotification(reconciled, event);
  }
  return reconciled;
}
