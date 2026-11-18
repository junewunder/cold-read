---
name: cold-read
description: "Check prose the way a first-time reader meets it. A blind reader goes through the document chunk by chunk and logs what each chunk tells them; code then flags terms used before they are explained, one thing under two names, questions raised and never settled, and drift from the plan. Use for 'cold read this', 'does this README assume too much', 'check it for undefined terms', before handing june agent-written prose (a README, a doc, a paper section), and when june wants to see or edit the plan or outline of a document."
---

# Cold read

You wrote the text with the whole project in your context, so you cannot see
what a newcomer is missing. A **cold read** hands the text to a reader that has
only the text: a cheap model reads one chunk at a time, never sees what comes
later, and records what each chunk tells the reader. Those records are the
**log**. The checks are plain code over the log, and each thing they find is a
**flag**.

```sh
node <skill-dir>/scripts/cold-read.mjs check <doc.md> --reader "<who>" --knows "<a, b, c>" [--plan <plan.md>]
node <skill-dir>/scripts/cold-read.mjs outline <doc.md> --reader "<who>" --knows "<a, b, c>"
node <skill-dir>/scripts/cold-read.mjs plan <plan.md>
```

`<skill-dir>` is the folder this file is in. The reader's labels vary from one
reading to the next, so `check` reads the document twice, side by side, and
merges the flags; `--runs 3` reads it three times. A README takes about 3
minutes and 10 cents, so run it in the background. It prints
the report and writes the log, outline and report to the **state dir**
(`~/.local/share/cold-read/<project>/`), whose paths it prints. Exit 1 means at
least one flag is an error.

## 1. Name the reader

Every flag is relative to one reader, so settle the reader before anything
else. Write two things:

- `--reader`: one or two sentences. Who they are, and what they have never
  seen. "One developer with a personal project who uses Claude Code daily. They
  have never seen this project."
- `--knows`: the terms this reader already has, which will never be flagged.
  "git, Claude Code, agent, skill, test suite".

When june has already named the readers (the `readme` skill does this), use the
one whose verdict counts most. Done when you could say, for any term in the
document, whether this reader knows it.

Then take the branch that fits.

## 2A. The text exists: check it

Run `check`. Sort every flag by reading the lines it points at:

- **Real**: fix the text. Explain the term where it is first used, or use it
  later. Keep one name for one thing. Answer the question the text raises, or
  cut the words that raise it.
- **The reader does know this**: add the term to `--knows`. The text stays.
- **The labeller got it wrong**: leave the text, and keep one line saying why.

Rerun after fixing. Chunks before your first edit come from the cache, so a
rerun costs only what changed. Done when every flag left is one you can give a
reason for leaving.

Edit only a document that is yours to edit. Otherwise report the flags.

Tell june what you fixed, what you left and why, and the cost.

## 2B. No text yet, or a rewrite: plan first

1. **Write the plan yourself** to `<state dir>/<doc>.plan.md`, in the format
   below: the reader, then each point the document makes, in order, with the
   terms that point explains and relies on, and its links to other points. The
   plan is where the judgment goes, so it is written by the strongest model in
   the session and never handed to a cheaper subagent. The plan is also the
   document's vocabulary: a term that is not in `Knows:` or under some
   `defines:` does not belong in the text.
2. **Run `plan <plan.md>`.** It checks the plan as if it were a log, with no
   model and in under a second: a term a point relies on before any point
   explains it, a thread opened and never closed, a contrast whose other side
   is not in the plan. Done when it flags nothing.
3. **Show june the plan and stop.** Print it in full and link the file. june
   reads and edits the plan instead of the prose, because a wrong point costs
   one line to fix here and a rewrite later. Rerun step 2 after june's edits.
   Done when june says to go.
4. **Write the text from the plan**, one point at a time, in the plan's order.
5. **Run `check --plan <plan>`** and sort the flags as in 2A. When the text is
   right and the plan is what's stale, change the plan and tell june which
   points moved. Done when a round turns up no new real flag.
6. **Then, and only then, reviewers.** The `readme` skill's reviewer loop reads
   for truth, fit and tone, and costs ten times a cold read, so it starts on a
   text whose flags are already settled.

## 2C. june wants to see what a document says: outline it

Run `outline`. It prints the log in the plan format: what each part of the text
does, what it explains, and what it relies on that the reader was never given.
Link june the outline file. When june edits it into the document june wants,
that file is the plan: revise the text to match, then 2B from step 2.

## The plan format

```markdown
# Plan: README.md

Reader: One developer with a personal project. They have never seen this tool.
Knows: git, Claude Code, agent, skill

## Install
1. Say how to install it, in one command.
   - defines: toy factory
   - uses: unit, check
   - opens: what the questions are
2. List what the code enforces.
   - closes: what the questions are
   - contrasts: point 3
   - because: an agent can ignore its prompt
   - example of: check
3. List what is only asked of the agent.
```

`##` headings are the document's sections. A numbered line is one point: what
that stretch of text does for the reader. Under it, every key is optional:

- `defines:` terms the point explains; `uses:` terms it relies on.
- `opens:` something it promises or makes the reader wonder; `closes:` a
  thread it settles, in the same words.
- **Links**, for a point that only works because of another part.
  `contrasts:` names the other side, as `point N` or a term in the plan; cut
  that side and the plan check fails. `because:` says the point must give its
  reason. `example of:` says it must give an example of that term or claim.

## What each flag means

| Flag | Level | The log shows |
|---|---|---|
| undefined | error | a term the reader meets before, or without, any explanation |
| alias | warning | one thing called by two names that share no word |
| open | warning | a promise or question that no later part settles |
| stumble | warning | words the reader cannot resolve: a loose "this", a statement that disagrees with an earlier one |
| contrast | warning | wording set against something the reader was never given |
| dangling | error | (plan check) a contrast or a `closes:` that points at nothing in the plan |
| link | error | a contrast, reason or example the plan asks for that the text for that point lacks |
| missing | error | a term the plan explains that the text never explains |
| dropped | error | a plan point that no part of the text carries out |
| unplanned | warning | a term in the text that the plan does not have |
| extra | warning | a part of the text that serves no plan point |

**Keep the blind reader cheap.** Its job is to not know things. On the one
measured document a Haiku reading caught 6 or 7 of 14 known problems, Sonnet 7
to 9, and Opus 4: a stronger model understands a term the reader was never
given and lets it pass. To catch more, add readings (`--runs 3`), and leave
`--model` alone.

With more than one reading, each flag says how many readings raised it. One
raised by every reading is the surest; one raised by a single reading is still
worth a look, and half the real problems arrive that way. A flag is a place to
look and never a verdict. Whether a claim is true, the tone, and the length are outside what a
cold read sees: use reviewers and the `humanizer` skill for those.
