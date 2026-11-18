import { test } from "node:test";
import assert from "node:assert/strict";
import { newLog, applyEvents } from "../skill/scripts/lib/log.mjs";
import { check, norm, sameName } from "../skill/scripts/lib/check.mjs";
import { buildLog, describeLog } from "../skill/scripts/lib/label.mjs";
import { settlePrompt, applySettled } from "../skill/scripts/lib/settle.mjs";

const c = (n, start = n * 10) => ({ n, section: "S", kind: "para", start, end: start });
const ev = (over = {}) => ({ purpose: "says something", concepts: [], opens: [], closes: [], stumbles: [], ...over });
const k = (id, event, surface = id, gloss = event === "defines" ? "what it is" : "") => ({ id, event, surface, gloss });

test("norm folds case, articles, markup and plurals", () => {
  assert.equal(norm("The `Trackers`"), "tracker");
  assert.equal(norm("factory-spec"), "factory spec");
  assert.ok(sameName("check", "a check you trust"));
  assert.ok(sameName("unit of work", "trial units"));
  assert.ok(sameName("review before merge", "reviewer agent"));
  assert.ok(!sameName("usage and memory limits", "the loop"));
  assert.ok(!sameName("reviewer agent", "fresh read-only session"));
});

test("a term used and never defined is one error, counted", () => {
  const log = newLog({ reader: "r", model: "m" });
  applyEvents(log, c(1), ev({ concepts: [k("tracker", "uses")] }));
  applyEvents(log, c(2), ev({ concepts: [k("tracker", "uses")] }));
  const flags = check(log);
  assert.equal(flags.length, 1);
  assert.equal(flags[0].kind, "undefined");
  assert.equal(flags[0].level, "error");
  assert.match(flags[0].message, /2 times \(first at line 10\) and never explained/);
});

test("a term defined after its first use is flagged with both lines", () => {
  const log = newLog({ reader: "r", model: "m" });
  applyEvents(log, c(1), ev({ concepts: [k("unit", "uses")] }));
  applyEvents(log, c(2), ev({ concepts: [k("unit", "defines")] }));
  applyEvents(log, c(3), ev({ concepts: [k("unit", "uses")] }));
  const [f] = check(log);
  assert.match(f.message, /used at line 10 but only explained later, at line 20/);
});

test("defined then used raises nothing", () => {
  const log = newLog({ reader: "r", model: "m" });
  applyEvents(log, c(1), ev({ concepts: [k("lane", "defines")] }));
  applyEvents(log, c(2), ev({ concepts: [k("lane", "uses", "lanes")] }));
  assert.deepEqual(check(log), []);
});

test("one concept under two unrelated names is an alias warning", () => {
  const log = newLog({ reader: "r", model: "m" });
  applyEvents(log, c(1), ev({ concepts: [k("reviewer", "defines", "fresh read-only session")] }));
  applyEvents(log, c(2), ev({ concepts: [k("reviewer", "uses", "reviewer agent")] }));
  const [f] = check(log);
  assert.equal(f.kind, "alias");
  assert.equal(f.line, 20);
});

test("a term the reader is declared to know is never flagged", () => {
  const log = newLog({ reader: "r", knows: ["Skill", "just"], model: "m" });
  applyEvents(log, c(1), ev({ concepts: [k("skill", "uses", "skills"), k("tracker", "uses")] }));
  assert.deepEqual(check(log).map((f) => f.term), ["tracker"]);
});

test("the whole-log pass closes a thread only with a later chunk", () => {
  const log = newLog({ reader: "r", model: "m" });
  applyEvents(log, c(1), ev({ opens: [{ what: "the steps", quote: "goes like this" }] }));
  applyEvents(log, c(2), ev({ opens: [{ what: "without a remote?", quote: "with a git remote" }] }));
  applyEvents(log, c(3), ev());
  applySettled(log, [{ id: "t1", settled_by: 3 }, { id: "t2", settled_by: 1 }, { id: "t9", settled_by: 3 }]);
  assert.deepEqual(check(log).map((f) => f.quote), ["with a git remote"]);
  assert.match(settlePrompt(log), /t2 \(raised in part 2/);
  assert.doesNotMatch(settlePrompt(log), /t1 \(/);
});

test("a thread is flagged only while it stays open, and cannot close itself", () => {
  const log = newLog({ reader: "r", model: "m" });
  applyEvents(log, c(1), ev({ opens: [{ what: "where questions go", quote: "in one place" }], closes: ["t1"] }));
  assert.equal(check(log)[0].kind, "open");
  applyEvents(log, c(2), ev({ closes: ["t1"] }));
  assert.deepEqual(check(log), []);
});

test("the labeller sees the log so far and nothing after the current chunk", async () => {
  const chunks = [
    { ...c(1), text: "ALPHA text" },
    { ...c(2), text: "BRAVO text" },
    { ...c(3), text: "CHARLIE text" },
    { ...c(4), text: "DELTA text" },
  ];
  const prompts = [];
  const log = await buildLog(chunks, {
    reader: "r",
    call: async (prompt) => {
      prompts.push(prompt);
      return { events: ev({ concepts: prompts.length === 1 ? [k("Alpha Thing", "defines")] : [] }), cost: 0.01 };
    },
  });
  assert.doesNotMatch(prompts[0], /BRAVO|CHARLIE|DELTA/);
  assert.match(prompts[1], /alpha-thing.*explained in chunk 1/);
  // Chunk 4 gets the two chunks before it for pronouns, but not chunk 1's text.
  assert.match(prompts[3], /BRAVO[\s\S]*CHARLIE[\s\S]*DELTA/);
  assert.doesNotMatch(prompts[3], /ALPHA/);
  assert.equal(log.entries.length, 4);
  assert.ok(Math.abs(log.cost - 0.04) < 1e-9);
  assert.match(describeLog(log), /alpha-thing/);
});
