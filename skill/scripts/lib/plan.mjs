// The plan: the outline a writer commits to before writing, in a format a
// person can read and edit. An outline extracted from a finished document is
// written in the same format, so either can be edited into the other.
//
//   # Plan: README.md
//
//   Reader: someone who has never seen the project.
//   Knows: git, Claude Code, skill
//
//   ## Install
//   1. Say how to install it.
//      - defines: toy factory
//      - uses: skill, unit
//      - opens: what the questions are
//      - closes: where questions collect

import { norm, sameName } from "./check.mjs";

const KEYS = ["defines", "uses", "opens", "closes"];

export const splitList = (s) => String(s).split(",").map((t) => t.trim()).filter(Boolean);

export function parsePlan(text) {
  const plan = { title: "", reader: "", knows: [], points: [] };
  let section = "", point = null, inReader = false;

  for (const raw of text.replace(/\r\n/g, "\n").split("\n")) {
    const line = raw.trimEnd();
    let m;
    if ((m = line.match(/^#\s+(?:Plan|Outline):?\s*(.*)$/i))) { plan.title = m[1]; inReader = false; continue; }
    if ((m = line.match(/^#{2,6}\s+(.*)$/))) { section = m[1].trim(); point = null; inReader = false; continue; }
    if ((m = line.match(/^Reader:\s*(.*)$/i))) { plan.reader = m[1].trim(); inReader = true; continue; }
    if ((m = line.match(/^Knows:\s*(.*)$/i))) { plan.knows = splitList(m[1]); inReader = false; continue; }
    if ((m = line.match(/^\d+[.)]\s+(.*)$/))) {
      point = { n: plan.points.length + 1, section, text: m[1].replace(/\s*\(lines? [\d–-]+\)\s*$/, "").trim(), defines: [], uses: [], opens: [], closes: [] };
      plan.points.push(point);
      inReader = false;
      continue;
    }
    if (point && (m = line.match(/^\s+[-*]\s+(\w+):\s*(.*)$/)) && KEYS.includes(m[1].toLowerCase())) {
      const key = m[1].toLowerCase();
      let value = m[2].replace(/\s*⚠.*$/, "").trim();
      if (key === "opens" || key === "closes") { if (value) point[key].push(value); continue; }
      // "term — gloss" names one concept; otherwise a comma-separated list.
      const terms = value.includes(" — ") ? [value.split(" — ")[0]] : value.split(",");
      for (const t of terms) if (t.trim()) point[key].push(t.trim());
      continue;
    }
    if (inReader && line.trim() && !line.startsWith("#")) { plan.reader += " " + line.trim(); continue; }
    if (line.trim() === "") inReader = false;
  }
  return plan;
}

const conceptNames = (c) => [c.id.replace(/-/g, " "), ...c.surfaces];
const matches = (term, c) => conceptNames(c).some((name) => norm(name) === norm(term) || sameName(name, term));

/**
 * Compare a plan with the log of the text written from it.
 * `pointMatch` (optional) maps plan point number -> chunk numbers that carry it out.
 */
export function diffPlan(plan, log, pointMatch = null) {
  const flags = [];
  const concepts = Object.values(log.concepts);
  const line = (n) => log.entries.find((e) => e.n === n)?.start ?? 0;

  for (const p of plan.points) {
    for (const term of p.defines) {
      const c = concepts.find((c) => matches(term, c));
      if (!c || !c.definedAt) {
        flags.push({
          kind: "missing", level: "error", n: c?.firstAt ?? 0, line: c ? line(c.firstAt) : 0, term,
          message: c
            ? `The plan says "${term}" gets explained (point ${p.n}); the text uses it and never explains it.`
            : `The plan says "${term}" gets explained (point ${p.n}); the text never brings it up.`,
        });
      }
    }
  }

  const planned = plan.points.flatMap((p) => [...p.defines, ...p.uses]);
  for (const c of concepts) {
    if (planned.some((t) => matches(t, c))) continue;
    if ((log.knows ?? []).some((t) => conceptNames(c).some((name) => norm(name) === norm(t)))) continue;
    const name = c.surfaces[0] ?? c.id;
    flags.push({
      kind: "unplanned", level: "warn", n: c.firstAt, line: line(c.firstAt), term: name, id: c.id,
      message: `The text brings in "${name}", which is not in the plan.`,
    });
  }

  if (pointMatch) {
    const covered = new Set();
    for (const p of plan.points) {
      const chunks = (pointMatch[p.n] ?? []).filter((n) => log.entries.some((e) => e.n === n));
      chunks.forEach((n) => covered.add(n));
      if (chunks.length === 0) {
        flags.push({
          kind: "dropped", level: "error", n: 0, line: 0,
          message: `Plan point ${p.n} (${p.section || "top"}: "${p.text}") is not carried out anywhere in the text.`,
        });
      }
    }
    for (const e of log.entries) {
      if (covered.has(e.n)) continue;
      flags.push({
        kind: "extra", level: "warn", n: e.n, line: e.start,
        message: `Not in the plan: this part "${e.purpose}".`,
      });
    }
  }

  return flags;
}

/** The plan points and the log's purposes, as the point-matcher sees them. */
export function matchPrompt(plan, log) {
  const points = plan.points.map((p) => `P${p.n} [${p.section || "top"}] ${p.text}`).join("\n");
  const parts = log.entries.map((e) => `C${e.n} [${e.section || "top"}] ${e.purpose}`).join("\n");
  return `A writer planned a document as a list of points, then wrote it. Below are the planned points and, separately, a list of what each part of the finished text does. For every planned point, list the numbers of the parts that carry it out. A point may take several parts or none. A part that supports, illustrates or adds detail to a point serves that point. Match on what is done, not on wording, and leave a point empty when no part does it.\n\n<planned_points>\n${points}\n</planned_points>\n\n<parts_of_the_text>\n${parts}\n</parts_of_the_text>`;
}

export const MATCH_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["matches"],
  properties: {
    matches: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["point", "parts"],
        properties: { point: { type: "integer" }, parts: { type: "array", items: { type: "integer" } } },
      },
    },
  },
};
