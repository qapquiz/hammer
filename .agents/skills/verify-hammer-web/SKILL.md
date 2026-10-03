---
name: verify-hammer-web
description: >-
  Verify the Hammer app (Solana mobile template: Expo + React Native + Solana Kit + wallet-ui)
  through its web target — react-native-web served by Metro (`expo start --web`) and driven in a
  real browser with agent-browser. Use for any "verify / smoke-test / prove UI behavior" request on
  this repo when no Android emulator is available. Verifiable on web: tab navigation, Settings >
  Cluster (RPC URL editing, localStorage persistence), and Dark/Light/System theme switching.
  NOT verifiable on web: real Mobile Wallet Adapter flows (connect, sign, send) — those are
  Android-only. Product gap: tapping Connect Wallet on web hangs silently (no toast/error) —
  documented in features/wallet-connect.md; press RN pressables with helpers/press.sh.
---

# Verify Hammer via the web target

This repo is an Android-first Expo app, but the browser target is officially supported for
validation (`bun run web`, README). These instructions drive a **real browser against a real Metro
dev server** — no emulator, no mocked components. Everything below was executed and confirmed
against this checkout.

## What web can and cannot prove

- **Can prove:** routing/tabs, screen composition, theme switching, cluster selection and RPC URL
  editing with localStorage persistence, form validation, and status messages.
- **Product gap (2026-10-04):** the previously documented "deterministic failure toast" for
  Connect Wallet does **not** reproduce on the current build. Tapping `Connect Wallet` fires the
  request and then nothing observable happens — no toast, no console error, still disconnected
  after 20s+ (the web bundle's MWA `transact` never resolves; it contains no
  "Found no installed wallet" error string). Record `connect-fails-cleanly` as a product gap with
  evidence (screenshot + console dump + wait), never as verified either way.
- **Cannot prove:** any Mobile Wallet Adapter flow. Screens behind a connected wallet (balance,
  activity, sign/sign-in/send cards) are unreachable on web. Do not report them verified; record
  them as blocked-by-platform with the attempted entry point.

## Launch

Start **your own** instance on a non-default port. Never attach to a server you did not start
(the user often runs `bun run web` on 8081 — driving it would mutate their localStorage state).

```bash
.agents/skills/verify-hammer-web/helpers/verify.sh start 8082
# → ready: http://localhost:8082 (pid <pid>, log /tmp/hammer-web-verify-8082.log)
```

Readiness is the `Waiting on http://localhost:8082` line in `/tmp/hammer-web-verify-8082.log`.
Note: the HTTP 200 comes fast, but the **first page load triggers a Metro bundle compile** (up to
~1–2 min). Readiness to *drive* is the UI rendering — see Drive.

Teardown: `.agents/skills/verify-hammer-web/helpers/verify.sh stop 8082` (kills only the process
group recorded in `/tmp/hammer-web-verify-8082.pid`).

## Doctor

Run first whenever anything looks off — it answers "is this instance ours and worth driving?":

```bash
.agents/skills/verify-hammer-web/helpers/verify.sh doctor 8082
```

Four read-only checks: index HTML has `<title>Hammer</title>`; the pidfile process is alive; the
port listener belongs to our process group (not a foreign instance); the metro log has the ready
line. Any FAIL → stop and start a fresh instance on another port. Do not drive a foreign instance.

## Drive

Harness: `agent-browser` (CDP headless Chrome). Always use a named session so you never touch
another agent's or the user's browser:

```bash
export AGENT_BROWSER_SESSION=hammer-web-verify
agent-browser open http://localhost:8082
agent-browser wait --text "Connect Wallet" --timeout 180000   # waits out the first compile
agent-browser snapshot -i -c                                   # refs @eN, then click @eN
```

**Pressing RN-web pressables — use `helpers/press.sh "<text>"` (2026-10-04).** agent-browser's CDP
clicks never reach react-native-web Pressable handlers here (verified: zero pointer/mouse/click
events arrive at an instrumented target), and its XPath resolver misses elements that exist
("✓ Done" clicks that land nowhere). `press.sh` dispatches a synthetic pointer burst
(pointerdown → mousedown → pointerup → mouseup → click) on `document.elementFromPoint` at the
innermost visible element containing the text — it reaches RN Pressables, tabs, and links, and
scrolls into view first. Exception: react-aria-based heroui Select **items** ignore even synthetic
(untrusted) events — drive cluster switching through the Settings → Cluster rows instead of the
header popover.

Stable handles (from this repo's source): tab names `Wallet` / `Tools` / `Settings` (`[role=tab]`,
expo-router bottom tabs); Tools index shows **two** cards — `Meteora DLMM` (→ `/tools/meteora`)
and `Wallet actions` (→ `/tools/wallet-actions`); Settings rows are
`accessibilityRole="button"` links labeled `Cluster`; theme buttons labeled `Dark` / `Light` /
`System`; cluster rows are buttons labeled e.g. `Localhost No RPC URL configured. Disabled`; the
RPC URL textbox has placeholder `RPC URL`; action buttons `Update URL` and `Reset to Default`.
Routes: `/` (wallet), `/tools`, `/tools/meteora`, `/tools/meteora/<address>`, `/tools/wallet-actions`,
`/settings`, `/settings/cluster`.

**Gotcha you WILL hit — LogBox error overlay eats clicks.** The web build logs a benign heroui
`[colorKit.RGB]` console error, which pops Expo's dev-only LogBox; its `#error-toast` /
`#error-overlay` divs cover the click point even when visually empty, and get recreated on
re-render. After any console error appears, neutralize then interact — LogBox is dev chrome, so
this is legitimate (it does not exist in production builds):

```bash
agent-browser eval --stdin <<'EOF'
document.querySelectorAll('#error-toast,#error-overlay').forEach(e => { e.style.pointerEvents='none'; e.style.display='none' }); 'ok'
EOF
```

If a click still reports "covered", re-run the neutralizer immediately before the click, or click
the element by JS scoped to **visible** elements (react-navigation keeps hidden tab screens
mounted, so an unscoped text search matches the wrong screen):

```bash
agent-browser eval --stdin <<'EOF'
(() => { const b = [...document.querySelectorAll('div[role=button],button')]
  .filter(x => (x.innerText||'').trim() === 'Connect Wallet' && x.offsetParent !== null)[0]
  if (!b) return 'not found'; b.click(); return 'clicked' })()
EOF
```

Per-feature recipes live in `features/` — read the matching file before driving a feature.

## Evidence

Write proof to `.agents/skills/verify-hammer-web/evidence/<run-name>/` (create it; it is untracked
scratch-proof — cleanup must never delete it). A proof of one user path is:

1. **Action + result screenshots** — `agent-browser screenshot <file>.png` before and after the
   action (the app name/version is visible on the Settings tab for identity). Pass **absolute
   paths** — agent-browser resolves relative paths against the daemon's cwd, not your shell's.
2. **State transcript** — the `agent-browser snapshot -c` excerpts showing the changed UI (status
   text, chip labels, selected tab), saved into a `transcript.txt` in the run dir.
3. **Side effect** — the real persisted state, not just pixels:
   `agent-browser eval --stdin` with `localStorage.getItem('hammer\\wallet-ui:cluster')` for
   cluster config (single backslash in the key). Theme proof is `document.documentElement.className`
   plus `getComputedStyle(document.body).backgroundColor`.
4. **Console dump** — `agent-browser console` output, so noise (the `colorKit.RGB` error) is
   distinguishable from real failures.

Run dir: `EV=<repo>/.agents/skills/verify-hammer-web/evidence/<run-name>` (repo = this checkout;
always pass absolute paths to `agent-browser screenshot`);
screenshot with `agent-browser screenshot "$EV/step.png"`.

Standards: exercise the real user path (clicks on visible elements, real routes); capture the
action and the resulting state; verify side effects alongside what's visible. Mock nothing — there
are no test-only endpoints; cluster edits hit localStorage only.

## Cleanup

```bash
export AGENT_BROWSER_SESSION=hammer-web-verify
agent-browser close                                   # close YOUR browser session only
.agents/skills/verify-hammer-web/helpers/verify.sh stop 8082
ss -tln | grep 8082   # expect no output
```

`stop` kills only the process group from its own pidfile — never `pkill` by name (it would take
down the user's instance on 8081). Run cleanup after every attempt, failed ones included. Evidence
under `.agents/skills/verify-hammer-web/evidence/` survives cleanup by design; `/tmp/hammer-web-
verify-8082.{log,pid}` is scratch and may be removed.

## Helpers

`.agents/skills/verify-hammer-web/helpers/verify.sh` — shown in Launch/Doctor/Cleanup above.
`start [port]` (default 8082) launches `bunx expo start --web --port <port>` under `setsid`,
records the pid, waits for the ready line, and refuses if the port is taken. `doctor [port]` runs
the read-only checks. `stop [port]` kills that exact process group and waits for the port to free.
