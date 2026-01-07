// ====== Status sets for workflow authz ======

// Operational statuses (lawyer only, for assigned lawyer)
export const OPERATING_STATUSES = [
  "in_progress",
  "awaiting_documents",
  "awaiting_hearing",
  "awaiting_judgment",
  "completed",
] as const;

// Administrative statuses (admin only)
export const ADMIN_STATUSES = [
  "pending_review",
  "rejected",
  "accepted_pending_assignment",
  "assigned",
  "closed_admin",
] as const;

export type OperatingStatus = (typeof OPERATING_STATUSES)[number];
export type AdminStatus = (typeof ADMIN_STATUSES)[number];

// Backwards compatibility: keep legacy/older workflow statuses in the type
// because existing DBs can still contain them.
export type CaseStatus =
  | AdminStatus
  | OperatingStatus
  | "pending_admin_review"
  | "accepted"
  | "on_hold"
  | "cancelled"
  | "open"
  | "pending"
  | "closed"
  | "urgent";

// Legacy transition graph (kept for compatibility with any older flows).
// New admin dropdown/status endpoint is role-gated rather than transition-gated.
export const transitions: Record<string, string[]> = {
  pending_admin_review: ["accepted", "accepted_pending_assignment", "rejected", "cancelled"],
  pending_review: ["accepted_pending_assignment", "rejected", "closed_admin"],
  accepted: ["assigned", "cancelled", "on_hold"],
  accepted_pending_assignment: ["assigned", "closed_admin"],
  assigned: [
    "in_progress",
    "awaiting_documents",
    "awaiting_hearing",
    "awaiting_judgment",
    "completed",
    "closed_admin",
  ],
  in_progress: [
    "awaiting_documents",
    "awaiting_hearing",
    "awaiting_judgment",
    "completed",
    "closed_admin",
  ],
  awaiting_documents: ["in_progress", "awaiting_hearing", "awaiting_judgment", "completed", "closed_admin"],
  awaiting_hearing: ["in_progress", "awaiting_documents", "awaiting_judgment", "completed", "closed_admin"],
  awaiting_judgment: ["in_progress", "completed", "closed_admin"],
  rejected: [],
  completed: [],
  closed_admin: [],
  cancelled: [],
  on_hold: ["in_progress", "cancelled"],
};

export function canTransition(from: string, to: string): boolean {
  const allowed = (transitions as Record<string, string[]>)[from];
  if (!Array.isArray(allowed)) return false;
  return allowed.includes(to);
}

export function isOperatingStatus(status: string): status is OperatingStatus {
  return (OPERATING_STATUSES as readonly string[]).includes(status);
}

export function isAdminStatus(status: string): status is AdminStatus {
  return (ADMIN_STATUSES as readonly string[]).includes(status);
}
