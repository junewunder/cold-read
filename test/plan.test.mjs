import { test } from "node:test";
import assert from "node:assert/strict";
import { newLog, applyEvents } from "../skill/scripts/lib/log.mjs";
import { parsePlan, diffPlan } from "../skill/scripts/lib/plan.mjs";
import { outline } from "../skill/scripts/lib/render.mjs";

const PLAN = `# Plan: README.md

Reader: someone new
who knows git.

## Intro
1. Say what the tool is.
   - defines: factory, unit
   - opens: how setup works
2. Walk through a run.
   - defines: tracker — records each unit and its state
   - uses: unit

## Install
3. Give the install command. (lines 30–34)
   - uses: skill ⚠ not explained yet
`;

test("a plan parses into points with their sections and terms", () => {
  const plan = parsePlan(PLAN);
  assert.equal(plan.title, "README.md");
  assert.equal(plan.reader, "someone new who knows git.");
  assert.equal(plan.points.length, 3);
  assert.deepEqual(plan.points[0].defines, ["factory", "unit"]);
  assert.deepEqual(plan.points[0].opens, ["how setup works"]);
  assert.deepEqual(plan.points[1].defines, ["tracker"]);
  assert.deepEqual([plan.points[2].section, plan.points[2].text, plan.points[2].uses], ["Install", "Give the install command.", ["skill"]]);
});

const chunkAt = (n) => ({ n, section: "Intro", kind: "para", start: n * 10, end: n * 10 + 2 });
const ev = (purpose, concepts) => ({ purpose, concepts, opens: [], closes: [], stumbles: [] });

function sampleLog() {
  const log = newLog({ reader: "someone new", model: "m" });
  applyEvents(log, chunkAt(1), ev("says what the tool is", [
    { id: "factory", surface: "factory", event: "defines", gloss: "a backlog worked through unattended" },
    { id: "unit", surface: "units", event: "uses", gloss: "" },
  ]));
  applyEvents(log, chunkAt(2), ev("lists the lanes", [{ id: "lane", surface: "lane", event: "uses", gloss: "" }]));
  return log;
}

test("the diff reports planned terms the text lacks and terms the plan lacks", () => {
  const flags = diffPlan(parsePlan(PLAN), sampleLog());
  const by = (kind) => flags.filter((f) => f.kind === kind).map((f) => f.term);
  assert.deepEqual(by("missing"), ["unit", "tracker"]);
  assert.deepEqual(by("unplanned"), ["lane"]);
  assert.match(flags.find((f) => f.term === "unit").message, /uses it and never explains it/);
  assert.match(flags.find((f) => f.term === "tracker").message, /never brings it up/);
});

test("with a point match, unmatched points are dropped and unmatched chunks are extra", () => {
  const flags = diffPlan(parsePlan(PLAN), sampleLog(), { 1: [1], 2: [], 3: [99] });
  assert.equal(flags.filter((f) => f.kind === "dropped").length, 2);
  const extra = flags.filter((f) => f.kind === "extra");
  assert.equal(extra.length, 1);
  assert.equal(extra[0].line, 20);
});

test("an extracted outline parses back as a plan", () => {
  const plan = parsePlan(outline(sampleLog(), "README.md"));
  assert.equal(plan.reader, "someone new");
  assert.equal(plan.points.length, 2);
  assert.deepEqual(plan.points[0].defines, ["factory"]);
  assert.deepEqual(plan.points[0].uses, ["units"]);
  assert.equal(plan.points[0].text, "Says what the tool is.");
});

const LINKED = `# Plan: README.md

Reader: someone new
Knows: git

## Rules
1. Walk through a run.
   - uses: lane
   - opens: where questions go
2. Say what a lane is.
   - defines: lane
   - example of: lane
3. List the rules the code enforces.
   - contrasts: prompt-only rules
   - because: an agent can ignore a prompt
   - closes: what happens on failure
4. Say where questions go.
   - contrasts: point 3
   - closes: where questions go
`;

test("links parse, and a plan is checked like a log before any text exists", async () => {
  const { parsePlan, checkPlan } = await import("../skill/scripts/lib/plan.mjs");
  const plan = parsePlan(LINKED);
  assert.deepEqual(plan.points[2].links, [
    { type: "contrast", about: "prompt-only rules" },
    { type: "reason", about: "an agent can ignore a prompt" },
  ]);
  assert.deepEqual(plan.points[1].links, [{ type: "example", about: "lane" }]);

  // (This plan sets no length, which is a warning of its own; see rounds.test.mjs.)
  const flags = checkPlan(plan).flags.filter((f) => f.kind !== "long");
  assert.deepEqual(flags.map((f) => [f.kind, f.line]), [
    ["undefined", 7],   // point 1 uses "lane" before point 2 defines it
    ["dangling", 13],   // point 3 contrasts with a term no point has
    ["dangling", 13],   // point 3 closes a thread nobody opened
  ]);
  assert.match(flags[0].message, /"lane" is used at line 7 but only explained later, at line 10/);
  assert.match(flags[1].message, /closes "what happens on failure"|contrasts with "prompt-only rules"/);
});

test("a link the plan asks for must appear in the text for that point", () => {
  const plan = parsePlan(LINKED);
  const log = newLog({ reader: "someone new", model: "m" });
  const at = (n) => ({ n, section: "Rules", kind: "para", start: n * 10, end: n * 10 });
  const base = { concepts: [], opens: [], closes: [], stumbles: [] };
  applyEvents(log, at(1), { ...base, purpose: "lists the enforced rules", links: [{ type: "reason", about: "prompts", stated: true, quote: "because" }] });
  applyEvents(log, at(2), { ...base, purpose: "says what a lane is", links: [] });
  const flags = diffPlan(plan, log, { 1: [1], 2: [2], 3: [1], 4: [1] }).filter((f) => f.kind === "link");
  assert.deepEqual(flags.map((f) => f.message.match(/point (\d) (\w+)/).slice(1)), [["2", "gives"], ["3", "contrasts"], ["4", "contrasts"]]);
});

const MANNER_PLAN = `# Outline: paper.md

Reader: a first-year student.
Length: 40 lines

## Background
1. Say what a unit is.
   - defines: unit (paragraph, by example), f(x)
2. Say what a lane does.
   - defines: lane (sentence, builds on unit)
`;

const def = (id, how, extra = {}) => ({ id, surface: id, event: "defines", gloss: "g", how, example: false, builds_on: [], ...extra });
const use = (id) => ({ id, surface: id, event: "uses", gloss: "" });

test("the way a term is introduced parses out of the brackets after it", () => {
  const plan = parsePlan(MANNER_PLAN);
  assert.deepEqual(plan.points[0].defines, ["unit", "f(x)"]);
  assert.deepEqual(plan.points[0].manners, [{ term: "unit", how: "paragraph", example: true, on: [] }]);
  assert.deepEqual(plan.points[1].manners, [{ term: "lane", how: "sentence", example: false, on: ["unit"] }]);
});

test("a term a definition builds on must be explained by then", async () => {
  const { checkPlan } = await import("../skill/scripts/lib/plan.mjs");
  const flags = checkPlan(parsePlan(MANNER_PLAN.replace("builds on unit", "builds on tracker"))).flags;
  assert.deepEqual(flags.map((f) => [f.kind, f.term]), [["undefined", "tracker"]]);
  assert.deepEqual(checkPlan(parsePlan(MANNER_PLAN)).flags, []);
});

test("a gloss dropped in ahead of the planned explanation is misplaced", () => {
  const log = newLog({ reader: "r", model: "m" });
  applyEvents(log, chunkAt(1), ev("opens the paper", [def("unit", "gloss")]));
  applyEvents(log, chunkAt(2), ev("says what a unit is", [def("unit", "paragraph", { example: true })]));
  applyEvents(log, chunkAt(3), ev("says what a lane does", [def("lane", "sentence", { builds_on: ["units"] })]));
  const flags = diffPlan(parsePlan(MANNER_PLAN), log, { 1: [2], 2: [3] }, "f(x)");
  assert.deepEqual(flags.filter((f) => f.kind !== "extra").map((f) => [f.kind, f.term, f.line]), [["misplaced", "unit", 10]]);
});

test("an explanation in the right place and the wrong manner is flagged", () => {
  const log = newLog({ reader: "r", model: "m" });
  applyEvents(log, chunkAt(1), ev("says what a unit is", [def("unit", "gloss")]));
  applyEvents(log, chunkAt(2), ev("says what a lane does", [def("lane", "sentence"), use("unit")]));
  const flags = diffPlan(parsePlan(MANNER_PLAN), log, { 1: [1], 2: [2] }, "f(x)");
  assert.deepEqual(flags.map((f) => [f.kind, f.term]), [["manner", "unit"], ["manner", "lane"]]);
  assert.match(flags[0].message, /paragraph of its own \(the text explains it in passing, as a gloss\); with an example/);
  assert.match(flags[1].message, /building on "unit"/);
});

test("an outline shows how each term is introduced, and reads back the same", () => {
  const log = newLog({ reader: "r", model: "m" });
  applyEvents(log, chunkAt(1), ev("says what a unit is", [def("unit", "paragraph", { example: true, builds_on: ["task"] })]));
  const text = outline(log, "paper.md");
  assert.match(text, /- defines: unit \(paragraph, by example, builds on task\) — g/);
  assert.deepEqual(parsePlan(text).points[0].manners, [{ term: "unit", how: "paragraph", example: true, on: ["task"] }]);
});

test("a term given to two points may be glossed in one and defined in the other", () => {
  const plan = parsePlan(MANNER_PLAN.replace("1. Say what a unit is.", "1. Open the paper.\n   - defines: unit (gloss)\n2. Say what a unit is."));
  const log = newLog({ reader: "r", model: "m" });
  applyEvents(log, chunkAt(1), ev("opens the paper", [def("unit", "gloss")]));
  applyEvents(log, chunkAt(2), ev("says what a unit is", [def("unit", "paragraph", { example: true })]));
  applyEvents(log, chunkAt(3), ev("says what a lane does", [def("lane", "sentence", { builds_on: ["unit"] })]));
  assert.deepEqual(diffPlan(plan, log, { 1: [1], 2: [2], 3: [3] }, "f(x)"), []);
});
