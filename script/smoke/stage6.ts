import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

type HttpResult = {
  ok: boolean;
  status: number;
  url: string;
  method: string;
  responseText: string;
  json: any | null;
  setCookie: string | null;
};

type TestRow = {
  name: string;
  method: string;
  path: string;
  expected: number | number[];
  actual: number;
  pass: boolean;
  note?: string;
};

class CookieJar {
  private cookieHeader: string | null = null;

  updateFromSetCookie(setCookie: string | null) {
    if (!setCookie) return;
    // We only need connect.sid for this app.
    const sidMatch = setCookie.match(/connect\.sid=[^;]+/);
    if (sidMatch) {
      this.cookieHeader = sidMatch[0];
    }
  }

  header(): string | undefined {
    return this.cookieHeader ?? undefined;
  }
}

async function readResponse(res: Response): Promise<{ text: string; json: any | null }> {
  const text = await res.text();
  try {
    return { text, json: text ? JSON.parse(text) : null };
  } catch {
    return { text, json: null };
  }
}

async function http(
  baseUrl: string,
  method: string,
  path: string,
  opts: {
    jar?: CookieJar;
    json?: any;
    headers?: Record<string, string>;
    body?: Uint8Array;
  } = {},
): Promise<HttpResult> {
  const url = `${baseUrl}${path}`;

  const headers: Record<string, string> = {
    ...(opts.headers ?? {}),
  };

  const cookie = opts.jar?.header();
  if (cookie) headers["cookie"] = cookie;

  let body: any = undefined;
  if (opts.json !== undefined) {
    headers["content-type"] = "application/json";
    body = JSON.stringify(opts.json);
  } else if (opts.body) {
    body = opts.body;
  }

  const res = await fetch(url, { method, headers, body });
  const setCookie = res.headers.get("set-cookie");
  const { text, json } = await readResponse(res);
  opts.jar?.updateFromSetCookie(setCookie);

  return {
    ok: res.ok,
    status: res.status,
    url,
    method,
    responseText: text,
    json,
    setCookie,
  };
}

function assertStatus(row: TestRow, actualStatus: number) {
  const expectedList = Array.isArray(row.expected) ? row.expected : [row.expected];
  row.actual = actualStatus;
  row.pass = expectedList.includes(actualStatus);
}

async function ensureFixtures(fixturesDir: string) {
  await mkdir(fixturesDir, { recursive: true });

  const pdfPath = join(fixturesDir, "sample.pdf");
  const pngPath = join(fixturesDir, "sample.png");

  // Tiny dummy PDF bytes (not a full PDF, but enough for upload storage).
  const pdf = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n", "utf8");

  // 1x1 transparent PNG (base64).
  const pngBase64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMB/6Xb3n0AAAAASUVORK5CYII=";
  const png = Buffer.from(pngBase64, "base64");

  await writeFile(pdfPath, pdf);
  await writeFile(pngPath, png);

  return { pdfPath, pngPath, pdf, png };
}

async function startServer(env: Record<string, string>) {
  const child = spawn("npx", ["tsx", "server/index.ts"], {
    cwd: process.cwd(),
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stdout = "";
  let stderr = "";

  child.stdout.on("data", (d) => {
    stdout += String(d);
  });
  child.stderr.on("data", (d) => {
    stderr += String(d);
  });

  const ready = await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Server did not start in time.\nstdout:\n${stdout}\nstderr:\n${stderr}`));
    }, 20000);

    const check = () => {
      if (stdout.includes("serving on port")) {
        clearTimeout(timeout);
        resolve();
      }
    };

    const interval = setInterval(check, 100);
    child.on("exit", (code) => {
      clearInterval(interval);
      clearTimeout(timeout);
      reject(new Error(`Server exited early with code ${code}.\nstdout:\n${stdout}\nstderr:\n${stderr}`));
    });
  });

  return {
    child,
    ready,
    getLogs: () => ({ stdout, stderr }),
  };
}

async function main() {
  const DATABASE_URL = process.env.DATABASE_URL;
  if (!DATABASE_URL) {
    console.error("Missing DATABASE_URL");
    process.exit(2);
  }

  // Avoid inheriting PORT from the parent shell (dev servers often set it).
  // Use SMOKE_PORT if provided, otherwise a stable default.
  // Note: Node's fetch (undici) follows the Fetch spec and blocks some "bad ports"
  // (e.g. 5060/5061 used by SIP). Use a safe default.
  const portRaw = process.env.SMOKE_PORT || "5057";
  const port = Number(portRaw);
  if (!Number.isFinite(port) || port <= 0 || port > 65535) {
    throw new Error(`Invalid SMOKE_PORT='${portRaw}' parsed as ${port}`);
  }

  const baseUrl = `http://localhost:${port}`;
  console.log(`Stage6 smoke starting against ${baseUrl}`);

  const results: TestRow[] = [];

  const fixturesDir = join(process.cwd(), "tests", "fixtures");
  await mkdir(dirname(fixturesDir), { recursive: true });
  const { pdf, png } = await ensureFixtures(fixturesDir);

  const { child, getLogs } = await startServer({ PORT: String(port), DATABASE_URL, NODE_ENV: "development" });

  const adminJar = new CookieJar();
  const b1Jar = new CookieJar();
  const b2Jar = new CookieJar();

  try {
    // --- Admin setup/login ---
    // Try login; if fails, register then login.
    const loginRes = await http(baseUrl, "POST", "/api/auth/login", {
      jar: adminJar,
      json: { username: "admin", password: "admin123" },
    });

    if (loginRes.status !== 200) {
      const reg = await http(baseUrl, "POST", "/api/auth/register", {
        json: {
          username: "admin",
          email: "admin@local.test",
          password: "admin123",
          fullName: "Admin",
          role: "admin",
          userType: "staff",
        },
      });

      if (reg.status !== 200 && reg.status !== 201 && reg.status !== 409) {
        throw new Error(`Admin register failed: ${reg.status} ${reg.responseText}`);
      }

      const login2 = await http(baseUrl, "POST", "/api/auth/login", {
        jar: adminJar,
        json: { username: "admin", password: "admin123" },
      });
      if (login2.status !== 200) {
        throw new Error(`Admin login failed: ${login2.status} ${login2.responseText}`);
      }
    }

    // --- Stage 6-A: Forbidden on /api/system-settings for beneficiary ---
    // Create beneficiary via public registration and keep cookie.
    const stamp = Date.now();
    const b1Email = `b1_${stamp}@example.com`;
    const b1Register = await http(baseUrl, "POST", "/api/auth/register-beneficiary", {
      jar: b1Jar,
      json: {
        fullName: "B1",
        email: b1Email,
        password: "StrongPassw0rd!",
        confirmPassword: "StrongPassw0rd!",
        phone: "+966500000111",
        city: "Riyadh",
        preferredLanguage: "ar",
        serviceType: "legal_consultation",
        details: "Stage6",
      },
    });

    results.push({
      name: "6-A1 beneficiary register",
      method: "POST",
      path: "/api/auth/register-beneficiary",
      expected: 201,
      actual: b1Register.status,
      pass: b1Register.status === 201,
    });

    const b1UserId = b1Register.json?.user?.id as string | undefined;
    const b1BeneficiaryId = b1Register.json?.beneficiary?.id as string | undefined;
    if (!b1UserId || !b1BeneficiaryId) {
      throw new Error(`Beneficiary register missing ids: ${b1Register.responseText}`);
    }

    const b1Settings = await http(baseUrl, "GET", "/api/system-settings", { jar: b1Jar });
    const rowA2: TestRow = {
      name: "6-A2 beneficiary forbidden system-settings",
      method: "GET",
      path: "/api/system-settings",
      expected: [401, 403],
      actual: b1Settings.status,
      pass: false,
      note: typeof b1Settings.json?.error === "string" ? b1Settings.json.error : b1Settings.responseText,
    };
    assertStatus(rowA2, b1Settings.status);
    results.push(rowA2);

    if (rowA2.pass) {
      const msg = rowA2.note ?? "";
      if (msg.includes("[object Object]")) {
        rowA2.pass = false;
        rowA2.note = `Bad message: ${msg}`;
      }
    }

    const adminSettings = await http(baseUrl, "GET", "/api/system-settings", { jar: adminJar });
    const rowA3: TestRow = {
      name: "6-A3 admin can read system-settings",
      method: "GET",
      path: "/api/system-settings",
      expected: 200,
      actual: adminSettings.status,
      pass: false,
    };
    assertStatus(rowA3, adminSettings.status);
    results.push(rowA3);

    // --- Stage 6-B: beneficiary sees only own cases ---
    // Create two beneficiaries (staff API) + two cases.
    const b1Staff = await http(baseUrl, "POST", "/api/beneficiaries", {
      jar: adminJar,
      json: {
        fullName: `B1 Staff ${stamp}`,
        idNumber: `B1-${stamp}`,
        phone: "+966500000112",
        email: `b1_staff_${stamp}@example.com`,
        city: "Riyadh",
      },
    });
    if (b1Staff.status !== 200) {
      throw new Error(`Admin create beneficiary B1 failed: ${b1Staff.status} ${b1Staff.responseText}`);
    }

    const b2Staff = await http(baseUrl, "POST", "/api/beneficiaries", {
      jar: adminJar,
      json: {
        fullName: `B2 Staff ${stamp}`,
        idNumber: `B2-${stamp}`,
        phone: "+966500000113",
        email: `b2_staff_${stamp}@example.com`,
        city: "Riyadh",
      },
    });
    if (b2Staff.status !== 200) {
      throw new Error(`Admin create beneficiary B2 failed: ${b2Staff.status} ${b2Staff.responseText}`);
    }

    const b1Id = b1Staff.json?.id as string;
    const b2Id = b2Staff.json?.id as string;

    const case1 = await http(baseUrl, "POST", "/api/cases", {
      jar: adminJar,
      json: {
        caseNumber: `CASE-${stamp}-1`,
        title: `Case1 ${stamp}`,
        beneficiaryId: b1Id,
        caseType: "civil",
        description: "Case 1",
      },
    });
    if (case1.status !== 200) {
      throw new Error(`Admin create case1 failed: ${case1.status} ${case1.responseText}`);
    }

    const case2 = await http(baseUrl, "POST", "/api/cases", {
      jar: adminJar,
      json: {
        caseNumber: `CASE-${stamp}-2`,
        title: `Case2 ${stamp}`,
        beneficiaryId: b2Id,
        caseType: "civil",
        description: "Case 2",
      },
    });
    if (case2.status !== 200) {
      throw new Error(`Admin create case2 failed: ${case2.status} ${case2.responseText}`);
    }

    const case1Id = case1.json?.id as string;
    const case2Id = case2.json?.id as string;

    // Login as B1 beneficiary user (created via public reg above), verify /api/cases/my is empty (since those cases belong to staff-created B1, not portal B1)
    // To satisfy the requirement, we need B1 beneficiary user tied to B1 staff beneficiary id.
    // We'll attach the portal user's beneficiary to case1 by creating case1b using portal B1 beneficiaryId.
    const case1b = await http(baseUrl, "POST", "/api/cases", {
      jar: adminJar,
      json: {
        caseNumber: `CASE-${stamp}-B1P`,
        title: `Case1 PortalB1 ${stamp}`,
        beneficiaryId: b1BeneficiaryId,
        caseType: "civil",
        description: "Case 1 for portal beneficiary",
      },
    });
    if (case1b.status !== 200) {
      throw new Error(`Admin create case1b failed: ${case1b.status} ${case1b.responseText}`);
    }
    const case1PortalId = case1b.json?.id as string;

    // Create B2 portal beneficiary and a case for them.
    const b2Email = `b2_${stamp}@example.com`;
    const b2Register = await http(baseUrl, "POST", "/api/auth/register-beneficiary", {
      jar: b2Jar,
      json: {
        fullName: "B2",
        email: b2Email,
        password: "StrongPassw0rd!",
        confirmPassword: "StrongPassw0rd!",
        phone: "+966500000222",
        city: "Riyadh",
        preferredLanguage: "ar",
        serviceType: "legal_consultation",
        details: "Stage6",
      },
    });
    if (b2Register.status !== 201) {
      throw new Error(`Portal B2 register failed: ${b2Register.status} ${b2Register.responseText}`);
    }
    const b2BeneficiaryPortalId = b2Register.json?.beneficiary?.id as string;

    const case2b = await http(baseUrl, "POST", "/api/cases", {
      jar: adminJar,
      json: {
        caseNumber: `CASE-${stamp}-B2P`,
        title: `Case2 PortalB2 ${stamp}`,
        beneficiaryId: b2BeneficiaryPortalId,
        caseType: "civil",
        description: "Case 2 for portal beneficiary",
      },
    });
    if (case2b.status !== 200) {
      throw new Error(`Admin create case2b failed: ${case2b.status} ${case2b.responseText}`);
    }
    const case2PortalId = case2b.json?.id as string;

    const b1MyCases = await http(baseUrl, "GET", "/api/cases/my", { jar: b1Jar });
    const rowB2: TestRow = {
      name: "6-B2 beneficiary sees only own cases",
      method: "GET",
      path: "/api/cases/my",
      expected: 200,
      actual: b1MyCases.status,
      pass: false,
    };
    assertStatus(rowB2, b1MyCases.status);
    if (rowB2.pass) {
      const ids: string[] = Array.isArray(b1MyCases.json) ? b1MyCases.json.map((c: any) => c.id) : [];
      rowB2.pass = ids.includes(case1PortalId) && !ids.includes(case2PortalId);
      rowB2.note = `ids=${ids.join(",")}`;
    }
    results.push(rowB2);

    const b1GetOtherCase = await http(baseUrl, "GET", `/api/cases/${case2PortalId}`, { jar: b1Jar });
    const rowB3: TestRow = {
      name: "6-B3 beneficiary cannot access other case details",
      method: "GET",
      path: `/api/cases/${case2PortalId}`,
      expected: [401, 403],
      actual: b1GetOtherCase.status,
      pass: false,
    };
    assertStatus(rowB3, b1GetOtherCase.status);
    results.push(rowB3);

    const adminAllCases = await http(baseUrl, "GET", "/api/cases", { jar: adminJar });
    const rowB4: TestRow = {
      name: "6-B4 admin sees all cases",
      method: "GET",
      path: "/api/cases",
      expected: 200,
      actual: adminAllCases.status,
      pass: false,
    };
    assertStatus(rowB4, adminAllCases.status);
    if (rowB4.pass) {
      const ids: string[] = Array.isArray(adminAllCases.json) ? adminAllCases.json.map((c: any) => c.id) : [];
      rowB4.pass = ids.includes(case1PortalId) && ids.includes(case2PortalId);
      rowB4.note = `contains case1Portal=${ids.includes(case1PortalId)} case2Portal=${ids.includes(case2PortalId)}`;
    }
    results.push(rowB4);

    // --- Stage 6-C: Upload documents to Case1 and verify lists/visibility ---
    // Upload pdf + png via /api/uploads (raw).
    const pdfUp = await http(baseUrl, "POST", "/api/uploads", {
      headers: {
        "content-type": "application/pdf",
        "x-file-name": "sample.pdf",
      },
      body: pdf,
    });
    if (pdfUp.status !== 201) {
      throw new Error(`PDF upload failed: ${pdfUp.status} ${pdfUp.responseText}`);
    }

    const pngUp = await http(baseUrl, "POST", "/api/uploads", {
      headers: {
        "content-type": "image/png",
        "x-file-name": "sample.png",
      },
      body: png,
    });
    if (pngUp.status !== 201) {
      throw new Error(`PNG upload failed: ${pngUp.status} ${pngUp.responseText}`);
    }

    // Attach both docs to case (one public, one internal).
    const attachPublic = await http(baseUrl, "POST", `/api/cases/${case1PortalId}/documents`, {
      jar: adminJar,
      json: { isPublic: true, documents: [pdfUp.json] },
    });
    results.push({
      name: "6-C3 attach public doc to case (admin)",
      method: "POST",
      path: `/api/cases/${case1PortalId}/documents`,
      expected: 201,
      actual: attachPublic.status,
      pass: attachPublic.status === 201,
    });

    const attachInternal = await http(baseUrl, "POST", `/api/cases/${case1PortalId}/documents`, {
      jar: adminJar,
      json: { isPublic: false, documents: [pngUp.json] },
    });
    results.push({
      name: "6-C3 attach internal doc to case (admin)",
      method: "POST",
      path: `/api/cases/${case1PortalId}/documents`,
      expected: 201,
      actual: attachInternal.status,
      pass: attachInternal.status === 201,
    });

    // Admin list: should see both.
    const adminCaseDocs = await http(baseUrl, "GET", `/api/cases/${case1PortalId}/documents`, { jar: adminJar });
    const rowC4: TestRow = {
      name: "6-C4 admin lists case documents (2)",
      method: "GET",
      path: `/api/cases/${case1PortalId}/documents`,
      expected: 200,
      actual: adminCaseDocs.status,
      pass: false,
    };
    assertStatus(rowC4, adminCaseDocs.status);
    if (rowC4.pass) {
      const files: string[] = Array.isArray(adminCaseDocs.json) ? adminCaseDocs.json.map((d: any) => d.fileName) : [];
      rowC4.pass = files.includes("sample.pdf") && files.includes("sample.png");
      rowC4.note = `files=${files.join(",")}`;
    }
    results.push(rowC4);

    // Beneficiary B1 list: should see only public doc.
    const b1CaseDocs = await http(baseUrl, "GET", `/api/cases/my/${case1PortalId}/documents`, { jar: b1Jar });
    const rowC5: TestRow = {
      name: "6-C5 beneficiary sees only public docs",
      method: "GET",
      path: `/api/cases/my/${case1PortalId}/documents`,
      expected: 200,
      actual: b1CaseDocs.status,
      pass: false,
    };
    assertStatus(rowC5, b1CaseDocs.status);
    if (rowC5.pass) {
      const files: string[] = Array.isArray(b1CaseDocs.json) ? b1CaseDocs.json.map((d: any) => d.fileName) : [];
      rowC5.pass = files.includes("sample.pdf") && !files.includes("sample.png");
      rowC5.note = `files=${files.join(",")}`;
    }
    results.push(rowC5);

    // Beneficiary B2 cannot see B1 case docs.
    const b2CaseDocs = await http(baseUrl, "GET", `/api/cases/my/${case1PortalId}/documents`, { jar: b2Jar });
    const rowC6: TestRow = {
      name: "6-C6 other beneficiary cannot access case docs",
      method: "GET",
      path: `/api/cases/my/${case1PortalId}/documents`,
      expected: [401, 403],
      actual: b2CaseDocs.status,
      pass: false,
    };
    assertStatus(rowC6, b2CaseDocs.status);
    results.push(rowC6);

    // Also verify /api/documents/my is filtered (no internal docs leak).
    const b1MyDocs = await http(baseUrl, "GET", "/api/documents/my", { jar: b1Jar });
    const rowC7: TestRow = {
      name: "6-C7 beneficiary my documents has no internal leak",
      method: "GET",
      path: "/api/documents/my",
      expected: 200,
      actual: b1MyDocs.status,
      pass: false,
    };
    assertStatus(rowC7, b1MyDocs.status);
    if (rowC7.pass) {
      const files: string[] = Array.isArray(b1MyDocs.json) ? b1MyDocs.json.map((d: any) => d.fileName) : [];
      rowC7.pass = files.includes("sample.pdf") && !files.includes("sample.png");
      rowC7.note = `files=${files.join(",")}`;
    }
    results.push(rowC7);

    // Print final summary.
    console.log("\n=== Stage 6 Summary ===");
    for (const r of results) {
      const expected = Array.isArray(r.expected) ? r.expected.join("|") : String(r.expected);
      console.log(
        `${r.pass ? "PASS" : "FAIL"}  ${r.name}  ${r.method} ${r.path}  expected=${expected} actual=${r.actual}` +
          (r.note ? `  note=${r.note}` : ""),
      );
    }

    const failed = results.filter((r) => !r.pass);
    if (failed.length) {
      console.log("\n--- Server logs (tail) ---");
      const { stdout, stderr } = getLogs();
      console.log(stdout.split("\n").slice(-60).join("\n"));
      if (stderr.trim()) console.log(stderr.split("\n").slice(-60).join("\n"));
      process.exit(1);
    }

    process.exit(0);
  } finally {
    child.kill("SIGTERM");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
