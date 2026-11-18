// The labeller reads forward one chunk at a time, and it is poor at noticing
// that a later chunk answers something an earlier one raised. This pass looks
// at the whole log once and closes the threads that were in fact settled. It
// sees the log only: what each chunk does and what it explains, never the text.

export function settlePrompt(log) {
  const open = log.threads.filter((t) => !t.closedAt);
  const threads = open.map((t) => `${t.id} (raised in part ${t.openedAt} by "${t.quote.replace(/\s+/g, " ")}"): ${t.what}`).join("\n");
  const parts = log.entries
    .map((e) => {
      const gave = e.concepts.filter((k) => k.event === "defines").map((k) => `${k.surface}: ${k.gloss}`);
      return `part ${e.n} [${e.section || "top"}] ${e.purpose}${gave.length ? ` Explains ${gave.join("; ")}` : ""}`;
    })
    .join("\n");
  return `Below is a record of a document, part by part: what each part does and what it explains. Then a list of things an earlier part made the reader expect or wonder about. For each one, give the number of the first LATER part that settles it: delivers the promised thing, or answers the question. Give 0 when no later part does. Be strict: a part settles a thread only if the record shows it addressing that very thing, not merely the same topic.\n\n<record>\n${parts}\n</record>\n\n<threads>\n${threads}\n</threads>`;
}

export const SETTLE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["threads"],
  properties: {
    threads: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "settled_by"],
        properties: { id: { type: "string" }, settled_by: { type: "integer" } },
      },
    },
  },
};

/** Close the threads the pass says were settled. A thread can only be settled by a later part. */
export function applySettled(log, answers) {
  for (const a of answers) {
    const t = log.threads.find((t) => t.id === a.id && !t.closedAt);
    const entry = log.entries.find((e) => e.n === a.settled_by);
    if (!t || !entry || entry.n <= t.openedAt) continue;
    t.closedAt = entry.n;
    entry.closes.push(t.id);
  }
  return log;
}
