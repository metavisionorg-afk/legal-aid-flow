import type { User } from "@shared/schema";

export const ROLE_VALUES = [
  "super_admin",
  "admin",
  "lawyer",
  "intake_officer",
  "viewer",
  "expert",
  "beneficiary",
] as const;

export type Role = (typeof ROLE_VALUES)[number];

function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLE_VALUES as readonly string[]).includes(value);
}

/**
 * Returns the effective role for authorization decisions.
 *
 * Notes:
 * - Backend stores both `userType` (staff|beneficiary) and `role` (granular roles).
 * - Some UI decisions are based on `userType`, but most staff authz should key off `role`.
 */
export function getRole(user: User | null | undefined): Role | null {
  const role = (user as any)?.role;
  if (isRole(role)) return role;

  const userType = (user as any)?.userType;
  if (userType === "beneficiary") return "beneficiary";

  return null;
}

export function isAdmin(user: User | null | undefined): boolean {
  const role = getRole(user);
  return role === "super_admin" || role === "admin";
}

export function isLawyer(user: User | null | undefined): boolean {
  return getRole(user) === "lawyer";
}

export function isBeneficiary(user: User | null | undefined): boolean {
  return (user as any)?.userType === "beneficiary" || getRole(user) === "beneficiary";
}

// ====== Basic capability helpers (Stage 0 / simple defaults) ======

export function canViewCases(user: User | null | undefined): boolean {
  if (!user) return false;
  const role = getRole(user);
  // Beneficiaries can view their own cases via the portal.
  if (role === "beneficiary") return true;
  // Any staff role can view cases in the staff UI (refine later with permissions/rules).
  return Boolean(role);
}

export function canCreateCase(user: User | null | undefined): boolean {
  if (!user) return false;
  const role = getRole(user);
  // Beneficiaries submit intake requests; staff create actual cases.
  if (role === "beneficiary") return false;
  return role === "super_admin" || role === "admin" || role === "lawyer" || role === "intake_officer";
}

export function canManageUsers(user: User | null | undefined): boolean {
  return isAdmin(user);
}

export function canViewReports(user: User | null | undefined): boolean {
  if (!user) return false;
  // Simple default: admins only.
  return isAdmin(user);
}
