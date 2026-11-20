// The plan: the outline a writer commits to before writing, in a format a
// person can read and edit. An outline extracted from a finished document is
// written in the same format, so either can be edited into the other.
//
//   # Plan: README.md
//
//   Reader: someone who has never seen the project.
//   Knows: git, Claude Code, skill
//   Length: 120 lines
//
//   ## Install
//   Length: 15 lines
//   1. Say how to install it.
//      - defines: toy factory
//      - uses: skill, unit
//      - mentions: Homebrew
//      - opens: what the questions are
//      - closes: where questions collect
//      - contrasts: point 4
//      - because: a bad unit would otherwise be built on
//      - example of: unit
//
// "mentions:" lists names the point brings up without explaining, which the
// reader is not expected to know and the text must not lean on. The last three
// keys are links: ties from this point to something else. A contrast needs its
// other side to exist, so "contrasts:" names another point or a term. Points
// are numbered through the whole plan, not per section, whatever numbers are
// written: "point 5" is the fifth numbered line.

import { norm, contained, looseContained, appearsIn, check } from "./check.mjs";
import { newLog, applyEvents, kebab } from "./log.mjs";
import { parseLength, checkPlanLength } from "./length.mjs";

const KEYS = ["defines", "uses", "mentions", "opens", "closes"];

// How a point introduces a term, written in brackets after it under "defines:":
//   - defines: unit (paragraph, by example), lane (gloss, builds on unit)
// One size (gloss, sentence, paragraph, formal), and any of "by example" and
// "builds on <term> and <term>". The blind reader records the same three
// things about every explanation it meets, so code can compare them.
const SIZES = { gloss: "gloss", "in passing": "gloss", sentence: "sentence", "own sentence": "sentence", paragraph: "paragraph", "own paragraph": "paragraph", formal: "formal", "formal definition": "formal" };
const HOW = { gloss: "in passing, as a gloss", sentence: "in a sentence of its own", paragraph: "in a paragraph of its own", formal: "as a formal definition" };

/** The words in the brackets as { how, example, on }, or null when they are not a manner (and so are part of the term). */
export function parseManner(inner) {
  const m = { how: "", example: false, on: [] };
  for (const raw of inner.split(",").map((t) => t.trim()).filter(Boolean)) {
    const item = raw.toLowerCase();
    let b;
    if (SIZES[item]) m.how = SIZES[item];
    else if (/^(by |with an? |with )?examples?$/.test(item)) m.example = true;
    else if ((b = raw.match(/^(?:builds on|building on|from)\s+(.+)$/i))) m.on.push(...b[1].split(/\s+and\s+/).map((t) => t.trim()).filter(Boolean));
    else return null;
  }
  return m.how || m.example || m.on.length ? m : null;
}

/** A manner as it is written in an outline: " (gloss, by example, builds on unit)", or "" when there is none. */
export function mannerText(m) {
  const parts = [m.how, m.example ? "by example" : "", m.on?.length ? `builds on ${m.on.join(" and ")}` : ""].filter(Boolean);
  return parts.length ? ` (${parts.join(", ")})` : "";
}

/** Split on the commas that are not inside brackets. */
function splitTerms(s) {
  const out = [];
  let depth = 0, cur = "";
  for (const ch of s) {
    if (ch === "(") depth++;
    if (ch === ")") depth = Math.max(0, depth - 1);
    if (ch === "," && depth === 0) { out.push(cur); cur = ""; } else cur += ch;
  }
  out.push(cur);
  return out.map((t) => t.trim()).filter(Boolean);
}
const LINK_KEYS = { contrasts: "contrast", because: "reason", "example of": "example" };

export const splitList = (s) => String(s).split(",").map((t) => t.trim()).filter(Boolean);

export function parsePlan(text) {
  const plan = { title: "", reader: "", knows: [], length: null, sections: [], points: [] };
  let section = "", point = null, inReader = false;

  let lineNo = 0;
  for (const raw of text.replace(/\r\n/g, "\n").split("\n")) {
    const line = raw.trimEnd();
    lineNo++;
    let m;
    if ((m = line.match(/^#\s+(?:Plan|Outline):?\s*(.*)$/i))) { plan.title = m[1]; inReader = false; continue; }
    if ((m = line.match(/^#{2,6}\s+(.*)$/))) {
      section = m[1].trim(); point = null; inReader = false;
      plan.sections.push({ name: section, line: lineNo, length: null });
      continue;
    }
    if ((m = line.match(/^Length:\s*(.*)$/i))) {
      const length = parseLength(m[1]);
      if (length) {
        if (plan.sections.length) plan.sections.at(-1).length = { ...length, line: lineNo };
        else plan.length = { ...length, line: lineNo };
      }
      inReader = false;
      continue;
    }
    if ((m = line.match(/^Reader:\s*(.*)$/i))) { plan.reader = m[1].trim(); inReader = true; continue; }
    if ((m = line.match(/^Knows:\s*(.*)$/i))) { plan.knows = splitList(m[1]); inReader = false; continue; }
    if ((m = line.match(/^\d+[.)]\s+(.*)$/))) {
      point = { n: plan.points.length + 1, section, line: lineNo, text: m[1].replace(/\s*\(lines? [\d–-]+\)\s*$/, "").trim(), defines: [], uses: [], mentions: [], opens: [], closes: [], links: [], manners: [] };
      plan.points.push(point);
      inReader = false;
      continue;
    }
    if (point && (m = line.match(/^\s+[-*]\s+([\w ]+?):\s*(.*)$/)) && LINK_KEYS[m[1].toLowerCase()]) {
      point.links.push({ type: LINK_KEYS[m[1].toLowerCase()], about: m[2].replace(/\s*⚠.*$/, "").trim() });
      continue;
    }
    if (point && (m = line.match(/^\s+[-*]\s+(\w+):\s*(.*)$/)) && KEYS.includes(m[1].toLowerCase())) {
      const key = m[1].toLowerCase();
      let value = m[2].replace(/\s*⚠.*$/, "").trim();
      if (key === "opens" || key === "closes") { if (value) point[key].push(value); continue; }
      // "term — gloss" names one concept; otherwise a comma-separated list.
      const terms = value.includes(" — ") ? [value.split(" — ")[0].trim()] : splitTerms(value);
      for (let t of terms) {
        const b = key === "defines" && t.match(/^(.*\S)\s*\(([^()]*)\)$/);
        const manner = b && parseManner(b[2]);
        if (manner) { t = b[1]; point.manners.push({ term: t, ...manner }); }
        if (t) point[key].push(t);
      }
      continue;
    }
    if (inReader && line.trim() && !line.startsWith("#")) { plan.reader += " " + line.trim(); continue; }
    if (line.trim() === "") inReader = false;
  }
  return plan;
}

const conceptNames = (c) => [c.id.replace(/-/g, " "), ...c.surfaces];
// Word endings are ignored here: a plan that says "lift" is matched by a text that says "lifted".
const matches = (term, c) => conceptNames(c).some((name) => norm(name) === norm(term) || looseContained(name, term));
const allMentions = (plan) => plan.points.flatMap((p) => p.mentions ?? []);

/**
 * The plan is itself a log: each point is an entry that explains terms, relies
 * on terms, and opens and closes threads. So the checks that run on a text's
 * log run on the plan too, before a word of the text exists.
 */
export function planAsLog(plan) {
  const log = newLog({ reader: plan.reader, knows: plan.knows, model: "plan" });
  const term = (t, event) => ({ id: kebab(norm(t)), surface: t, event, gloss: "" });
  for (const p of plan.points) {
    const closes = p.closes
      .map((what) => log.threads.find((t) => !t.closedAt && (norm(t.what) === norm(what) || contained(t.what, what)))?.id)
      .filter(Boolean);
    applyEvents(log, { n: p.n, section: p.section, kind: "point", start: p.line, end: p.line }, {
      purpose: p.text,
      // A term an explanation builds on is a term the point relies on.
      concepts: [...p.defines.map((t) => term(t, "defines")), ...[...p.uses, ...(p.manners ?? []).flatMap((m) => m.on)].map((t) => term(t, "uses"))],
      opens: p.opens.map((what) => ({ what, quote: what })),
      closes,
      links: p.links.map((l) => ({ ...l, stated: true, quote: "" })),
      stumbles: [],
    });
  }
  return log;
}

/** Check a plan on its own. Line numbers in the flags are lines of the plan file. */
export function checkPlan(plan) {
  const log = planAsLog(plan);
  // A mention is not an event in the plan's log, so a point that relies on a
  // name the plan only mentions is flagged like any other unexplained term.
  const flags = [...check(log), ...checkPlanLength(plan)];
  const terms = [...plan.knows, ...plan.points.flatMap((p) => [...p.defines, ...p.uses, ...(p.mentions ?? [])])];

  for (const p of plan.points) {
    for (const what of p.closes) {
      const opened = plan.points.some((q) => q.n < p.n && q.opens.some((o) => norm(o) === norm(what) || contained(o, what)));
      if (!opened) {
        flags.push({ kind: "dangling", level: "error", n: p.n, line: p.line, message: `Point ${p.n} closes "${what}", which no earlier point opens.` });
      }
    }
    for (const l of p.links) {
      if (l.type !== "contrast") continue;
      const ref = l.about.match(/^point (\d+)$/i);
      const found = ref ? plan.points.some((q) => q.n === Number(ref[1]) && q.n !== p.n) : terms.some((t) => norm(t) === norm(l.about) || contained(t, l.about));
      if (!found) {
        flags.push({
          kind: "dangling", level: "error", n: p.n, line: p.line,
          message: `Point ${p.n} contrasts with "${l.about}", which is not a point or a term in the outline.`,
        });
      }
    }
  }
  return { log, flags: flags.sort((a, b) => a.n - b.n || a.kind.localeCompare(b.kind)) };
}

/**
 * Compare a plan with the log of the text written from it.
 * `pointMatch` (optional) maps plan point number -> chunk numbers that carry it out.
 * `text` (optional) is the document, used only to look a planned term up in it.
 */
export function diffPlan(plan, log, pointMatch = null, text = "") {
  const flags = [];
  const concepts = Object.values(log.concepts);
  const line = (n) => log.entries.find((e) => e.n === n)?.start ?? 0;

  for (const p of plan.points) {
    for (const term of p.defines) {
      // Prefer a concept the text explains: "lifter" explained and "lifted code" used both match "lift".
      const found = concepts.filter((c) => matches(term, c));
      const c = found.find((c) => c.definedAt) ?? found[0];
      // The words are in the text and the reader never noted them as a term:
      // they read as ordinary words, and no reader is left short.
      if (!c && appearsIn(term, text)) continue;
      if (!c || !c.definedAt) {
        flags.push({
          kind: "missing", level: "error", n: c?.firstAt ?? 0, line: c ? line(c.firstAt) : 0, term,
          message: c
            ? `The outline says "${term}" gets explained (point ${p.n}); the text uses it and never explains it.`
            : `The outline says "${term}" gets explained (point ${p.n}); the text never brings it up.`,
        });
        continue;
      }
      // Where the text explains the term, and how. This is what stops a term
      // being "explained" by a gloss dropped in wherever a flag pointed.
      const chunks = (pointMatch?.[p.n] ?? []).filter((n) => log.entries.some((e) => e.n === n));
      if (chunks.length === 0) continue;
      const ids = found.map((c) => c.id);
      const defs = log.entries.flatMap((e) => e.concepts.filter((k) => k.event === "defines" && ids.includes(k.id)).map((k) => ({
        // The reader sometimes notes an example as a link and not on the explanation; either counts.
        ...k, n: e.n, line: e.start, example: k.example || (e.links ?? []).some((l) => l.type === "example"),
      })));
      const here = defs.filter((d) => chunks.includes(d.n));
      const first = defs[0];
      const asHow = (d) => (HOW[d.how] ? ` ${HOW[d.how]}` : "");
      if (here.length === 0) {
        flags.push({
          kind: "misplaced", level: "error", n: first.n, line: first.line, term,
          message: `The outline has point ${p.n} ("${p.text}") explain "${term}". The text explains it here${asHow(first)}, which is not part of that point.`,
        });
        continue;
      }
      // A term may be given to two points: glossed in one, defined in full in another.
      const others = plan.points.filter((q) => q !== p && q.defines.some((t) => norm(t) === norm(term))).flatMap((q) => pointMatch?.[q.n] ?? []);
      if (first.n < here[0].n && !others.includes(first.n)) {
        flags.push({
          kind: "misplaced", level: "error", n: first.n, line: first.line, term,
          message: `"${term}" is explained here${asHow(first)}, before the point the outline has introduce it (point ${p.n}, line ${here[0].line}).`,
        });
      }
      const want = (p.manners ?? []).find((m) => norm(m.term) === norm(term));
      if (!want) continue;
      const namesOf = (t) => [t, ...concepts.filter((c) => matches(t, c)).flatMap(conceptNames)];
      const misses = (d) => [
        want.how && d.how && d.how !== want.how ? `${HOW[want.how]} (the text explains it ${HOW[d.how]})` : "",
        want.example && !d.example ? "with an example (the text gives none)" : "",
        ...want.on.filter((t) => !(d.on ?? []).some((o) => namesOf(t).some((name) => norm(name) === norm(o) || looseContained(name, o))))
          .map((t) => `building on "${t}" (the explanation does not)`),
      ].filter(Boolean);
      // Any explanation inside the point that is made the way the plan asks will do.
      const best = here.map((d) => ({ d, miss: misses(d) })).sort((a, b) => a.miss.length - b.miss.length)[0];
      if (best.miss.length) {
        flags.push({
          kind: "manner", level: "error", n: best.d.n, line: best.d.line, term,
          message: `The outline asks for "${term}" to be explained ${best.miss.join("; ")}.`,
        });
      }
    }
  }

  const planned = plan.points.flatMap((p) => [...p.defines, ...p.uses, ...(p.mentions ?? [])]);
  for (const c of concepts) {
    if (planned.some((t) => matches(t, c))) continue;
    if ((log.knows ?? []).some((t) => conceptNames(c).some((name) => norm(name) === norm(t)))) continue;
    const name = c.surfaces[0] ?? c.id;
    flags.push({
      kind: "unplanned", level: "warn", n: c.firstAt, line: line(c.firstAt), term: name, id: c.id,
      message: `The text brings in "${name}", which is not in the outline.`,
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
          message: `Outline point ${p.n} (${p.section || "top"}: "${p.text}") is not carried out anywhere in the text.`,
        });
        continue;
      }
      // A link the plan asks for must show up in the text that carries the point out.
      const made = log.entries.filter((e) => chunks.includes(e.n)).flatMap((e) => e.links ?? []);
      for (const l of p.links ?? []) {
        if (made.some((m) => m.type === l.type && (l.type !== "contrast" || m.stated))) continue;
        const want = { contrast: `contrasts with "${l.about}"`, reason: `gives a reason ("${l.about}")`, example: `gives an example of "${l.about}"` }[l.type];
        flags.push({
          kind: "link", level: "error", n: chunks[0], line: log.entries.find((e) => e.n === chunks[0]).start,
          message: `Outline point ${p.n} ${want}; the text for it does not.`,
        });
      }
    }
    for (const e of log.entries) {
      if (covered.has(e.n)) continue;
      flags.push({
        kind: "extra", level: "warn", n: e.n, line: e.start,
        message: `Not in the outline: this part "${e.purpose}".`,
      });
    }
  }

  return flags;
}

/** The plan points and the log's purposes, as the point-matcher sees them. */
export { allMentions };

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
