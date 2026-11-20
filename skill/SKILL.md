---
name: cold-read
description: "Check prose the way a first-time reader meets it. A blind reader goes through the document chunk by chunk and logs what each chunk tells them; code then flags terms used before they are explained, one thing under two names, questions raised and never settled, and drift from the outline. Use for 'cold read this', 'does this README assume too much', 'check it for undefined terms', before handing june agent-written prose (a README, a doc, a paper section), and when june wants to see or edit the outline of a document: its points, and where and how each term is introduced."
---

# Cold read

You wrote the text with the whole project in your context, so you cannot see
what a newcomer is missing. A **cold read** hands the text to a reader that has
only the text: a cheap model reads one chunk at a time, never sees what comes
later, and records what each chunk tells the reader. Those records are the
**log**. The checks are plain code over the log, and each thing they find is a
**flag**.

```sh
node <skill-dir>/scripts/cold-read.mjs check <doc.md> --reader "<who>" --knows "<a, b, c>" [--outline <outline.md>]
node <skill-dir>/scripts/cold-read.mjs leave <doc.md> <flag id> "<why>"
node <skill-dir>/scripts/cold-read.mjs outline <doc.md> --reader "<who>" --knows "<a, b, c>"
node <skill-dir>/scripts/cold-read.mjs outline <outline.md>
node <skill-dir>/scripts/cold-read.mjs style <doc.md>
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
  has: a name they have never heard goes under `mentions:` in an outline, or is
  left with a reason.

When june has already named the readers (the `readme` skill does this), use the
one whose verdict counts most. Done when you could say, for any term in the
document, whether this reader knows it.

Then take the branch that fits.

## 2A. The text exists: check it

**Run `style` first.** It is free and takes a second: Vale matches the text
against patterns for sentence-level habits (a figure of speech where a plain
verb would do, a point staged before it is stated, a dash joining two
clauses) and prints each as `line:col "matched words" what to do [rule]`.
Rewrite each flagged sentence so it says the plain thing; when the flagged
words are literal ("the family lives in Leeds"), leave them. Done when `style`
exits 0 or every flag still standing is a literal use. If it reports that
Vale is missing, tell june and go on to `check`.

Each `check` on an edited text is a **round**. Run one, then sort every flag by
reading the lines it points at:

- **Real**: fix the text. First look for the fix that adds no words: use the
  name the reader already has, move the sentence after the one that explains
  it, or cut the words that raise the question. When the term does need
  explaining, the flagged line is only where the reader first missed it.
  Choose the **introduction**: which part of the document should explain the
  term, and how (a paragraph of its own, a sentence, a gloss in passing; with
  an example; building on which earlier term). A term the document is about
  gets a sentence or a paragraph where its subject comes up; a gloss suits a
  name the reader needs once. Write the introduction there, reorder so it
  comes before the first use, and say which you chose when you report.
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

## 2B. No text yet, or a rewrite: outline first

1. **Write the outline yourself** to `<state dir>/<doc>.outline.md`, in the
   format below: the reader, the length, then each point the document makes,
   in order, with the terms that point explains and relies on, how each term
   is introduced, and the point's links to other points. The outline is where the judgment goes, so it is written by the
   strongest model in the session and never handed to a cheaper subagent. The
   outline is also the document's vocabulary: a term that is not in `Knows:`,
   under some `defines:` or under some `mentions:` does not belong in the
   text. Take the length from june; if june has given none, propose one with
   the outline.
2. **Run `outline <outline.md>`.** It checks the outline as if it were a log, with no
   model and in under a second: a term a point relies on before any point
   explains it, a thread opened and never closed, a contrast whose other side
   is not in the outline, section lengths that add up to more than the document's.
   Done when it flags nothing.
3. **Show june the outline and stop.** Print it in full and link the file. june
   reads and edits the outline instead of the prose, because a wrong point costs
   one line to fix here and a rewrite later. Rerun step 2 after june's edits.
   Done when june says to go.
4. **Write the text from the outline**, one point at a time, in the outline's order.
5. **Run `check --outline <outline>`** in rounds, sorting the flags as in 2A.
   Three kinds of flag are settled differently here:
   - **misplaced** or **manner**: the text explains a term somewhere other
     than the point the outline gives it to, or not the way the outline asks.
     Where and how a term is introduced is june's choice, made in the outline.
     Rewrite that point's text so the introduction is there, in that manner,
     and take out the explanation that stands in for it elsewhere. When the
     outline's choice cannot work (the term is needed before its point), tell
     june which term and stop.
   - **long**: the text is over a length the outline sets. Cut until it fits. The
     lengths are june's: when a section cannot say what its points need in the
     room it has, tell june which point is the cause and stop.
   - **unplanned** or **missing** where the text is right: change the outline's
     term lists to match. When a point itself changes, tell june which.
6. **Then, and only then, reviewers.** The `readme` skill's reviewer loop reads
   for truth, fit and tone, and costs ten times a cold read, so it starts on a
   text the report calls done.

## 2C. june wants to see what a document says: outline it

Run `outline <doc.md>`. It prints the log in the outline format: what each part
of the text does, what it explains and how (`defines: unit (gloss)`), what it
relies on that the reader was never given, and how long each section is. It
writes the same to `<doc>.as-read.outline.md` in the state dir, which every
later run overwrites. Copy that file to `<doc>.outline.md` and link june the
copy. When june has edited it into the document june wants, revise the text to
match, then 2B from step 2.

## The outline format

```markdown
# Outline: README.md

Reader: One developer with a personal project. They have never seen this tool.
Knows: git, Claude Code, agent, skill
Length: 120 lines

## Install
Length: 15 lines
1. Say how to install it, in one command.
   - defines: toy factory (paragraph, by example), lane (gloss, builds on unit)
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
reader. Points are numbered through the whole outline, so `point 3` is the third
numbered line, whatever section it is in.

- `Length:` under the reader is the most the whole document may be; under a
  heading, the most that section may be. `120 lines` or `900 words`. Lines are
  counted as an editor shows them, with blank lines and code.
- `defines:` terms the point explains; `uses:` terms it relies on.
- After a term under `defines:`, brackets say how it is introduced. One size:
  `gloss` (a few words in passing, inside a sentence about something else),
  `sentence` (a sentence or two whose job is to say what it is), `paragraph`
  (a paragraph of its own), `formal` (a definition set off or labelled as
  one, as a paper does). Then any of `by example` and `builds on <term>`
  (`builds on unit and check` for two). A term with no brackets may be
  explained in any manner, but still only in its own point. A term glossed
  early and defined in full later goes under `defines:` in both points,
  each with its own brackets.
- `mentions:` names the point brings up and does not explain, which the reader
  is not expected to know: a game's name, a tool in a one-line list. They are
  never flagged. A later point that relies on one needs it under a `defines:`.
- `opens:` something it promises or makes the reader wonder; `closes:` a
  thread it settles, in the same words.
- **Links**, for a point that only works because of another part.
  `contrasts:` names the other side, as `point N` or a term in the outline; cut
  that side and the outline check fails. `because:` says the point must give its
  reason. `example of:` says it must give an example of that term or claim.

## What each flag means

| Flag | Level | What was found |
|---|---|---|
| undefined | error | a term the reader meets before, or without, any explanation |
| alias | warning | one thing called by two names that share no word |
| open | warning | a promise or question that no later part settles |
| stumble | warning | words the reader cannot resolve: a loose "this", a statement that disagrees with an earlier one |
| contrast | warning | wording set against something the reader was never given |
| long | error | the document or a section is longer than the outline allows |
| dangling | error | (outline check) a contrast or a `closes:` that points at nothing in the outline |
| link | error | a contrast, reason or example the outline asks for that the text for that point lacks |
| missing | error | a term the outline explains that the text never explains |
| dropped | error | an outline point that no part of the text carries out |
| misplaced | error | a term explained outside the point the outline gives it to, or glossed before that point |
| manner | error | a term explained in its point, but at another size, or without the example or the earlier term the outline asks for |
| unplanned | warning | a term in the text that the outline does not have |
| extra | warning | a part of the text that serves no outline point |

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
`style` finds only the habits a pattern can match, so a text it passes can
still need the `humanizer`.
