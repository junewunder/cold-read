// Length. Almost every fix for a flag adds words, and nothing in the log
// pushes back, so the plan says how long the document and each section may
// be, and this counts. No model is involved.
//
//   Length: 200 lines          (at the top of the plan: the whole document)
//   ## Install
//   Length: 15 lines           (under a heading: that section)
//
// "150-200 lines" means at most 200. The unit is lines or words.

import { norm } from "./check.mjs";

const FENCE = /^\s*(```+|~~~+)/;
const HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
const wordCount = (lines) => lines.join(" ").split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;

/** "200 lines", "at most 1,200 words", "150–200 lines" -> { max, unit }, or null when it can't be read. */
export function parseLength(s) {
  const m = String(s).replace(/,/g, "").match(/(?:(\d+)\s*(?:-|–|to)\s*)?(\d+)\s*(lines?|words?)/i);
  return m ? { max: Number(m[2]), unit: m[3].toLowerCase().startsWith("w") ? "words" : "lines" } : null;
}

/**
 * Count a markdown document. Lines are counted as an editor shows them, blank
 * lines and code included, without trailing blank lines. A section runs from
 * its heading to the next heading of the same or a higher level. The title's
 * section is the opening: the text up to the first heading below it.
 * @returns {{lines:number, words:number, sections:{name:string, level:number, start:number, lines:number, words:number}[]}}
 */
export function measure(markdown) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const trimmed = (from, to) => { while (to > from && lines[to - 1].trim() === "") to--; return to; };
  const heads = [];
  let marker = null;
  lines.forEach((l, i) => {
    if (marker) { if (l.trim().startsWith(marker)) marker = null; return; }
    const f = l.match(FENCE);
    if (f) { marker = f[1][0].repeat(3); return; }
    const h = l.match(HEADING);
    if (h) heads.push({ name: h[2], level: h[1].length, at: i });
  });
  const sections = heads.map((h, k) => {
    const next = heads.slice(k + 1).find((o) => h.level === 1 || o.level <= h.level);
    const end = trimmed(h.at, next ? next.at : lines.length);
    return { name: h.name, level: h.level, start: h.at + 1, lines: end - h.at, words: wordCount(lines.slice(h.at + 1, end)) };
  });
  const end = trimmed(0, lines.length);
  return { lines: end, words: wordCount(lines.slice(0, end)), sections };
}

/** Compare a measured document with the lengths its plan allows. */
export function checkLength(plan, m) {
  const flags = [];
  if (plan.length && m[plan.length.unit] > plan.length.max) {
    flags.push({
      kind: "long", level: "error", n: 0, line: 0,
      message: `The text is ${m[plan.length.unit]} ${plan.length.unit}; the outline allows ${plan.length.max}.`,
    });
  }
  for (const s of plan.sections ?? []) {
    if (!s.length) continue;
    const found = m.sections.find((d) => norm(d.name) === norm(s.name));
    if (!found) {
      flags.push({
        kind: "long", level: "warn", n: 0, line: 0,
        message: `The outline allows "${s.name}" ${s.length.max} ${s.length.unit}, but the text has no heading "${s.name}", so its length was not checked.`,
      });
    } else if (found[s.length.unit] > s.length.max) {
      flags.push({
        kind: "long", level: "error", n: 0, line: found.start,
        message: `"${s.name}" is ${found[s.length.unit]} ${s.length.unit}; the outline allows ${s.length.max}.`,
      });
    }
  }
  return flags;
}

/** Check the plan's lengths against each other, before any text exists. */
export function checkPlanLength(plan) {
  const flags = [];
  const set = (plan.sections ?? []).filter((s) => s.length);
  if (!plan.length && set.length === 0) {
    flags.push({
      kind: "long", level: "warn", n: 0, line: 0,
      message: "The outline sets no length, so nothing will hold the text to one. Add a \"Length:\" line under the reader, and under any section that must stay short.",
    });
    return flags;
  }
  if (!plan.length) return flags;
  const same = set.filter((s) => s.length.unit === plan.length.unit);
  const sum = same.reduce((t, s) => t + s.length.max, 0);
  if (sum > plan.length.max) {
    flags.push({
      kind: "long", level: "error", n: 0, line: plan.length.line,
      message: `The sections' lengths add up to ${sum} ${plan.length.unit}; the whole document is allowed ${plan.length.max}.`,
    });
  }
  return flags;
}
