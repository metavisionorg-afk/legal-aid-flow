import path from "path";
import { spawn } from "child_process";
import { chromium, type ConsoleMessage, type Response } from "playwright";

type SmokeReport = {
  baseUrl: string;
  caseCreated: boolean;
  createdCaseId?: string;
  reviewSummaryOk: boolean;
  documentUploadedOk: boolean;
  uiDocumentVisibleOk: boolean;
  consoleErrors: string[];
  pageErrors: string[];
  networkErrors: Array<{ method: string; url: string; status: number }>;
  devLogTail?: string[];
};

async function waitForServer(baseUrl: string, timeoutMs = 60_000) {
  const started = Date.now();
  const url = `${baseUrl}/api/auth/me`;

  // /api/auth/me should always return 200 (even when logged out).
  // For readiness, we only care that the server responds (not the auth state).
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(url, { method: "GET" });
      if (res.status >= 200 && res.status < 500) return;
    } catch {
      // ignore
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Server not ready within ${timeoutMs}ms: ${baseUrl}`);
}

function toIsoLocalDatetimeInput(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(
    date.getMinutes(),
  )}`;
}

async function selectRadixOptionByName(page: any, triggerTestId: string, optionName: string) {
  const trigger = page.getByTestId(triggerTestId);
  await trigger.click();

  const listbox = page.getByRole("listbox");
  await listbox.waitFor({ state: "visible", timeout: 10_000 });

  // Avoid Radix typeahead (it can schedule a focus() in a setTimeout that fires
  // after the listbox unmounts, causing a non-fatal `null.focus` page error).
  await page.keyboard.press("ArrowDown");

  const normalizedTarget = optionName.trim().toLowerCase();
  for (let i = 0; i < 25; i++) {
    const highlighted = page.locator('[role="option"][data-highlighted]').first();
    const highlightedCount = await highlighted.count();
    if (highlightedCount) {
      const text = String(await highlighted.innerText()).trim().toLowerCase();
      if (text === normalizedTarget || text.includes(normalizedTarget)) {
        await page.keyboard.press("Enter");
        return;
      }
    }
    await page.keyboard.press("ArrowDown");
  }

  throw new Error(`Failed to select option '${optionName}' for ${triggerTestId}`);
}

async function selectRadixFirstOption(page: any, triggerTestId: string) {
  const trigger = page.getByTestId(triggerTestId);
  await trigger.click();

  const listbox = page.getByRole("listbox");
  await listbox.waitFor({ state: "visible", timeout: 10_000 });

  // Select the first option deterministically without relying on scrolling.
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
}

async function main() {
  const baseUrl = process.env.BASE_URL || "http://localhost:5058";
  const fixturePath = path.resolve(process.cwd(), "tests/fixtures/sample.pdf");
  const skipServer = process.env.SKIP_SERVER === "1";
  const databaseUrl = process.env.DATABASE_URL || "postgresql:///legal_aidflow";

  const urlObj = new URL(baseUrl);
  const port = urlObj.port ? Number(urlObj.port) : urlObj.protocol === "https:" ? 443 : 80;

  const report: SmokeReport = {
    baseUrl,
    caseCreated: false,
    reviewSummaryOk: false,
    documentUploadedOk: false,
    uiDocumentVisibleOk: false,
    consoleErrors: [],
    pageErrors: [],
    networkErrors: [],
  };

  let serverProc: ReturnType<typeof spawn> | null = null;
  const devLogLines: string[] = [];
  const pushDevLog = (chunk: any) => {
    const text = String(chunk ?? "");
    for (const line of text.split(/\r?\n/)) {
      if (!line.trim()) continue;
      devLogLines.push(line);
      if (devLogLines.length > 2000) devLogLines.shift();
    }
  };

  if (!skipServer) {
    serverProc = spawn("npm", ["run", "dev"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        NODE_ENV: "development",
        DATABASE_URL: databaseUrl,
        PORT: String(port),
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    serverProc.stdout?.on("data", pushDevLog);
    serverProc.stderr?.on("data", pushDevLog);

    serverProc.on("exit", (code) => {
      pushDevLog(`(dev server exited with code ${code})`);
    });
  }

  try {
    await waitForServer(baseUrl);
  } catch (e) {
    report.devLogTail = devLogLines.slice(-120);
    throw e;
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ baseURL: baseUrl });
  const page = await context.newPage();

  page.on("console", (msg: ConsoleMessage) => {
    if (msg.type() === "error") report.consoleErrors.push(msg.text());
  });

  page.on("pageerror", (err) => {
    const anyErr = err as any;
    report.pageErrors.push(String(anyErr?.stack || anyErr?.message || anyErr || "Unknown page error"));
  });

  page.on("response", (res: Response) => {
    const url = res.url();
    const status = res.status();
    if (url.includes("/api/") && status >= 400) {
      report.networkErrors.push({ method: res.request().method(), url, status });
    }
  });

  const caseNumber = `SMOKE-${Date.now()}`;
  const title = "Smoke Test Case";
  const description = "Runtime smoke test: create case + upload one document.";
  const issueSummary = "Smoke: issue summary";
  const issueDetails = "Smoke: issue details";
  const jurisdiction = "Amman";
  const relatedLaws = "Labor Law Article 1";
  const docType = "ID Copy";

  let runError: unknown = undefined;

  try {
    // Login
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await page.getByTestId("input-username").fill("admin");
    await page.getByTestId("input-password").fill("admin123");
    await page.getByTestId("button-login").click();
    await page.waitForURL(/\/$/, { timeout: 30_000 });

    // Go to cases
    await page.goto("/cases", { waitUntil: "domcontentloaded" });
    await page.getByTestId("input-search").waitFor({ state: "visible", timeout: 30_000 });

    const addBtnCount = await page.locator('[data-testid="button-add-case"]').count();
    if (addBtnCount !== 1) {
      const screenshotPath = path.resolve(process.cwd(), "playwright-smoke-missing-add-case.png");
      await page.screenshot({ path: screenshotPath, fullPage: true });
      throw new Error(`Add-case button not found (count=${addBtnCount}). Screenshot: ${screenshotPath}`);
    }

    // Open dialog
    await page.getByTestId("button-add-case").click();
    await page.getByTestId("input-case-number").waitFor({ state: "visible", timeout: 15_000 });

    // Step 1
    await page.getByTestId("input-case-number").fill(caseNumber);
    await page.getByTestId("input-case-title").fill(title);
    await page.getByTestId("textarea-case-description").fill(description);

    // Select beneficiary (first option)
    await selectRadixFirstOption(page, "select-case-beneficiary");

    // Select case type
    await selectRadixOptionByName(page, "select-case-type", "Labor");

    await page.getByTestId("button-step-next").click();

    // Step 2
    await page.getByTestId("textarea-issue-summary").fill(issueSummary);
    await page.getByTestId("textarea-issue-details").fill(issueDetails);

    // Enable urgency and set urgency date
    await page.getByTestId("switch-urgency").click();
    const urgencyDate = toIsoLocalDatetimeInput(new Date(Date.now() + 60 * 60 * 1000));
    await page.getByTestId("input-urgency-date").fill(urgencyDate);

    await page.getByTestId("input-jurisdiction").fill(jurisdiction);
    await page.getByTestId("textarea-related-laws").fill(relatedLaws);

    await page.getByTestId("button-step-next").click();

    // Step 3 (documents)
    await page.getByTestId("input-doc-draft-file").setInputFiles(fixturePath);
    await page.getByTestId("input-doc-draft-type").fill(docType);
    await page.getByTestId("switch-doc-draft-public").click();
    await page.getByTestId("button-doc-draft-add").click();

    await page.getByTestId("button-step-next").click();

    // Step 4 (review)
    await page.getByTestId("review-summary").waitFor({ state: "visible", timeout: 10_000 });

    const reviewText = await page.getByTestId("review-summary").innerText();
    report.reviewSummaryOk =
      reviewText.includes(caseNumber) &&
      reviewText.includes(title) &&
      reviewText.includes(issueSummary) &&
      reviewText.includes("sample.pdf") &&
      reviewText.includes(docType);

    await page.getByTestId("checkbox-acknowledge").click();
    await page.getByTestId("button-step-submit").click();

    // Wait for redirect
    await page.waitForURL(/\/cases\/[a-zA-Z0-9-]+$/, { timeout: 30_000 });
    const url = page.url();
    const match = url.match(/\/cases\/([^/?#]+)/);
    const caseId = match?.[1];

    if (caseId) {
      report.caseCreated = true;
      report.createdCaseId = caseId;

      // Try to observe UI docs dialog (auto-open behavior)
      try {
        await page.getByText("Case Documents").waitFor({ timeout: 15_000 });
        await page.getByText("sample.pdf").waitFor({ timeout: 15_000 });
        report.uiDocumentVisibleOk = true;
      } catch {
        report.uiDocumentVisibleOk = false;
      }

      // Validate via API (authoritative)
      try {
        const docs = await page.evaluate(async (id: string) => {
          const res = await fetch(`/api/cases/${id}/documents`, { credentials: "include" });
          if (!res.ok) throw new Error(`listDocuments failed: ${res.status}`);
          return res.json();
        }, caseId);

        if (Array.isArray(docs)) {
          report.documentUploadedOk = docs.some((d: any) =>
            String(d?.fileName || d?.title || "").includes("sample.pdf"),
          );
        }
      } catch (e: any) {
        report.documentUploadedOk = false;
        report.networkErrors.push({ method: "GET", url: `${baseUrl}/api/cases/${caseId}/documents`, status: 0 });
        report.consoleErrors.push(String(e?.message || e));
      }
    }
  } catch (e) {
    runError = e;
  }

  await context.close();
  await browser.close();

  if (serverProc) {
    serverProc.kill("SIGTERM");
    await new Promise((r) => setTimeout(r, 500));
    if (!serverProc.killed) serverProc.kill("SIGKILL");
  }

  report.devLogTail = devLogLines.slice(-120);

  // eslint-disable-next-line no-console
  console.log(JSON.stringify(report, null, 2));

  if (runError || !report.caseCreated || !report.reviewSummaryOk || !report.documentUploadedOk) {
    if (runError) {
      // eslint-disable-next-line no-console
      console.error(runError);
    }
    process.exitCode = 1;
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
