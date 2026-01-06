/*
Stage 3 smoke: service requests (UI/API authz proof)
- Beneficiary can POST /api/service-requests and see it in GET /api/service-requests/my
- Admin/Lawyer can GET /api/service-requests and PATCH /api/service-requests/:id/status
- Beneficiary cannot PATCH status (403)
*/

export async function run() {
  const baseUrl = process.env.SMOKE_BASE_URL || "http://localhost:5058";

  type JsonRecord = Record<string, unknown>;
  const isRecord = (value: unknown): value is JsonRecord => typeof value === "object" && value !== null;

  const randomId = (prefix: string) => `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now()}`;

  const pickErrorMessage = (data: unknown, fallback: string) => {
    if (typeof data === "string" && data.trim()) return data;
    if (isRecord(data)) {
      const err = data.error;
      const msg = data.message;
      if (typeof err === "string" && err.trim()) return err;
      if (typeof msg === "string" && msg.trim()) return msg;
    }
    return fallback;
  };

  class HttpError extends Error {
    status: number;
    body: unknown;
    constructor(message: string, status: number, body: unknown) {
      super(message);
      this.name = "HttpError";
      this.status = status;
      this.body = body;
    }
  }

  const makeClient = () => {
    let cookie = "";

    const request = async <T = unknown>(path: string, init?: RequestInit): Promise<T> => {
      const res = await fetch(`${baseUrl}${path}`, {
        ...init,
        headers: {
          "Content-Type": "application/json",
          ...(cookie ? { Cookie: cookie } : {}),
          ...(init?.headers || {}),
        },
      });

      const setCookie = res.headers.get("set-cookie");
      if (setCookie) cookie = setCookie.split(";")[0];

      const contentType = res.headers.get("content-type") || "";
      const body: unknown = contentType.includes("application/json")
        ? await res.json().catch(() => ({}))
        : await res.text().catch(() => "");

      if (!res.ok) {
        throw new HttpError(pickErrorMessage(body, res.statusText || "Request failed"), res.status, body);
      }

      return body as T;
    };

    return { request };
  };

  const adminClient = makeClient();
  const benClient = makeClient();

  const adminUsername = randomId("smoke_stage3_admin");
  const adminPassword = "Admin123!";

  await adminClient.request("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({
      username: adminUsername,
      email: `${adminUsername}@example.com`,
      password: adminPassword,
      fullName: "Smoke Admin",
      role: "admin",
    }),
  });

  await adminClient.request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username: adminUsername, password: adminPassword }),
  });

  const benUsername = randomId("smoke_stage3_ben");
  const benReg = await benClient.request<{ beneficiary?: { id?: string } }>("/api/auth/register-beneficiary", {
    method: "POST",
    body: JSON.stringify({
      username: benUsername,
      fullName: "Smoke Beneficiary",
      email: `${benUsername}@example.com`,
      idNumber: randomId("300").replace(/[^0-9]/g, "").slice(0, 9).padEnd(9, "3"),
      phone: "+962793333333",
      city: "Amman",
      preferredLanguage: "ar",
      password: "StrongPass1!",
      confirmPassword: "StrongPass1!",
      serviceType: "legal_consultation",
      notes: "Smoke stage3",
    }),
  });

  const beneficiaryId = benReg?.beneficiary?.id;
  if (!beneficiaryId) throw new Error("Missing beneficiary id");

  // Beneficiary creates a new service request via Stage 3 endpoint
  const issueSummary = randomId("Issue");
  const created = await benClient.request<{ id?: string }>("/api/service-requests", {
    method: "POST",
    body: JSON.stringify({
      serviceType: "legal_consultation",
      issueSummary,
      issueDetails: "Details",
      urgent: false,
    }),
  });

  if (!created?.id) throw new Error("Service request create did not return id");

  // Beneficiary sees it in my list
  const my = await benClient.request<unknown>("/api/service-requests/my", { method: "GET" });
  const mine = (Array.isArray(my) ? my : []).find(
    (r) => isRecord(r) && (r.id === created.id || r.issueSummary === issueSummary)
  );
  if (!mine) throw new Error("Beneficiary cannot see created request in /my");

  // Beneficiary cannot update status
  let got403 = false;
  try {
    await benClient.request(`/api/service-requests/${created.id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status: "accepted" }),
    });
  } catch (e: unknown) {
    got403 = e instanceof HttpError && e.status === 403;
  }
  if (!got403) throw new Error("Expected 403 when beneficiary patches status");

  // Admin sees it in list-all
  const all = await adminClient.request<unknown>("/api/service-requests", { method: "GET" });
  const inAll = (Array.isArray(all) ? all : []).find((r) => isRecord(r) && r.id === created.id);
  if (!inAll) throw new Error("Admin cannot see created request in list-all");

  // Admin updates status
  const updated = await adminClient.request<{ status?: string }>(`/api/service-requests/${created.id}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status: "in_review" }),
  });

  if (updated?.status !== "in_review") throw new Error("Admin status update failed");

  // Beneficiary sees updated status
  const myAfter = await benClient.request<unknown>("/api/service-requests/my", { method: "GET" });
  const mineAfter = (Array.isArray(myAfter) ? myAfter : []).find((r) => isRecord(r) && r.id === created.id);
  if (!mineAfter) throw new Error("Beneficiary cannot see request after status update");
  if (!isRecord(mineAfter) || mineAfter.status !== "in_review") throw new Error("Beneficiary did not see updated status");

  console.log("OK stage3 service requests", { baseUrl, requestId: created.id, beneficiaryId });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run().catch(console.error);
}
