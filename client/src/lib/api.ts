// API Client
const API_BASE = "/api";

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
    const error = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(error.error || "Request failed");
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
};

// Beneficiaries API
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

// Intake Requests API
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

// Cases API
export const casesAPI = {
  getAll: () => fetchAPI("/cases"),
  getOne: (id: string) => fetchAPI(`/cases/${id}`),
  create: (data: any) =>
    fetchAPI("/cases", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  update: (id: string, data: any) =>
    fetchAPI(`/cases/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  delete: (id: string) =>
    fetchAPI(`/cases/${id}`, { method: "DELETE" }),
};

// Hearings API
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

// Dashboard API
export const dashboardAPI = {
  getStats: () => fetchAPI("/dashboard/stats"),
};

// Audit Logs API
export const auditAPI = {
  getLogs: (limit?: number) =>
    fetchAPI(`/audit-logs${limit ? `?limit=${limit}` : ""}`),
};

// Users API
export const usersAPI = {
  getAll: () => fetchAPI("/users"),
};
