# cold-read

Visibility: public (github.com/junewunder/cold-read)

A Claude Code skill and the CLI under it. A blind reader (a cheap model, one
chunk at a time) turns a document into a log of what its reader has been told,
and plain code checks the log. `README.md` says what it is for; this file is
for whoever changes it.

## Commands

- `just test`: the unit tests. No model calls; they must stay that way.
- `just eval`: runs the CLI on `eval/wfactory/` and scores it against
  problems found by hand. About 3 minutes and 5 cents on Haiku.
- `just check <doc>`: cold-read any document.

## Layout

- `skill/`: what gets installed. `~/.claude/skills/cold-read` is a symlink to
  it, so an edit here is live at once.
  - `SKILL.md`: what the agent follows.
  - `scripts/cold-read.mjs`: the CLI. `scripts/lib/` holds one module per
    stage: `chunk` (markdown to chunks), `label` (the blind reader), `log`
    (folding events into the log), `settle` (the whole-log pass that closes
    threads), `check` (the flags), `plan` (the plan format and its diff),
    `render` (outline and report).
- `test/`: `node --test`, no dependencies.
- `eval/<case>/`: a document as it was before someone fixed it by hand, and
  `expected.json` listing what they fixed.
- `work/`: eval output, gitignored.

## Rules

- **The labeller never sees later text.** It gets the reader, the log so far,
  the two chunks before, and the current chunk. A test holds this. A change
  that shows it more of the document breaks the one property the tool rests on.
- **A model writes the log; code raises the flags.** A new check is a function
  over the log in `check.mjs` or `plan.mjs`. If a check seems to need judgment,
  add what it needs to the log as a new event, then check that in code.
- **Model calls go through `claude -p`**, tool-less, with `--json-schema`
  (`claude()` in `label.mjs`). No SDK, no API key.
- **Measure a prompt change.** Run `just eval` before and after and put both
  score lines in the commit message. Labels vary between runs, so one known
  problem flipping is noise.
- No runtime dependencies. Node's standard library only.
- This repo is public. Eval cases come from documents that are already public.
