---
name: setup-pstack
description: Configure which models pstack uses per role and at what reasoning budget. Detects your available models and writes an always-applied section that overrides the skill defaults. Use for /skill:setup-pstack, "configure pstack models", "pstack budget", or changing pstack's model choices.
disable-model-invocation: true
---

# Setup pstack

Write the `pstack models` section into `~/.pi/agent/AGENTS.md`. Pi loads that file in every session, and pstack's skills read their per-role spawn models from the section.

## Steps

### 1. Detect available models

Run `pi --list-models` (it accepts a fuzzy search term) to enumerate the `provider/model` entries you can pass to a spawned `pi -p` subagent. That is the dependable source. Never write an entry you have not confirmed resolves. The aliases `inherit-parent` and `auto` are always valid even though they are not detected entries.

### 2. Load current state

The default role-to-model mapping is the section shape shown in step 5 below. If `~/.pi/agent/AGENTS.md` already carries a `pstack models` section, read it and treat its `# budget` line and its role values as the current choices. Otherwise start from those defaults. A line whose role is not in step 5, such as `how critics`, is from a retired role. Drop it.

### 3. Budget, map, and confirm

**(a) Ask for a budget.** Ask with short lettered options rather than free text. Offer these four options with these exact labels, and name the current budget when the section records one.

- `unlimited — keep max`
- `large — xhigh reasoning`
- `medium — high reasoning`
- `small — medium reasoning`

**(b) Apply it.** Build the working table from the skill defaults, and on a re-run keep any role you changed by family, list, or alias (`inherit-parent`, `auto`). The budget sets the `:<thinking>` suffix (pi model patterns accept one, e.g. `google/gemini-3-pro:xhigh`) of every real entry, panel entries included, to `xhigh`, `high`, or `medium`; `unlimited` leaves entries as they are, and an entry with no suffix counts as `max`. If a model rejects the resulting thinking level, use the highest accepted level at or below the target, else mark the role as needing a choice. `inherit-parent` and `auto` do not change. So `small` turns `google/gemini-3-pro` into `google/gemini-3-pro:medium`.

With no existing section, propose from the detected set and confirm: code roles (`feature, refactoring`, `bug-fix`, `perf-issue`, `hillclimb`, `swarm workers`, `how explorer`, `why investigators`) get your fastest strong coding model; judgment and prose roles (`judgment and prose`, `hardest tasks`, `how explainer`, `why synthesizer`, `reflect judgment, divergent, synthesizer`) get your strongest reasoning model; panel roles (`arena runners`, `arena cross-judge pool`, `architect runners`, `interrogate reviewers`) get one entry per distinct model family, up to three. One model detected means everything is `inherit-parent`.

**(c) Show the roles and confirm.** Show every role with its model, marking any real entry not in the detected set as needing a choice. Also list each line step 2 dropped. Ask whether to accept as-is or change specific roles, offering the detected models plus `inherit-parent` and `auto` (both mean: this role runs on your own model) as lettered options. For panel roles the value is a list, and one spawn runs per entry, alias entries included, so the list length sets the count. `arena cross-judge pool` is also a list, but Arena selects one value from it whose model family differs from yours when possible. `swarm workers` is the default model for every worker unless a race or comparison assigns another model per arm.

### 4. Validate

Every real entry written must be in the detected set. `inherit-parent` and `auto` always pass. If a chosen real entry is not available, stop and ask again.

### 5. Write the section

In `~/.pi/agent/AGENTS.md`, replace the existing `## pstack models` section in place, or append a new one at the end. Leave the rest of the file untouched so re-runs stay idempotent. Shape:

```markdown
## pstack models

# pstack per-role model choices (overrides skill defaults). One line per role. Delete a line to fall back to the skill default.
# `inherit-parent` or `auto` as a value: the role runs on your own model. Alias entries in a panel list still count toward its fan-out.
# An entry may carry a `:<thinking>` suffix (off..max). `# budget` records the chosen label.
# budget: unlimited (max)
feature, refactoring: inherit-parent
bug-fix: inherit-parent
perf-issue: inherit-parent
hillclimb: inherit-parent
judgment and prose: inherit-parent
hardest tasks: inherit-parent
how explorer: inherit-parent
how explainer: inherit-parent
why investigators: inherit-parent
why synthesizer: inherit-parent
reflect tooling: inherit-parent
reflect judgment, divergent, synthesizer: inherit-parent
arena runners: inherit-parent, inherit-parent, inherit-parent
arena cross-judge pool: inherit-parent, inherit-parent, inherit-parent
swarm workers: inherit-parent
architect runners: inherit-parent, inherit-parent, inherit-parent
interrogate reviewers: inherit-parent, inherit-parent, inherit-parent
```

with each `inherit-parent` replaced by the confirmed `provider/model[:thinking]` entry, and panel lists shortened to the confirmed entry count.

### 6. Confirm

Tell the user the section was written, that it is user-global, and that new spawns pick it up immediately. Re-running this skill updates it.

### 7. Offer a verification skill (optional)

Check whether the project has a way to drive the real app for proof (a `verify-*` skill, or an existing harness). If not, offer once: "want a project-local verification skill, so agents can drive the app the way a user does and prove changes work? I can generate one with /skill:create-verification-skill." On yes, invoke it. On no, move on without pushing.
