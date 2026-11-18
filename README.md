# cold-read

An agent writes a README with the whole project in view. It knows what a
"lane" is because it read the code an hour ago, so it writes "the lane claims
the next unit" and moves on. The person reading has only the page.

cold-read checks a document from that person's side. A **blind reader**, a
cheap model, goes through the document one **chunk** (a paragraph or a list
item) at a time. It is never shown what comes later. For each chunk it records
what the reader has now been told: which terms were explained, which were
relied on, what was promised. Those records are the **log**. Ordinary code then
reads the log and raises a **flag** wherever the reader was left short.

This is part of what it said about an older README of
[wfactory](https://github.com/junewunder/wfactory), another project of mine.
The blind reader doesn't give the same answers twice, so here it read the
document three times, and each flag says how many of those readings raised
it:

```
## Used before it is explained

- line 8: "tracker" is used 5 times (first at line 8) and never explained. (3 of 3 readings)
- line 8: "check" is used 5 times (first at line 8) and never explained. (3 of 3 readings)
- line 62: "protections" is used at line 62 but only explained later, at line 92. (1 of 3 readings)

## One thing, several names

- line 53: One thing has 2 names: "fresh read-only session" (line 24), "reviewer agent" (line 53). (2 of 3 readings)

## Raised and never settled

- line 24: Raises "what happens to the branch when there is no git remote, since review
  and merge are conditional on one" and nothing later settles it. (3 of 3 readings)
```

It's brand new. It has been measured on one document, described below, and
nobody but me has tried it.

## Install

It's a [Claude Code](https://docs.claude.com/en/docs/claude-code) skill with a
small CLI under it. It needs node 20 or newer and the `claude` command, signed
in. It has no other dependencies and uses no API key: every model call is a
`claude -p` run on your plan.

```sh
git clone https://github.com/junewunder/cold-read
ln -s "$PWD/cold-read/skill" ~/.claude/skills/cold-read
```

Then tell Claude Code "cold read the README", or run the CLI yourself as below.

## Checking a document

```sh
node skill/scripts/cold-read.mjs check README.md \
  --reader "A developer who uses Claude Code daily and has never seen this project." \
  --knows "git, Claude Code, agent, skill"
```

Every flag is relative to one **reader**, so you say who that is: a sentence
or two on who they are and what they have never seen. `--knows` lists terms
that reader already has. Those are looked up by the code and never flagged.

A flag is a place to look. For each one you fix the text, or add the term to
`--knows` because this reader does have it, or leave it because the blind
reader got it wrong. The blind reader's answers are cached, so a rerun only
pays for the chunks from your first edit down.

`check` reads the document twice and merges the flags. `--runs 3` reads it
three times.

| Flag | What the log shows |
|---|---|
| undefined | a term the reader meets before, or without, any explanation |
| alias | one thing called by two names that share no word |
| open | a promise or a question that no later part settles |
| stumble | words the reader can't resolve, such as a loose "this" |
| contrast | wording set against something the reader was never given |

## Planning a document

A **plan** is the outline a writer commits to before writing. It names the
reader, then lists each **point** the document makes, in order, with the terms
that point explains and the terms it relies on:

```markdown
# Plan: README.md

Reader: A developer who has never seen this tool.
Knows: git, Claude Code

## What it enforces
1. List the rules the code enforces.
   - defines: check
   - uses: unit
   - contrasts: point 2
   - because: an agent can ignore its prompt
2. List the rules that are only asked of the agent.
```

The last two lines under point 1 are **links**: they say the point only works
because of something else. `contrasts:` names the other side of a contrast,
`because:` says the point has to give its reason, and `example of:` says it
has to give an example.

A plan can be checked before any text exists. `cold-read plan plan.md` reads
the plan as if it were a log, with no model and in under a second. It flags a
term that a point relies on before any point explains it, and a contrast whose
other side is not in the plan. Delete point 2 above and point 1 is flagged.

The agent writes the plan and stops. You read and edit the plan instead of the
prose, since a wrong point costs one line to fix there and a rewrite later.
Then the agent writes the text, and `check --plan plan.md` adds five flags:

| Flag | What it found |
|---|---|
| missing | a term the plan explains that the text never explains |
| dropped | a point that no part of the text carries out |
| link | a contrast, reason or example the plan asks for that the text lacks |
| unplanned | a term in the text that the plan doesn't have |
| extra | a part of the text that serves no point |

For a document that already exists, `outline` prints the log in the same
format: what each part of the text does, and what it explains and relies on.
That **outline** is the plan the text actually follows. Edit it into the plan
you want, have the agent revise the text, and check the result with
`check --plan`.

This README was written from [docs/README.plan.md](docs/README.plan.md).

## How well it works

There is one measurement so far. Before cold-read existed, an agent read that
older wfactory README top to bottom, keeping a list by hand of what the text
had told the reader. That **hand pass** found 14 problems, which were then
fixed: terms such as "the tracker" that were never explained, a "That part"
that could mean two things, a promise of usage limits that nothing delivered.
`eval/wfactory/` holds the README as it was and the 14 problems, and
`just eval` scores cold-read's flags against them.

| Blind reader | Caught, of 14 | Other flags | Cost |
|---|---|---|---|
| Haiku, one reading | 7, then 6 | 10 | $0.05 |
| Sonnet, one reading | 9, then 7 | 13, then 7 | $0.38 |
| Opus, one reading | 4 | 6 | $0.81 |
| Haiku, three readings merged | 8, then 8 | 13 | $0.13, then $0.15 |

"7, then 6" is two separate runs of the same setup. The runs used slightly
different wording in the blind reader's instructions, so read the table as a
rough picture. Three readings side by side took about 3 minutes.

Three things stand out.

The same model on the same text catches a different half each time. Every one
of the 14 problems was caught by at least one reading. But in the last merged
run, the three readings caught 8 between them, and only 2 of those 8 were
caught by every one of the three.

A stronger model is a worse blind reader. Opus caught the fewest. The job is
to not know things, and a stronger model understands a term the reader was
never given and lets it pass.

More readings beat a better model. Three Haiku readings did about as well as
one Sonnet reading for less than half the cost. So `check` reads the document
twice by default, and every flag says how many readings raised it.

The flags in the "Other flags" column are not all noise. By my reading, about
half are problems the hand pass missed ("run records" and "protections" really
are never explained) and half are the blind reader being wrong.

What it gets wrong:

- **It misses things.** One reading finds about half of what a careful person
  finds. More readings find more, with more wrong flags alongside.
- **It rarely catches a contrast that lost its other half.** The wfactory
  README had a list of rules that its code enforces, introduced by "All of
  these are code". That line was written when the list sat beside a second
  list, of rules that were only instructions to the agent. The second list was
  cut, and the line no longer contrasted with anything. One reading in three
  flagged it, and none did before the log recorded contrasts.
- **It can't tell whether a claim is true**, or whether the text is too long.
  The log records what the reader was told and nothing else.
- **The plan checks are barely tested.** Checking a text against its plan has
  been run on one document, this README.

## How it works

Two rules hold the design together.

The blind reader never sees later text. It gets the reader, the log so far,
the two chunks before this one, and the current chunk. So it can't know more
than a first-time reader, and "this term was never explained" becomes a lookup
in the log, which is something a model with the whole document in view has to
guess at.

A model writes the log, and code raises the flags. No model is asked whether
something is a problem. There is one more model call, which looks over the
whole log (never the text) for a later part that answers an earlier question,
because a reader going forward one chunk at a time is bad at noticing that.
All it can do is take an "open" flag away.

The idea of tracking what the reader holds at each sentence is old. Joseph
Williams's *Style: Lessons in Clarity and Grace* teaches writers to start a
sentence with what the reader knows and end it with what's new.
[ScholarPhi](https://arxiv.org/abs/2009.14237) finds where a paper defines its
terms, to help the people reading it. cold-read uses the same record to check
the writing.

## About

I'm june wunder, finishing a PhD in programming languages. I make the design
calls; Claude writes the code. Claude wrote this README from my notes and
decisions. More at [junewunder.com](https://junewunder.com).

MIT licensed. See [LICENSE](LICENSE).
