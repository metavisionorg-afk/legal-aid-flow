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

  return res.json();
}

async function fetchUpload(file: File) {
  const res = await fetch(`${API_BASE}/uploads`, {
    method: "POST",
    body: file,
    headers: {
      "Content-Type": file.type || "application/octet-stream",
      "x-file-name": file.name,
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
  getOne: (id: string) => fetchAPI(`/tasks/${id}`),
  getByUser: (userId: string) => fetchAPI(`/users/${userId}/tasks`),
  getByCase: (caseId: string) => fetchAPI(`/cases/${caseId}/tasks`),
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
