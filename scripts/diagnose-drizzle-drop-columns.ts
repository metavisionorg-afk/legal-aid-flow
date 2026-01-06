import fs from "node:fs";
import path from "node:path";
import pg from "pg";

type StringSetMap = Map<string, Set<string>>;

function addToSetMap(map: StringSetMap, key: string, value: string) {
  const set = map.get(key) ?? new Set<string>();
  set.add(value);
  map.set(key, set);
}

function extractPgTableBlocks(source: string): Array<{ tableName: string; block: string }> {
  const results: Array<{ tableName: string; block: string }> = [];
  const tableRe = /pgTable\(\s*"([^"]+)"\s*,\s*\{/g;

  for (;;) {
    const match = tableRe.exec(source);
    if (!match) break;

    const tableName = match[1];
    const objectStart = source.indexOf("{", match.index);
    if (objectStart < 0) continue;

    let i = objectStart;
    let depth = 0;
    let inSingle = false;
    let inDouble = false;
    let inTemplate = false;
    let escape = false;

    for (; i < source.length; i++) {
      const ch = source[i];

      if (escape) {
        escape = false;
        continue;
      }

      if (ch === "\\") {
        escape = true;
        continue;
      }

      if (!inDouble && !inTemplate && ch === "'") {
        inSingle = !inSingle;
        continue;
      }
      if (!inSingle && !inTemplate && ch === '"') {
        inDouble = !inDouble;
        continue;
      }
      if (!inSingle && !inDouble && ch === "`") {
        inTemplate = !inTemplate;
        continue;
      }

      if (inSingle || inDouble || inTemplate) continue;

      if (ch === "{") depth++;
      if (ch === "}") {
        depth--;
        if (depth === 0) {
          const block = source.slice(objectStart, i + 1);
          results.push({ tableName, block });
          break;
        }
      }
    }
  }

  return results;
}

function extractSchemaColumns(schemaSource: string): StringSetMap {
  const blocks = extractPgTableBlocks(schemaSource);
  const map: StringSetMap = new Map();

  const colRe = /\b[a-zA-Z_][a-zA-Z0-9_]*\(\s*"([^"]+)"\s*\)/g;

  for (const { tableName, block } of blocks) {
    for (;;) {
      const match = colRe.exec(block);
      if (!match) break;
      addToSetMap(map, tableName, match[1]);
    }
    colRe.lastIndex = 0;
  }

  return map;
}

async function extractDbColumns(databaseUrl: string): Promise<StringSetMap> {
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const { rows } = await client.query<{
      table_name: string;
      column_name: string;
    }>(
      `
      select table_name, column_name
      from information_schema.columns
      where table_schema = 'public'
      order by table_name, ordinal_position
      `
    );

    const map: StringSetMap = new Map();
    for (const row of rows) {
      addToSetMap(map, row.table_name, row.column_name);
    }

    return map;
  } finally {
    await client.end();
  }
}

function diffColumns(db: Set<string>, schema: Set<string>): string[] {
  const diff: string[] = [];
  for (const col of db) {
    if (!schema.has(col)) diff.push(col);
  }
  return diff.sort();
}

export async function run() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set");
  }

  const schemaPath = path.resolve(process.cwd(), "shared/schema.ts");
  const schemaSource = fs.readFileSync(schemaPath, "utf8");

  const schemaCols = extractSchemaColumns(schemaSource);
  const dbCols = await extractDbColumns(databaseUrl);

  const interestingTables = ["users", "beneficiaries", "documents", "case_workflows"];

  const allTables = Array.from(dbCols.keys()).sort();

  const dropsByTable: Array<{ table: string; cols: string[] }> = [];
  for (const table of allTables) {
    const dbSet = dbCols.get(table) ?? new Set<string>();
    const schemaSet = schemaCols.get(table) ?? new Set<string>();

    if (schemaSet.size === 0) continue; // only consider tables defined in schema

    const drops = diffColumns(dbSet, schemaSet);
    if (drops.length > 0) dropsByTable.push({ table, cols: drops });
  }

  const totalDrops = dropsByTable.reduce((sum, x) => sum + x.cols.length, 0);

  console.log("DATABASE_URL:", databaseUrl);
  console.log("Schema file:", schemaPath);
  console.log("Schema tables parsed:", schemaCols.size);
  console.log("DB tables found:", dbCols.size);
  console.log("---");

  console.log("Potential drop columns (DB has column but schema.ts does not):", totalDrops);
  for (const { table, cols } of dropsByTable) {
    console.log(`- ${table}: ${cols.join(", ")}`);
  }

  console.log("---");
  console.log("Focus tables:");
  for (const table of interestingTables) {
    const dbSet = dbCols.get(table) ?? new Set<string>();
    const schemaSet = schemaCols.get(table) ?? new Set<string>();
    if (dbSet.size === 0) {
      console.log(`- ${table}: not found in DB`);
      continue;
    }
    if (schemaSet.size === 0) {
      console.log(`- ${table}: not found in schema.ts`);
      continue;
    }
    const drops = diffColumns(dbSet, schemaSet);
    console.log(`- ${table}: ${drops.length ? drops.join(", ") : "(none)"}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run().catch(console.error);
}
