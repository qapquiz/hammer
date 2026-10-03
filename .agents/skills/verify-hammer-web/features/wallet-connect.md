# Wallet connect

The Wallet tab shows a `Connect Wallet` button when no account is connected. On web, Mobile Wallet
Adapter has no wallet provider in a browser. **Product gap (2026-10-04):** tapping the button fires
the connect request and then nothing observable happens — no error toast, no console error, still
disconnected after 20s+ (the web bundle's MWA `transact` never resolves). The previously documented
"deterministic failure toast" (`Could not connect wallet` / `Found no installed wallet that
supports the mobile wallet protocol.`) does **not** reproduce on the current build — do not claim
it, and do not treat the silent hang as a broken run: it is the current product behavior, recorded
as a gap for the app owners.

## Sub-features

- `connect-visible` renders `Connect Wallet` on the Wallet tab (and on `/tools/wallet-actions`).
  **Proven (2026-10-04).**
- `connect-fails-cleanly` **not satisfied on the current build** — attempted entry point: Wallet
  tab → `Connect Wallet` press (helpers `press.sh`), 20s wait. Observed: no toast, no console
  error, button still present (`evidence/maintenance-web/02-connect-wallet-hang.png`). Report as a
  product gap with that evidence; re-verify if the app's web connect error handling changes.
- `connect-android` (blocked-by-platform) — real connection, balance, disconnect; Android only.

## How to get to it (user POV)

- Open the app; the Wallet tab is the default screen — `Connect Wallet` is the main button.
- The same button gates `/tools/wallet-actions` when unconnected.

## Driving it with agent-browser

Preconditions:

- Instance healthy per doctor; no account connected (fresh browser session has no MWA provider).

- **See the button.** Run `agent-browser open http://localhost:<port>` then
  `agent-browser wait --text "Connect Wallet" --timeout 180000`. The Wallet tab is selected.
- **Attempt connect.** Neutralize LogBox overlays (see `../SKILL.md`), then click the visible
  `Connect Wallet` button (snapshot ref, or the visible-scoped JS click).
- **Assert the toast.** Within ~5s, run `agent-browser snapshot -c` and grep for
  `Could not connect wallet` and `Found no installed wallet that supports the mobile wallet
  protocol.` — both appear with a `Try again` button (`role=status`). Screenshot
  `connect-web-error.png` in `../evidence/<run-name>/`.
- **Proof.** Toast text transcript + screenshot. The account must remain unconnected
  (`Connect Wallet` still present). Record `connect-android` as blocked-by-platform.

## Gotchas

- Do not interpret the toast as a failed verification run — on web this is the *correct* outcome.
- A hidden Wallet screen stays mounted from other tabs; an unscoped `find text "Connect Wallet"`
  can click the invisible copy and appear to do nothing. Use visible-scoped clicks.
- Repeated connect attempts stack multiple `Try again` toasts — one proof toast is enough.
- If heroui's `[colorKit.RGB]` LogBox overlay opens full-screen (`Dismiss error` button), dismiss
  it and re-apply the overlay neutralizer before continuing.
