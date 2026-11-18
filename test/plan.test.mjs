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
