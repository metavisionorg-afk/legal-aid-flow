/*
Smoke: sessions (Stage: upgraded session create)
- Admin can create beneficiary + case
- Uploads endpoint accepts PDF and returns metadata
- Admin can POST /api/sessions with attachments + addToTimeline
- GET /api/cases/:caseId/sessions includes created session
- GET /api/sessions/:id returns attachments
*/

export async function run() {
  const baseUrl = process.env.SMOKE_BASE_URL || process.env.BASE_URL || "http://localhost:5000";

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

  const adminUsername = randomId("smoke_sessions_admin");
  const adminPassword = "Admin123!";

  // Register admin (ok if already exists)
  await adminClient
    .request("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: adminUsername,
        email: `${adminUsername}@example.com`,
        password: adminPassword,
        fullName: "Smoke Sessions Admin",
        role: "admin",
        userType: "staff",
      }),
    })
    .catch((e: any) => {
      // Ignore conflicts
      if (e instanceof HttpError && e.status === 400) return;
      throw e;
    });

  await adminClient.request("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: adminUsername, password: adminPassword }),
  });

  const beneficiaryIdNumber = randomId("smoke_sessions_id");
  const beneficiary = await adminClient.request<{ id: string }>("/api/beneficiaries", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fullName: "Smoke Sessions Beneficiary",
      idNumber: beneficiaryIdNumber,
      phone: "+966500000000",
      status: "pending",
    }),
  });

  if (!beneficiary?.id) throw new Error("Beneficiary create failed");

  const caseNumber = randomId("smoke_sessions_case");
  const createdCase = await adminClient.request<{ id: string }>("/api/cases", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      caseNumber,
      title: "Smoke Sessions Case",
      beneficiaryId: beneficiary.id,
      description: "smoke",
      caseType: "civil",
      priority: "medium",
    }),
  });

  if (!createdCase?.id) throw new Error("Case create failed");

  // Upload a tiny PDF
  const pdfBytes = new TextEncoder().encode("%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n");
  const uploadRes = await fetch(`${baseUrl}/api/uploads`, {
    method: "POST",
    body: pdfBytes,
    headers: {
      "Content-Type": "application/pdf",
      "x-file-name": `${randomId("smoke")}.pdf`,
    },
  });

  const uploadJson = (await uploadRes.json().catch(() => null)) as any;
  if (!uploadRes.ok) {
    throw new Error(`Upload failed: ${uploadRes.status} ${JSON.stringify(uploadJson)}`);
  }

  if (!uploadJson?.storageKey) throw new Error("Upload did not return storageKey");

  const now = new Date();
  const dateGregorian = now.toISOString();

  const createdSession = await adminClient.request<{ id: string }>("/api/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      caseId: createdCase.id,
      dateGregorian,
      time: "10:00",
      hijriDate: null,
      sessionType: "remote",
      status: "upcoming",
      meetingUrl: "https://example.com/meet",
      requirements: "smoke",
      notes: "smoke",
      isConfidential: false,
      reminderMinutes: 30,
      addToTimeline: true,
      courtName: "Smoke Court",
      city: "Riyadh",
      circuit: "A",
      attachments: [uploadJson],
    }),
  });

  if (!createdSession?.id) throw new Error("Session create failed");

  const byCase = await adminClient.request<any[]>(`/api/cases/${createdCase.id}/sessions`, { method: "GET" });
  const found = (Array.isArray(byCase) ? byCase : []).find((s: any) => isRecord(s) && s.id === createdSession.id);
  if (!found) throw new Error("GET sessions by case did not include created session");

  const byId = await adminClient.request<any>(`/api/sessions/${createdSession.id}`, { method: "GET" });
  const attachments = (byId as any)?.attachments;
  if (!Array.isArray(attachments) || attachments.length !== 1) {
    throw new Error("GET session by id did not include attachments");
  }

  console.log("OK smoke sessions", {
    baseUrl,
    beneficiaryId: beneficiary.id,
    caseId: createdCase.id,
    sessionId: createdSession.id,
    attachmentStorageKey: attachments[0]?.storageKey,
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run().catch(console.error);
}
