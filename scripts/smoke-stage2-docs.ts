/*
Stage 2 smoke: documents visibility + authz
- Staff (admin) can upload public+private documents to a case
- Beneficiary can only see public documents for their case via GET /api/cases/:id/documents
- Beneficiary cannot access other beneficiary case docs (403)
- Beneficiary can upload to their own case, and server forces isPublic=true
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

  const fakeMeta = (name: string) => {
    const storageKey = randomId("doc");
    return {
      storageKey,
      fileUrl: `/uploads/${storageKey}.pdf`,
      fileName: name,
      mimeType: "application/pdf",
      size: 1234,
    };
  };

  const adminClient = makeClient();
  const benClient = makeClient();
  const otherBenClient = makeClient();

  const adminUsername = randomId("smoke_stage2_admin");
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

  const benUsername = randomId("smoke_stage2_ben");
  const otherBenUsername = randomId("smoke_stage2_ben_other");

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
      notes: "Smoke stage2",
    }),
  });

  const otherBenReg = await otherBenClient.request<{ beneficiary?: { id?: string } }>("/api/auth/register-beneficiary", {
    method: "POST",
    body: JSON.stringify({
      username: otherBenUsername,
      fullName: "Smoke Beneficiary Other",
      email: `${otherBenUsername}@example.com`,
      idNumber: randomId("400").replace(/[^0-9]/g, "").slice(0, 9).padEnd(9, "4"),
      phone: "+962794444444",
      city: "Zarqa",
      preferredLanguage: "ar",
      password: "StrongPass1!",
      confirmPassword: "StrongPass1!",
      serviceType: "legal_consultation",
      notes: "Smoke stage2",
    }),
  });

  const beneficiaryId = benReg?.beneficiary?.id;
  const otherBeneficiaryId = otherBenReg?.beneficiary?.id;
  if (!beneficiaryId || !otherBeneficiaryId) throw new Error("Missing beneficiary ids");

  const case1 = await adminClient.request<{ id: string }>("/api/cases", {
    method: "POST",
    body: JSON.stringify({
      caseNumber: randomId("CASE").slice(0, 18),
      title: "Stage2 Case",
      beneficiaryId,
      caseType: "civil",
      description: "Stage2",
      status: "open",
      priority: "medium",
    }),
  });

  const otherCase = await adminClient.request<{ id: string }>("/api/cases", {
    method: "POST",
    body: JSON.stringify({
      caseNumber: randomId("CASE").slice(0, 18),
      title: "Stage2 Other Case",
      beneficiaryId: otherBeneficiaryId,
      caseType: "civil",
      description: "Stage2",
      status: "open",
      priority: "medium",
    }),
  });

  // Staff uploads: one public and one private
  const pub = fakeMeta("public.pdf");
  const priv = fakeMeta("private.pdf");

  await adminClient.request(`/api/cases/${case1.id}/documents`, {
    method: "POST",
    body: JSON.stringify({ isPublic: true, documents: [pub] }),
  });

  await adminClient.request(`/api/cases/${case1.id}/documents`, {
    method: "POST",
    body: JSON.stringify({ isPublic: false, documents: [priv] }),
  });

  // Beneficiary sees only public
  const benDocs = await benClient.request<unknown>(`/api/cases/${case1.id}/documents`, { method: "GET" });
  const benNames = new Set(
    (Array.isArray(benDocs) ? benDocs : []).map((d) => (isRecord(d) ? String(d.fileName) : ""))
  );
  if (!benNames.has("public.pdf") || benNames.has("private.pdf")) {
    throw new Error("Beneficiary visibility mismatch (should only see public) ");
  }

  // Admin sees both
  const staffDocs = await adminClient.request<unknown>(`/api/cases/${case1.id}/documents`, { method: "GET" });
  const staffNames = new Set(
    (Array.isArray(staffDocs) ? staffDocs : []).map((d) => (isRecord(d) ? String(d.fileName) : ""))
  );
  if (!staffNames.has("public.pdf") || !staffNames.has("private.pdf")) {
    throw new Error("Staff visibility mismatch (should see all)");
  }

  // Beneficiary cannot access other case
  let got403 = false;
  try {
    await benClient.request(`/api/cases/${otherCase.id}/documents`, { method: "GET" });
  } catch (e: unknown) {
    got403 = e instanceof HttpError && e.status === 403;
  }
  if (!got403) throw new Error("Expected 403 when beneficiary accesses other case docs");

  // Beneficiary upload to their own case forces public
  await benClient.request(`/api/cases/${case1.id}/documents`, {
    method: "POST",
    body: JSON.stringify({ isPublic: false, documents: [fakeMeta("ben.pdf")] }),
  });

  const staffDocsAfter = await adminClient.request<unknown>(`/api/cases/${case1.id}/documents`, { method: "GET" });
  const benDoc = (Array.isArray(staffDocsAfter) ? staffDocsAfter : []).find(
    (d) => isRecord(d) && d.fileName === "ben.pdf"
  );
  if (!benDoc) throw new Error("Missing beneficiary uploaded document");
  if (!isRecord(benDoc) || benDoc.isPublic !== true) throw new Error("Expected beneficiary uploaded doc to be isPublic=true");

  // Beneficiary cannot upload to other case
  got403 = false;
  try {
    await benClient.request(`/api/cases/${otherCase.id}/documents`, {
      method: "POST",
      body: JSON.stringify({ isPublic: true, documents: [fakeMeta("forbidden.pdf")] }),
    });
  } catch (e: unknown) {
    got403 = e instanceof HttpError && e.status === 403;
  }
  if (!got403) throw new Error("Expected 403 when beneficiary uploads to other case");

  console.log("OK stage2 documents visibility", { baseUrl, caseId: case1.id });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run().catch(console.error);
}
