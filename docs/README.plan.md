# Plan: README.md

Reader: A developer who writes READMEs and docs with a coding agent and has noticed the result assumes things the reader was never told. They have never seen cold-read.
Knows: Claude Code, claude -p, agent, skill, README, git, markdown, node, just, model, Haiku, Sonnet, Opus, context, prompt, CLI, cache
Length: 300 lines

## cold-read

1. Say the problem: an agent writes with the whole project in view, so its text leans on things the reader was never given.
2. Say what cold-read does, in the order it happens: a blind reader reads chunk by chunk, writes a log, and code turns the log into flags.
   - defines: blind reader, chunk, log, flag
3. Show part of a real report, from a real README, and say that each flag counts how many readings raised it and carries an id.
   - defines: wfactory
4. Say how early this is.

## Install

5. Give the install commands, what it needs, and how to start using it.

## Checking a document

6. Give the command, and say what the reader and the list of known terms are for.
   - defines: reader, knows
   - uses: flag
7. Say what to do with a flag: fix the text, tell it the reader knows the term, or leave it with a reason.
   - uses: flag, knows
8. Say that it reads the document more than once, and why.
   - defines: check
   - uses: blind reader, flag
9. Say what a round is, what it costs, and when to stop.
   - defines: round, quiet round
   - uses: flag, blind reader, chunk
   - because: a round never comes back with nothing new
10. List the kinds of flag.
   - uses: flag, log

## Planning a document

11. Say what a plan is and show one, with its lengths, the names it only mentions, and its links.
   - defines: plan, point, link, length, mentions
   - example of: plan
   - mentions: GitHub Actions
12. Say that a plan can be checked on its own, before any text exists.
   - uses: plan, log, point, length
13. Say how the plan is used: a person edits the plan before the text exists, and the finished text is checked against it, length included.
   - uses: plan, flag, length
   - because: every fix for a flag adds words
14. Say that an outline is the same format, read off a text that already exists, and that this README was written from a plan.
   - defines: outline
   - uses: log, plan

## How well it works

15. Say what it was measured against: problems found by hand in one older README.
   - defines: hand pass
   - mentions: just eval
16. Give the measured result: how many of those problems it catches, how many other flags it raises and how many of those are real, the time and the cost.
   - uses: flag, blind reader
17. Say what the numbers show: readings differ, a stronger model reads worse, and more readings beat a better model.
   - because: the blind reader's job is to not know things
   - uses: flag, blind reader
18. Tell the first real use: a README written plan first, the flags and cost of each round, and the best catch.
   - defines: gbaa
   - uses: plan, point, round, flag
   - example of: flag (a struct field named after an address)
19. Say what went badly there and what each failure changed in the tool, then compare the tool before and after on the same text.
   - uses: round, quiet round, length, knows, flag
20. Say what it gets wrong and what it cannot see: it varies between readings, it cannot check a claim, and the plan checks and the newest changes are barely tested.
   - uses: flag, log, plan

## How it works

21. State the two rules the design rests on.
   - uses: blind reader, log, flag, chunk
22. Name the ideas it borrows from.
   - defines: Style: Lessons in Clarity and Grace, ScholarPhi

## About

23. Say who made it, that Claude wrote the README from this plan, and the license.
