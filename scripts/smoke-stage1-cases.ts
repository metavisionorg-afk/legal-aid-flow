/*
Stage 1 smoke: cases authz
- Admin can create case
- Beneficiary cannot create case (403)
- GET /api/cases returns only beneficiary's cases for beneficiary
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
  const beneficiaryClient1 = makeClient();
  const beneficiaryClient2 = makeClient();

  const adminUsername = randomId("smoke_stage1_admin");
  const adminPassword = "Admin123!";

  // Create a staff admin user (public dev endpoint)
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

  // Login as admin
  await adminClient.request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username: adminUsername, password: adminPassword }),
  });

  const adminMe = await adminClient.request<{ userType?: string; role?: string }>("/api/auth/me", { method: "GET" });
  if (adminMe?.userType !== "staff" || !["admin", "super_admin"].includes(adminMe?.role || "")) {
    throw new Error(`Admin session invalid: userType=${adminMe?.userType} role=${adminMe?.role}`);
  }

  // Create two beneficiaries (auto-login per client)
  const b1Username = randomId("smoke_stage1_ben1");
  const b2Username = randomId("smoke_stage1_ben2");

  const b1 = await beneficiaryClient1.request<{ beneficiary?: { id?: string } }>("/api/auth/register-beneficiary", {
    method: "POST",
    body: JSON.stringify({
      username: b1Username,
      fullName: "Smoke Beneficiary 1",
      email: `${b1Username}@example.com`,
      idNumber: randomId("100")
        .replace(/[^0-9]/g, "")
        .slice(0, 9)
        .padEnd(9, "1"),
      phone: "+962791111111",
      city: "Amman",
      preferredLanguage: "ar",
      password: "StrongPass1!",
      confirmPassword: "StrongPass1!",
      serviceType: "legal_consultation",
      issueSummary: "Smoke stage1 issue",
      urgent: false,
    }),
  });

  const b2 = await beneficiaryClient2.request<{ beneficiary?: { id?: string } }>("/api/auth/register-beneficiary", {
    method: "POST",
    body: JSON.stringify({
      username: b2Username,
      fullName: "Smoke Beneficiary 2",
      email: `${b2Username}@example.com`,
      idNumber: randomId("200")
        .replace(/[^0-9]/g, "")
        .slice(0, 9)
        .padEnd(9, "2"),
      phone: "+962792222222",
      city: "Zarqa",
      preferredLanguage: "ar",
      password: "StrongPass1!",
      confirmPassword: "StrongPass1!",
      serviceType: "legal_consultation",
      issueSummary: "Smoke stage1 issue",
      urgent: false,
    }),
  });

  const beneficiaryId1 = b1?.beneficiary?.id;
  const beneficiaryId2 = b2?.beneficiary?.id;
  if (!beneficiaryId1 || !beneficiaryId2) {
    throw new Error("register-beneficiary response missing beneficiary.id");
  }

  const adminMe2 = await adminClient.request<{ userType?: string; role?: string }>("/api/auth/me", { method: "GET" });
  if (adminMe2?.userType !== "staff") {
    throw new Error(`Admin session changed unexpectedly: userType=${adminMe2?.userType} role=${adminMe2?.role}`);
  }
  await adminClient.request("/api/cases", { method: "GET" });

  // Admin creates one case for each beneficiary
  const c1 = await adminClient.request<{ id: string }>("/api/cases", {
    method: "POST",
    body: JSON.stringify({
      caseNumber: randomId("CASE").slice(0, 18),
      title: "Smoke Case 1",
      beneficiaryId: beneficiaryId1,
      caseType: "civil",
      description: "Smoke created case 1",
      status: "open",
      priority: "medium",
    }),
  });

  const c2 = await adminClient.request<{ id: string }>("/api/cases", {
    method: "POST",
    body: JSON.stringify({
      caseNumber: randomId("CASE").slice(0, 18),
      title: "Smoke Case 2",
      beneficiaryId: beneficiaryId2,
      caseType: "civil",
      description: "Smoke created case 2",
      status: "open",
      priority: "medium",
    }),
  });

  // Beneficiary GET /api/cases should only return their case(s)
  const b1Cases = await beneficiaryClient1.request<unknown>("/api/cases", { method: "GET" });
  const b2Cases = await beneficiaryClient2.request<unknown>("/api/cases", { method: "GET" });

  const b1Ids = new Set(
    (Array.isArray(b1Cases) ? b1Cases : []).map((x) => (isRecord(x) ? String(x.id) : ""))
  );
  const b2Ids = new Set(
    (Array.isArray(b2Cases) ? b2Cases : []).map((x) => (isRecord(x) ? String(x.id) : ""))
  );

  if (!b1Ids.has(c1.id) || b1Ids.has(c2.id)) {
    throw new Error("Beneficiary 1 visibility mismatch for GET /api/cases");
  }
  if (!b2Ids.has(c2.id) || b2Ids.has(c1.id)) {
    throw new Error("Beneficiary 2 visibility mismatch for GET /api/cases");
  }

  // Beneficiary cannot POST /api/cases (must be 403)
  let got403 = false;
  try {
    await beneficiaryClient1.request("/api/cases", {
      method: "POST",
      body: JSON.stringify({
        caseNumber: randomId("CASE").slice(0, 18),
        title: "Should fail",
        beneficiaryId: beneficiaryId1,
        caseType: "civil",
        description: "Should fail",
        status: "open",
        priority: "medium",
      }),
    });
  } catch (e: unknown) {
    got403 = e instanceof HttpError && e.status === 403;
  }

  if (!got403) {
    throw new Error("Expected beneficiary POST /api/cases to return 403");
  }

  console.log("OK stage1 cases authz", {
    baseUrl,
    adminUsername,
    beneficiaryId1,
    beneficiaryId2,
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run().catch(console.error);
}
