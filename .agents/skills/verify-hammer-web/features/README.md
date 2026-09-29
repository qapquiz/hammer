# Hammer web verification map

Maintained source for verifying Hammer's user-facing behavior on the web target. Read the matching
feature file before driving; the recipes assume the launch/doctor/drive conventions in `../SKILL.md`.

## Baseline preconditions

- Your own Metro web instance is ready per `../SKILL.md` Launch (helpers script, non-default port).
- `helpers/verify.sh doctor <port>` passes on all four checks.
- Browser runs in a named `AGENT_BROWSER_SESSION`; first load waits for `Connect Wallet` text.
- The LogBox neutralizer from `../SKILL.md` Drive is applied after any console error appears.
- Never drive an instance this run did not start.

## Driving conventions

- Prefer accessible names and `[role=tab]` / `[role=button]` handles over CSS selectors.
- Screenshot before and after each user action into `../evidence/<run-name>/` using **absolute**
  paths (agent-browser resolves relative paths against the daemon's cwd).
- Assert state twice where it matters: what renders **and** what persisted (localStorage key
  `hammer\wallet-ui:cluster`, or `documentElement.className` for theme).
- Restore mutated state before finishing a feature (e.g. `Reset to Default` on the cluster page)
  unless the proof requires keeping it; keep proof artifacts regardless.
- Report Android-only paths as blocked-by-platform with the attempted entry point; never count a
  skipped entry point as verified through a different path.

## Features

- [Navigation tabs](./navigation-tabs.md) — bottom tab bar, stack pushes, back navigation.
- [Wallet connect](./wallet-connect.md) — Wallet tab and the deterministic connect failure toast on web.
- [Cluster settings](./settings-cluster.md) — cluster selection, RPC URL editing, reset, persistence.
- [Theme switcher](./settings-theme.md) — Dark / Light / System switching and its visible effect.
- [Tools and wallet actions](./tools-wallet-actions.md) — Tools tab card and the gated actions screen.
