// What came out of the first real use, a README written plan first: a length the
// plan sets and code counts, names a point only mentions, flags left with a
// reason, a cache that survives a known-terms edit, code samples, and looser
// matching of a plan's terms. No model calls.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { newLog, applyEvents } from "../skill/scripts/lib/log.mjs";
import { check, stem, sameName, sameProblem } from "../skill/scripts/lib/check.mjs";
import { buildLog, knownHere, onlyInFence, screen } from "../skill/scripts/lib/label.mjs";
import { parsePlan, checkPlan, diffPlan, allMentions } from "../skill/scripts/lib/plan.mjs";
import { measure, parseLength, checkLength } from "../skill/scripts/lib/length.mjs";
import { assignIds, splitLeft, leave, loadLeft, recordRound } from "../skill/scripts/lib/left.mjs";
import { report, outline } from "../skill/scripts/lib/render.mjs";

const c = (n, text = "") => ({ n, section: "S", kind: "para", start: n * 10, end: n * 10, text });
const ev = (over = {}) => ({ purpose: "says something", concepts: [], opens: [], closes: [], stumbles: [], links: [], ...over });
const k = (id, event, surface = id, gloss = event === "defines" ? "what it is" : "") => ({ id, event, surface, gloss });

// ── Length ──────────────────────────────────────────────────────────────

const DOC = `# tool

One line of opening.

## Install

Run this:

\`\`\`sh
# not a heading
make install
\`\`\`

### On a Mac

Use brew.

## Use

Type the command.
`;

test("a document is measured in lines and words, section by section", () => {
  const m = measure(DOC);
  assert.equal(m.lines, 20);
  assert.deepEqual(m.sections.map((s) => [s.name, s.start, s.lines]), [
    ["tool", 1, 3],        // the title's section is the opening only
    ["Install", 5, 12],    // a section holds its subsections, and a "#" in a code fence is not a heading
    ["On a Mac", 14, 3],
    ["Use", 18, 3],
  ]);
  assert.equal(m.sections[3].words, 3);
});

test("a length is 'N lines' or 'N words', and a range means its upper end", () => {
  assert.deepEqual(parseLength("200 lines"), { max: 200, unit: "lines" });
  assert.deepEqual(parseLength("150–200 lines"), { max: 200, unit: "lines" });
  assert.deepEqual(parseLength("at most 1,200 words"), { max: 1200, unit: "words" });
  assert.equal(parseLength("short"), null);
});

const SIZED = `# Plan: README.md

Reader: someone new
Length: 15 lines

## Install
Length: 8 lines
1. Say how to install it.

## Use
Length: 5 lines
2. Say how to run it.

## Licence
Length: 2 lines
3. Name the licence.
`;

test("text longer than the outline allows is an error, for the document and for a section", () => {
  const plan = parsePlan(SIZED);
  assert.deepEqual(plan.length, { max: 15, unit: "lines", line: 4 });
  assert.deepEqual(plan.sections.map((s) => [s.name, s.length?.max]), [["Install", 8], ["Use", 5], ["Licence", 2]]);
  const flags = checkLength(plan, measure(DOC));
  assert.deepEqual(flags.map((f) => [f.level, f.line, f.message]), [
    ["error", 0, "The text is 20 lines; the outline allows 15."],
    ["error", 5, '"Install" is 12 lines; the outline allows 8.'],
    ["warn", 0, 'The outline allows "Licence" 2 lines, but the text has no heading "Licence", so its length was not checked.'],
  ]);
});

test("the plan check adds the section lengths up, and warns when a plan sets none", () => {
  assert.deepEqual(checkPlan(parsePlan(SIZED)).flags, []);
  const over = checkPlan(parsePlan(SIZED.replace("Length: 15 lines", "Length: 12 lines"))).flags;
  assert.deepEqual(over.map((f) => [f.kind, f.level, f.line]), [["long", "error", 4]]);
  assert.match(over[0].message, /add up to 15 lines; the whole document is allowed 12/);
  const none = checkPlan(parsePlan(SIZED.replace(/^Length:.*\n/gm, ""))).flags;
  assert.deepEqual(none.map((f) => [f.kind, f.level]), [["long", "warn"]]);
});

test("an outline carries the lengths it found, so it reads back as a plan with them", () => {
  const log = newLog({ reader: "r", model: "m" });
  applyEvents(log, { n: 1, section: "tool > Install", kind: "para", start: 7, end: 12 }, ev());
  const plan = parsePlan(outline(log, "README.md", { lengths: measure(DOC) }));
  assert.equal(plan.length.max, 20);
  assert.equal(plan.sections[0].length.max, 12);
});

// ── Mentions ────────────────────────────────────────────────────────────

const NAMES = `# Plan: README.md

Reader: someone new
Length: 50 lines

## What runs
1. Name the games that run.
   - defines: route
   - mentions: Emerald Rogue, mGBA
2. Say how a route is checked.
   - uses: route
`;

test("a name the plan only mentions is not unexplained, not unplanned and not missing", () => {
  const plan = parsePlan(NAMES);
  assert.deepEqual(plan.points[0].mentions, ["Emerald Rogue", "mGBA"]);
  assert.deepEqual(checkPlan(plan).flags, []);

  const log = newLog({ reader: "r", model: "m" });
  applyEvents(log, c(1), ev({ concepts: [k("route", "defines"), k("emerald-rogue", "uses", "Emerald Rogue"), k("sdl", "uses", "SDL")] }));
  const flags = [...check(log, { mentions: allMentions(plan) }), ...diffPlan(plan, log)];
  assert.deepEqual(flags.map((f) => [f.kind, f.term]), [["undefined", "SDL"], ["unplanned", "SDL"]]);
});

test("a point that relies on a name the plan only mentions is flagged in the plan check", () => {
  const plan = parsePlan(NAMES.replace("- uses: route", "- uses: route, mGBA"));
  assert.deepEqual(checkPlan(plan).flags.map((f) => [f.kind, f.term]), [["undefined", "mGBA"]]);
});

// ── Matching a plan's terms to the text's ───────────────────────────────

test("word endings do not hide a planned term: lift, lifted, lifter; mod, modded", () => {
  assert.ok(sameName("lifter", "lifted code"));
  assert.deepEqual(["lifted", "lifter", "lifting", "lifts", "modded", "recompiled", "recompiler", "class"].map(stem),
    ["lift", "lift", "lift", "lift", "mod", "recompil", "recompil", "class"]);

  const plan = parsePlan("# Plan: x\n\n## A\n1. Say what lifting is.\n   - defines: lift, mod, romhack\n");
  const log = newLog({ reader: "r", model: "m" });
  applyEvents(log, c(1), ev({ concepts: [k("lifted-code", "uses", "lifted code"), k("lifter", "defines"), k("modded", "defines")] }));
  // "lift" is matched by "lifter", which the text explains, and not by "lifted code", which it only uses.
  // "romhack" is in the text as plain words the reader never noted, so nobody was left short.
  assert.deepEqual(diffPlan(plan, log, null, "Two romhacks have been played.").filter((f) => f.kind === "missing"), []);
  // A planned term that is nowhere in the text is still missing.
  const gone = diffPlan(plan, log, null, "Nothing relevant.").filter((f) => f.kind === "missing");
  assert.deepEqual(gone.map((f) => f.term), ["romhack"]);
  assert.match(gone[0].message, /never brings it up/);
});

test("a second id for a name the log already has is the same concept", () => {
  const log = newLog({ reader: "r", model: "m" });
  applyEvents(log, c(1), ev({ concepts: [k("checkpoint", "defines", "checkpoints")] }));
  applyEvents(log, c(2), ev({ concepts: [k("checkpoints", "uses", "checkpoint")] }));
  assert.deepEqual(Object.keys(log.concepts), ["checkpoint"]);
  assert.deepEqual(check(log), []);
});

// ── Code samples and known terms ────────────────────────────────────────

const SAMPLE = "The lifted code writes one field, `gPen.state`:\n\n```rust\nfn pen_set(g: &mut Game, r: &mut Regs) {\n    g.ram.d_0300000c = r.r0;\n}\n```";

test("a name that exists only inside a code fence is not the document's vocabulary", () => {
  assert.ok(onlyInFence("Regs", SAMPLE));
  assert.ok(onlyInFence("d_0300000c", SAMPLE));
  assert.ok(!onlyInFence("gPen.state", SAMPLE));   // the sentence names it
  assert.ok(!onlyInFence("Game struct", SAMPLE));  // not literally in the fence: the reader's own name for something
  const out = screen(ev({
    concepts: [k("regs", "uses", "Regs"), k("gpen-state", "defines", "gPen.state"), k("rust", "uses", "Rust")],
    stumbles: [{ quote: "g.ram.d_0300000c = r.r0;", why: "raw address" }, { quote: "one field", why: "which field" }],
  }), { text: SAMPLE }, ["Rust"]);
  assert.deepEqual(out.concepts.map((x) => x.surface), ["gPen.state"]);
  assert.deepEqual(out.stumbles.map((x) => x.quote), ["one field"]);
});

test("a new known term changes the reader's prompt only from the chunk that contains it", async () => {
  assert.deepEqual(knownHere(["git", "CPU register", "Lua"], "It saves the CPU registers. Uses git."), ["git", "CPU register"]);

  const chunks = [c(1, "ALPHA is a tool."), c(2, "BRAVO uses cmake."), c(3, "CHARLIE ends it.")];
  const prompts = async (knows) => {
    const seen = [];
    await buildLog(chunks, { reader: "r", knows, call: async (p) => { seen.push(p); return { events: ev(), cost: 0 }; } });
    return seen;
  };
  const [a, b] = [await prompts(["git"]), await prompts(["git", "cmake"])];
  assert.equal(a[0], b[0]);
  assert.notEqual(a[1], b[1]);
  assert.equal(a[2], b[2]);
});

test("a rerun pays only for the chunks that were not cached, and says so", async () => {
  const cacheDir = mkdtempSync(join(tmpdir(), "cold-read-test-"));
  const chunks = [c(1, "ALPHA is a tool."), c(2, "BRAVO uses it.")];
  const call = async () => ({ events: ev(), cost: 0.01 });
  const first = await buildLog(chunks, { reader: "r", cacheDir, call });
  assert.deepEqual([first.cached, first.paid.toFixed(2), first.cost.toFixed(2)], [0, "0.02", "0.02"]);
  const again = await buildLog([chunks[0], c(2, "BRAVO was edited.")], { reader: "r", cacheDir, call });
  assert.deepEqual([again.cached, again.paid.toFixed(2), again.cost.toFixed(2)], [1, "0.01", "0.02"]);
});

// ── Rounds: what was left, what is new, when to stop ────────────────────

test("a flag left with a reason is not raised again, and a round is quiet when no agreed flag stands", () => {
  const dir = mkdtempSync(join(tmpdir(), "cold-read-test-"));
  const files = { flags: join(dir, "f.json"), left: join(dir, "l.json"), rounds: join(dir, "r.json") };
  const alias = { kind: "alias", level: "warn", n: 3, line: 30, term: "pokeemerald", message: "One thing has 2 names.", seen: 2, of: 2 };
  const loose = { kind: "stumble", level: "warn", n: 5, line: 50, quote: "it then hands back", message: "Unclear it.", seen: 1, of: 2 };

  // Round 1: both flags stand; the alias was raised by both readings, so the round is not quiet.
  let all = assignIds([{ ...alias }, { ...loose }]);
  let { standing, left } = splitLeft(all, loadLeft(files.left));
  let round = recordRound(files.rounds, { docText: "v1", standing, runs: 2, cost: 0.1, paid: 0.1 });
  assert.deepEqual([round.n, round.quiet, round.agreed, round.fresh], [1, false, 1, null]);
  writeFileSync(files.flags, JSON.stringify({ flags: standing, left }));
  assert.match(report(standing, newLog({ reader: "r", model: "haiku" }), "README.md", { runs: 2, round }), /Not done: 1 flag below that two or more readings raised is still standing/);

  // The alias is two things on purpose: leave it. The id comes from the report.
  assert.match(all[0].id, /^[0-9a-f]{4}$/);
  leave(files.flags, files.left, all[0].id, "the game and its decompilation are two things");
  assert.throws(() => leave(files.flags, files.left, "zzzz", "x"), /no flag "zzzz"/);

  // Round 2, after an edit: the alias comes back with its chunk moved, and stays left. A new stumble appears.
  const fresh = { kind: "stumble", level: "warn", n: 9, line: 90, quote: "the second kind", message: "Second of what?", seen: 1, of: 2 };
  all = assignIds([{ ...alias, n: 4, line: 41 }, { ...loose, n: 6 }, fresh]);
  ({ standing, left } = splitLeft(all, loadLeft(files.left)));
  round = recordRound(files.rounds, { docText: "v2", standing, runs: 2, cost: 0.1, paid: 0.04 });
  assert.deepEqual(standing.map((f) => [f.quote, f.new]), [["it then hands back", false], ["the second kind", true]]);
  assert.deepEqual(left.map((f) => f.reason), ["the game and its decompilation are two things"]);
  assert.deepEqual([round.n, round.quiet, round.streak, round.fresh], [2, true, 1, 1]);
  const text = report(standing, newLog({ reader: "r", model: "haiku" }), "README.md", { runs: 2, round, left, cost: 0.1, paid: 0.04, cached: 3 });
  assert.match(text, /Round 2: 2 flags \(0 errors, 2 warnings\), 1 of them new since the last round\. 1 more was left earlier/);
  assert.match(text, /Quiet round/);
  assert.match(text, /\(1 of 2 readings, new\)/);
  assert.match(text, /## Left earlier \(1\)[\s\S]*Left because: the game and its decompilation are two things/);

  // Reading the same text again is the same round; a third text makes the second quiet round running.
  assert.equal(recordRound(files.rounds, { docText: "v2", standing, runs: 2, cost: 0.1, paid: 0 }).n, 2);
  round = recordRound(files.rounds, { docText: "v3", standing: [], runs: 2, cost: 0.1, paid: 0.02 });
  assert.deepEqual([round.n, round.streak], [3, 2]);
  assert.match(report([], newLog({ reader: "r", model: "haiku" }), "README.md", { runs: 2, round }), /Done: this is the second quiet round running/);
  assert.equal(JSON.parse(readFileSync(files.rounds, "utf8")).length, 3);
});

test("a length over the plan keeps a round from being quiet without any reading agreeing", () => {
  const dir = mkdtempSync(join(tmpdir(), "cold-read-test-"));
  const long = { kind: "long", level: "error", n: 0, line: 0, message: "The text is 283 lines; the outline allows 200.", sure: true };
  const round = recordRound(join(dir, "r.json"), { docText: "v1", standing: [long], runs: 3, cost: 0, paid: 0 });
  assert.equal(round.quiet, false);
  assert.ok(sameProblem(long, { ...long }));
  assert.ok(!sameProblem(long, { ...long, message: "The text is 240 lines; the outline allows 200." }));
});
