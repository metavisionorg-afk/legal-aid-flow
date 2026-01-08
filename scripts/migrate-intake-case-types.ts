import { Client } from "pg";

type CaseTypeRow = {
  id: string;
  name_ar: string;
  name_en: string | null;
  is_active?: boolean | null;
  key?: string | null;
  slug?: string | null;
};

type TableInfo = {
  tableName: string;
  idColumn: string;
  legacyColumn: string;
  caseTypeIdColumn: string;
};

type MatchAction = "ACCEPT" | "SKIP_NO_MATCH" | "SKIP_AMBIGUOUS";

type MatchResult = {
  action: MatchAction;
  best?: { caseTypeId: string; name: string; score: number };
  secondBestScore?: number;
};

function legacyVariants(raw: unknown): string[] {
  if (typeof raw !== "string") return [];
  const base = raw.trim();
  if (!base) return [];

  const out = new Set<string>([base]);
  const lower = base.toLowerCase();

  // Expand known legacy enum values into bilingual candidates
  // to maximize matches when case_types has only Arabic/only English.
  switch (lower) {
    case "civil":
      ["civil", "civil case", "مدني", "قضايا مدنية", "مدنية"].forEach((v) => out.add(v));
      break;
    case "criminal":
      ["criminal", "criminal case", "جنائي", "قضايا جنائية", "جنائية"].forEach((v) => out.add(v));
      break;
    case "family":
      ["family", "personal status", "أحوال شخصية", "اسرة", "أسرة", "الأسرة"].forEach((v) => out.add(v));
      break;
    case "labor":
    case "labour":
      ["labor", "labour", "employment", "عمال", "عمل", "قضايا عمالية"].forEach((v) => out.add(v));
      break;
    case "asylum":
      ["asylum", "refugee", "لجوء", "لاجئ", "قضايا لجوء"].forEach((v) => out.add(v));
      break;
    case "other":
      ["other", "misc", "متنوع", "أخرى", "اخرى"].forEach((v) => out.add(v));
      break;
  }

  return [...out];
}

function removeArabicDiacritics(input: string): string {
  // Arabic diacritics + Quranic marks
  return input.replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, "");
}

function normalizeArabicVariants(input: string): string {
  return input
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/\u0640/g, ""); // tatweel
}

function normalize(text: unknown): string {
  if (typeof text !== "string") return "";
  let s = text.toLowerCase();
  s = removeArabicDiacritics(s);
  s = normalizeArabicVariants(s);

  // Remove punctuation (explicit list) and normalize to spaces.
  s = s.replace(/[-_\/\\.,()\[\]{}:]+/g, " ");

  // Remove everything except letters/numbers/spaces.
  s = s.replace(/[^\p{L}\p{N} ]/gu, " ");

  // Collapse spaces (also covers English multiple spaces).
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

function tokenize(norm: string): string[] {
  if (!norm) return [];
  return norm
    .split(" ")
    .map((t) => t.trim())
    .filter(Boolean)
    .filter((t) => t.length >= 2);
}

function intersectionSize(a: Set<string>, b: Set<string>): number {
  let c = 0;
  for (const v of a) if (b.has(v)) c += 1;
  return c;
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const v0 = new Array<number>(b.length + 1);
  const v1 = new Array<number>(b.length + 1);
  for (let i = 0; i < v0.length; i++) v0[i] = i;

  for (let i = 0; i < a.length; i++) {
    v1[0] = i + 1;
    for (let j = 0; j < b.length; j++) {
      const cost = a[i] === b[j] ? 0 : 1;
      v1[j + 1] = Math.min(v1[j] + 1, v0[j + 1] + 1, v0[j] + cost);
    }
    for (let j = 0; j < v0.length; j++) v0[j] = v1[j];
  }
  return v1[b.length];
}

function fuzzyScore(aNorm: string, bNorm: string): number {
  const maxLen = Math.max(aNorm.length, bNorm.length);
  if (maxLen < 6) return 0;
  const dist = levenshtein(aNorm, bNorm);
  const sim = 1 - dist / maxLen;
  const raw = Math.round(sim * 100);
  // Keep it below the acceptance threshold to stay conservative.
  return Math.max(0, Math.min(79, Math.max(60, raw)));
}

function scorePair(legacyNorm: string, keyNorm: string): number {
  if (!legacyNorm || !keyNorm) return 0;
  if (legacyNorm === keyNorm) return 100;

  if (legacyNorm.length >= 6 && (legacyNorm.includes(keyNorm) || keyNorm.includes(legacyNorm))) {
    return 80;
  }

  const legacyTokens = new Set(tokenize(legacyNorm));
  const keyTokens = new Set(tokenize(keyNorm));
  if (legacyTokens.size && keyTokens.size) {
    const overlap = intersectionSize(legacyTokens, keyTokens);
    const denom = Math.max(legacyTokens.size, keyTokens.size);
    const ratio = denom ? overlap / denom : 0;
    if (ratio >= 0.6) return 70;
  }

  return fuzzyScore(legacyNorm, keyNorm);
}

function matchCaseType(legacyRaw: unknown, caseTypes: Array<{ id: string; displayName: string; keysNorm: string[] }>): MatchResult {
  const variants = legacyVariants(legacyRaw);
  const legacyNorms = variants.map((v) => normalize(v)).filter(Boolean);
  if (!legacyNorms.length) {
    const legacyNorm = normalize(legacyRaw);
    if (!legacyNorm) return { action: "SKIP_NO_MATCH" };
    legacyNorms.push(legacyNorm);
  }

  const scored: Array<{ id: string; name: string; score: number }> = [];

  for (const ct of caseTypes) {
    let bestForCt = 0;
    for (const legacyNorm of legacyNorms) {
      for (const keyNorm of ct.keysNorm) {
        const s = scorePair(legacyNorm, keyNorm);
        if (s > bestForCt) bestForCt = s;
        if (bestForCt === 100) break;
      }
      if (bestForCt === 100) break;
    }
    if (bestForCt > 0) scored.push({ id: ct.id, name: ct.displayName, score: bestForCt });
  }

  if (!scored.length) return { action: "SKIP_NO_MATCH" };
  scored.sort((a, b) => b.score - a.score);

  const best = scored[0];
  const second = scored[1];
  const secondScore = second ? second.score : 0;

  // Acceptance rule: score >= 80 AND best - second >= 15
  if (best.score >= 80 && best.score - secondScore >= 15) {
    return {
      action: "ACCEPT",
      best: { caseTypeId: best.id, name: best.name, score: best.score },
      secondBestScore: secondScore,
    };
  }

  // Otherwise, treat as ambiguous (includes low score or close contenders)
  return {
    action: scored.length ? "SKIP_AMBIGUOUS" : "SKIP_NO_MATCH",
    best: { caseTypeId: best.id, name: best.name, score: best.score },
    secondBestScore: secondScore,
  };
}

async function tableExists(client: Client, tableName: string): Promise<boolean> {
  const res = await client.query<{ exists: boolean }>(
    `select exists(
       select 1 from information_schema.tables
       where table_schema = 'public' and table_name = $1
     ) as exists`,
    [tableName],
  );
  return Boolean(res.rows[0]?.exists);
}

async function getColumns(client: Client, tableName: string): Promise<Set<string>> {
  const res = await client.query<{ column_name: string }>(
    `select column_name from information_schema.columns
     where table_schema = 'public' and table_name = $1`,
    [tableName],
  );
  return new Set(res.rows.map((r) => r.column_name));
}

function parseLimit(): number | undefined {
  const raw = process.env.LIMIT;
  if (!raw) return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return Math.floor(n);
}

function isDryRun(): boolean {
  return process.env.DRY_RUN !== "0";
}

function includeInactiveCaseTypes(): boolean {
  return process.env.INCLUDE_INACTIVE === "1";
}

function pad(s: string, width: number): string {
  if (s.length >= width) return s.slice(0, width - 1) + "…";
  return s + " ".repeat(width - s.length);
}

async function main() {
  const databaseUrl =
    process.env.DATABASE_URL ||
    (process.env.NODE_ENV === "production" ? "" : "postgresql:///legal_aidflow");

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required (or set NODE_ENV!=production for local default)");
  }

  const dryRun = isDryRun();
  const includeInactive = includeInactiveCaseTypes();
  const limit = parseLimit();

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    // ====== Phase 1: identify request tables + fields ======
    const candidateTables = ["intake_requests", "service_requests"];
    const usableTables: TableInfo[] = [];

    console.log("\n[Phase 1] Detecting request tables/fields...");
    for (const tableName of candidateTables) {
      const exists = await tableExists(client, tableName);
      if (!exists) {
        console.log(`- ${tableName}: not found`);
        continue;
      }

      const cols = await getColumns(client, tableName);
      const hasId = cols.has("id");
      const hasLegacy = cols.has("case_type");
      const hasCaseTypeId = cols.has("case_type_id");

      console.log(
        `- ${tableName}: columns=${[...cols]
          .filter((c) => ["id", "case_type", "case_type_id"].includes(c))
          .join(", ") || "(id/case_type/case_type_id not present)"}`,
      );

      if (!hasId || !hasLegacy || !hasCaseTypeId) {
        console.log(
          `  -> skipping (needs id + case_type + case_type_id; hasId=${hasId}, hasLegacy=${hasLegacy}, hasCaseTypeId=${hasCaseTypeId})`,
        );
        continue;
      }

      usableTables.push({
        tableName,
        idColumn: "id",
        legacyColumn: "case_type",
        caseTypeIdColumn: "case_type_id",
      });
    }

    if (!usableTables.length) {
      console.log("\nNo usable tables found. Nothing to migrate.");
      return;
    }

    // ====== Phase 2: build case_types dictionary ======
    console.log("\n[Phase 2] Loading active case_types...");
    if (!(await tableExists(client, "case_types"))) {
      throw new Error("case_types table not found");
    }

    const caseTypeCols = await getColumns(client, "case_types");
    const hasIsActive = caseTypeCols.has("is_active");
    const hasKey = caseTypeCols.has("key");
    const hasSlug = caseTypeCols.has("slug");

    // Counts: always compute activeCount (if possible) and totalCount for reporting.
    const totalCountRes = await client.query<{ count: string }>(
      `select count(*)::text as count from case_types`,
    );
    const totalCaseTypesCount = Number(totalCountRes.rows[0]?.count || 0);

    let activeCaseTypesCount = totalCaseTypesCount;
    if (hasIsActive) {
      const activeCountRes = await client.query<{ count: string }>(
        `select count(*)::text as count from case_types where is_active = true`,
      );
      activeCaseTypesCount = Number(activeCountRes.rows[0]?.count || 0);
    }

    if (totalCaseTypesCount === 0) {
      console.warn(
        "WARNING: case_types is empty (totalCount=0). No rows can be matched/updated until case types are created.",
      );
    } else if (hasIsActive && !includeInactive && activeCaseTypesCount === 0) {
      console.warn(
        "WARNING: includeInactive=0 and there are zero active case types. Matching will find no results; consider activating case types or re-running with INCLUDE_INACTIVE=1.",
      );
    }

    const selectCols = [
      "id",
      "name_ar",
      "name_en",
      ...(hasIsActive ? ["is_active"] : []),
      ...(hasKey ? ["key"] : []),
      ...(hasSlug ? ["slug"] : []),
    ];

    const caseTypesRes = await client.query<CaseTypeRow>(
      `select ${selectCols.join(", ")}
       from case_types
       ${hasIsActive && !includeInactive ? "where is_active = true" : ""}`,
    );

    const caseTypes = caseTypesRes.rows.map((r) => {
      const nameAr = r.name_ar || "";
      const nameEn = r.name_en || "";
      const key = (r as any).key as string | null | undefined;
      const slug = (r as any).slug as string | null | undefined;

      const keysRaw = [nameAr, nameEn, key || "", slug || ""].filter((x) => typeof x === "string" && x.trim());
      const keysNorm = Array.from(new Set(keysRaw.map((k) => normalize(k)).filter(Boolean)));

      const displayName = (nameEn && nameEn.trim()) || nameAr;

      return {
        id: r.id,
        displayName,
        keysNorm,
      };
    });

    console.log(
      `includeInactive=${includeInactive ? "1" : "0"} | loadedCaseTypesCount=${caseTypes.length} | activeCount=${activeCaseTypesCount} | totalCount=${totalCaseTypesCount}`,
    );
    if (!hasIsActive && includeInactive) {
      console.log("Note: case_types.is_active not found; INCLUDE_INACTIVE has no effect.");
    }

    // ====== Phase 4/5: scan + dry/apply ======
    const globalExamples = {
      updated: [] as Array<any>,
      noMatch: [] as Array<any>,
      ambiguous: [] as Array<any>,
    };

    for (const table of usableTables) {
      console.log(`\n[Table] ${table.tableName}`);

      const counts = await client.query<{ total: string; with_id: string; without_id: string }>(
        `select
           count(*)::text as total,
           sum(case when ${table.caseTypeIdColumn} is not null then 1 else 0 end)::text as with_id,
           sum(case when ${table.caseTypeIdColumn} is null then 1 else 0 end)::text as without_id
         from ${table.tableName}`,
      );

      const totalInTable = Number(counts.rows[0]?.total || 0);
      const withCaseTypeId = Number(counts.rows[0]?.with_id || 0);
      const withoutCaseTypeId = Number(counts.rows[0]?.without_id || 0);

      console.log(
        `Counts: total=${totalInTable} | already_has_caseTypeId=${withCaseTypeId} | missing_caseTypeId=${withoutCaseTypeId}`,
      );

      const limitClause = limit ? `limit ${limit}` : "";
      const rowsRes = await client.query<{ id: string; legacy: any; case_type_id: string | null }>(
        `select ${table.idColumn} as id, ${table.legacyColumn} as legacy, ${table.caseTypeIdColumn} as case_type_id
         from ${table.tableName}
         where ${table.caseTypeIdColumn} is null
         ${limitClause}`,
      );

      const rows = rowsRes.rows;
      const scanned = rows.length;
      console.log(`Scanning ${scanned}${limit ? ` (LIMIT=${limit})` : ""} rows...`);

      const freqNoMatch = new Map<string, number>();
      const freqAmbiguous = new Map<string, number>();

      let updated = 0;
      let skippedNoMatch = 0;
      let skippedAmbiguous = 0;

      if (dryRun) {
        console.log("\nDRY RUN table (legacy_value | best_match_name | best_score | action)");
        console.log(
          `${pad("legacy_value", 32)} | ${pad("best_match_name", 28)} | ${pad("score", 5)} | action`,
        );
        console.log("-".repeat(80));
      }

      const acceptedToUpdate: Array<{ id: string; caseTypeId: string; legacyNorm: string; bestName: string; score: number }> = [];

      for (const r of rows) {
        const legacyNorm = normalize(r.legacy);
        const result = matchCaseType(r.legacy, caseTypes);

        if (result.action === "ACCEPT" && result.best) {
          acceptedToUpdate.push({
            id: r.id,
            caseTypeId: result.best.caseTypeId,
            legacyNorm,
            bestName: result.best.name,
            score: result.best.score,
          });

          if (globalExamples.updated.length < 5) {
            globalExamples.updated.push({ table: table.tableName, id: r.id, legacy: r.legacy, best: result.best });
          }
        } else if (result.action === "SKIP_NO_MATCH") {
          skippedNoMatch += 1;
          const key = legacyNorm || String(r.legacy || "");
          freqNoMatch.set(key, (freqNoMatch.get(key) || 0) + 1);
          if (globalExamples.noMatch.length < 5) {
            globalExamples.noMatch.push({ table: table.tableName, id: r.id, legacy: r.legacy });
          }
        } else {
          skippedAmbiguous += 1;
          const key = legacyNorm || String(r.legacy || "");
          freqAmbiguous.set(key, (freqAmbiguous.get(key) || 0) + 1);
          if (globalExamples.ambiguous.length < 5) {
            globalExamples.ambiguous.push({
              table: table.tableName,
              id: r.id,
              legacy: r.legacy,
              best: result.best,
              secondBestScore: result.secondBestScore,
            });
          }
        }

        if (dryRun) {
          const bestName = result.best?.name || "";
          const bestScore = result.best?.score != null ? String(result.best.score) : "";
          const action = result.action === "ACCEPT" ? "UPDATE" : result.action;
          console.log(
            `${pad(String(r.legacy ?? ""), 32)} | ${pad(bestName, 28)} | ${pad(bestScore, 5)} | ${action}`,
          );
        }
      }

      if (!dryRun) {
        console.log("\nAPPLY mode: updating accepted rows inside a transaction...");
        await client.query("begin");
        try {
          for (const row of acceptedToUpdate) {
            const res = await client.query(
              `update ${table.tableName}
               set ${table.caseTypeIdColumn} = $1
               where ${table.idColumn} = $2 and ${table.caseTypeIdColumn} is null`,
              [row.caseTypeId, row.id],
            );
            updated += Number(res.rowCount || 0);
          }
          await client.query("commit");
        } catch (e) {
          await client.query("rollback");
          throw e;
        }
      } else {
        updated = acceptedToUpdate.length;
      }

      const topNoMatch = [...freqNoMatch.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20);
      const topAmbiguous = [...freqAmbiguous.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20);

      console.log("\n[Final Report]");
      console.log(`- dry_run: ${dryRun ? "1" : "0"}`);
      console.log(`- total_in_table: ${totalInTable}`);
      console.log(`- already_had_caseTypeId: ${withCaseTypeId}`);
      console.log(`- missing_caseTypeId: ${withoutCaseTypeId}`);
      console.log(`- total_scanned: ${scanned}`);
      console.log(`- updated: ${updated}`);
      console.log(`- skipped_no_match: ${skippedNoMatch}`);
      console.log(`- skipped_ambiguous: ${skippedAmbiguous}`);

      if (topNoMatch.length) {
        console.log("\nTop 20 legacy values (no match):");
        for (const [val, cnt] of topNoMatch) console.log(`- ${val} (${cnt})`);
      }

      if (topAmbiguous.length) {
        console.log("\nTop 20 legacy values (ambiguous):");
        for (const [val, cnt] of topAmbiguous) console.log(`- ${val} (${cnt})`);
      }
    }

    console.log("\n[Samples]");
    console.log("Updated (5):");
    for (const s of globalExamples.updated) {
      console.log(
        `- ${s.table} id=${s.id} legacy=${String(s.legacy)} -> ${s.best?.name} (score=${s.best?.score}, caseTypeId=${s.best?.caseTypeId})`,
      );
    }

    console.log("\nSkipped (no match) (5):");
    for (const s of globalExamples.noMatch) {
      console.log(`- ${s.table} id=${s.id} legacy=${String(s.legacy)}`);
    }

    console.log("\nSkipped (ambiguous) (5):");
    for (const s of globalExamples.ambiguous) {
      console.log(
        `- ${s.table} id=${s.id} legacy=${String(s.legacy)} best=${s.best?.name ?? ""} score=${s.best?.score ?? ""} second=${s.secondBestScore ?? ""}`,
      );
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
