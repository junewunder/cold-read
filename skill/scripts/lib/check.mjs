// The checks. Each is plain code over the log: no model decides whether a
// flag is raised. A flag is { kind, level, n, line, message, ... }.

/** Lowercase, drop markup and leading articles, and fold simple plurals. */
export function norm(term) {
  return String(term)
    .toLowerCase()
    .replace(/[`*_"'“”‘’]/g, "")
    .replace(/[-_/]+/g, " ")
    .replace(/[^a-z0-9. ]+/g, " ")
    .trim()
    .replace(/^(a|an|the|your|its|each|every|this|that)\s+/, "")
    .split(/\s+/)
    .map((w) => (w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w))
    .join(" ");
}

const STOP = new Set(["of", "and", "to", "for", "in", "on", "with", "before", "after", "by", "or", "a", "an", "the"]);
export const wordsOf = (s) => norm(s).split(" ").filter((w) => w && !STOP.has(w));
// "review" and "reviewer" count as one word.
export const akin = (a, b) => a === b || (Math.min(a.length, b.length) >= 4 && (a.startsWith(b) || b.startsWith(a)));

/** A word without its ending: "lifted", "lifter" and "lifting" are "lift"; "modded" is "mod". */
export function stem(w) {
  let s = w.replace(/(ing|ed|er|es|(?<!s)s)$/, (m) => (w.length - m.length >= 3 ? "" : m));
  // "modded" loses its ending and then its doubled letter; "class" lost nothing and keeps both.
  if (s !== w && s.length > 3 && /([b-df-hj-np-tv-z])\1$/.test(s)) s = s.slice(0, -1);
  if (s.length > 4 && s.endsWith("e")) s = s.slice(0, -1);
  return s;
}
const stemsOf = (s) => wordsOf(s).map(stem);
/** Two names are the same name when they share a content word ("unit of work", "trial units"; "lifter", "lifted code"). */
export const sameName = (a, b) => wordsOf(a).some((x) => wordsOf(b).some((y) => akin(x, y) || stem(x) === stem(y)));

const lineOf = (log, n) => log.entries.find((e) => e.n === n)?.start ?? 0;
const times = (k) => (k === 1 ? "once" : `${k} times`);

/**
 * @param {object} log
 * @param {{mentions?: string[]}} opts names the plan says the text brings up
 *   without explaining. Like what the reader knows, they are never flagged.
 */
export function check(log, { mentions = [] } = {}) {
  const flags = [];
  // What the reader is declared to know is looked up here, not left to the labeller.
  const passed = [...(log.knows ?? []), ...mentions];
  const known = (c) => passed.some((k) => [c.id.replace(/-/g, " "), ...c.surfaces].some((s) => norm(s) === norm(k)));

  for (const c of Object.values(log.concepts)) {
    if (known(c)) continue;
    const name = c.surfaces[0] ?? c.id;
    const early = c.uses.filter((n) => !c.definedAt || n < c.definedAt);
    if (early.length) {
      const first = lineOf(log, early[0]);
      flags.push({
        kind: "undefined", level: "error", n: early[0], line: first, term: name, id: c.id,
        message: c.definedAt
          ? `"${name}" is used at line ${first} but only explained later, at line ${lineOf(log, c.definedAt)}.`
          : `"${name}" is used ${times(c.uses.length)} (first at line ${first}) and never explained.`,
      });
    }

    // One concept, several unrelated names.
    const distinct = [];
    for (const s of c.surfaces) if (!distinct.some((d) => sameName(d, s))) distinct.push(s);
    if (distinct.length > 1) {
      const where = (s) => {
        const e = log.entries.find((e) => e.concepts.some((k) => k.id === c.id && sameName(k.surface, s)));
        return e ? ` (line ${e.start})` : "";
      };
      const e2 = log.entries.find((e) => e.concepts.some((k) => k.id === c.id && sameName(k.surface, distinct[1])));
      flags.push({
        kind: "alias", level: "warn", n: e2?.n ?? c.firstAt, line: e2?.start ?? 0, term: name, id: c.id,
        message: `One thing has ${distinct.length} names: ${distinct.map((s) => `"${s}"${where(s)}`).join(", ")}.`,
      });
    }
  }

  for (const t of log.threads) {
    if (t.closedAt) continue;
    flags.push({
      kind: "open", level: "warn", n: t.openedAt, line: lineOf(log, t.openedAt), quote: t.quote,
      message: `Raises "${t.what}" and nothing later settles it.`,
    });
  }

  for (const e of log.entries) {
    for (const s of e.stumbles) {
      flags.push({ kind: "stumble", level: "warn", n: e.n, line: e.start, quote: s.quote, message: s.why });
    }
    for (const l of e.links ?? []) {
      if (l.type !== "contrast" || l.stated) continue;
      flags.push({
        kind: "contrast", level: "warn", n: e.n, line: e.start, quote: l.quote,
        message: `Sets itself against "${l.about}", which the reader was never given.`,
      });
    }
  }

  return flags.sort((a, b) => a.n - b.n || a.kind.localeCompare(b.kind));
}

/** One name's content words are all in the other's: "tracker" and "the tracker file". */
export const contained = (a, b) => {
  const A = wordsOf(a), B = wordsOf(b);
  return A.length > 0 && B.length > 0 && (A.every((w) => B.includes(w)) || B.every((w) => A.includes(w)));
};
/** The same, with word endings ignored: "lift" and "lifted code". Used to match a plan's terms to the text's. */
export const looseContained = (a, b) => {
  const A = stemsOf(a), B = stemsOf(b);
  return A.length > 0 && B.length > 0 && (A.every((w) => B.includes(w)) || B.every((w) => A.includes(w)));
};
/** Whether the words of `term` all appear in `text`, endings ignored. */
export const appearsIn = (term, text) => {
  const have = new Set(stemsOf(String(text).replace(/[.,;:!?)]+(\s|$)/g, " ")));
  const want = stemsOf(term);
  return want.length > 0 && want.every((w) => have.has(w));
};
const overlap = (a, b) => {
  const A = new Set(wordsOf(a)), B = new Set(wordsOf(b));
  const both = [...A].filter((w) => B.has(w)).length;
  return both / Math.max(1, A.size + B.size - both);
};

/** Whether two flags from different runs point at the same problem. */
export function sameFlag(a, b) {
  if (a.kind !== b.kind) return false;
  if (a.term && b.term) return contained(a.term, b.term);
  if (["dropped", "link", "dangling", "long"].includes(a.kind)) return a.message === b.message;
  if (a.n !== b.n) return false;
  if (a.quote && b.quote) return contained(a.quote, b.quote) || overlap(a.quote, b.quote) >= 0.5;
  return true;
}

/**
 * Whether two flags from different rounds are the same problem. Between rounds
 * the text was edited, so chunk numbers have moved and cannot be compared: a
 * flag is known by its term, or by the words of the document it quotes.
 */
export function sameProblem(a, b) {
  if (a.kind !== b.kind) return false;
  if (a.term && b.term) return contained(a.term, b.term);
  if (a.quote && b.quote) return contained(a.quote, b.quote) || overlap(a.quote, b.quote) >= 0.5;
  return !a.term && !b.term && !a.quote && !b.quote && a.message === b.message;
}

/**
 * The labeller is a sample: the same model on the same text flags a problem in
 * one run and misses it in the next. So read the document several times and
 * merge. Each merged flag carries `seen`, how many of the `of` runs raised it.
 */
export function mergeFlags(perRun) {
  const merged = [];
  perRun.forEach((flags, run) => {
    for (const f of flags) {
      const hit = merged.find((m) => sameFlag(m, f));
      if (hit) hit.runs.add(run);
      else merged.push({ ...f, runs: new Set([run]) });
    }
  });
  return merged
    .map(({ runs, ...f }) => ({ ...f, seen: runs.size, of: perRun.length }))
    .sort((a, b) => a.n - b.n || a.kind.localeCompare(b.kind));
}

/** A term that is unexplained and also absent from the plan is one problem, said once. */
export function foldUnplanned(flags) {
  const out = [];
  for (const f of flags) {
    if (f.kind !== "unplanned") { out.push(f); continue; }
    const twin = flags.find((d) => d.kind === "undefined" && contained(d.term, f.term));
    if (twin) { if (!twin.message.endsWith("plan.")) twin.message += " It is not in the plan."; }
    else out.push(f);
  }
  return out;
}
