import { Client } from "pg";

type HttpResult = {
  status: number;
  url: string;
  method: string;
  text: string;
  json: any | null;
  setCookie: string | null;
};

type TestRow = {
  name: string;
  method: string;
  url: string;
  expected: number | number[];
  actual: number;
  pass: boolean;
  bodySnippet?: string;
};

const PREFIX = "smoke_stage6_";

class CookieJar {
  private cookieHeader: string | null = null;

  updateFromSetCookie(setCookie: string | null) {
    if (!setCookie) return;
    const sidMatch = setCookie.match(/connect\.sid=[^;]+/);
    if (sidMatch) this.cookieHeader = sidMatch[0];
  }

  header(): string | undefined {
    return this.cookieHeader ?? undefined;
  }
}

function toSnippet(value: any): string {
  if (value == null) return "";
  const s = typeof value === "string" ? value : JSON.stringify(value);
  const oneLine = s.replace(/\s+/g, " ").trim();
  return oneLine.length > 240 ? `${oneLine.slice(0, 240)}…` : oneLine;
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
  if (cookie) headers.cookie = cookie;

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

  return { status: res.status, url, method, text, json, setCookie };
}

function expectStatus(row: TestRow, actual: number) {
  const expectedList = Array.isArray(row.expected) ? row.expected : [row.expected];
  row.actual = actual;
  row.pass = expectedList.includes(actual);
}

function printReport(rows: TestRow[]) {
  const passed = rows.filter((r) => r.pass).length;
  const failed = rows.length - passed;

  console.log("\n=== Stage 6 Report ===");
  console.log(`Total: ${rows.length} | PASS: ${passed} | FAIL: ${failed}`);

  for (const r of rows) {
    const expected = Array.isArray(r.expected) ? r.expected.join("|") : String(r.expected);
    console.log(
      `${r.pass ? "PASS" : "FAIL"}  ${r.name}  ${r.method} ${r.url}  expected=${expected} actual=${r.actual}` +
        (r.bodySnippet ? `  body=${r.bodySnippet}` : ""),
    );
  }
}

function fixtures() {
  const pdf = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n", "utf8");
  const pngBase64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMB/6Xb3n0AAAAASUVORK5CYII=";
  const png = Buffer.from(pngBase64, "base64");
  return { pdf, png };
}

async function ensureAdminSession(baseUrl: string, jar: CookieJar, stamp: number) {
  // Use a deterministic admin in case the DB is clean.
  const username = `${PREFIX}admin_${stamp}`;
  const password = "admin123";

  // Try login
  const login = await http(baseUrl, "POST", "/api/auth/login", {
    jar,
    json: { username, password },
  });
  if (login.status === 200) return { username, password };

  // Register, then login
  const register = await http(baseUrl, "POST", "/api/auth/register", {
    json: {
      username,
      email: `${username}@example.com`,
      password,
      fullName: "Smoke Stage6 Admin",
      role: "admin",
      userType: "staff",
    },
  });

  if (![200, 201, 409].includes(register.status)) {
    throw new Error(`Admin register failed: ${register.status} ${toSnippet(register.json ?? register.text)}`);
  }

  const login2 = await http(baseUrl, "POST", "/api/auth/login", {
    jar,
    json: { username, password },
  });

  if (login2.status !== 200) {
    throw new Error(`Admin login failed: ${login2.status} ${toSnippet(login2.json ?? login2.text)}`);
  }

  return { username, password };
}

async function registerBeneficiary(baseUrl: string, jar: CookieJar, stamp: number, label: "b1" | "b2") {
  const email = `${PREFIX}${label}_${stamp}@example.com`;

  const res = await http(baseUrl, "POST", "/api/auth/register-beneficiary", {
    jar,
    json: {
      fullName: `${PREFIX}${label}`,
      email,
      password: "StrongPassw0rd!",
      confirmPassword: "StrongPassw0rd!",
      phone: "+966500000000",
      city: "Riyadh",
      preferredLanguage: "ar",
      serviceType: "legal_consultation",
      details: "smoke",
    },
  });

  if (res.status !== 201) {
    throw new Error(`Beneficiary register failed (${label}): ${res.status} ${toSnippet(res.json ?? res.text)}`);
  }

  return {
    email,
    userId: res.json?.user?.id as string,
    beneficiaryId: res.json?.beneficiary?.id as string,
  };
}

async function cleanupViaDb(databaseUrl: string) {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    // Select user IDs created by this smoke.
    const users = await client.query(
      `select id from users where email like $1 or username like $1`,
      [`${PREFIX}%`],
    );
    const userIds: string[] = users.rows.map((r) => r.id);

    // Beneficiaries created by this smoke: either linked to our users, or idNumber prefix.
    const beneficiaries = await client.query(
      `select id from beneficiaries where (user_id = any($1::varchar[])) or (id_number like $2)`,
      [userIds, `${PREFIX}%`],
    );
    const beneficiaryIds: string[] = beneficiaries.rows.map((r) => r.id);

    // Cases created by this smoke.
    const cases = await client.query(
      `select id from cases where case_number like $1 or beneficiary_id = any($2::varchar[])`,
      [`${PREFIX}%`, beneficiaryIds],
    );
    const caseIds: string[] = cases.rows.map((r) => r.id);

    // Documents created by this smoke.
    await client.query(
      `delete from documents where file_name like $1 or title like $1 or beneficiary_id = any($2::varchar[]) or case_id = any($3::varchar[])`,
      [`${PREFIX}%`, beneficiaryIds, caseIds],
    );

    // Service requests / intake requests that might have been created during registration.
    await client.query(`delete from service_requests where beneficiary_id = any($1::varchar[])`, [beneficiaryIds]);
    await client.query(`delete from intake_requests where beneficiary_id = any($1::varchar[])`, [beneficiaryIds]);

    // Cases.
    await client.query(`delete from cases where id = any($1::varchar[])`, [caseIds]);

    // Beneficiaries.
    await client.query(`delete from beneficiaries where id = any($1::varchar[])`, [beneficiaryIds]);

    // User rules (if present).
    await client.query(`delete from user_rules where user_id = any($1::varchar[])`, [userIds]).catch(() => {});

    // Audit log rows reference users via FK.
    await client.query(`delete from audit_log where user_id = any($1::varchar[])`, [userIds]).catch(() => {});

    // Users.
    await client.query(`delete from users where id = any($1::varchar[])`, [userIds]);

    console.log(
      `Cleanup(DB) done: users=${userIds.length} beneficiaries=${beneficiaryIds.length} cases=${caseIds.length}`,
    );
  } finally {
    await client.end();
  }
}

async function main() {
  const baseUrl = (process.env.BASE_URL || "http://localhost:5001").replace(/\/$/, "");
  const databaseUrl = process.env.DATABASE_URL;
  const cleanup = process.env.CLEANUP === "1";

  console.log(`BASE_URL=${baseUrl}`);
  if (cleanup) {
    if (!databaseUrl) {
      throw new Error("CLEANUP=1 requires DATABASE_URL");
    }
    console.log("CLEANUP=1 (will remove smoke_stage6_ data)");
  }

  const stamp = Date.now();
  const adminJar = new CookieJar();
  const b1Jar = new CookieJar();
  const b2Jar = new CookieJar();

  const tests: TestRow[] = [];

  // ---- Identify actual endpoints (do not assume /api/settings) ----
  const settingsPath = "/api/system-settings"; // actual in this repo
  const beneficiaryCasesPath = "/api/cases/my"; // actual in this repo
  const staffCasesPath = "/api/cases";
  const documentsMyPath = "/api/documents/my";
  const uploadsPath = "/api/uploads";

  let adminCreds: { username: string; password: string } | null = null;
  let b1: { email: string; userId: string; beneficiaryId: string } | null = null;
  let b2: { email: string; userId: string; beneficiaryId: string } | null = null;
  let case1Id = "";
  let case2Id = "";

  try {
    // ---- Admin login/register ----
    adminCreds = await ensureAdminSession(baseUrl, adminJar, stamp);

    // ---- Register beneficiaries (B1/B2) ----
    const b1Res = await registerBeneficiary(baseUrl, b1Jar, stamp, "b1");
    b1 = b1Res;
    tests.push({
      name: "6-A1 beneficiary register (B1)",
      method: "POST",
      url: `${baseUrl}/api/auth/register-beneficiary`,
      expected: 201,
      actual: 201,
      pass: true,
    });

    const b2Res = await registerBeneficiary(baseUrl, b2Jar, stamp, "b2");
    b2 = b2Res;

    // ---- 6-A Forbidden: beneficiary cannot read system settings ----
    const b1Settings = await http(baseUrl, "GET", settingsPath, { jar: b1Jar });
    const rowA2: TestRow = {
      name: "6-A2 beneficiary forbidden settings",
      method: "GET",
      url: `${baseUrl}${settingsPath}`,
      expected: [401, 403],
      actual: b1Settings.status,
      pass: false,
      bodySnippet: toSnippet(b1Settings.json ?? b1Settings.text),
    };
    expectStatus(rowA2, b1Settings.status);
    if (rowA2.pass && rowA2.bodySnippet?.includes("[object Object]")) {
      rowA2.pass = false;
    }
    tests.push(rowA2);

    const adminSettings = await http(baseUrl, "GET", settingsPath, { jar: adminJar });
    const rowA3: TestRow = {
      name: "6-A3 admin can read settings",
      method: "GET",
      url: `${baseUrl}${settingsPath}`,
      expected: 200,
      actual: adminSettings.status,
      pass: false,
      bodySnippet: toSnippet(adminSettings.json ?? adminSettings.text),
    };
    expectStatus(rowA3, adminSettings.status);
    tests.push(rowA3);

    // ---- 6-B: create 2 cases as staff, tied to portal B1/B2 beneficiaries ----
    const case1 = await http(baseUrl, "POST", staffCasesPath, {
      jar: adminJar,
      json: {
        caseNumber: `${PREFIX}CASE_${stamp}_1`,
        title: `${PREFIX}Case1`,
        beneficiaryId: b1.beneficiaryId,
        caseType: "civil",
        description: "smoke stage6 case1",
      },
    });
    if (case1.status !== 200) {
      throw new Error(`Create case1 failed: ${case1.status} ${toSnippet(case1.json ?? case1.text)}`);
    }
    case1Id = case1.json?.id as string;

    const case2 = await http(baseUrl, "POST", staffCasesPath, {
      jar: adminJar,
      json: {
        caseNumber: `${PREFIX}CASE_${stamp}_2`,
        title: `${PREFIX}Case2`,
        beneficiaryId: b2.beneficiaryId,
        caseType: "civil",
        description: "smoke stage6 case2",
      },
    });
    if (case2.status !== 200) {
      throw new Error(`Create case2 failed: ${case2.status} ${toSnippet(case2.json ?? case2.text)}`);
    }
    case2Id = case2.json?.id as string;

    // B1 list own cases
    const b1Cases = await http(baseUrl, "GET", beneficiaryCasesPath, { jar: b1Jar });
    const rowB2: TestRow = {
      name: "6-B2 beneficiary sees only own cases",
      method: "GET",
      url: `${baseUrl}${beneficiaryCasesPath}`,
      expected: 200,
      actual: b1Cases.status,
      pass: false,
      bodySnippet: toSnippet(b1Cases.json ?? b1Cases.text),
    };
    expectStatus(rowB2, b1Cases.status);
    if (rowB2.pass) {
      const ids: string[] = Array.isArray(b1Cases.json) ? b1Cases.json.map((c: any) => c.id) : [];
      rowB2.pass = ids.includes(case1Id) && !ids.includes(case2Id);
      rowB2.bodySnippet = `ids=${ids.join(",")}`;
    }
    tests.push(rowB2);

    // B1 tries to access case2 (staff-only endpoint exists: should be forbidden)
    const b1OtherCase = await http(baseUrl, "GET", `/api/cases/${case2Id}`, { jar: b1Jar });
    const rowB3: TestRow = {
      name: "6-B3 beneficiary blocked from other case details",
      method: "GET",
      url: `${baseUrl}/api/cases/${case2Id}`,
      expected: [401, 403],
      actual: b1OtherCase.status,
      pass: false,
      bodySnippet: toSnippet(b1OtherCase.json ?? b1OtherCase.text),
    };
    expectStatus(rowB3, b1OtherCase.status);
    tests.push(rowB3);

    // Admin lists all cases (should include both)
    const adminCases = await http(baseUrl, "GET", staffCasesPath, { jar: adminJar });
    const rowB4: TestRow = {
      name: "6-B4 admin sees both cases",
      method: "GET",
      url: `${baseUrl}${staffCasesPath}`,
      expected: 200,
      actual: adminCases.status,
      pass: false,
      bodySnippet: toSnippet(adminCases.json ?? adminCases.text),
    };
    expectStatus(rowB4, adminCases.status);
    if (rowB4.pass) {
      const ids: string[] = Array.isArray(adminCases.json) ? adminCases.json.map((c: any) => c.id) : [];
      rowB4.pass = ids.includes(case1Id) && ids.includes(case2Id);
      rowB4.bodySnippet = `contains_case1=${ids.includes(case1Id)} contains_case2=${ids.includes(case2Id)}`;
    }
    tests.push(rowB4);

    // ---- 6-C: upload pdf+png via the repo's actual upload endpoint (/api/uploads) ----
    const { pdf, png } = fixtures();

    const pdfUp = await http(baseUrl, "POST", uploadsPath, {
      headers: {
        "content-type": "application/pdf",
        "x-file-name": `${PREFIX}sample.pdf`,
      },
      body: pdf,
    });
    if (pdfUp.status !== 201) {
      throw new Error(`PDF upload failed: ${pdfUp.status} ${toSnippet(pdfUp.json ?? pdfUp.text)}`);
    }

    const pngUp = await http(baseUrl, "POST", uploadsPath, {
      headers: {
        "content-type": "image/png",
        "x-file-name": `${PREFIX}sample.png`,
      },
      body: png,
    });
    if (pngUp.status !== 201) {
      throw new Error(`PNG upload failed: ${pngUp.status} ${toSnippet(pngUp.json ?? pngUp.text)}`);
    }

    const attachPath = `/api/cases/${case1Id}/documents`;

    const attachPublic = await http(baseUrl, "POST", attachPath, {
      jar: adminJar,
      json: { isPublic: true, documents: [pdfUp.json] },
    });
    const rowC3a: TestRow = {
      name: "6-C3 attach public document to Case1 (admin)",
      method: "POST",
      url: `${baseUrl}${attachPath}`,
      expected: 201,
      actual: attachPublic.status,
      pass: false,
      bodySnippet: toSnippet(attachPublic.json ?? attachPublic.text),
    };
    expectStatus(rowC3a, attachPublic.status);
    tests.push(rowC3a);

    const attachInternal = await http(baseUrl, "POST", attachPath, {
      jar: adminJar,
      json: { isPublic: false, documents: [pngUp.json] },
    });
    const rowC3b: TestRow = {
      name: "6-C3 attach internal document to Case1 (admin)",
      method: "POST",
      url: `${baseUrl}${attachPath}`,
      expected: 201,
      actual: attachInternal.status,
      pass: false,
      bodySnippet: toSnippet(attachInternal.json ?? attachInternal.text),
    };
    expectStatus(rowC3b, attachInternal.status);
    tests.push(rowC3b);

    // Admin list case documents
    const adminDocs = await http(baseUrl, "GET", `/api/cases/${case1Id}/documents`, { jar: adminJar });
    const rowC4: TestRow = {
      name: "6-C4 admin lists case documents (expects pdf+png)",
      method: "GET",
      url: `${baseUrl}/api/cases/${case1Id}/documents`,
      expected: 200,
      actual: adminDocs.status,
      pass: false,
      bodySnippet: toSnippet(adminDocs.json ?? adminDocs.text),
    };
    expectStatus(rowC4, adminDocs.status);
    if (rowC4.pass) {
      const files: string[] = Array.isArray(adminDocs.json) ? adminDocs.json.map((d: any) => d.fileName) : [];
      rowC4.pass = files.includes(`${PREFIX}sample.pdf`) && files.includes(`${PREFIX}sample.png`);
      rowC4.bodySnippet = `files=${files.join(",")}`;
    }
    tests.push(rowC4);

    // Beneficiary B1 lists own case documents (public only)
    const b1Docs = await http(baseUrl, "GET", `/api/cases/my/${case1Id}/documents`, { jar: b1Jar });
    const rowC5: TestRow = {
      name: "6-C5 beneficiary sees only public docs",
      method: "GET",
      url: `${baseUrl}/api/cases/my/${case1Id}/documents`,
      expected: 200,
      actual: b1Docs.status,
      pass: false,
      bodySnippet: toSnippet(b1Docs.json ?? b1Docs.text),
    };
    expectStatus(rowC5, b1Docs.status);
    if (rowC5.pass) {
      const files: string[] = Array.isArray(b1Docs.json) ? b1Docs.json.map((d: any) => d.fileName) : [];
      rowC5.pass = files.includes(`${PREFIX}sample.pdf`) && !files.includes(`${PREFIX}sample.png`);
      rowC5.bodySnippet = `files=${files.join(",")}`;
    }
    tests.push(rowC5);

    // Beneficiary B2 cannot access B1 case docs
    const b2Docs = await http(baseUrl, "GET", `/api/cases/my/${case1Id}/documents`, { jar: b2Jar });
    const rowC6: TestRow = {
      name: "6-C6 other beneficiary blocked from case docs",
      method: "GET",
      url: `${baseUrl}/api/cases/my/${case1Id}/documents`,
      expected: [401, 403],
      actual: b2Docs.status,
      pass: false,
      bodySnippet: toSnippet(b2Docs.json ?? b2Docs.text),
    };
    expectStatus(rowC6, b2Docs.status);
    tests.push(rowC6);

    // Beneficiary /api/documents/my should show only visible docs (no internal)
    const b1MyDocs = await http(baseUrl, "GET", documentsMyPath, { jar: b1Jar });
    const rowC7: TestRow = {
      name: "6-C7 beneficiary /documents/my no internal leak",
      method: "GET",
      url: `${baseUrl}${documentsMyPath}`,
      expected: 200,
      actual: b1MyDocs.status,
      pass: false,
      bodySnippet: toSnippet(b1MyDocs.json ?? b1MyDocs.text),
    };
    expectStatus(rowC7, b1MyDocs.status);
    if (rowC7.pass) {
      const files: string[] = Array.isArray(b1MyDocs.json) ? b1MyDocs.json.map((d: any) => d.fileName) : [];
      rowC7.pass = files.includes(`${PREFIX}sample.pdf`) && !files.includes(`${PREFIX}sample.png`);
      rowC7.bodySnippet = `files=${files.join(",")}`;
    }
    tests.push(rowC7);

    // Final report
    printReport(tests);

    const failed = tests.filter((t) => !t.pass);
    if (failed.length) {
      if (cleanup && databaseUrl) {
        await cleanupViaDb(databaseUrl);
      }
      process.exit(1);
    }

    if (cleanup && databaseUrl) {
      // Prefer API cleanup where available.
      // Delete cases via staff API.
      await http(baseUrl, "DELETE", `/api/cases/${case1Id}`, { jar: adminJar }).catch(() => {});
      await http(baseUrl, "DELETE", `/api/cases/${case2Id}`, { jar: adminJar }).catch(() => {});

      // Delete beneficiaries via staff API is only possible if we know their IDs (we do).
      await http(baseUrl, "DELETE", `/api/beneficiaries/${b1.beneficiaryId}`, { jar: adminJar }).catch(() => {});
      await http(baseUrl, "DELETE", `/api/beneficiaries/${b2.beneficiaryId}`, { jar: adminJar }).catch(() => {});

      // No delete endpoints for documents/users in this repo → DB fallback for the remaining.
      await cleanupViaDb(databaseUrl);
    }

    process.exit(0);
  } catch (err) {
    // Print whatever we have and exit non-zero.
    printReport(tests);
    console.error(err);
    if (cleanup && databaseUrl) {
      await cleanupViaDb(databaseUrl);
    }
    process.exit(1);
  }
}

main();
