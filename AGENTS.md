# cold-read

Visibility: public (github.com/junewunder/cold-read)

A Claude Code skill and the CLI under it. A blind reader (a cheap model, one
chunk at a time) turns a document into a log of what its reader has been told,
and plain code checks the log. `README.md` says what it is for; this file is
for whoever changes it.

## Commands

- `just test`: the unit tests. No model calls; they must stay that way.
- `just eval`: runs the CLI on `eval/wfactory/` and scores it against
  problems found by hand. About 3 minutes and 10 cents on Haiku.
- `just check <doc>`: cold-read any document.
- `just style <doc>`: the style pass. Needs `vale` on the PATH; no model.

## Layout

- `skill/`: what gets installed. `~/.claude/skills/cold-read` is a symlink to
  it, so an edit here is live at once.
  - `SKILL.md`: what the agent follows.
  - `scripts/cold-read.mjs`: the CLI. `scripts/lib/` holds one module per
    stage: `chunk` (markdown to chunks), `label` (the blind reader, its cache,
    and the screen that drops what it was told to leave out), `log` (folding
    events into the log), `settle` (the whole-log pass that closes threads),
    `check` (the flags), `plan` (the plan format, its own check, and its
    diff), `length` (counting the text against the lengths a plan sets),
    `style` (the style pass: empties what is not the author's prose, runs
    Vale, turns its output into flags), `left` (rounds: flags left with a reason, which flags are new, when a
    round is quiet), `render` (outline and report).
  - `style/.vale.ini`: every rule the style pass runs, one line each.
    `style/styles/cold-read/` holds our own rules. The rest come from
    `tbhb/vale-ai-tells` (MIT), which `vale sync` fetches at the version the
    file pins; that copy is gitignored.
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
- **When the blind reader ignores an instruction, enforce it in code.** It
  is a cheap model and will keep listing what it was told to leave out.
  `screen()` in `label.mjs` drops those after the fact, where a test can hold
  it.
- **Measure a prompt change.** Run `just eval` before and after and put both
  score lines in the commit message. Labels vary between readings, so one
  known problem flipping is noise.
- No runtime dependencies. Node's standard library only. `claude` and `vale`
  are outside programs the CLI runs, and only `style` needs `vale`.
- **A style rule is kept on evidence.** Before adding a line to `.vale.ini`,
  run the rule over a few hundred real documents, read a random sample of at
  least eight hits, and keep it only if half or more are sentences worth
  rewriting. A rule that reads markdown structure or a literal word as the
  habit gets fixed in `styles/cold-read/` or left out. The style pass stays
  model-free: a habit that needs judgment belongs in the log.
- This repo is public. Eval cases come from documents that are already public.
