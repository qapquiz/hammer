---
name: reflect
description: Spawn three parallel review subagents over the active transcript, surface learnings, and route each to a concrete edit on an existing skill. Use when the user says reflect.
disable-model-invocation: true
---

# Reflect

Mine the current conversation for durable learnings, then route them into skill edits.

## When to invoke

Invoke when the user says "reflect" or "/reflect". Skip when the conversation is trivial, off-topic, or already covered by an existing skill the parent followed correctly. One-offs are not learnings.

## Process

### 1. Locate the active transcript

The parent finds its own transcript file before fanning out. Pi writes session files as JSONL under `~/.pi/agent/sessions/<project-slug>/`; the current project's directory holds the active session. Do not glob across other projects' directories there. That crosses project boundaries and reads private chats from unrelated projects.

```bash
ls -t ~/.pi/agent/sessions/<this-project>/*.jsonl 2>/dev/null | head -10
```

For each candidate, read the first JSONL lines and check the content contains the conversation's opening user prompt. Take the matching path. If no path resolves, write a tight digest of the session and pass that instead.

### 2. Spawn three reviewers in parallel

One bash call, three backgrounded pi processes (Subagents section of poteto-mode), with the role models below. Reviewers need tool access for context lookups (tickets, chat threads, observability traces referenced in the transcript), so run them with default tools.

Each reviewer and the synthesizer name a role line in the `pstack models` section of `AGENTS.md` (written by `/skill:setup-pstack`). Resolve the spawn's model from that line; run the seat on your own model when the section or the line is missing, and for the aliases `auto` and `inherit-parent`. If a configured model fails to resolve (`pi --list-models <entry>` finds nothing), run the seat on your own model and say so.

| Lens | Role line | Fallback model | Prompt template |
|---|---|---|---|
| Judgment | `reflect judgment, divergent, synthesizer` | your own model | `references/judgment-reviewer.md` |
| Tooling | `reflect tooling` | your own model | `references/tooling-reviewer.md` |
| Divergent | `reflect judgment, divergent, synthesizer` | your own model | `references/divergent-reviewer.md` |

Pass each template verbatim, substituting the transcript path or digest where marked. Reviewers return findings in their output files.

### 3. Synthesize

One more pi process, with the model from the `reflect judgment, divergent, synthesizer` line (fallback: your own model), default tools. The synthesizer's quality check includes spot-verifying citations, which can require tool access. Use `references/synthesizer.md` verbatim, with each reviewer's full output inlined where marked. The synthesizer returns a structured Accepted / Rejected / Backlog list.

### 4. Structural enforcement check

Sanity-check the synthesizer's Accepted list. For any item that would be enforced more reliably by a lint rule, script, metadata flag, or runtime check, move it from Accepted to Backlog. See the **encode-lessons-in-structure** principle skill.

### 5. Apply

Before applying any Accepted edit, present the synthesizer's full Accepted/Rejected/Backlog output to the user and wait for explicit approval. The user picks which subset to apply and may redirect routings. Skill changes affect every future agent in the org. Do not auto-apply.

Backlog items file to whatever devex / backlog tracker your team uses automatically. Only the Accepted list waits for approval.

For each approved Accepted item, follow the Routing field exactly:

- Trivial existing-skill edit (a one-line bullet, a tightened sentence, a stale fact corrected): parent does directly.
- Substantive existing-skill edit (a new section, a new pattern table, more than ~10 lines): follow poteto-mode's **authoring-a-skill** playbook and run its draft / test / iterate loop.
- `tune description: <skill path>` (the skill exists but didn't trigger when it should have): follow the **authoring-a-skill** playbook and optimize the description for routing.
- `new skill: <kebab-name>`: author it per the **authoring-a-skill** playbook. Do not invent the shape ad hoc.

If your environment ships a SKILL.md validator, run it on every touched skill before declaring done. Skip this step if it doesn't.

### 6. Summarize for the user

Short list, no preamble:

- Edits applied: `<skill path>`. What changed, one line each.
- New skills created: `<skill path>`. One line each (rare).
- Backlog filed to the devex tracker: `<issue title>` (`<tags>`). One line each.
- Dropped: one line per rejected finding + reason from the synthesizer.
