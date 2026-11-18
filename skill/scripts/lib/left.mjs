// Rounds. A document is read, fixed and read again. Three things carry over
// from one round to the next, each a file in the state dir:
//
//   <doc>.left.json    flags someone looked at and left, each with the reason.
//                      They are not raised again.
//   <doc>.rounds.json  one entry per round: the flags it raised, so the next
//                      round can say which are new, and whether it was quiet.
//   <doc>.flags.json   the last round's flags, with the ids `leave` takes.
//
// A round is quiet when no flag that two or more readings agree on is still
// standing (one reading, when there was only one).

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { norm, sameProblem } from "./check.mjs";

const sha = (s) => createHash("sha256").update(s).digest("hex");
const readJson = (file, otherwise) => (existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : otherwise);
const slim = ({ kind, term, quote, message }) => ({ kind, term, quote, message });

/** Give each flag a short id that `leave` can name. The same problem gets the same id in a later round. */
export function assignIds(flags) {
  const taken = new Set();
  for (const f of flags) {
    const full = sha([f.kind, norm(f.term ?? f.quote ?? f.message)].join("\0"));
    let len = 4;
    while (taken.has(full.slice(0, len))) len++;
    f.id = full.slice(0, len);
    taken.add(f.id);
  }
  return flags;
}

export const loadLeft = (file) => readJson(file, []);

/** Split a round's flags into the ones still standing and the ones left earlier (each with its reason). */
export function splitLeft(flags, left) {
  const standing = [], set = [];
  for (const f of flags) {
    const hit = left.find((l) => sameProblem(l, f));
    if (hit) set.push({ ...f, reason: hit.reason });
    else standing.push(f);
  }
  return { standing, left: set };
}

/** Record that the flag with this id, from the last round, is left as it is. */
export function leave(flagsFile, leftFile, id, reason) {
  const last = readJson(flagsFile, null);
  if (!last) throw new Error("no round has been run on this document yet");
  const flag = [...last.flags, ...(last.left ?? [])].find((f) => f.id === id);
  if (!flag) throw new Error(`the last round has no flag "${id}"`);
  const left = loadLeft(leftFile).filter((l) => !sameProblem(l, flag));
  left.push({ ...slim(flag), reason, added: new Date().toISOString().slice(0, 10) });
  writeFileSync(leftFile, JSON.stringify(left, null, 2) + "\n");
  return flag;
}

/**
 * Add this round to the history and say where things stand.
 * Reading the same text again is the same round, so it replaces the last entry.
 * @returns {{n:number, agreed:number, quiet:boolean, streak:number, fresh:number|null, history:number[]}}
 *   fresh is how many standing flags the round before did not raise (null in round 1).
 */
export function recordRound(roundsFile, { docText, standing, runs, cost, paid }) {
  const rounds = readJson(roundsFile, []);
  const doc = sha(docText).slice(0, 16);
  if (rounds.at(-1)?.doc === doc) rounds.pop();
  const before = rounds.at(-1);

  let fresh = null;
  if (before) {
    fresh = 0;
    for (const f of standing) {
      f.new = !before.raised.some((p) => sameProblem(p, f));
      if (f.new) fresh++;
    }
  }
  // A flag that code counted (a length) is sure without any reading.
  const agreed = standing.filter((f) => f.sure || (f.seen ?? 1) >= Math.min(2, runs)).length;
  rounds.push({ doc, at: new Date().toISOString(), flags: standing.length, agreed, quiet: agreed === 0, cost, paid, raised: standing.map(slim) });
  writeFileSync(roundsFile, JSON.stringify(rounds, null, 2) + "\n");

  let streak = 0;
  for (let i = rounds.length - 1; i >= 0 && rounds[i].quiet; i--) streak++;
  return { n: rounds.length, agreed, quiet: agreed === 0, streak, fresh, history: rounds.map((r) => r.flags) };
}
