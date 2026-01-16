// API Client
const API_BASE = "/api";

function pickErrorMessage(data: any, fallback: string) {
  if (typeof data === "string" && data.trim()) return data;
  if (data && typeof data === "object") {
    if (typeof (data as any).error === "string" && (data as any).error.trim()) return (data as any).error;
    if (typeof (data as any).message === "string" && (data as any).message.trim()) return (data as any).message;
    if (typeof (data as any).msg === "string" && (data as any).msg.trim()) return (data as any).msg;
  }
  return fallback;
}

async function fetchAPI(endpoint: string, options?: RequestInit) {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
    credentials: "include",
  });

  const contentType = (res.headers.get("content-type") || "").toLowerCase();

  if (!res.ok) {
    const contentType = res.headers.get("content-type") || "";
    const data = contentType.includes("application/json")
      ? await res.json().catch(() => ({ error: "Request failed" }))
      : await res.text().catch(() => "Request failed");
    const message = pickErrorMessage(data, res.statusText || "Request failed");

    const error: any = new Error(message);
    error.response = { status: res.status, statusText: res.statusText, data };
    throw error;
  }

  // Some endpoints may intentionally return no body.
  if (res.status === 204) return null;

  // Guardrail: if we got HTML (often the SPA index.html), don't try to JSON-parse it.
  if (!contentType.includes("application/json")) {
    const text = await res.text().catch(() => "");
    const sample = text ? text.slice(0, 200) : "";
    const hint =
      contentType.includes("text/html") || sample.includes("<!DOCTYPE") || sample.includes("<html")
        ? "The server returned HTML (likely the SPA shell). Check that the API route exists and that you're running the Express server (not only the Vite client)."
        : `Unexpected content-type: ${contentType || "(none)"}`;

    const error: any = new Error(hint);
    error.response = { status: res.status, statusText: res.statusText, data: sample || text };
    throw error;
  }

  return res.json();
}

async function fetchUpload(file: File) {
  const res = await fetch(`${API_BASE}/uploads`, {
    method: "POST",
    body: file,
    headers: {
      "Content-Type": file.type || "application/octet-stream",
      // Header values must be ASCII-safe in browsers; encode to support Arabic/Unicode names.
      "x-file-name": encodeURIComponent(file.name),
    },
    credentials: "include",
  });

  if (!res.ok) {
    const contentType = res.headers.get("content-type") || "";
    const data = contentType.includes("application/json")
      ? await res.json().catch(() => ({ error: "Upload failed" }))
      : await res.text().catch(() => "Upload failed");
    const message = pickErrorMessage(data, res.statusText || "Upload failed");
    const error: any = new Error(message);
    error.response = { status: res.status, statusText: res.statusText, data };
    throw error;
  }

  return res.json();
}

// Config API
export const configAPI = {
  features: () => fetchAPI("/config/features"),
};

// Auth API
export const authAPI = {
  login: (username: string, password: string) =>
    fetchAPI("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  
  logout: () =>
    fetchAPI("/auth/logout", { method: "POST" }),
  
  me: () =>
    fetchAPI("/auth/me"),
  
  register: (data: any) =>
    fetchAPI("/auth/register", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  registerBeneficiary: (data: any) =>
    fetchAPI("/auth/register-beneficiary", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  changePassword: (data: { currentPassword: string; newPassword: string }) =>
    fetchAPI("/auth/change-password", {
      method: "POST",
      body: JSON.stringify(data),
    }),
};

// Portal API (Beneficiary)
export const portalAPI = {
  register: (data: any) =>
    fetchAPI("/portal/register", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  
  getProfile: () =>
    fetchAPI("/portal/profile"),
  
  updateProfile: (data: any) =>
    fetchAPI("/portal/profile", {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  
  getMyCases: () =>
    fetchAPI("/portal/my-cases"),
  
  getMyIntakeRequests: () =>
    fetchAPI("/portal/my-intake-requests"),
  
  createIntakeRequest: (data: any) =>
    fetchAPI("/portal/intake-requests", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  
  getDashboardStats: () =>
    fetchAPI("/portal/dashboard-stats"),
};

// Beneficiary Self API
export const beneficiaryAPI = {
  me: () => fetchAPI("/beneficiary/me"),
  updateMe: (data: any) =>
    fetchAPI("/beneficiary/me", {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
};

export const uploadsAPI = {
  upload: (file: File) => fetchUpload(file),
};

export const documentsAPI = {
  uploadMy: (data: { requestId?: string; documents: any[] }) =>
    fetchAPI("/documents/my", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  listMy: () => fetchAPI("/documents/my"),
};

export const serviceRequestsAPI = {
  create: (data: any) =>
    fetchAPI("/service-requests", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  listMy: () => fetchAPI("/service-requests/my"),
  listAll: () => fetchAPI("/service-requests"),
  updateStatus: (id: string, status: "new" | "in_review" | "accepted" | "rejected") =>
    fetchAPI(`/service-requests/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),
};

// Staff Beneficiaries API
// Staff-only endpoint for creating beneficiary user + beneficiary profile.
export const staffBeneficiariesAPI = {
  create: (data: any) =>
    fetchAPI("/staff/beneficiaries", {
      method: "POST",
      body: JSON.stringify(data),
    }),
};

// Beneficiaries API (Staff only)
export const beneficiariesAPI = {
  getAll: () => fetchAPI("/beneficiaries"),
  getOne: (id: string) => fetchAPI(`/beneficiaries/${id}`),
  create: (data: any) =>
    fetchAPI("/beneficiaries", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  update: (id: string, data: any) =>
    fetchAPI(`/beneficiaries/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  delete: (id: string) =>
    fetchAPI(`/beneficiaries/${id}`, { method: "DELETE" }),
};

// Intake Requests API (Staff only)
export const intakeAPI = {
  getAll: () => fetchAPI("/intake-requests"),
  getOne: (id: string) => fetchAPI(`/intake-requests/${id}`),
  create: (data: any) =>
    fetchAPI("/intake-requests", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  update: (id: string, data: any) =>
    fetchAPI(`/intake-requests/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
};

// Cases API (Staff only)
export const casesAPI = {
  getAll: () => fetchAPI("/cases"),
  getOne: (id: string) => fetchAPI(`/cases/${id}`),
  getMy: () => fetchAPI("/cases/my"),
  listDocuments: (caseId: string) => fetchAPI(`/cases/${caseId}/documents`),
  uploadDocuments: (caseId: string, data: { isPublic?: boolean; documents: any[] }) =>
    fetchAPI(`/cases/${caseId}/documents`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  getTimeline: (id: string) => fetchAPI(`/cases/${id}/timeline`),
  create: (data: any) =>
    fetchAPI("/cases", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  approve: (id: string) =>
    fetchAPI(`/cases/${id}/approve`, {
      method: "PATCH",
      body: JSON.stringify({}),
    }),
  reject: (id: string, rejectReason?: string) =>
    fetchAPI(`/cases/${id}/reject`, {
      method: "PATCH",
      body: JSON.stringify({ rejectReason: rejectReason?.trim() ? rejectReason.trim() : null }),
    }),
  assignLawyer: (id: string, lawyerId: string) =>
    fetchAPI(`/cases/${id}/assign-lawyer`, {
      method: "PATCH",
      body: JSON.stringify({ lawyerId }),
    }),
  updateStatus: (id: string, status: string, note?: string) =>
    fetchAPI(`/cases/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status, note: note?.trim() ? note.trim() : null }),
    }),
  update: (id: string, data: any) =>
    fetchAPI(`/cases/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  delete: (id: string) =>
    fetchAPI(`/cases/${id}`, { method: "DELETE" }),
};

export const caseDetailsAPI = {
  upsertForCase: (caseId: string, data: any) =>
    fetchAPI(`/cases/${caseId}/details`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
};

// Hearings API (Staff only)
export const hearingsAPI = {
  getAll: () => fetchAPI("/hearings"),
  getOne: (id: string) => fetchAPI(`/hearings/${id}`),
  create: (data: any) =>
    fetchAPI("/hearings", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  update: (id: string, data: any) =>
    fetchAPI(`/hearings/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  delete: (id: string) =>
    fetchAPI(`/hearings/${id}`, { method: "DELETE" }),
};

// Experts API
export const expertsAPI = {
  getAll: () => fetchAPI("/experts"),
  getOne: (userId: string) => fetchAPI(`/experts/${userId}`),
  create: (data: any) =>
    fetchAPI("/experts", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  update: (userId: string, data: any) =>
    fetchAPI(`/experts/${userId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
};

// Appointments API
export const appointmentsAPI = {
  getAll: () => fetchAPI("/appointments"),
  getOne: (id: string) => fetchAPI(`/appointments/${id}`),
  create: (data: any) =>
    fetchAPI("/appointments", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  update: (id: string, data: any) =>
    fetchAPI(`/appointments/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  delete: (id: string) =>
    fetchAPI(`/appointments/${id}`, { method: "DELETE" }),
};

// Notifications API
export const notificationsAPI = {
  getAll: () => fetchAPI("/notifications"),
  getMy: () => fetchAPI("/notifications/my"),
  getUnread: () => fetchAPI("/notifications/unread"),
  markAsRead: (id: string) =>
    fetchAPI(`/notifications/${id}/read`, { method: "PATCH" }),
  markAllAsRead: () =>
    fetchAPI("/notifications/mark-all-read", { method: "POST" }),
};

// Dashboard API (Staff only)
export const dashboardAPI = {
  getStats: () => fetchAPI("/dashboard/stats"),
};

// Audit Logs API (Staff only)
export const auditAPI = {
  getLogs: (limit?: number) =>
    fetchAPI(`/audit-logs${limit ? `?limit=${limit}` : ""}`),
};

// Users API (Staff only)
export const usersAPI = {
  getAll: () => fetchAPI("/users"),
  listLawyers: () => fetchAPI("/users/lawyers"),
  create: (data: any) =>
    fetchAPI("/users", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  update: (id: string, data: any) =>
    fetchAPI(`/users/${id}`,
      {
        method: "PATCH",
        body: JSON.stringify(data),
      }
    ),
};

// System Settings API (Staff only)
export const systemSettingsAPI = {
  get: () => fetchAPI("/system-settings"),
  update: (data: any) =>
    fetchAPI("/system-settings", {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
};

// Rules API (Staff only)
export const rulesAPI = {
  getAll: () => fetchAPI("/rules"),
  getOne: (id: string) => fetchAPI(`/rules/${id}`),
  create: (data: any) =>
    fetchAPI("/rules", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  update: (id: string, data: any) =>
    fetchAPI(`/rules/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  delete: (id: string) =>
    fetchAPI(`/rules/${id}`, { method: "DELETE" }),
  
  // User Rules
  getUserRules: (userId: string) => fetchAPI(`/users/${userId}/rules`),
  assignToUser: (userId: string, ruleId: string) =>
    fetchAPI(`/users/${userId}/rules/${ruleId}`, { method: "POST" }),
  removeFromUser: (userId: string, ruleId: string) =>
    fetchAPI(`/users/${userId}/rules/${ruleId}`, { method: "DELETE" }),
  getUserPermissions: (userId: string) => fetchAPI(`/users/${userId}/permissions`),
};

// Tasks API (Staff only)
export const tasksAPI = {
  getAll: () => fetchAPI("/tasks"),
  // Beneficiary portal
  getMy: () => fetchAPI("/tasks/my"),
  getOne: (id: string) => fetchAPI(`/tasks/${id}`),  getMySessions: () => fetchAPI("/portal/my-sessions"),  getByUser: (userId: string) => fetchAPI(`/users/${userId}/tasks`),
  getByCase: (caseId: string) => fetchAPI(`/cases/${caseId}/tasks`),
  listAttachments: (taskId: string) => fetchAPI(`/tasks/${taskId}/attachments`),
  addAttachments: (taskId: string, data: { isPublic?: boolean; documents: any[] }) =>
    fetchAPI(`/tasks/${taskId}/attachments`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  create: (data: any) =>
    fetchAPI("/tasks", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  update: (id: string, data: any) =>
    fetchAPI(`/tasks/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  delete: (id: string) =>
    fetchAPI(`/tasks/${id}`, { method: "DELETE" }),
};

// Consultations API (Staff only)
export const consultationsAPI = {
  getAll: () => fetchAPI("/consultations"),
  getByBeneficiary: (beneficiaryId: string) =>
    fetchAPI(`/beneficiaries/${beneficiaryId}/consultations`),
  create: (data: any) =>
    fetchAPI("/consultations", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  update: (id: string, data: any) =>
    fetchAPI(`/consultations/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  delete: (id: string) => fetchAPI(`/consultations/${id}`, { method: "DELETE" }),
};

// Sessions API (Staff only)
export const sessionsAPI = {
  getAll: () => fetchAPI("/sessions"),
  getByCase: (caseId: string) => fetchAPI(`/cases/${caseId}/sessions`),
  create: (data: any) =>
    fetchAPI("/sessions", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  update: (id: string, data: any) =>
    fetchAPI(`/sessions/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  delete: (id: string) => fetchAPI(`/sessions/${id}`, { method: "DELETE" }),
};

// Enhanced Dashboard API (Staff only)
export const enhancedDashboardAPI = {
  getStats: () => fetchAPI("/dashboard/enhanced-stats"),

  listAttachments: (taskId: string) => fetchAPI(`/tasks/${taskId}/attachments`),
  addAttachments: (taskId: string, data: { isPublic?: boolean; documents: any[] }) =>
    fetchAPI(`/tasks/${taskId}/attachments`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
};

// Powers of Attorney API (Staff)
export const powersOfAttorneyAPI = {
  list: (params?: { caseId?: string; beneficiaryId?: string; expiringDays?: number }) => {
    const qs = new URLSearchParams();
    if (params?.caseId) qs.set("caseId", params.caseId);
    if (params?.beneficiaryId) qs.set("beneficiaryId", params.beneficiaryId);
    if (typeof params?.expiringDays === "number") qs.set("expiringDays", String(params.expiringDays));
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return fetchAPI(`/power-of-attorney${suffix}`);
  },
  expiring: (days?: number) => {
    const suffix = typeof days === "number" ? `?days=${encodeURIComponent(String(days))}` : "";
    return fetchAPI(`/power-of-attorney/expiring${suffix}`);
  },
  getOne: (id: string) => fetchAPI(`/power-of-attorney/${id}`),
  create: (data: any) =>
    fetchAPI("/power-of-attorney", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  update: (id: string, data: any) =>
    fetchAPI(`/power-of-attorney/${id}`,
      {
        method: "PATCH",
        body: JSON.stringify(data),
      }
    ),
  delete: (id: string) => fetchAPI(`/power-of-attorney/${id}`, { method: "DELETE" }),
  listAttachments: (id: string) => fetchAPI(`/power-of-attorney/${id}/attachments`),
  addAttachments: (id: string, data: { documents: any[] }) =>
    fetchAPI(`/power-of-attorney/${id}/attachments`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  printUrl: (id: string) => `/api/power-of-attorney/${id}/print`,
};

// Case Types API (Staff/admin management + active list for authenticated users)
export const caseTypesAPI = {
  listAll: () => fetchAPI("/case-types"),
  listActive: () => fetchAPI("/case-types/active"),
  create: (data: { nameAr: string; nameEn?: string | null; sortOrder?: number | null }) =>
    fetchAPI("/case-types", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  update: (id: string, data: { nameAr?: string; nameEn?: string | null; sortOrder?: number | null }) =>
    fetchAPI(`/case-types/${id}`,
      {
        method: "PATCH",
        body: JSON.stringify(data),
      }
    ),
  toggle: (id: string, isActive: boolean) =>
    fetchAPI(`/case-types/${id}/toggle`, {
      method: "PATCH",
      body: JSON.stringify({ isActive }),
    }),
  delete: (id: string) => fetchAPI(`/case-types/${id}`, { method: "DELETE" }),
};

// Lawyer Portal API (Staff role=lawyer)
export const lawyerAPI = {
  getDashboard: () => fetchAPI("/lawyer/me/dashboard"),
  listCases: (params?: { status?: string; q?: string }) => {
    const qs = new URLSearchParams();
    if (params?.status) qs.set("status", params.status);
    if (params?.q) qs.set("q", params.q);
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return fetchAPI(`/lawyer/cases${suffix}`);
  },
  listBeneficiaries: () => fetchAPI("/lawyer/beneficiaries"),
};

// Documents Library Folders API
export const docFoldersAPI = {
  list: (params?: { includeArchived?: boolean }) =>
    fetchAPI(`/doc-folders${params?.includeArchived ? "?includeArchived=1" : ""}`),
  getOne: (id: string) => fetchAPI(`/doc-folders/${id}`),
  create: (data: any) =>
    fetchAPI("/doc-folders", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  update: (id: string, data: any) =>
    fetchAPI(`/doc-folders/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  archive: (id: string, isArchived: boolean) =>
    fetchAPI(`/doc-folders/${id}/archive`, {
      method: "PATCH",
      body: JSON.stringify({ isArchived }),
    }),
  delete: (id: string) => fetchAPI(`/doc-folders/${id}`, { method: "DELETE" }),
};

// Documents Library Documents API
export const libraryDocsAPI = {
  list: (params?: {
    q?: string;
    folderId?: string | null;
    beneficiaryId?: string | null;
    caseId?: string | null;
    visibility?: string | null;
    includeArchived?: boolean;
    limit?: number;
  }) => {
    const qs = new URLSearchParams();
    if (params?.q) qs.set("q", params.q);
    if (params?.folderId) qs.set("folderId", params.folderId);
    if (params?.beneficiaryId) qs.set("beneficiaryId", params.beneficiaryId);
    if (params?.caseId) qs.set("caseId", params.caseId);
    if (params?.visibility) qs.set("visibility", params.visibility);
    if (params?.includeArchived) qs.set("includeArchived", "1");
    if (params?.limit) qs.set("limit", String(params.limit));
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return fetchAPI(`/library-docs${suffix}`);
  },
  getOne: (id: string) => fetchAPI(`/library-docs/${id}`),
  create: (data: any) =>
    fetchAPI("/library-docs", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  update: (id: string, data: any) =>
    fetchAPI(`/library-docs/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  archive: (id: string, isArchived: boolean) =>
    fetchAPI(`/library-docs/${id}/archive`, {
      method: "PATCH",
      body: JSON.stringify({ isArchived }),
    }),
  delete: (id: string) => fetchAPI(`/library-docs/${id}`, { method: "DELETE" }),
};

// Judicial Service Types API (Staff/admin dictionary + active list for authenticated users)
export const judicialServiceTypesAPI = {
  listAll: () => fetchAPI("/judicial-service-types"),
  listActive: () => fetchAPI("/judicial-service-types/active"),
  create: (data: { nameAr: string; nameEn?: string | null; sortOrder?: number | null }) =>
    fetchAPI("/judicial-service-types", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  update: (id: string, data: { nameAr?: string; nameEn?: string | null; sortOrder?: number | null }) =>
    fetchAPI(`/judicial-service-types/${id}`,
      {
        method: "PATCH",
        body: JSON.stringify(data),
      }
    ),
  toggle: (id: string, isActive: boolean) =>
    fetchAPI(`/judicial-service-types/${id}/toggle`, {
      method: "PATCH",
      body: JSON.stringify({ isActive }),
    }),
  delete: (id: string) => fetchAPI(`/judicial-service-types/${id}`, { method: "DELETE" }),
};

// Service Types Settings API (Staff/admin management + active list for authenticated users)
export const serviceTypesAPI = {
  listAll: () => fetchAPI("/settings/service-types"),
  listActive: () => fetchAPI("/settings/service-types/active"),
  create: (data: { key?: string; nameAr: string; nameEn?: string | null }) =>
    fetchAPI("/settings/service-types", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  update: (id: string, data: { nameAr?: string; nameEn?: string | null }) =>
    fetchAPI(`/settings/service-types/${id}`,
      {
        method: "PATCH",
        body: JSON.stringify(data),
      }
    ),
  toggle: (id: string, isActive: boolean) =>
    fetchAPI(`/settings/service-types/${id}/toggle`, {
      method: "PATCH",
      body: JSON.stringify({ isActive }),
    }),
  delete: (id: string) => fetchAPI(`/settings/service-types/${id}`, { method: "DELETE" }),
};

// Judicial Services API (Staff + Beneficiary)
export const judicialServicesAPI = {
  list: () => fetchAPI("/judicial-services"),
  listMy: () => fetchAPI("/judicial-services/my"),
  getOne: (id: string) => fetchAPI(`/judicial-services/${id}`),
  create: (data: any) =>
    fetchAPI("/judicial-services", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  update: (id: string, data: any) =>
    fetchAPI(`/judicial-services/${id}`,
      {
        method: "PATCH",
        body: JSON.stringify(data),
      }
    ),
  updateStatus: (id: string, data: { status: string; note?: string | null }) =>
    fetchAPI(`/judicial-services/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  assignLawyer: (id: string, lawyerId: string) =>
    fetchAPI(`/judicial-services/${id}/assign-lawyer`, {
      method: "PATCH",
      body: JSON.stringify({ lawyerId }),
    }),
  delete: (id: string) => fetchAPI(`/judicial-services/${id}`, { method: "DELETE" }),

  listAttachments: (id: string) => fetchAPI(`/judicial-services/${id}/attachments`),
  addAttachments: (id: string, data: { isPublic?: boolean; documents: any[] }) =>
    fetchAPI(`/judicial-services/${id}/attachments`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
};

// Support API
export const supportAPI = {
  createTicket: (data: { category: string; subject: string; message: string }) =>
    fetchAPI("/support/tickets", {
      method: "POST",
      body: JSON.stringify(data),
    }),
};
