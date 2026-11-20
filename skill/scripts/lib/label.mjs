// The blind reader. It reads one chunk at a time and records what the chunk
// does to the reader's knowledge. It is given the log so far and the two
// chunks before this one (to resolve "this" and "that"), and never anything
// later, so it cannot know more than a real first-time reader would.

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { newLog, applyEvents, kebab } from "./log.mjs";
import { norm, wordsOf, akin } from "./check.mjs";
import { prose } from "./chunk.mjs";

export const PROMPT_VERSION = 10;

const SYSTEM = `You read a document on behalf of one specific reader, one chunk at a time, in order. You record what each chunk does to that reader's knowledge. Your records become a log that is checked by a program, so follow the definitions below exactly.

You are given: the reader, the log so far, the one or two chunks just before this one, and the current chunk. You have NOT seen the rest of the document. Never guess what it says later, and never use knowledge of the subject that the reader would not have. If the reader's background and the log do not explain something, then the reader does not know it.

Record these for the current chunk only:

purpose: what this chunk does for the reader, as one short clause starting with a verb ("says what the tool is", "lists the install requirements").

concepts: each named thing in this chunk that the reader does NOT already know from their background: a term the document coins or uses in its own sense, a component, a command, a file, a role, a product. Leave out ordinary words, anything the reader's background covers, a file or link that the chunk only points to for more detail, and a word the text only quotes or mentions as an example, where the reader is not expected to know what it means. Text inside a code fence is a command, sample output or an example file: a term that appears only inside a fence is not a concept, and nothing inside a fence is a stumble. For each one:
- id: if it is the same thing as a concept already in the log, use that id, even when this chunk calls it by a different name. Otherwise a new short lowercase id.
- surface: the name as this chunk writes it: a noun phrase of one to four words ("tracker", not "the tracker that records units"). A clause or a verb phrase ("more are opt-in", "reviews the branch") is not a concept.
- event: "defines" only if this chunk SAYS what the thing is or does: a definition, an example, a gloss in brackets or after a comma, or a link's own description. "uses" if the chunk relies on the reader knowing it. If you can only guess the meaning from how the sentence uses the word ("a lane claims the next unit from the tracker" does not say what a tracker is), that is "uses".
- gloss: for "defines", what the reader now knows about it, in at most 20 words, taken from this chunk only. For "uses", an empty string.
- how: for "defines", the way this chunk explains it. "gloss": in passing, a few words inside a sentence that is about something else (in brackets, after a comma, a link's description). "sentence": one or two sentences whose job is to say what the thing is. "paragraph": most of the chunk is about it, so the chunk is there to explain it. "formal": a definition set off or labelled as one ("Definition 2", "we define X as", a formula that fixes its meaning). For "uses", an empty string.
- example: true if the explanation shows a concrete instance of the thing. For "uses", false.
- builds_on: for "defines", the other terms the explanation is stated in terms of, as the chunk writes them ("a lane is a loop that claims units" builds on "unit"). Often empty. For "uses", empty.
A concept the log marks "used, never explained" stays unknown to the reader until some chunk defines it.

opens: a thing this chunk makes the reader expect or wonder about and does not itself settle: a promise that something exists or comes later, or a question the wording raises and leaves open ("with a git remote" — and without one?). Only things a careful reader would be bothered by if the document never came back to them. A link to another document settles what it points to. An unexplained term is a "uses" concept, not a thread. Most chunks open nothing. Give "what" (the expectation, a few words) and "quote" (the words that raise it).

closes: ids of open threads in the log that this chunk settles.

links: ties between this chunk and something else. Three types:
- "contrast": the wording sets this against something else. Words like "unlike", "instead", "rather than" or "only" do it, and so does stress that implies an opposite: "all of these are code" implies that some other things are not code. "about" is the other side, in a few words. "stated" is true only if that other side is in this chunk, in the text just before, or in the log. If the wording implies an other side the reader was never given, "stated" is false.
- "reason": the chunk says why something is so, or why it matters. "about" is the thing it gives the reason for. "stated" is true.
- "example": the chunk gives a concrete example of a concept or a claim. "about" is the concept id or the claim. "stated" is true.
Give "quote", the words that make the link. Most chunks have no links.

stumbles: places where this reader cannot tell what is meant: "this", "that" or "it" with no clear referent; a statement that disagrees with the log. Give "quote" (the exact words) and "why" (one sentence). Most chunks have none. A concept the reader does not know is NOT a stumble; it is a "uses" concept.`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["purpose", "concepts", "opens", "closes", "links", "stumbles"],
  properties: {
    purpose: { type: "string" },
    concepts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "surface", "event", "gloss", "how", "example", "builds_on"],
        properties: {
          id: { type: "string" },
          surface: { type: "string" },
          event: { type: "string", enum: ["defines", "uses"] },
          gloss: { type: "string" },
          how: { type: "string", enum: ["gloss", "sentence", "paragraph", "formal", ""] },
          example: { type: "boolean" },
          builds_on: { type: "array", items: { type: "string" } },
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
    links: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["type", "about", "stated", "quote"],
        properties: {
          type: { type: "string", enum: ["contrast", "reason", "example"] },
          about: { type: "string" },
          stated: { type: "boolean" },
          quote: { type: "string" },
        },
      },
    },
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

/** The log as the labeller sees it: what each part did, the concepts and the open threads. No document text. */
export function describeLog(log) {
  const concepts = Object.values(log.concepts);
  const lines = ["Parts so far:"];
  if (log.entries.length === 0) lines.push("(none)");
  for (const e of log.entries) lines.push(`${e.n}. ${e.purpose}`);
  lines.push("", "Concepts so far:");
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

/**
 * The known terms that this chunk actually contains. Only these go in the
 * prompt, so adding a term to the list changes the prompt (and so the cached
 * answer) from the first chunk that has the term, and not from chunk 1.
 */
export function knownHere(knows, text) {
  const have = wordsOf(text.replace(/[.,;:!?)]+(\s|$)/g, " "));
  return knows.filter((t) => wordsOf(t).every((w) => have.some((h) => akin(h, w))));
}

function userPrompt(reader, log, before, c) {
  const here = knownHere(log.knows, c.text);
  const knows = here.length ? `\nThey already know these, so never list them as concepts: ${here.join(", ")}.` : "";
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
 * Run `fn` (which returns { output, cost }) unless an answer for these key
 * parts is already in the cache. A cached answer keeps what it cost.
 */
export async function withCache(cacheDir, parts, fn) {
  if (!cacheDir) return { ...(await fn()), hit: false };
  mkdirSync(cacheDir, { recursive: true });
  const key = createHash("sha256").update([PROMPT_VERSION, ...parts].join("\0")).digest("hex");
  const file = join(cacheDir, `${key.slice(0, 32)}.json`);
  if (existsSync(file)) return { ...JSON.parse(readFileSync(file, "utf8")), hit: true };
  const res = await fn();
  writeFileSync(file, JSON.stringify(res));
  return { ...res, hit: false };
}

const flat = (s) => String(s).toLowerCase().replace(/[`*]/g, "").replace(/\s+/g, " ").trim();
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** True when `words` is in the chunk's code fences and nowhere in its sentences. */
export function onlyInFence(words, chunkText) {
  const q = flat(words);
  if (!q || !flat(chunkText).includes(q)) return false;
  return !new RegExp(`(^|[^a-z0-9_])${escape(q)}($|[^a-z0-9_])`).test(flat(prose(chunkText)));
}

/**
 * What the labeller is told to leave out, enforced in code because it does
 * not always comply: terms the reader already knows, and names and stumbles
 * that exist only inside a code fence (a sample's identifiers are not the
 * document's vocabulary).
 */
export function screen(events, chunk, knows) {
  const known = (k) => knows.some((t) => norm(t) === norm(k.surface) || norm(t) === norm(k.id.replace(/-/g, " ")));
  return {
    ...events,
    concepts: (events.concepts ?? []).filter((k) => !known(k) && !onlyInFence(k.surface, chunk.text)),
    stumbles: (events.stumbles ?? []).filter((s) => !onlyInFence(s.quote, chunk.text)),
  };
}

/**
 * Read the chunks in order and build the log.
 * @param {object} opts reader, knows, model, run (which sample this is), cacheDir, onProgress, call (injectable for tests)
 */
export async function buildLog(chunks, opts) {
  const { reader, knows = [], model = "haiku", run = 0, cacheDir, onProgress = () => {}, call = callClaude } = opts;
  const log = newLog({ reader, knows, model });

  for (const c of chunks) {
    const before = chunks.slice(Math.max(0, c.n - 3), c.n - 1);
    const prompt = userPrompt(reader, log, before, c);
    // The prompt contains the log so far, so a cached answer is reused only
    // when everything the reader knew at this point is unchanged.
    // Each run is an independent sample, so each keeps its own cached answers.
    const { output, cost, hit } = await withCache(cacheDir, [model, run, SYSTEM, prompt], async () => {
      let res, lastErr;
      for (let attempt = 0; attempt < 2 && !res; attempt++) {
        try { res = await call(prompt, model); } catch (e) { lastErr = e; }
      }
      if (!res) throw lastErr;
      return { output: res.events, cost: res.cost };
    });
    const events = screen(output, c, knows);
    for (const k of events.concepts) k.id = kebab(k.id);
    applyEvents(log, c, events);
    log.cost += cost;
    if (hit) log.cached += 1; else log.paid += cost;
    onProgress({ chunk: c, cached: hit, total: chunks.length });
  }
  return log;
}
