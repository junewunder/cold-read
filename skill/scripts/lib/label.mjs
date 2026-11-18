// The blind reader. It reads one chunk at a time and records what the chunk
// does to the reader's knowledge. It is given the log so far and the two
// chunks before this one (to resolve "this" and "that"), and never anything
// later, so it cannot know more than a real first-time reader would.

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { newLog, applyEvents, kebab } from "./log.mjs";

export const PROMPT_VERSION = 7;

const SYSTEM = `You read a document on behalf of one specific reader, one chunk at a time, in order. You record what each chunk does to that reader's knowledge. Your records become a log that is checked by a program, so follow the definitions below exactly.

You are given: the reader, the log so far, the one or two chunks just before this one, and the current chunk. You have NOT seen the rest of the document. Never guess what it says later, and never use knowledge of the subject that the reader would not have. If the reader's background and the log do not explain something, then the reader does not know it.

Record these for the current chunk only:

purpose: what this chunk does for the reader, as one short clause starting with a verb ("says what the tool is", "lists the install requirements").

concepts: each named thing in this chunk that the reader does NOT already know from their background: a term the document coins or uses in its own sense, a component, a command, a file, a role, a product. Leave out ordinary words, anything the reader's background covers, a file or link that the chunk only points to for more detail, and a word the text only quotes or mentions as an example, where the reader is not expected to know what it means. Text inside a code fence is a command, sample output or an example file: a term that appears only inside a fence is not a concept, and nothing inside a fence is a stumble. For each one:
- id: if it is the same thing as a concept already in the log, use that id, even when this chunk calls it by a different name. Otherwise a new short lowercase id.
- surface: the name as this chunk writes it: a noun phrase of one to four words ("tracker", not "the tracker that records units"). A clause or a verb phrase ("more are opt-in", "reviews the branch") is not a concept.
- event: "defines" only if this chunk SAYS what the thing is or does: a definition, an example, a gloss in brackets or after a comma, or a link's own description. "uses" if the chunk relies on the reader knowing it. If you can only guess the meaning from how the sentence uses the word ("a lane claims the next unit from the tracker" does not say what a tracker is), that is "uses".
- gloss: for "defines", what the reader now knows about it, in at most 20 words, taken from this chunk only. For "uses", an empty string.
A concept the log marks "used, never explained" stays unknown to the reader until some chunk defines it.

opens: a thing this chunk makes the reader expect or wonder about and does not itself settle: a promise that something exists or comes later, or a question the wording raises and leaves open ("with a git remote" — and without one?). Only things a careful reader would be bothered by if the document never came back to them. A link to another document settles what it points to. An unexplained term is a "uses" concept, not a thread. Most chunks open nothing. Give "what" (the expectation, a few words) and "quote" (the words that raise it).

closes: ids of open threads in the log that this chunk settles.

stumbles: places where this reader cannot tell what is meant: "this", "that" or "it" with no clear referent; a contrast with something the document never stated; a statement that disagrees with the log. Give "quote" (the exact words) and "why" (one sentence). Most chunks have none. A concept the reader does not know is NOT a stumble; it is a "uses" concept.`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["purpose", "concepts", "opens", "closes", "stumbles"],
  properties: {
    purpose: { type: "string" },
    concepts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "surface", "event", "gloss"],
        properties: {
          id: { type: "string" },
          surface: { type: "string" },
          event: { type: "string", enum: ["defines", "uses"] },
          gloss: { type: "string" },
        },
      },
    },
    opens: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["what", "quote"],
        properties: { what: { type: "string" }, quote: { type: "string" } },
      },
    },
    closes: { type: "array", items: { type: "string" } },
    stumbles: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["quote", "why"],
        properties: { quote: { type: "string" }, why: { type: "string" } },
      },
    },
  },
};

/** The log as the labeller sees it: concepts and open threads, no document text. */
export function describeLog(log) {
  const concepts = Object.values(log.concepts);
  const lines = ["Concepts so far:"];
  if (concepts.length === 0) lines.push("(none)");
  for (const c of concepts) {
    const names = c.surfaces.length ? ` (written as: ${c.surfaces.map((s) => `"${s}"`).join(", ")})` : "";
    lines.push(
      c.definedAt
        ? `- ${c.id}${names}: explained in chunk ${c.definedAt}: ${c.gloss}`
        : `- ${c.id}${names}: used, never explained`,
    );
  }
  const open = log.threads.filter((t) => !t.closedAt);
  lines.push("", "Open threads:");
  if (open.length === 0) lines.push("(none)");
  for (const t of open) lines.push(`- ${t.id} (chunk ${t.openedAt}): ${t.what}`);
  return lines.join("\n");
}

function userPrompt(reader, log, before, c) {
  const knows = log.knows.length ? `\nThey already know these, so never list them as concepts: ${log.knows.join(", ")}.` : "";
  return [
    `<reader>\n${reader}${knows}\n</reader>`,
    `<log>\n${describeLog(log)}\n</log>`,
    `<just_before>\n${before.length ? before.map((b) => b.text).join("\n\n") : "(this is the first chunk)"}\n</just_before>`,
    `<current_chunk number="${c.n}" section="${c.section || "(top of document)"}">\n${c.text}\n</current_chunk>`,
  ].join("\n\n");
}

/** One headless, tool-less `claude -p` call that must answer in the given JSON schema. */
export function claude({ prompt, model, system, schema }) {
  return new Promise((resolve, reject) => {
    const args = [
      "-p", prompt,
      "--model", model,
      "--system-prompt", system,
      "--tools", "",
      "--setting-sources", "",
      "--strict-mcp-config",
      "--no-session-persistence",
      "--disable-slash-commands",
      "--output-format", "json",
      "--json-schema", JSON.stringify(schema),
    ];
    const child = spawn(process.env.CLAUDE_BIN || "claude", args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "", err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", reject);
    child.on("close", (code) => {
      try {
        const res = JSON.parse(out);
        if (res.is_error || !res.structured_output) throw new Error(res.result || "no structured output");
        resolve({ output: res.structured_output, cost: res.total_cost_usd ?? 0 });
      } catch (e) {
        reject(new Error(`claude -p failed (exit ${code}): ${e.message}\n${err.slice(0, 500)}`));
      }
    });
  });
}

const callClaude = async (prompt, model) => {
  const { output, cost } = await claude({ prompt, model, system: SYSTEM, schema: SCHEMA });
  return { events: output, cost };
};

/**
 * Read the chunks in order and build the log.
 * @param {object} opts reader, knows, model, run (which sample this is), cacheDir, onProgress, call (injectable for tests)
 */
export async function buildLog(chunks, opts) {
  const { reader, knows = [], model = "haiku", run = 0, cacheDir, onProgress = () => {}, call = callClaude } = opts;
  const log = newLog({ reader, knows, model });
  if (cacheDir) mkdirSync(cacheDir, { recursive: true });

  for (const c of chunks) {
    const before = chunks.slice(Math.max(0, c.n - 3), c.n - 1);
    const prompt = userPrompt(reader, log, before, c);
    // The prompt contains the log so far, so a cached answer is reused only
    // when everything the reader knew at this point is unchanged.
    // Each run is an independent sample, so each keeps its own cached answers.
    const key = createHash("sha256").update([PROMPT_VERSION, model, run, SYSTEM, prompt].join("\0")).digest("hex");
    const file = cacheDir && join(cacheDir, `${key.slice(0, 32)}.json`);

    // A cached answer keeps what it cost, so log.cost is always the cost of
    // building this log from nothing.
    let events, cost = 0, cached = false;
    if (file && existsSync(file)) {
      ({ events, cost } = JSON.parse(readFileSync(file, "utf8")));
      cached = true;
    } else {
      let lastErr;
      for (let attempt = 0; attempt < 2 && !events; attempt++) {
        try { ({ events, cost } = await call(prompt, model)); } catch (e) { lastErr = e; }
      }
      if (!events) throw lastErr;
      if (file) writeFileSync(file, JSON.stringify({ events, cost }));
    }
    for (const k of events.concepts) k.id = kebab(k.id);
    applyEvents(log, c, events);
    log.cost += cost;
    if (cached) log.cached += 1;
    onProgress({ chunk: c, cached, total: chunks.length });
  }
  return log;
}
