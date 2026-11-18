// Split a markdown document into chunks: the units the blind reader sees one at
// a time. A chunk is a paragraph, a short list, one item of a long list, a
// table or a quote. A code block joins the chunk it follows, and a lead-in
// line ending in a colon joins the chunk it introduces. Headings are not
// chunks; each chunk records the heading path it sits under.

const LIST_ITEM = /^(\s*)([-*+]|\d+[.)])\s+/;
const FENCE = /^\s*(```+|~~~+)/;
const HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
// Above this many words a list is read one item at a time, so a flag points at
// the item and one vague item cannot hide among clear ones.
const LONG_LIST_WORDS = 40;

const words = (s) => s.split(/\s+/).filter(Boolean).length;

/** A chunk's text without its code fences: the part written in sentences. */
export function prose(text) {
  const out = [];
  let marker = null;
  for (const l of text.split("\n")) {
    if (marker) { if (l.trim().startsWith(marker)) marker = null; continue; }
    const f = l.match(FENCE);
    if (f) { marker = f[1][0].repeat(3); continue; }
    out.push(l);
  }
  return out.join("\n");
}

/** @returns {{n:number, section:string, kind:string, start:number, end:number, text:string}[]} */
export function chunk(markdown) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const blocks = [];
  let i = 0;

  // YAML frontmatter is metadata, not something the reader reads.
  if (lines[0] === "---") {
    const close = lines.indexOf("---", 1);
    if (close > 0) i = close + 1;
  }

  const path = [];
  const section = () => path.filter(Boolean).join(" > ");

  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === "") { i++; continue; }

    if (/^\s*<!--/.test(line)) {
      while (i < lines.length && !lines[i].includes("-->")) i++;
      i++;
      continue;
    }

    const h = line.match(HEADING);
    if (h) {
      path.length = h[1].length - 1;
      path[h[1].length - 1] = h[2];
      i++;
      continue;
    }

    const fence = line.match(FENCE);
    if (fence) {
      const start = i;
      const marker = fence[1][0].repeat(3);
      i++;
      while (i < lines.length && !lines[i].trim().startsWith(marker)) i++;
      i++;
      blocks.push({ kind: "code", section: section(), start, end: i - 1 });
      continue;
    }

    if (LIST_ITEM.test(line)) {
      const start = i;
      const indent = line.match(LIST_ITEM)[1].length;
      const items = [];
      while (i < lines.length) {
        const l = lines[i];
        const m = l.match(LIST_ITEM);
        if (m && m[1].length <= indent) {
          items.push({ start: i, end: i });
        } else if (l.trim() === "") {
          // A blank line ends the list unless an item or indented text follows.
          const next = lines[i + 1] ?? "";
          const cont = LIST_ITEM.test(next) || (/^\s+\S/.test(next) && !FENCE.test(next));
          if (!cont) break;
        } else if (HEADING.test(l) || (FENCE.test(l) && !/^\s+/.test(l))) {
          break;
        } else {
          items[items.length - 1].end = i;
        }
        if (l.trim() !== "") items[items.length - 1].end = i;
        i++;
      }
      const end = items[items.length - 1].end;
      const total = words(lines.slice(start, end + 1).join(" "));
      if (total > LONG_LIST_WORDS && items.length > 1) {
        for (const it of items) blocks.push({ kind: "item", section: section(), ...it });
      } else {
        blocks.push({ kind: "list", section: section(), start, end });
      }
      continue;
    }

    // Paragraph, table or quote: runs to the next blank line or block start.
    const start = i;
    const kind = /^\s*\|/.test(line) ? "table" : /^\s*>/.test(line) ? "quote" : "para";
    i++;
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !HEADING.test(lines[i]) &&
      !FENCE.test(lines[i]) &&
      !(kind === "para" && LIST_ITEM.test(lines[i]))
    ) i++;
    blocks.push({ kind, section: section(), start, end: i - 1 });
  }

  // A code block belongs with the text that introduces it, and a lead-in that
  // ends in a colon ("These hold:") belongs with what it introduces.
  const merged = [];
  for (const b of blocks) {
    const prev = merged[merged.length - 1];
    const same = prev && prev.section === b.section;
    if (b.kind === "code" && same && prev.kind !== "code") {
      prev.end = b.end;
    } else if (same && prev.kind === "para" && /:\s*$/.test(lines[prev.end])) {
      prev.kind = b.kind;
      prev.end = b.end;
    } else {
      merged.push({ ...b });
    }
  }

  return merged.map((b, n) => ({
    n: n + 1,
    section: b.section,
    kind: b.kind,
    start: b.start + 1,
    end: b.end + 1,
    text: lines.slice(b.start, b.end + 1).join("\n"),
  }));
}
