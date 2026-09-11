import type { UserRole } from "../../types/database.types";

/**
 * Role hierarchy levels for permission comparisons.
 * Higher number means higher authority.
 */
export const ROLE_HIERARCHY: Record<UserRole, number> = {
  super_admin: 50,
  admin: 40,
  editor: 30,
  analyst: 20,
  user: 10,
};

/**
 * Verifies whether a given user role meets the required role threshold.
 */
export function hasMinimumRole(userRole: UserRole, requiredRole: UserRole): boolean {
  const userLevel = ROLE_HIERARCHY[userRole] ?? 0;
  const requiredLevel = ROLE_HIERARCHY[requiredRole] ?? 999;
  return userLevel >= requiredLevel;
}

/**
 * Permission checks for specific operational capabilities
 */
export const PERMISSIONS = {
  CAN_MANAGE_IPOS: (role: UserRole) => hasMinimumRole(role, "editor"),
  CAN_UPDATE_GMP: (role: UserRole) => hasMinimumRole(role, "editor"),
  CAN_UPDATE_SUBSCRIPTION: (role: UserRole) => hasMinimumRole(role, "editor"),
  CAN_VIEW_ADMIN_DASHBOARD: (role: UserRole) => hasMinimumRole(role, "analyst"),
  CAN_MANAGE_USERS: (role: UserRole) => hasMinimumRole(role, "admin"),
  CAN_TRIGGER_PIPELINES: (role: UserRole) => hasMinimumRole(role, "admin"),
  CAN_VIEW_AUDIT_LOGS: (role: UserRole) => hasMinimumRole(role, "super_admin"),
  CAN_MANAGE_ADMIN_ROLES: (role: UserRole) => hasMinimumRole(role, "super_admin"),
};
