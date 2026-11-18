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
const wordsOf = (s) => norm(s).split(" ").filter((w) => w && !STOP.has(w));
// "review" and "reviewer" count as one word.
const akin = (a, b) => a === b || (Math.min(a.length, b.length) >= 4 && (a.startsWith(b) || b.startsWith(a)));
/** Two names are the same name when they share a content word ("unit of work", "trial units"). */
export const sameName = (a, b) => wordsOf(a).some((x) => wordsOf(b).some((y) => akin(x, y)));

const lineOf = (log, n) => log.entries.find((e) => e.n === n)?.start ?? 0;
const times = (k) => (k === 1 ? "once" : `${k} times`);

export function check(log) {
  const flags = [];
  // What the reader is declared to know is looked up here, not left to the labeller.
  const known = (c) => (log.knows ?? []).some((k) => [c.id.replace(/-/g, " "), ...c.surfaces].some((s) => norm(s) === norm(k)));

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
  }

  return flags.sort((a, b) => a.n - b.n || a.kind.localeCompare(b.kind));
}
