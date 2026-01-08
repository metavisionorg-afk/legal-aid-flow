import { Client } from "pg";

type CaseTypeRow = {
  id: string;
  name_ar: string;
  name_en: string | null;
};

type Legacy = "civil" | "criminal" | "family" | "labor" | "asylum" | "other";

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[\/\-–—_]+/g, " ")
    .replace(/[^\p{L}\p{N} ]/gu, "")
    .trim();
}

function legacyCandidates(legacy: Legacy): string[] {
  switch (legacy) {
    case "civil":
      return ["civil", "civil case", "مدني", "قضايا مدنية"];
    case "criminal":
      return ["criminal", "criminal case", "جنائي", "قضايا جنائية"];
    case "family":
      return ["family", "personal status", "family personal status", "أحوال شخصية", "أسرة"];
    case "labor":
      return ["labor", "labour", "employment", "عمال", "عمل"];
    case "asylum":
      return ["asylum", "refugee", "asylum refugee", "لجوء", "لاجئ"];
    case "other":
      return ["other", "misc", "متنوع", "أخرى", "اخرى"];
  }
}

async function main() {
  const databaseUrl =
    process.env.DATABASE_URL ||
    (process.env.NODE_ENV === "production" ? "" : "postgresql:///legal_aidflow");

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required (or set NODE_ENV!=production for local default)");
  }

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    const caseTypesRes = await client.query<CaseTypeRow>(
      `select id, name_ar, name_en from case_types`,
    );

    const byName = new Map<string, string>();
    for (const ct of caseTypesRes.rows) {
      const ar = ct.name_ar ? normalize(ct.name_ar) : "";
      const en = ct.name_en ? normalize(ct.name_en) : "";
      if (ar) byName.set(ar, ct.id);
      if (en) byName.set(en, ct.id);
    }

    const legacyValues: Legacy[] = ["civil", "criminal", "family", "labor", "asylum", "other"];

    const mappings: Array<{ legacy: Legacy; caseTypeId: string }> = [];
    for (const legacy of legacyValues) {
      const candidates = legacyCandidates(legacy).map(normalize);
      const found = candidates.map((c) => byName.get(c)).find(Boolean);
      if (found) mappings.push({ legacy, caseTypeId: found });
    }

    console.log("Found mappings:");
    for (const m of mappings) console.log(`- ${m.legacy} -> ${m.caseTypeId}`);

    let totalUpdated = 0;
    for (const m of mappings) {
      const res = await client.query(
        `update intake_requests
         set case_type_id = $1
         where case_type_id is null and case_type = $2`,
        [m.caseTypeId, m.legacy],
      );
      const updated = Number(res.rowCount || 0);
      totalUpdated += updated;
      if (updated) {
        console.log(`Updated ${updated} rows for legacy=${m.legacy}`);
      }
    }

    const remaining = await client.query<{ count: string }>(
      `select count(*)::text as count from intake_requests where case_type_id is null`,
    );

    console.log("Done.");
    console.log(`Total updated: ${totalUpdated}`);
    console.log(`Remaining without case_type_id: ${remaining.rows[0]?.count ?? "0"}`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
