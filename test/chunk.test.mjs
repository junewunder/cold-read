import { test } from "node:test";
import assert from "node:assert/strict";
import { chunk } from "../skill/scripts/lib/chunk.mjs";

test("paragraphs become chunks with line numbers and section paths", () => {
  const cs = chunk("# Tool\n\nFirst para\nstill first.\n\n## Install\n\nSecond para.\n");
  assert.equal(cs.length, 2);
  assert.deepEqual([cs[0].start, cs[0].end, cs[0].section], [3, 4, "Tool"]);
  assert.deepEqual([cs[1].start, cs[1].section], [8, "Tool > Install"]);
});

test("a short list is one chunk; a long list is one chunk per item", () => {
  const short = chunk("- one\n- two\n- three\n");
  assert.equal(short.length, 1);
  assert.equal(short[0].kind, "list");

  const item = "word ".repeat(30).trim();
  const long = chunk(`- ${item}\n  continued\n- ${item}\n- ${item}\n`);
  assert.equal(long.length, 3);
  assert.equal(long[0].kind, "item");
  assert.deepEqual([long[0].start, long[0].end], [1, 2]);
});

test("a code block joins the text that introduces it", () => {
  const cs = chunk("Run this:\n\n```sh\njust test\n\n# not a heading\n```\n\nThen read on.\n");
  assert.equal(cs.length, 2);
  assert.match(cs[0].text, /just test/);
  assert.equal(cs[0].end, 7);
});

test("frontmatter and comments are skipped; a sibling heading replaces the path", () => {
  const cs = chunk("---\ntitle: x\n---\n# A\n\n<!-- note\nmore -->\n\n## B\n\nb text\n\n## C\n\nc text\n");
  assert.deepEqual(cs.map((c) => c.section), ["A > B", "A > C"]);
});

test("a lead-in ending in a colon is read with what it introduces", () => {
  const cs = chunk("These hold:\n- one\n- two\n\nNot a lead-in.\n\n- three\n");
  assert.deepEqual(cs.map((c) => [c.kind, c.start, c.end]), [["list", 1, 3], ["para", 5, 5], ["list", 7, 7]]);
});
