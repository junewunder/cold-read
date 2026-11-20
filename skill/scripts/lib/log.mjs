// The log: what the document has told its reader, chunk by chunk. It is the
// thing the checks run over, and it holds no document text beyond short quotes.

import { norm } from "./check.mjs";

export const kebab = (s) =>
  String(s).toLowerCase().replace(/[`*_"']/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

export function newLog({ reader, knows = [], model }) {
  // cost is what building this log from nothing costs; paid is what this run spent, the rest having come from the cache.
  return { version: 1, reader, knows, model, cost: 0, paid: 0, cached: 0, entries: [], concepts: {}, threads: [] };
}

/** Fold one chunk's events into the log. */
export function applyEvents(log, c, events) {
  const entry = {
    n: c.n, section: c.section, kind: c.kind, start: c.start, end: c.end,
    purpose: events.purpose.trim(),
    concepts: [], opens: [], closes: [], stumbles: events.stumbles ?? [],
    links: (events.links ?? []).map((l) => ({ type: l.type, about: l.about.trim(), stated: l.stated !== false, quote: (l.quote ?? "").trim() })),
  };

  for (let k of events.concepts ?? []) {
    if (!k.id) continue;
    const surface = k.surface.trim();
    // The labeller sometimes gives a thing it has already met a second id
    // ("checkpoint", then "checkpoints"). A name the log already has is that concept.
    if (!log.concepts[k.id]) {
      const name = norm(surface || k.id);
      const twin = Object.values(log.concepts).find((x) => [x.id.replace(/-/g, " "), ...x.surfaces].some((s) => norm(s) === name));
      if (twin) k = { ...k, id: twin.id };
    }
    const known = log.concepts[k.id] ??= {
      id: k.id, surfaces: [], definedAt: null, gloss: "", firstAt: c.n, uses: [],
    };
    if (surface && !known.surfaces.some((s) => s.toLowerCase() === surface.toLowerCase())) {
      known.surfaces.push(surface);
    }
    if (k.event === "defines") {
      // The first explanation is the one the reader carries forward.
      if (!known.definedAt) { known.definedAt = c.n; known.gloss = k.gloss.trim(); }
    } else {
      known.uses.push(c.n);
    }
    const rec = { id: k.id, surface, event: k.event, gloss: k.gloss.trim() };
    // How the chunk explains the term. Only an explanation has a manner.
    if (k.event === "defines") {
      rec.how = k.how || "";
      rec.example = k.example === true;
      rec.on = (k.builds_on ?? []).map((t) => t.trim()).filter(Boolean);
    }
    entry.concepts.push(rec);
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
