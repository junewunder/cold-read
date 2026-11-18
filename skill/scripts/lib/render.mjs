// Turn the log and the flags into things a person reads.

/** The log as an outline, in the plan format (see plan.mjs), so it can be edited into a plan. */
export function outline(log, docName, { lengths = null } = {}) {
  const out = [`# Outline: ${docName}`, "", `Reader: ${log.reader}`];
  if (log.knows?.length) out.push(`Knows: ${log.knows.join(", ")}`);
  if (lengths) out.push(`Length: ${lengths.lines} lines`);
  let section = null, i = 0;
  for (const e of log.entries) {
    if (e.section !== section) {
      section = e.section;
      out.push("", `## ${section || "(top)"}`);
      // The section this part sits in is the last heading at or above it.
      const here = lengths?.sections.filter((s) => s.start <= e.start).at(-1);
      if (here) out.push(`Length: ${here.lines} lines`);
      out.push("");
    }
    const lines = e.start === e.end ? `line ${e.start}` : `lines ${e.start}–${e.end}`;
    const purpose = e.purpose.charAt(0).toUpperCase() + e.purpose.slice(1).replace(/\.$/, "");
    out.push(`${++i}. ${purpose}. (${lines})`);
    for (const k of e.concepts) {
      const c = log.concepts[k.id];
      if (k.event === "defines") {
        out.push(`   - defines: ${k.surface}${k.gloss ? ` — ${k.gloss}` : ""}`);
      } else {
        const unknown = !c.definedAt || c.definedAt > e.n;
        out.push(`   - uses: ${k.surface}${unknown ? " ⚠ not explained yet" : ""}`);
      }
    }
    for (const l of e.links ?? []) {
      const key = { contrast: "contrasts", reason: "because", example: "example of" }[l.type];
      out.push(`   - ${key}: ${l.about}${l.stated ? "" : " ⚠ never stated"}`);
    }
    for (const id of e.opens) out.push(`   - opens: ${log.threads.find((t) => t.id === id).what}`);
    for (const id of e.closes) out.push(`   - closes: ${log.threads.find((t) => t.id === id).what}`);
  }
  return out.join("\n") + "\n";
}

const TITLES = {
  long: "Longer than the plan allows",
  undefined: "Used before it is explained",
  missing: "In the plan, missing from the text",
  dropped: "Plan points the text does not carry out",
  alias: "One thing, several names",
  open: "Raised and never settled",
  contrast: "A contrast with nothing on the other side",
  dangling: "Plan links that point at nothing",
  link: "Planned links the text does not make",
  stumble: "Places the reader cannot follow",
  unplanned: "In the text, not in the plan",
  extra: "Parts of the text the plan does not have",
};

const ordinal = (k) => ["first", "second", "third", "fourth", "fifth"][k - 1] ?? `${k}th`;

/** Where the rounds stand, in a sentence the writer can act on. */
function standing(round, runs) {
  const who = runs > 1 ? "two or more readings raised" : "this reading raised";
  if (!round.quiet) {
    return `Not done: ${round.agreed} ${round.agreed === 1 ? "flag" : "flags"} below that ${who} ${round.agreed === 1 ? "is" : "are"} still standing. Fix each one or leave it with a reason.`;
  }
  if (round.streak >= 2) {
    return `Done: this is the ${ordinal(round.streak)} quiet round running. Leave the single-reading flags that remain.`;
  }
  return runs > 1
    ? "Quiet round: no flag that two or more readings raised is still standing. Go through the single-reading flags once. If you change nothing, the cold read is done; if you edit the text, run one more round."
    : "Quiet round: nothing is still standing. The cold read is done.";
}

/**
 * @param {object[]} flags the flags still standing
 * @param {object} o plan, planOnly, runs, cost (from nothing), paid (this run), cached, left (flags left earlier), round, lengths
 */
export function report(flags, log, docName, { plan = null, planOnly = false, runs = 1, cost = log.cost, paid = cost, cached = log.cached, left = [], round = null, lengths = null } = {}) {
  const errors = flags.filter((f) => f.level === "error").length;
  if (planOnly) {
    const out = [`# Plan check: ${docName}`, "", `${log.entries.length} points, for: ${log.reader}`, `${flags.length} flags (${errors} errors). Line numbers are lines of the plan.`];
    return out.concat(groups(flags)).join("\n") + "\n";
  }
  const readings = log.entries.length * runs;
  const out = [
    `# Cold read: ${docName}`,
    "",
    `${log.entries.length} chunks read as: ${log.reader}`,
    "",
    (round ? `Round ${round.n}: ` : "") +
      `${flags.length} flags (${errors} errors, ${flags.length - errors} warnings)` +
      (round?.fresh != null ? `, ${round.fresh} of them new since the last round` : "") +
      (left.length ? `. ${left.length} more ${left.length === 1 ? "was" : "were"} left earlier and ${left.length === 1 ? "is" : "are"} listed at the end` : "") +
      (plan ? `. Checked against a plan of ${plan.points.length} points.` : "."),
    `Read ${runs === 1 ? "once" : `${runs} times`} on ${log.model}. ` +
      (cached
        ? `This run cost $${paid.toFixed(2)}: ${cached} of ${readings} chunk readings came from the cache. Reading it all from nothing costs $${cost.toFixed(2)}.`
        : `This run cost $${paid.toFixed(2)}; nothing came from the cache.`),
  ];
  if (lengths) out.push(`Length: ${lengths.lines} lines, ${lengths.words} words` + (plan?.length ? ` (the plan allows ${plan.length.max} ${plan.length.unit}).` : "."));
  if (round) out.push("", standing(round, runs));
  out.push(...groups(flags));
  if (flags.length) out.push("", `To leave a flag as it is: cold-read leave ${docName} <id> "<why>". It will not be raised again.`);
  if (left.length) {
    out.push("", `## Left earlier (${left.length})`, "");
    for (const f of left) out.push(`- ${f.line ? `line ${f.line}: ` : ""}${f.message} Left because: ${f.reason}`);
  }
  return out.join("\n") + "\n";
}

function groups(flags) {
  const out = [];
  for (const kind of Object.keys(TITLES)) {
    const group = flags.filter((f) => f.kind === kind);
    if (!group.length) continue;
    out.push("", `## ${TITLES[kind]} (${group.length})`, "");
    // Flags that every run raised come first: they are the surest.
    for (const f of [...group].sort((a, b) => (b.seen ?? 1) - (a.seen ?? 1) || a.n - b.n)) {
      const id = f.id ? `[${f.id}] ` : "";
      const at = f.line ? `line ${f.line}: ` : "";
      const notes = [f.of > 1 ? `${f.seen} of ${f.of} readings` : "", f.new ? "new" : ""].filter(Boolean).join(", ");
      out.push(`- ${id}${at}${f.message}${f.quote ? ` Text: "${f.quote.replace(/\s+/g, " ")}"` : ""}${notes ? ` (${notes})` : ""}`);
    }
  }
  if (!flags.length) out.push("", "Nothing flagged.");
  return out;
}
