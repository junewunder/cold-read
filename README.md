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
[wfactory](https://github.com/junewunder/wfactory):

```
## Used before it is explained (10)

- line 3: "check you trust" is used at line 3 but only explained later, at line 22.
- line 8: "the tracker" is used at line 8 but only explained later, at line 22.
- line 94: "run records" is used once (first at line 94) and never explained.

## One thing, several names (1)

- line 53: One thing has 2 names: "fresh read-only session" (line 24), "reviewer agent" (line 53).

## Raised and never settled (1)

- line 24: Raises "behavior without a git remote" and nothing later settles it. Text: "With a git remote"
```

It's brand new. There is one measured run, described below, and nobody but me
has tried it.

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
reader got it wrong. A rerun reuses its earlier answers for every chunk above
your first edit.

| Flag | What the log shows |
|---|---|
| undefined | a term the reader meets before, or without, any explanation |
| alias | one thing called by two names that share no word |
| open | a promise or a question that no later part settles |
| stumble | words the reader can't resolve, such as a loose "this" |

## Planning a document

A **plan** is the outline a writer commits to before writing. It names the
reader, then lists each **point** the document makes, in order, with the terms
that point explains and the terms it relies on:

```markdown
# Plan: README.md

Reader: A developer who has never seen this tool.
Knows: git, Claude Code

## Install
1. Say how to install it, in one command.
   - defines: toy factory
   - uses: unit, check
```

The agent writes the plan and stops. You read and edit the plan instead of the
prose, since a wrong point costs one line to fix there and a rewrite later.
Then the agent writes the text, and `check --plan plan.md` adds four flags:

| Flag | What it found |
|---|---|
| missing | a term the plan explains that the text never explains |
| dropped | a point that no part of the text carries out |
| unplanned | a term in the text that the plan doesn't have |
| extra | a part of the text that serves no point |

For a document that already exists, `outline` prints the log in the same
format: what each part of the text does, and what it explains and relies on.
That **outline** is the plan the text actually follows. Edit it into the plan
you want and hand it back.

This README was written from [docs/README.plan.md](docs/README.plan.md).

## How well it works

There is one measurement so far. Before cold-read existed, an agent read that
older wfactory README top to bottom, keeping a list by hand of what the text
had told the reader. That **hand pass** found 14 problems, which were then
fixed. `eval/wfactory/` holds the README as it was and the 14 problems, and
`just eval` scores cold-read's flags against them.

| Blind reader | Caught, of 14 | Other flags |
|---|---|---|
| Haiku | 7 | 10 |
| Sonnet | 9 | 13 |

Reading that README chunk by chunk took about 8 seconds a chunk, and cost
$0.03 on Haiku and $0.30 on Sonnet.

The other flags are not all noise. By my reading, about half are problems the
hand pass missed ("run records" and "protections" really are never explained)
and half are the blind reader being wrong.

What it gets wrong:

- **It varies between runs.** The same model on the same text will catch a
  problem one time and miss it the next. Treat one run as a sample.
- **It misses a contrast that lost its other half.** "All of these are code"
  once sat beside rules that were only prompts. The prompts were cut, and the
  sentence stopped making sense. Neither model flagged it.
- **It can't tell whether a claim is true**, or whether the text is too long.
  The log records what the reader was told and nothing else.

## How it works

Two rules hold the design together.

The blind reader never sees later text. It gets the reader, the log so far,
the two chunks before this one, and the current chunk. So it can't know more
than a first-time reader, and "this term was never explained" becomes a lookup
in the log, which is something a model with the whole document in view has to
guess at.

A model writes the log, and code raises the flags. No model decides that
something is a problem. One more model call looks over the whole log (never
the text) to notice when a later part answers an earlier question, because a
reader going forward one chunk at a time is bad at that.

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
