#!/usr/bin/env node
// Score cold-read against problems a person already found by hand.
//
//   node eval/run.mjs <case> [--model haiku] [--pass-model sonnet] [--no-cache]
//
// <case> is a directory under eval/ holding README.md (the document as it was
// before the hand fixes) and expected.json (the reader, and each known problem
// with a pattern that a matching flag must contain). Prints which known
// problems were flagged, and lists every other flag: each of those is either a
// real problem the hand pass missed or noise, and only reading them tells which.

import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const [name, ...rest] = process.argv.slice(2);
if (!name) { console.error("usage: node eval/run.mjs <case> [cold-read options]"); process.exit(2); }

const expected = JSON.parse(readFileSync(join(here, name, "expected.json"), "utf8"));
const modelAt = rest.indexOf("--model");
const model = modelAt >= 0 ? rest[modelAt + 1] : "haiku";
const state = join(here, "..", "work", `${name}-${model}`);
// cold-read reads the document twice unless told otherwise; pass --runs to change it.
mkdirSync(state, { recursive: true });

const run = spawnSync(
  "node",
  [join(here, "..", "skill/scripts/cold-read.mjs"), "check", join(here, name, "README.md"),
    "--reader", expected.reader, "--knows", expected.knows.join(", "), "--state", state, "--json", ...rest],
  { stdio: ["ignore", "pipe", "inherit"], maxBuffer: 1 << 26 },
);
if (run.status !== 0 && run.status !== 1) process.exit(run.status ?? 1);
const { flags, runs, cost, chunks } = JSON.parse(run.stdout.toString());

const text = (f) => [f.term, f.message, f.quote].filter(Boolean).join(" ");
const used = new Set();
const lines = [];
let hits = 0, sure = 0;
for (const p of expected.problems) {
  const re = new RegExp(p.match, "i");
  const found = flags.filter((f) => p.kinds.includes(f.kind) && re.test(text(f)));
  found.forEach((f) => used.add(f));
  found.sort((a, b) => b.seen - a.seen);
  if (found.length) hits++;
  if (found.length && found[0].seen === runs) sure++;
  lines.push(`${found.length ? `caught ${found[0].seen}/${runs}` : "MISSED    "}  ${p.what}${found.length ? `\n              -> [${found[0].kind}] line ${found[0].line}: ${found[0].message}` : ""}`);
}
const others = flags.filter((f) => !used.has(f));

const out = [
  `${name} on ${model}, ${runs} ${runs === 1 ? "reading" : "readings"}: caught ${hits} of ${expected.problems.length} known problems (${sure} in every reading); ${others.length} other flags; ${chunks} chunks; $${cost.toFixed(3)}`,
  "",
  ...lines,
  "",
  `Other flags (${others.length}):`,
  ...others.map((f) => `  ${f.seen}/${runs} [${f.kind}] line ${f.line}: ${f.message}${f.quote ? ` Text: "${f.quote.replace(/\s+/g, " ")}"` : ""}`),
].join("\n");
writeFileSync(join(state, "score.txt"), out + "\n");
console.log(out);
