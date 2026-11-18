#!/usr/bin/env node
// cold-read: read a document the way a first-time reader does, one chunk at a
// time, and check what that reader was never told.
//
//   cold-read check <doc.md> [--reader "who is reading"] [--plan plan.md]
//   cold-read outline <doc.md> [--reader "..."]
//
// check   builds the log, runs the checks, prints the report. Exit 1 if any
//         flag is an error, so it can gate a commit.
// outline builds the log and prints it as an outline in the plan format.
//
// Options:
//   --reader <text>       who is reading and what they have never seen
//   --knows <a, b, c>     terms this reader already knows; never flagged
//   --plan <file>         a plan to check the text against (its Reader: and Knows:
//                         lines are used unless the options are given)
//   --model <name>        labelling model (default haiku)
//   --pass-model <name>   model for the two passes over the whole log: settling
//                         threads and matching plan points (default sonnet)
//   --state <dir>         where the log, outline, report and cache go
//                         (default ~/.local/share/cold-read/<project>/)
//   --json                print flags as JSON instead of the report
//   --no-cache            relabel every chunk

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { basename, dirname, join, resolve, relative } from "node:path";
import { homedir } from "node:os";
import { parseArgs } from "node:util";
import { chunk } from "./lib/chunk.mjs";
import { buildLog, claude } from "./lib/label.mjs";
import { check } from "./lib/check.mjs";
import { parsePlan, diffPlan, matchPrompt, splitList, MATCH_SCHEMA } from "./lib/plan.mjs";
import { settlePrompt, applySettled, SETTLE_SCHEMA } from "./lib/settle.mjs";
import { outline, report } from "./lib/render.mjs";

const DEFAULT_READER =
  "A capable developer who has never seen this project and knows nothing about how it works inside. They know common tools: git, a shell, a package manager.";

function usage(msg) {
  if (msg) console.error(`cold-read: ${msg}\n`);
  console.error(readFileSync(new URL(import.meta.url), "utf8").split("\n").slice(1, 24).map((l) => l.replace(/^\/\/ ?/, "")).join("\n"));
  process.exit(2);
}

function projectRoot(doc) {
  try {
    return execFileSync("git", ["-C", dirname(doc), "rev-parse", "--show-toplevel"], { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return dirname(doc);
  }
}

const { values: opt, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    reader: { type: "string" },
    knows: { type: "string" },
    plan: { type: "string" },
    model: { type: "string", default: "haiku" },
    "pass-model": { type: "string", default: "sonnet" },
    state: { type: "string" },
    json: { type: "boolean", default: false },
    "no-cache": { type: "boolean", default: false },
    help: { type: "boolean", short: "h", default: false },
  },
});

const [command, docArg] = positionals;
if (opt.help || !command) usage();
if (!["check", "outline"].includes(command)) usage(`unknown command "${command}"`);
if (!docArg) usage("which document?");

const doc = resolve(docArg);
const root = projectRoot(doc);
const stem = relative(root, doc).replace(/\.[^.]+$/, "").replace(/[\\/]/g, "__");
const state = resolve(opt.state ?? join(process.env.XDG_DATA_HOME || join(homedir(), ".local/share"), "cold-read", basename(root)));
mkdirSync(state, { recursive: true });

const plan = opt.plan ? parsePlan(readFileSync(resolve(opt.plan), "utf8")) : null;
const reader = opt.reader ?? (plan?.reader || DEFAULT_READER);
const knows = opt.knows ? splitList(opt.knows) : (plan?.knows ?? []);

const chunks = chunk(readFileSync(doc, "utf8"));
if (chunks.length === 0) usage(`${docArg} has no text to read`);

const log = await buildLog(chunks, {
  reader,
  knows,
  model: opt.model,
  cacheDir: opt["no-cache"] ? null : join(state, "cache"),
  onProgress: ({ chunk: c, cached, total }) =>
    process.stderr.write(`\r  reading chunk ${c.n}/${total}${cached ? " (cached)" : ""}   `),
});
process.stderr.write("\n");

const PASS_SYSTEM = "You compare records of what a document does. You never see the document. Answer in the JSON schema only.";
if (log.threads.some((t) => !t.closedAt)) {
  const { output, cost } = await claude({ prompt: settlePrompt(log), model: opt["pass-model"], system: PASS_SYSTEM, schema: SETTLE_SCHEMA });
  applySettled(log, output.threads);
  log.cost += cost;
}

const docName = relative(root, doc);
const outlinePath = join(state, `${stem}.outline.md`);
writeFileSync(join(state, `${stem}.log.json`), JSON.stringify(log, null, 2));
writeFileSync(outlinePath, outline(log, docName));

if (command === "outline") {
  process.stdout.write(outline(log, docName));
  console.error(`\noutline: ${outlinePath}`);
  process.exit(0);
}

let flags = check(log);
if (plan) {
  const { output, cost } = await claude({
    prompt: matchPrompt(plan, log),
    model: opt["pass-model"],
    system: PASS_SYSTEM,
    schema: MATCH_SCHEMA,
  });
  log.cost += cost;
  const pointMatch = Object.fromEntries(output.matches.map((m) => [m.point, m.parts]));
  flags = [...flags, ...diffPlan(plan, log, pointMatch)];
}

const text = report(flags, log, docName, { plan });
const reportPath = join(state, `${stem}.report.md`);
writeFileSync(reportPath, text);
writeFileSync(join(state, `${stem}.flags.json`), JSON.stringify(flags, null, 2));

process.stdout.write(opt.json ? JSON.stringify(flags, null, 2) + "\n" : text);
console.error(`\nreport:  ${reportPath}\noutline: ${outlinePath}`);
process.exit(flags.some((f) => f.level === "error") ? 1 : 0);
