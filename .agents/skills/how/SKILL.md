---
name: how
description: "Use for \"how does X work\", code walkthroughs before changing something, and placement / ownership / layering questions (\"where should this live\", \"which package owns this\", \"is this the right layer\"). Explains subsystem architecture, runtime flow, onboarding mental models. Use why for motivation."
disable-model-invocation: true
---

# How

Explore the codebase to answer "how does X work?" questions. Produce architectural explanations at the level of a senior engineer onboarding onto a subsystem, enough to build a working mental model, not so much that it reads like annotated source code.

Each spawn below names a role line in the `pstack models` section of `AGENTS.md` (written by `/skill:setup-pstack`). Resolve the spawn's model from that line; run the seat on your own model (pass your own `--provider`/`--model`) when the section or the line is missing, and for the aliases `auto` and `inherit-parent`. If a configured model fails to resolve (`pi --list-models <entry>` finds nothing), run the seat on your own model and say so.

## Step 1. Assess Complexity

If the scope is ambiguous, state your interpretation and explore. The user can redirect.

- **Simple** (a single module, a small utility, a narrow question such as "how does function X work"): no explorers. One explainer explores and explains in a single pass. Go to Step 2b.
- **Complex** (a subsystem spanning multiple files or services, a cross-cutting feature, a full architectural overview): spawn parallel explorers first, then hand off to the explainer. Go to Step 2a.

When in doubt, take the simple path.

## Step 2a. Explore (complex questions only)

Decompose the question into 2 to 4 exploration angles, each a distinct slice of the subsystem. Spawn all explorers as backgrounded pi processes (one bash call), then wait and read the output files:

```bash
pi -p --no-session --tools read [--provider <p> --model <m>[:<thinking>]] \
  "<explorer prompt>" > /tmp/how-explorer-<n>.out 2>&1 &
```

- Prompt: `references/explorer-prompt.md` with its angle filled in
- `--tools read`: explorers are read-only
- model: the `how explorer` line, or your own model when unset

Then go to Step 3.

## Step 2b. Direct Explain (simple questions)

Spawn one pi process that explores and explains in one pass:

```bash
pi -p --no-session --tools read [--provider <p> --model <m>[:<thinking>]] \
  "<explainer prompt>" > /tmp/how-explainer.out 2>&1
```

- Prompt: `references/explainer-prompt.md` without the explorer-findings section
- model: the `how explainer` line, or your own model when unset

Go to Step 4.

## Step 3. Synthesize (complex questions only)

Once all explorers have returned, spawn one pi process to synthesize their findings into one explanation:

```bash
pi -p --no-session --tools read [--provider <p> --model <m>[:<thinking>]] \
  "<explainer prompt with findings>" > /tmp/how-explainer.out 2>&1
```

Build its prompt from `references/explainer-prompt.md` with every explorer's findings filled in.

## Step 4. Present

Present the explainer's output to the user. Light edits for clarity or context from the conversation are fine. Do not substantially rewrite it.

## Output Format

The explanation uses the sections defined in `references/explainer-prompt.md`, dropping any that do not apply: Overview, Key Concepts, How It Works, Where Things Live, Gotchas.
