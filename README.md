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
it. The code in brackets is the flag's id:

```
## Used before it is explained

- [f074] line 8: "tracker" is used 4 times (first at line 8) and never explained. (3 of 3 readings)
- [fb24] line 3: "check you trust" is used at line 3 but only explained later, at line 22. (3 of 3 readings)
- [9a05] line 94: "run records" is used once (first at line 94) and never explained. (1 of 3 readings)

## One thing, several names

- [427e] line 24: One thing has 2 names: "review before merge" (line 8), "fresh read-only session" (line 24). (1 of 3 readings)

## Raised and never settled

- [f52d] line 24: Raises "what happens to the branch when there is no git remote" and nothing later settles it. (3 of 3 readings)
```

It's brand new. It has been measured on one document and used in earnest on
one more, both described below, and nobody but me has tried it.

## Install

It's a [Claude Code](https://docs.claude.com/en/docs/claude-code) skill with a
small CLI under it. It needs node 20 or newer and the `claude` command, signed
in. It has no other dependencies and uses no API key: every model call is a
`claude -p` run on your plan. The optional style pass also needs `vale`.

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
`--knows` because this reader does have it, or leave it and say why:

```sh
node skill/scripts/cold-read.mjs leave README.md 427e "the review and the session that does it are two things"
```

A flag you leave is not raised again. The report lists it at the end with
your reason.

`check` reads the document twice and merges the flags. `--runs 3` reads it
three times.

Each check of an edited text is a **round**. The blind reader's answers are
cached, so a round pays only for the chunks from your first edit down, and the
report says what it paid. The report also marks the flags that are new since
the last round, and it says when to stop. A round is quiet when no flag that
two or more readings raised is still standing. After a quiet round you go
through the flags that only one reading raised, once, and a second quiet round
in a row ends the cold read. Without that rule it never ends: every round turns up one or
two small things the round before didn't.

| Flag | What the log shows |
|---|---|
| undefined | a term the reader meets before, or without, any explanation |
| alias | one thing called by two names that share no word |
| open | a promise or a question that no later part settles |
| stumble | words the reader can't resolve, such as a loose "this" |
| contrast | wording set against something the reader was never given |

## The style pass

```sh
node skill/scripts/cold-read.mjs style notes.md
```

A cold read finds what the reader was never told. `style` finds a smaller,
cheaper kind of problem: habits of agent prose that a pattern can match. It
calls no model and takes about a second. It needs [Vale](https://vale.sh), a
prose linter that ships as one binary.

```
notes.md: 2 style flags

  1:1  "The token lives in"  AI overused verb: 'The token lives in'. Say where the item is defined or stored. Disable this rule for biography or housing prose.  [FigurativeLives]
  1:32  " — "  Dash as a connector. Use a comma, a colon, a full stop or parentheses.  [Dash]
```

It runs 23 rules. One is this repo's own. The other 22 are picked from
[tbhb/vale-ai-tells](https://github.com/tbhb/vale-ai-tells), a package of 155
rules for the tells of AI writing, which Vale downloads on the first run. I
ran the whole package over my own agent-written markdown and had models judge
a random sample of each rule's hits. About one hit in ten was a
sentence worth rewriting, so `style` keeps only the rules where at least half
were. Passive voice, semicolons and colons are among the rules left out: in
technical writing they were nearly always fine.

## Planning a document

A **plan** is the outline a writer commits to before writing. It names the
reader, then lists each **point** the document makes, in order, with the terms
that point explains and the terms it relies on:

```markdown
# Plan: README.md

Reader: A developer who has never seen this tool.
Knows: git, Claude Code
Length: 120 lines

## What it enforces
Length: 30 lines
1. List the rules the code enforces.
   - defines: check
   - uses: unit
   - mentions: GitHub Actions
   - contrasts: point 2
   - because: an agent can ignore its prompt
2. List the rules that are only asked of the agent.
```

`Length:` is the most the document, or one section, may be. `mentions:` lists
names the point brings up without explaining, such as a product in a list of
examples. The reader isn't expected to know them, and they are never flagged.

The last two lines under point 1 are **links**: they say the point only works
because of something else. `contrasts:` names the other side of a contrast,
`because:` says the point has to give its reason, and `example of:` says it
has to give an example.

A plan can be checked before any text exists. `cold-read plan plan.md` reads
the plan as if it were a log, with no model and in under a second. It flags a
term that a point relies on before any point explains it, a contrast whose
other side is not in the plan, and section lengths that add up to more than
the document's. Delete point 2 above and point 1 is flagged.

The agent writes the plan and stops. You read and edit the plan instead of the
prose, since a wrong point costs one line to fix there and a rewrite later.
Then the agent writes the text, and `check --plan plan.md` adds six flags:

| Flag | What it found |
|---|---|
| long | the document or a section is longer than the plan allows |
| missing | a term the plan explains that the text never explains |
| dropped | a point that no part of the text carries out |
| link | a contrast, reason or example the plan asks for that the text lacks |
| unplanned | a term in the text that the plan doesn't have |
| extra | a part of the text that serves no point |

The length is counted by code. It is in the plan because almost every fix for
a flag adds words, and nothing else pushes back.

For a document that already exists, `outline` prints the log in the same
format: what each part of the text does, what it explains and relies on, and
how long each section is.
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
`just eval` scores cold-read's flags against them. Each row below is one
setup, and "7, then 6" is two separate runs of it, the first catching 7 of the
14 problems. "Other flags" are the flags that match none of the 14:

| Blind reader | Caught, of 14 | Other flags | Cost |
|---|---|---|---|
| Haiku, one reading | 7, then 6 | 10 | $0.05 |
| Sonnet, one reading | 9, then 7 | 13, then 7 | $0.38 |
| Opus, one reading | 4 | 6 | $0.81 |
| Haiku, three readings merged | 8, then 8 | 13 | $0.13, then $0.15 |

The runs used slightly different wording in the blind reader's instructions,
so read the table as a rough picture. Each run of three Haiku readings took about 3 minutes.

Three things stand out.

The same model on the same text catches a different half each time. Every one
of the 14 problems was caught by at least one reading. But in the second run
of the table's last row, the three readings caught 8 between them, and only 2
of those 8 were caught by every one of the three.

A stronger model is a worse blind reader. Opus caught the fewest. The job is
to not know things, and a stronger model understands a term the reader was
never given and lets it pass.

More readings beat a better model. Three Haiku readings did about as well as
one Sonnet reading for less than half the cost. So `check` reads the document
twice by default, and every flag says how many readings raised it.

The flags in the "Other flags" column are not all noise. By my reading, about
half are problems the hand pass missed ("run records" and "protections" really
are never explained) and half are the blind reader being wrong.

### The first real use

The one real use so far is a rewrite of the README of
[gbaa](https://github.com/junewunder/gbaa), my Game Boy Advance recompiler. An
agent wrote a plan of 27 points, I read and approved it, and the agent wrote
the text and ran four rounds of three readings each. These are the flags each
round raised, after its three readings were merged:

| Round | Flags | Cost |
|---|---|---|
| 1 | 52 | $0.35 |
| 2 | 39 | $0.37 |
| 3 | 33 | $0.33 |
| 4 | 22 | $0.36 |

A round took about 5 minutes. By the agent's own rough tally, 37 flags over
the four rounds led to a fix in the text. The best one: a code sample showed a struct
field named `d_0300000c`, and the prose called it a field. All three readings
said that a name made of an address reads as an address. The rest of the flags
were bookkeeping in the plan's lists of terms, or the blind reader being
wrong.

Four things went badly, and each one changed the tool:

- No round came back with nothing new, so there was no point at which to
  stop. That is where the quiet-round rule comes from.
- The same wrong flags came back every round. Now a flag can be left with a
  reason.
- We had agreed on 150 to 200 lines and the text came out at 283. Now the
  plan sets lengths and code counts them.
- Adding one term to `--knows` threw away every cached answer. Now it throws
  away only the answers from the first chunk that contains the term. On a
  later draft of the same README, 117 of 144 cached answers survived such an
  edit.

I then ran the version before those changes and the version after on that
later draft, three readings each. The old version raised 3 wrong "missing"
flags, such as one saying the text never explains "lift" when it says "to lift
a game is to...". The new version raised none. Otherwise the two agreed. Two or
more readings raised 14 flags in the old version and 12 in the new, mostly the
same ones. A single reading raised 21 in the old and 34 in the new, which is
why a quiet round counts only the flags that readings agree on.

### What it gets wrong

- **It misses things.** One reading finds about half of what a careful person
  finds. More readings find more, with more wrong flags alongside.
- **It rarely catches a contrast that lost its other half.** The wfactory
  README had a list of rules that its code enforces, introduced by "All of
  these are code". That line was written when the list sat beside a second
  list, of rules that were only instructions to the agent. The second list was
  cut, and the line no longer contrasted with anything. One reading in three
  flagged it, and none did before the log recorded contrasts.
- **It can't tell whether a claim is true.** The log records what the reader
  was told and nothing else. In the gbaa rewrite three untrue claims passed
  every reading, and were caught by running the commands behind them.
- **The plan checks are barely tested.** Checking a text against its plan has
  been run on two documents, gbaa's README and this one. Checking a plan on
  its own flagged nothing on either, so I can't yet say what it catches.
- **The changes that came out of the gbaa rewrite are new.** Leaving a flag
  and the quiet-round rule have been through one document, this README. It
  took four rounds to reach a quiet one, with 10, 4, 2 and then 0 flags that
  both readings raised, and a fifth to confirm it: $0.83 in all. No text has
  yet had to be cut to fit a length.

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
