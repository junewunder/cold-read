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
node <skill-dir>/scripts/cold-read.mjs leave <doc.md> <flag id> "<why>"
node <skill-dir>/scripts/cold-read.mjs outline <doc.md> --reader "<who>" --knows "<a, b, c>"
node <skill-dir>/scripts/cold-read.mjs plan <plan.md>
```

`<skill-dir>` is the folder this file is in. The reader's labels vary from one
reading to the next, so `check` reads the document twice, side by side, and
merges the flags; `--runs 3` reads it three times. Before it starts it prints
how long the run should take and what it should cost (a 300-line README read
three times is about 5 minutes and 35 cents), so run it in the background. It
prints the report and writes the log, outline and report to the **state dir**
(`~/.local/share/cold-read/<project>/`), whose paths it prints.

## 1. Name the reader

Every flag is relative to one reader, so settle the reader before anything
else. Write two things:

- `--reader`: one or two sentences. Who they are, and what they have never
  seen. "One developer with a personal project who uses Claude Code daily. They
  have never seen this project."
- `--knows`: the terms this reader already has, which will never be flagged.
  "git, Claude Code, agent, skill, test suite". Only terms this reader really
  has: a name they have never heard goes under `mentions:` in a plan, or is
  left with a reason.

When june has already named the readers (the `readme` skill does this), use the
one whose verdict counts most. Done when you could say, for any term in the
document, whether this reader knows it.

Then take the branch that fits.

## 2A. The text exists: check it

Each `check` on an edited text is a **round**. Run one, then sort every flag by
reading the lines it points at:

- **Real**: fix the text. First look for the fix that adds no words: use the
  name the reader already has, move the sentence after the one that explains
  it, or cut the words that raise the question. Explain the term only when the
  reader needs it.
- **The reader does know this**: add the term to `--knows`. The text stays.
- **The blind reader got it wrong, or the text is right as it stands**: run
  `leave <doc> <id> "<why>"` with the id the report prints in brackets. The
  flag is not raised again, and the report keeps your reason at the end.

Sort the whole report before the next round: a round pays for every chunk
from your first edit down, so one edit near the top costs as much as the first
round did. The next round marks the flags that are new and says where things
stand:

- **Not done**: a flag that two or more readings raised is still standing.
- **Quiet round**: none is. Go through the single-reading flags once (half
  the real problems arrive that way). Change nothing and you are done; edit
  the text and you owe one more round.
- **Done**: two quiet rounds running. Stop, whatever single-reading flags
  remain.

`check` exits 0 on a quiet round and 1 otherwise.

Edit only a document that is yours to edit. Otherwise report the flags.

Tell june what you fixed, what you left and why, and what the rounds cost.

## 2B. No text yet, or a rewrite: plan first

1. **Write the plan yourself** to `<state dir>/<doc>.plan.md`, in the format
   below: the reader, the length, then each point the document makes, in
   order, with the terms that point explains and relies on, and its links to
   other points. The plan is where the judgment goes, so it is written by the
   strongest model in the session and never handed to a cheaper subagent. The
   plan is also the document's vocabulary: a term that is not in `Knows:`,
   under some `defines:` or under some `mentions:` does not belong in the
   text. Take the length from june; if june has given none, propose one with
   the plan.
2. **Run `plan <plan.md>`.** It checks the plan as if it were a log, with no
   model and in under a second: a term a point relies on before any point
   explains it, a thread opened and never closed, a contrast whose other side
   is not in the plan, section lengths that add up to more than the document's.
   Done when it flags nothing.
3. **Show june the plan and stop.** Print it in full and link the file. june
   reads and edits the plan instead of the prose, because a wrong point costs
   one line to fix here and a rewrite later. Rerun step 2 after june's edits.
   Done when june says to go.
4. **Write the text from the plan**, one point at a time, in the plan's order.
5. **Run `check --plan <plan>`** in rounds, sorting the flags as in 2A. Two
   kinds of flag are settled differently here:
   - **long**: the text is over a length the plan sets. Cut until it fits. The
     lengths are june's: when a section cannot say what its points need in the
     room it has, tell june which point is the cause and stop.
   - **unplanned** or **missing** where the text is right: change the plan's
     term lists to match. When a point itself changes, tell june which.
6. **Then, and only then, reviewers.** The `readme` skill's reviewer loop reads
   for truth, fit and tone, and costs ten times a cold read, so it starts on a
   text the report calls done.

## 2C. june wants to see what a document says: outline it

Run `outline`. It prints the log in the plan format: what each part of the text
does, what it explains, what it relies on that the reader was never given, and
how long each section is. Link june the outline file. When june edits it into
the document june wants, that file is the plan: revise the text to match, then
2B from step 2.

## The plan format

```markdown
# Plan: README.md

Reader: One developer with a personal project. They have never seen this tool.
Knows: git, Claude Code, agent, skill
Length: 120 lines

## Install
Length: 15 lines
1. Say how to install it, in one command.
   - defines: toy factory
   - uses: unit, check
   - mentions: Homebrew
   - opens: what the questions are

## What it enforces
2. List what the code enforces.
   - closes: what the questions are
   - contrasts: point 3
   - because: an agent can ignore its prompt
   - example of: check
3. List what is only asked of the agent.
```

`##` headings are the document's sections, spelled as the document spells
them. A numbered line is one point: what that stretch of text does for the
reader. Points are numbered through the whole plan, so `point 3` is the third
numbered line, whatever section it is in.

- `Length:` under the reader is the most the whole document may be; under a
  heading, the most that section may be. `120 lines` or `900 words`. Lines are
  counted as an editor shows them, with blank lines and code.
- `defines:` terms the point explains; `uses:` terms it relies on.
- `mentions:` names the point brings up and does not explain, which the reader
  is not expected to know: a game's name, a tool in a one-line list. They are
  never flagged. A later point that relies on one needs it under a `defines:`.
- `opens:` something it promises or makes the reader wonder; `closes:` a
  thread it settles, in the same words.
- **Links**, for a point that only works because of another part.
  `contrasts:` names the other side, as `point N` or a term in the plan; cut
  that side and the plan check fails. `because:` says the point must give its
  reason. `example of:` says it must give an example of that term or claim.

## What each flag means

| Flag | Level | What was found |
|---|---|---|
| undefined | error | a term the reader meets before, or without, any explanation |
| alias | warning | one thing called by two names that share no word |
| open | warning | a promise or question that no later part settles |
| stumble | warning | words the reader cannot resolve: a loose "this", a statement that disagrees with an earlier one |
| contrast | warning | wording set against something the reader was never given |
| long | error | the document or a section is longer than the plan allows |
| dangling | error | (plan check) a contrast or a `closes:` that points at nothing in the plan |
| link | error | a contrast, reason or example the plan asks for that the text for that point lacks |
| missing | error | a term the plan explains that the text never explains |
| dropped | error | a plan point that no part of the text carries out |
| unplanned | warning | a term in the text that the plan does not have |
| extra | warning | a part of the text that serves no plan point |

A name that appears only inside a code fence is never flagged. When a
sentence leans on one, the sentence has to name it.

**Keep the blind reader cheap.** Its job is to not know things. On the one
measured document a Haiku reading caught 6 or 7 of 14 known problems, Sonnet 7
to 9, and Opus 4: a stronger model understands a term the reader was never
given and lets it pass. To catch more, add readings (`--runs 3`), and leave
`--model` alone.

A flag is a place to look and never a verdict. Whether a claim is true and how
the text sounds are outside what a cold read sees: run the commands behind
every number yourself, and use reviewers and the `humanizer` skill for tone.
