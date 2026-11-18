# List the recipes.
default:
    @just --list

# Run the unit tests (no model calls).
test:
    node --test test/

# Score cold-read against problems found by hand in an old README.
eval case="wfactory" *args:
    node eval/run.mjs {{case}} {{args}}

# Cold-read a document: just check README.md --reader "..." --knows "a, b"
check doc *args:
    node skill/scripts/cold-read.mjs check {{doc}} {{args}}

# Print a document's outline in the plan format.
outline doc *args:
    node skill/scripts/cold-read.mjs outline {{doc}} {{args}}

# Link the skill into ~/.claude/skills so Claude Code can use it.
install:
    mkdir -p ~/.claude/skills
    ln -sfn "{{justfile_directory()}}/skill" ~/.claude/skills/cold-read
