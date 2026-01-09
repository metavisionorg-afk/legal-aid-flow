/*
Stage 4 smoke: tasks + attachments + notifications
- Admin can create a task for a beneficiary (beneficiary-first)
- Beneficiary can list their tasks via GET /api/tasks/my
- Admin can attach INTERNAL and PUBLIC docs to a task; beneficiary sees only PUBLIC
- Lawyer (linked on task) can update task status (status-only)
- Task events emit notifications to participants

Usage:
  SMOKE_BASE_URL=http://localhost:5000 npm run smoke:stage4
*/

export async function run() {
  const baseUrl =
    process.env.SMOKE_BASE_URL || process.env.BASE_URL || "http://localhost:5000";

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
  const lawyerClient = makeClient();
  const benClient = makeClient();

  // Admin user
  const adminUsername = randomId("smoke_stage4_admin");
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

  // Lawyer user
  const lawyerUsername = randomId("smoke_stage4_lawyer");
  const lawyerPassword = "Lawyer123!";

  await lawyerClient.request("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({
      username: lawyerUsername,
      email: `${lawyerUsername}@example.com`,
      password: lawyerPassword,
      fullName: "Smoke Lawyer",
      role: "lawyer",
    }),
  });

  await lawyerClient.request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username: lawyerUsername, password: lawyerPassword }),
  });

  const lawyerMe = await lawyerClient.request<{ id?: string }>("/api/auth/me", { method: "GET" });
  if (!lawyerMe?.id) throw new Error("Missing lawyer id");

  // Beneficiary registration (Stage 3 flat payload) auto-logs in.
  const benUsername = randomId("smoke_stage4_ben");
  const benReg = await benClient.request<{ beneficiary?: { id?: string }; user?: { id?: string } }>(
    "/api/auth/register-beneficiary",
    {
      method: "POST",
      body: JSON.stringify({
        username: benUsername,
        fullName: "Smoke Beneficiary",
        email: `${benUsername}@example.com`,
        phone: "+962793333333",
        city: "Amman",
        preferredLanguage: "ar",
        serviceType: "legal_consultation",
        password: "StrongPass1!",
        confirmPassword: "StrongPass1!",
        notes: "Smoke stage4",
      }),
    },
  );

  const beneficiaryId = benReg?.beneficiary?.id;
  const beneficiaryUserId = benReg?.user?.id;
  if (!beneficiaryId || !beneficiaryUserId) throw new Error("Missing beneficiary ids");

  // Create task (admin)
  const taskTitle = randomId("Task");
  const createdTask = await adminClient.request<{ id?: string; title?: string }>("/api/tasks", {
    method: "POST",
    body: JSON.stringify({
      beneficiaryId,
      lawyerId: lawyerMe.id,
      caseId: null,
      title: taskTitle,
      description: "Smoke stage4 task",
      taskType: "follow_up",
      priority: "medium",
      status: "pending",
      dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    }),
  });

  if (!createdTask?.id) throw new Error("Task create did not return id");

  // Beneficiary sees task in /my
  const myTasks = await benClient.request<unknown>("/api/tasks/my", { method: "GET" });
  const found = (Array.isArray(myTasks) ? myTasks : []).find((t) => isRecord(t) && t.id === createdTask.id);
  if (!found) throw new Error("Beneficiary cannot see created task in /api/tasks/my");

  // Notifications should exist for beneficiary (task assigned)
  const benUnreadBefore = await benClient.request<unknown>("/api/notifications/unread", { method: "GET" });
  if (!Array.isArray(benUnreadBefore) || benUnreadBefore.length < 1) {
    throw new Error("Expected beneficiary to have at least 1 unread notification");
  }

  // Attach INTERNAL doc (admin) -> beneficiary should not see it
  await adminClient.request(`/api/tasks/${createdTask.id}/attachments`, {
    method: "POST",
    body: JSON.stringify({ isPublic: false, documents: [fakeMeta("internal.pdf")] }),
  });

  const benAttachmentsAfterInternal = await benClient.request<unknown>(`/api/tasks/${createdTask.id}/attachments`, {
    method: "GET",
  });
  const benNamesInternal = new Set(
    (Array.isArray(benAttachmentsAfterInternal) ? benAttachmentsAfterInternal : []).map((d) =>
      isRecord(d) ? String(d.fileName) : "",
    ),
  );
  if (benNamesInternal.has("internal.pdf")) {
    throw new Error("Beneficiary should not see internal task attachment");
  }

  // Attach PUBLIC doc (admin) -> beneficiary should see it
  await adminClient.request(`/api/tasks/${createdTask.id}/attachments`, {
    method: "POST",
    body: JSON.stringify({ isPublic: true, documents: [fakeMeta("public.pdf")] }),
  });

  const benAttachmentsAfterPublic = await benClient.request<unknown>(`/api/tasks/${createdTask.id}/attachments`, {
    method: "GET",
  });
  const benNamesPublic = new Set(
    (Array.isArray(benAttachmentsAfterPublic) ? benAttachmentsAfterPublic : []).map((d) =>
      isRecord(d) ? String(d.fileName) : "",
    ),
  );
  if (!benNamesPublic.has("public.pdf")) {
    throw new Error("Beneficiary should see public task attachment");
  }

  // Lawyer updates status (status-only patch)
  const updated = await lawyerClient.request<{ status?: string }>(`/api/tasks/${createdTask.id}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "completed" }),
  });
  if (updated?.status !== "completed") throw new Error("Lawyer status update failed");

  // Beneficiary sees completed
  const myTasksAfter = await benClient.request<unknown>("/api/tasks/my", { method: "GET" });
  const after = (Array.isArray(myTasksAfter) ? myTasksAfter : []).find((t) => isRecord(t) && t.id === createdTask.id);
  if (!after || !isRecord(after) || after.status !== "completed") {
    throw new Error("Beneficiary did not see task status update");
  }

  // Beneficiary has more notifications after attachments/status changes
  const benUnreadAfter = await benClient.request<unknown>("/api/notifications/unread", { method: "GET" });
  if (!Array.isArray(benUnreadAfter) || benUnreadAfter.length < 2) {
    throw new Error("Expected beneficiary to receive notifications for task events");
  }

  console.log("OK stage4 tasks", {
    baseUrl,
    beneficiaryId,
    beneficiaryUserId,
    lawyerId: lawyerMe.id,
    taskId: createdTask.id,
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run().catch(console.error);
}
