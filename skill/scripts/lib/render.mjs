// Turn the log and the flags into things a person reads.

/** The log as an outline, in the plan format (see plan.mjs), so it can be edited into a plan. */
export function outline(log, docName) {
  const out = [`# Outline: ${docName}`, "", `Reader: ${log.reader}`];
  if (log.knows?.length) out.push(`Knows: ${log.knows.join(", ")}`);
  let section = null, i = 0;
  for (const e of log.entries) {
    if (e.section !== section) {
      section = e.section;
      out.push("", `## ${section || "(top)"}`, "");
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
    for (const id of e.opens) out.push(`   - opens: ${log.threads.find((t) => t.id === id).what}`);
    for (const id of e.closes) out.push(`   - closes: ${log.threads.find((t) => t.id === id).what}`);
  }
  return out.join("\n") + "\n";
}

const TITLES = {
  undefined: "Used before it is explained",
  missing: "In the plan, missing from the text",
  dropped: "Plan points the text does not carry out",
  alias: "One thing, several names",
  open: "Raised and never settled",
  stumble: "Places the reader cannot follow",
  unplanned: "In the text, not in the plan",
  extra: "Parts of the text the plan does not have",
};

export function report(flags, log, docName, { plan = null } = {}) {
  const errors = flags.filter((f) => f.level === "error").length;
  const out = [
    `# Cold read: ${docName}`,
    "",
    `${log.entries.length} chunks read as: ${log.reader}`,
    `${flags.length} flags (${errors} errors, ${flags.length - errors} warnings)` +
      (plan ? `, checked against a plan of ${plan.points.length} points` : "") +
      `. Labelled on ${log.model}; $${log.cost.toFixed(3)} from scratch` +
      (log.cached ? `, ${log.cached} chunks reused from the cache.` : "."),
  ];
  for (const kind of Object.keys(TITLES)) {
    const group = flags.filter((f) => f.kind === kind);
    if (!group.length) continue;
    out.push("", `## ${TITLES[kind]} (${group.length})`, "");
    for (const f of group) {
      const at = f.line ? `line ${f.line}: ` : "";
      out.push(`- ${at}${f.message}${f.quote ? ` Text: "${f.quote}"` : ""}`);
    }
  }
  if (!flags.length) out.push("", "Nothing flagged.");
  return out.join("\n") + "\n";
}
