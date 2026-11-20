// The style pass: sentence-level habits that a pattern can find, with no model.
// Vale (https://vale.sh) does the matching; `skill/style/.vale.ini` names the
// rules. This module prepares the text, runs Vale and turns its output into
// flags.

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

export const STYLE_DIR = fileURLToPath(new URL("../../style/", import.meta.url));

/**
 * The document with the lines its author did not write as prose emptied:
 * YAML frontmatter, HTML comments and block quotes. Lines are emptied, not
 * removed, so a flag's line number is the document's.
 */
export function blank(markdown) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  let i = 0;
  if (lines[0] === "---") {
    const close = lines.indexOf("---", 1);
    if (close > 0) for (; i <= close; i++) lines[i] = "";
  }
  let fence = null;
  let comment = false;
  for (; i < lines.length; i++) {
    const l = lines[i];
    if (fence) { if (l.trim().startsWith(fence)) fence = null; continue; }
    if (comment) { if (l.includes("-->")) comment = false; lines[i] = ""; continue; }
    const f = l.match(/^\s*(```+|~~~+)/);
    if (f) { fence = f[1][0].repeat(3); continue; }
    if (/^\s*<!--/.test(l)) { comment = !l.includes("-->"); lines[i] = ""; continue; }
    if (/^\s*>/.test(l)) lines[i] = "";
  }
  return lines.join("\n");
}

/** Vale's JSON for one document, as flags in the order they appear. */
export function toFlags(valeJson) {
  return Object.values(valeJson)
    .flat()
    .map((a) => ({ line: a.Line, col: a.Span[0], rule: a.Check.split(".").pop(), match: a.Match, message: a.Message, level: a.Severity }))
    .sort((a, b) => a.line - b.line || a.col - b.col);
}

class StyleError extends Error {}

function vale(args, input) {
  const r = spawnSync("vale", args, { cwd: STYLE_DIR, input, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (r.error?.code === "ENOENT") {
    throw new StyleError("the style pass needs Vale, and `vale` is not on the PATH. Install it from https://vale.sh/docs/install (one binary).");
  }
  if (r.error) throw new StyleError(r.error.message);
  return r;
}

/** Whether the rules Vale fetches (see .vale.ini) are on disk. */
export const synced = () => existsSync(join(STYLE_DIR, "styles", "ai-tells"));

/** @returns {{line:number, col:number, rule:string, match:string, message:string, level:string}[]} */
export function lint(markdown) {
  if (!synced()) {
    const s = vale(["sync"]);
    if (s.status !== 0) throw new StyleError(`could not fetch the rules with \`vale sync\`:\n${s.stderr || s.stdout}`);
  }
  const r = vale(["--config", join(STYLE_DIR, ".vale.ini"), "--ext=.md", "--output=JSON", "--no-exit"], blank(markdown));
  try {
    return toFlags(JSON.parse(r.stdout));
  } catch {
    throw new StyleError(`Vale failed:\n${r.stderr || r.stdout}`);
  }
}

export function styleReport(flags, docName) {
  if (flags.length === 0) return `${docName}: no style flags.\n`;
  const out = [`${docName}: ${flags.length} style ${flags.length === 1 ? "flag" : "flags"}`, ""];
  for (const f of flags) out.push(`  ${f.line}:${f.col}  ${JSON.stringify(f.match)}  ${f.message}  [${f.rule}]`);
  return out.join("\n") + "\n";
}

export { StyleError };
