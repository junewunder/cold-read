// The log: what the document has told its reader, chunk by chunk. It is the
// thing the checks run over, and it holds no document text beyond short quotes.

export const kebab = (s) =>
  String(s).toLowerCase().replace(/[`*_"']/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

export function newLog({ reader, knows = [], model }) {
  return { version: 1, reader, knows, model, cost: 0, cached: 0, entries: [], concepts: {}, threads: [] };
}

/** Fold one chunk's events into the log. */
export function applyEvents(log, c, events) {
  const entry = {
    n: c.n, section: c.section, kind: c.kind, start: c.start, end: c.end,
    purpose: events.purpose.trim(),
    concepts: [], opens: [], closes: [], stumbles: events.stumbles ?? [],
    links: (events.links ?? []).map((l) => ({ type: l.type, about: l.about.trim(), stated: l.stated !== false, quote: (l.quote ?? "").trim() })),
  };

  for (const k of events.concepts ?? []) {
    if (!k.id) continue;
    const known = log.concepts[k.id] ??= {
      id: k.id, surfaces: [], definedAt: null, gloss: "", firstAt: c.n, uses: [],
    };
    const surface = k.surface.trim();
    if (surface && !known.surfaces.some((s) => s.toLowerCase() === surface.toLowerCase())) {
      known.surfaces.push(surface);
    }
    if (k.event === "defines") {
      // The first explanation is the one the reader carries forward.
      if (!known.definedAt) { known.definedAt = c.n; known.gloss = k.gloss.trim(); }
    } else {
      known.uses.push(c.n);
    }
    entry.concepts.push({ id: k.id, surface, event: k.event, gloss: k.gloss.trim() });
  }

  for (const o of events.opens ?? []) {
    const t = { id: `t${log.threads.length + 1}`, openedAt: c.n, what: o.what.trim(), quote: o.quote.trim(), closedAt: null };
    log.threads.push(t);
    entry.opens.push(t.id);
  }
  for (const id of events.closes ?? []) {
    const t = log.threads.find((t) => t.id === id.trim() && !t.closedAt && t.openedAt < c.n);
    if (t) { t.closedAt = c.n; entry.closes.push(t.id); }
  }

  log.entries.push(entry);
  return log;
}
