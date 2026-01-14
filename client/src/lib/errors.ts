type TFn = (key: string, options?: any) => string;

function extractResponse(error: any): { status?: number; data?: any } {
  if (!error || typeof error !== "object") return {};
  const res = (error as any).response;
  if (!res || typeof res !== "object") return {};
  return { status: typeof res.status === "number" ? res.status : undefined, data: res.data };
}

function extractMessage(error: unknown): string | undefined {
  if (error && typeof error === "object" && "message" in error) {
    const msg = (error as any).message;
    if (typeof msg === "string" && msg.trim()) return msg;
  }
  if (typeof error === "string" && error.trim()) return error;
  return undefined;
}

export function getErrorMessage(error: unknown, t?: TFn): string {
  const msg = extractMessage(error);
  const { status, data } = extractResponse(error as any);

  const serverMsg =
    (data && typeof data === "object" && typeof (data as any).error === "string" && (data as any).error.trim()
      ? (data as any).error
      : undefined) || msg;

  if (t) {
    // Auth errors (status 401 or specific error codes)
    if (status === 401 || data?.error === "USER_NOT_FOUND" || data?.error === "WRONG_PASSWORD" || data?.error === "INVALID_CREDENTIALS") {
      if (data?.error === "USER_NOT_FOUND") return t("auth.errors.user_not_found");
      if (data?.error === "WRONG_PASSWORD") return t("auth.errors.wrong_password");
      // Default to generic message for security
      return t("auth.errors.invalid_credentials");
    }
    if (data?.error === "MISSING_CREDENTIALS") return t("auth.errors.missing_credentials");

    if (status === 403 || serverMsg === "Forbidden") return t("errors.forbidden");
    if (status === 429 || /too many requests/i.test(serverMsg || "")) return t("errors.rate_limited");
    if (status === 409 && /email already exists/i.test(serverMsg || "")) return t("errors.email_exists");
    if (status === 409 && /username already exists/i.test(serverMsg || "")) return t("errors.username_exists");

    // Case workflow (server-side enforced)
    if (status === 403 && /only admin can approve/i.test(serverMsg || "")) return t("errors.case.only_admin_approve");
    if (status === 403 && /only admin can reject/i.test(serverMsg || "")) return t("errors.case.only_admin_reject");
    if (status === 403 && /only admin can assign/i.test(serverMsg || "")) return t("errors.case.only_admin_assign");
    if (status === 403 && /only assigned lawyer/i.test(serverMsg || "")) return t("errors.case.only_assigned_lawyer_operate");
    if (status === 400 && /invalid transition/i.test(serverMsg || "")) return t("errors.case.invalid_transition");
    if (status === 400 && /invalid status/i.test(serverMsg || "")) return t("errors.case.invalid_status");
  }

  if (serverMsg && serverMsg.trim()) return serverMsg;
  try {
    return JSON.stringify(error);
  } catch {
    return t ? t("errors.unknown") : "Unknown error";
  }
}
