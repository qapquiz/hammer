# Wallet connect

The Wallet tab shows a `Connect Wallet` button when no account is connected. On web, connecting
deterministically fails because Mobile Wallet Adapter has no wallet provider in a browser — the
button must surface a clear error toast. That failure toast is the web-verifiable behavior.

## Sub-features

- `connect-visible` renders `Connect Wallet` on the Wallet tab (and on `/tools/wallet-actions`).
- `connect-fails-cleanly` shows the error toast `Could not connect wallet` with description
  `Found no installed wallet that supports the mobile wallet protocol.` and a `Try again` action.
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
