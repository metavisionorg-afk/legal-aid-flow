#!/usr/bin/env node
/* eslint-disable no-console */

const fs = require("fs");
const path = require("path");

const root = path.resolve(process.cwd(), process.argv[2] || path.join("client", "src"));

function* walk(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) yield* walk(p);
    else if (/\.(ts|tsx)$/.test(ent.name)) yield p;
  }
}

function findUseQueryObjectRanges(text) {
  const ranges = [];
  let i = 0;

  while (true) {
    const idx = text.indexOf("useQuery", i);
    if (idx === -1) break;

    let j = idx + "useQuery".length;
    while (j < text.length && /\s/.test(text[j])) j++;
    if (text[j] !== "(") {
      i = j;
      continue;
    }

    j++;
    while (j < text.length && /\s/.test(text[j])) j++;
    if (text[j] !== "{") {
      i = j;
      continue;
    }

    const start = j;
    let depth = 0;
    let inStr = null;
    let inLineComment = false;
    let inBlockComment = false;
    let escaped = false;

    for (; j < text.length; j++) {
      const ch = text[j];
      const next = text[j + 1];

      if (inLineComment) {
        if (ch === "\n") inLineComment = false;
        continue;
      }
      if (inBlockComment) {
        if (ch === "*" && next === "/") {
          inBlockComment = false;
          j++;
        }
        continue;
      }

      if (inStr) {
        if (!escaped && ch === "\\") {
          escaped = true;
          continue;
        }
        if (!escaped && ch === inStr) {
          inStr = null;
          continue;
        }
        escaped = false;
        continue;
      }

      if (ch === "/" && next === "/") {
        inLineComment = true;
        j++;
        continue;
      }
      if (ch === "/" && next === "*") {
        inBlockComment = true;
        j++;
        continue;
      }

      if (ch === '"' || ch === "'" || ch === "`") {
        inStr = ch;
        continue;
      }

      if (ch === "{") depth++;
      if (ch === "}") {
        depth--;
        if (depth === 0) {
          ranges.push([start, j + 1]);
          break;
        }
      }
    }

    i = j + 1;
  }

  return ranges;
}

const offenders = [];

for (const file of walk(root)) {
  const text = fs.readFileSync(file, "utf8");
  const ranges = findUseQueryObjectRanges(text);

  for (const [a, b] of ranges) {
    const slice = text.slice(a, b);
    if (/\bonError\s*:/.test(slice)) offenders.push(file);
  }
}

if (!offenders.length) {
  console.log("OK: no useQuery({ ... onError: ... }) found under client/src");
  process.exit(0);
}

console.log("FOUND useQuery({ ... onError: ... }) in:");
for (const f of offenders) console.log(`- ${path.relative(process.cwd(), f)}`);
process.exit(1);
