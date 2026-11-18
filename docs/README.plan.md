# Plan: README.md

Reader: A developer who writes READMEs and docs with a coding agent and has noticed the result assumes things the reader was never told. They have never seen cold-read.
Knows: Claude Code, agent, skill, README, git, markdown, node, just, model, Haiku, Sonnet, context, prompt, CLI

## cold-read

1. Say the problem: an agent writes with the whole project in view, so its text leans on things the reader was never given.
2. Say what cold-read does, in the order it happens: a blind reader reads chunk by chunk, writes a log, and code turns the log into flags.
   - defines: blind reader, chunk, log, flag
3. Show part of a real report, from a real README.
4. Say how early this is.

## Install

5. Give the install commands and what it needs.

## Checking a document

6. Give the command, and say what the reader and the list of known terms are for.
   - defines: reader, knows
   - uses: flag
7. Say what to do with a flag: fix the text, tell it the reader knows the term, or leave it.
   - uses: flag, knows
8. List the kinds of flag.
   - uses: flag, log

## Planning a document

9. Say what a plan is and show one.
   - defines: plan, point
10. Say how the plan is used: a person edits the plan before the text exists, and the finished text is checked against it.
   - uses: plan, flag
11. Say that an outline is the same format, read off a text that already exists.
   - defines: outline
   - uses: log, plan

## How well it works

12. Give the measured result: how many of the problems a person found by hand it catches, on which document, at what cost.
   - defines: hand pass
   - uses: flag
13. Say what it gets wrong and what it cannot see.
   - uses: flag, log

## How it works

14. State the two rules the design rests on.
   - uses: blind reader, log, flag, chunk
15. Name the ideas it borrows from.

## About

16. Say who made it and that Claude wrote the README.
