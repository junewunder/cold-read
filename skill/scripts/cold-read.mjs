#!/usr/bin/env node
// cold-read: read a document the way a first-time reader does, one chunk at a
// time, and check what that reader was never told.
//
//   cold-read check <doc.md> [--reader "who is reading"] [--plan plan.md]
//   cold-read leave <doc.md> <flag id> "<why>"
//   cold-read outline <doc.md> [--reader "..."]
//   cold-read plan <plan.md>
//   cold-read style <doc.md>
//
// check   builds the log, runs the checks, prints the report. Each run on an
//         edited text is a round. Exit 0 when the round is quiet: no flag that
//         two or more readings raised is still standing. Exit 1 otherwise.
// leave   records that a flag from the last round is left as it is, and why.
//         It is not raised again; the report lists it at the end.
// outline builds the log and prints it as an outline in the plan format.
// plan    checks a plan on its own, before any text exists. No model calls.
//         Exit 1 if any flag is an error.
// style   flags sentence-level habits a pattern can find: figures of speech
//         standing in for plain verbs, staged points, dashes as connectors.
//         Needs Vale on the PATH. No model calls. Exit 1 if there is a flag.
//
// Options:
//   --reader <text>       who is reading and what they have never seen
//   --knows <a, b, c>     terms this reader already knows; never flagged
//   --plan <file>         a plan to check the text against (its Reader: and Knows:
//                         lines are used unless the options are given)
//   --model <name>        labelling model (default haiku)
//   --runs <n>            read the document n times and merge the flags (default 2);
//                         labels vary between readings, so two catch more than one
//   --pass-model <name>   model for the two passes over the whole log: settling
//                         threads and matching plan points (default sonnet)
//   --state <dir>         where the log, outline, report, rounds and cache go
//                         (default ~/.local/share/cold-read/<project>/)
//   --json                print flags as JSON instead of the report
//   --no-cache            relabel every chunk

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { basename, dirname, join, resolve, relative } from "node:path";
import { homedir } from "node:os";
import { parseArgs } from "node:util";
import { chunk } from "./lib/chunk.mjs";
import { buildLog, claude, withCache } from "./lib/label.mjs";
import { check, mergeFlags, foldUnplanned } from "./lib/check.mjs";
import { parsePlan, checkPlan, diffPlan, matchPrompt, splitList, allMentions, MATCH_SCHEMA } from "./lib/plan.mjs";
import { measure, checkLength } from "./lib/length.mjs";
import { assignIds, loadLeft, splitLeft, leave, recordRound } from "./lib/left.mjs";
import { settlePrompt, applySettled, SETTLE_SCHEMA } from "./lib/settle.mjs";
import { outline, report } from "./lib/render.mjs";
import { lint, styleReport, StyleError } from "./lib/style.mjs";

const DEFAULT_READER =
  "A capable developer who has never seen this project and knows nothing about how it works inside. They know common tools: git, a shell, a package manager.";

function usage(msg) {
  if (msg) console.error(`cold-read: ${msg}\n`);
  console.error(readFileSync(new URL(import.meta.url), "utf8").split("\n").slice(1, 37).map((l) => l.replace(/^\/\/ ?/, "")).join("\n"));
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
    runs: { type: "string", default: "2" },
    "pass-model": { type: "string", default: "sonnet" },
    state: { type: "string" },
    json: { type: "boolean", default: false },
    "no-cache": { type: "boolean", default: false },
    help: { type: "boolean", short: "h", default: false },
  },
});

const [command, docArg, ...restArgs] = positionals;
if (opt.help || !command) usage();
if (!["check", "leave", "outline", "plan", "style"].includes(command)) usage(`unknown command "${command}"`);
if (!docArg) usage("which document?");

if (command === "style") {
  let flags;
  try {
    flags = lint(readFileSync(resolve(docArg), "utf8"));
  } catch (e) {
    if (!(e instanceof StyleError)) throw e;
    console.error(`cold-read: ${e.message}`);
    process.exit(2);
  }
  process.stdout.write(opt.json ? JSON.stringify({ flags }, null, 2) + "\n" : styleReport(flags, docArg));
  process.exit(flags.length ? 1 : 0);
}

if (command === "plan") {
  const p = parsePlan(readFileSync(resolve(docArg), "utf8"));
  if (p.points.length === 0) usage(`${docArg} has no numbered points`);
  const { log, flags } = checkPlan(p);
  log.reader = p.reader || "(the plan names no reader)";
  const text = report(flags, log, docArg, { planOnly: true });
  process.stdout.write(opt.json ? JSON.stringify({ flags }, null, 2) + "\n" : text);
  process.exit(flags.some((f) => f.level === "error") ? 1 : 0);
}

const doc = resolve(docArg);
const root = projectRoot(doc);
const stem = relative(root, doc).replace(/\.[^.]+$/, "").replace(/[\\/]/g, "__");
const state = resolve(opt.state ?? join(process.env.XDG_DATA_HOME || join(homedir(), ".local/share"), "cold-read", basename(root)));
mkdirSync(state, { recursive: true });

const files = {
  log: join(state, `${stem}.log.json`),
  outline: join(state, `${stem}.outline.md`),
  report: join(state, `${stem}.report.md`),
  flags: join(state, `${stem}.flags.json`),
  left: join(state, `${stem}.left.json`),
  rounds: join(state, `${stem}.rounds.json`),
};

if (command === "leave") {
  const [id, ...why] = restArgs;
  if (!id || why.length === 0) usage('leave needs a flag id and a reason: cold-read leave README.md a3f2 "the game and its decompilation are two things"');
  try {
    const flag = leave(files.flags, files.left, id.replace(/[[\]]/g, ""), why.join(" "));
    console.log(`Left: ${flag.message}`);
  } catch (e) {
    usage(e.message);
  }
  process.exit(0);
}

const plan = opt.plan ? parsePlan(readFileSync(resolve(opt.plan), "utf8")) : null;
const reader = opt.reader ?? (plan?.reader || DEFAULT_READER);
const knows = opt.knows ? splitList(opt.knows) : (plan?.knows ?? []);
const mentions = plan ? allMentions(plan) : [];

const docText = readFileSync(doc, "utf8");
const chunks = chunk(docText);
if (chunks.length === 0) usage(`${docArg} has no text to read`);
const lengths = measure(docText);

const runs = Math.max(1, Number(opt.runs) || 1);
const cacheDir = opt["no-cache"] ? null : join(state, "cache");
const PASS_SYSTEM = "You compare records of what a document does. You never see the document. Answer in the JSON schema only.";
// A pass sees only the log, so an unchanged log gets its cached answer.
const pass = (prompt, schema, run) =>
  withCache(cacheDir, ["pass", opt["pass-model"], run, PASS_SYSTEM, prompt], () => claude({ prompt, model: opt["pass-model"], system: PASS_SYSTEM, schema }));
const spend = (log, { cost, hit }) => { log.cost += cost; if (!hit) log.paid += cost; };
let read = 0;

// Rough, from the documents measured so far: a chunk takes about 8 seconds,
// readings run side by side, and a chunk reading costs about a third of a cent.
process.stderr.write(
  `${chunks.length} chunks, ${runs} ${runs === 1 ? "reading" : "readings"}: about ${Math.max(1, Math.round((chunks.length * 8) / 60))} min and $${(chunks.length * runs * 0.003).toFixed(2)} if nothing is cached.\n`,
);

// One reading of the document: build the log, settle its threads, raise its flags.
async function readOnce(run) {
  const log = await buildLog(chunks, {
    reader, knows, model: opt.model, run, cacheDir,
    onProgress: () => process.stderr.write(`\r  read ${++read}/${chunks.length * runs} chunks   `),
  });
  if (log.threads.some((t) => !t.closedAt)) {
    const res = await pass(settlePrompt(log), SETTLE_SCHEMA, run);
    applySettled(log, res.output.threads);
    spend(log, res);
  }
  let flags = check(log, { mentions });
  if (plan && command === "check") {
    const res = await pass(matchPrompt(plan, log), MATCH_SCHEMA, run);
    spend(log, res);
    flags = [...flags, ...diffPlan(plan, log, Object.fromEntries(res.output.matches.map((m) => [m.point, m.parts])), docText)];
  }
  return { log, flags };
}

// The readings are independent, so they run side by side.
const readings = await Promise.all(Array.from({ length: runs }, (_, run) => readOnce(run)));
process.stderr.write("\n");

// The first reading's log is the one written out and shown as the outline.
const log = readings[0].log;
const docName = relative(root, doc);
writeFileSync(files.log, JSON.stringify(log, null, 2));
writeFileSync(files.outline, outline(log, docName, { lengths }));

if (command === "outline") {
  process.stdout.write(outline(log, docName, { lengths }));
  console.error(`\noutline: ${files.outline}`);
  process.exit(0);
}

// Length is counted, not read, so every reading agrees on it.
const counted = plan ? checkLength(plan, lengths).map((f) => ({ ...f, sure: true })) : [];
const all = assignIds([...counted, ...foldUnplanned(mergeFlags(readings.map((r) => r.flags)))]);
const { standing: flags, left } = splitLeft(all, loadLeft(files.left));
const cost = readings.reduce((sum, r) => sum + r.log.cost, 0);
const paid = readings.reduce((sum, r) => sum + r.log.paid, 0);
const cached = readings.reduce((sum, r) => sum + r.log.cached, 0);
const round = recordRound(files.rounds, { docText, standing: flags, runs, cost, paid });

const text = report(flags, log, docName, { plan, runs, cost, paid, cached, left, round, lengths });
const result = { runs, cost, paid, chunks: chunks.length, lines: lengths.lines, round, flags, left };
writeFileSync(files.report, text);
writeFileSync(files.flags, JSON.stringify(result, null, 2));

process.stdout.write(opt.json ? JSON.stringify(result, null, 2) + "\n" : text);
console.error(`\nreport:  ${files.report}\noutline: ${files.outline}`);
process.exit(round.quiet ? 0 : 1);
