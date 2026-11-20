import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { blank, toFlags, lint, synced } from "../skill/scripts/lib/style.mjs";

test("blank empties frontmatter, comments and quotes, and keeps every line number", () => {
  const doc = ["---", "title: x: y", "---", "One.", "<!-- a", "b -->", "> quoted", "Two.", "```", "> code", "```"].join("\n");
  const out = blank(doc).split("\n");
  assert.equal(out.length, 11);
  assert.deepEqual(out.slice(0, 3), ["", "", ""]);
  assert.equal(out[3], "One.");
  assert.deepEqual(out.slice(4, 7), ["", "", ""]);
  assert.equal(out[7], "Two.");
  assert.equal(out[9], "> code");
});

test("blank leaves a document that only opens with a rule alone", () => {
  assert.equal(blank("---\n\nText."), "---\n\nText.");
});

test("toFlags orders Vale's alerts by position and drops the style prefix", () => {
  const alert = (Line, col, Check) => ({ Line, Span: [col, col + 3], Check, Match: "m", Message: "msg", Severity: "error" });
  const flags = toFlags({ "stdin.md": [alert(4, 2, "ai-tells.B"), alert(1, 9, "cold-read.Dash"), alert(1, 3, "ai-tells.A")] });
  assert.deepEqual(flags.map((f) => [f.line, f.col, f.rule]), [[1, 3, "A"], [1, 9, "Dash"], [4, 2, "B"]]);
});

// The tests below run the real rules, so they need Vale and the fetched
// package. They are skipped on a machine with neither; nothing here calls a
// model or the network.
const haveVale = spawnSync("vale", ["--version"]).status === 0 && synced();
const rulesAt = (doc) => lint(doc).map((f) => `${f.line} ${f.rule}`);

test("a dash is flagged in a sentence and a list item, not elsewhere", { skip: !haveVale }, () => {
  const doc = [
    "# Setup — the short version",
    "",
    "The cache is cold — so the first run is slow.",
    "",
    "- Restart it — twice if needed.",
    "",
    "| a | b |",
    "|---|---|",
    "| — | none |",
    "",
    "See pages 4–9 and the years 2020–2024.",
    "",
    "The limit is enforced since 2018. — the project's issue 825",
  ].join("\n");
  assert.deepEqual(rulesAt(doc), ["3 Dash", "5 Dash"]);
});

test("the kept rules fire on the habit and stay quiet on the plain sentence", { skip: !haveVale }, () => {
  const bad = [
    "The token lives in the keychain.",
    "",
    "The checker surfaces cycles for a person to judge.",
    "",
    "It runs offline, and that's the whole point.",
    "",
    "> The token lives in the keychain.",
  ].join("\n");
  assert.deepEqual(rulesAt(bad), ["1 FigurativeLives", "3 FigurativeSurfaces", "5 PointVerdict"]);
  const good = ["The token is stored in the keychain.", "", "The checker reports cycles for a person to judge.", "", "It runs offline, so it needs no account."].join("\n");
  assert.deepEqual(rulesAt(good), []);
});

test("frontmatter Vale cannot parse does not stop the pass", { skip: !haveVale }, () => {
  assert.deepEqual(rulesAt("---\ndescription: a: b: c\n---\n\nThe token lives in the keychain."), ["5 FigurativeLives"]);
});
