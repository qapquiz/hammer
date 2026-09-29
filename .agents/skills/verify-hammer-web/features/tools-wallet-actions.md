# Tools and wallet actions

The Tools tab lists one card, `Wallet actions`, linking to `/tools/wallet-actions` — the example
screen for sign-in, sign-message, and sign-and-send wallet requests. When no wallet is connected
(always true on web) the screen shows only the gated `Connect Wallet` button.

## Sub-features

- `tools-list` renders the `Wallet actions` card with its description.
- `tools-push` the card navigates to `/tools/wallet-actions` with a `Tools, back` link.
- `actions-gated` unconnected state renders `Connect Wallet` instead of the four action cards
  (Sign and Send Transaction, Sign In, Sign Message, Sign Transaction).
- `actions-signed` (blocked-by-platform) — the action cards require a connected MWA wallet;
  unreachable on web.

## How to get to it (user POV)

- Tabs: `Tools` → tap the `Wallet actions` card. Direct route: `/tools/wallet-actions`.

## Driving it with agent-browser

Preconditions:

- Instance healthy; app rendered; no wallet connected.

- **See the card.** Click the `Tools` tab ref. Snapshot shows the link `Wallet actions — Run the
  example wallet requests…`. Screenshot `tools-list.png`.
- **Push the screen.** Click the `Wallet actions` link ref — `Connect Wallet` renders and a
  `Tools, back` link appears. Screenshot `wallet-actions-gated.png`.
- **Prove the gate.** Transcript must show `Connect Wallet` present and none of the four action
  card titles (they only mount with an account). Record `actions-signed` as blocked-by-platform.
- **Back.** Click `Tools, back` — the card list returns.

## Gotchas

- The four action cards never render on web — do not attempt to force them via DOM edits; that
  proves nothing about the app. Their logic is Android-only (MWA).
- Both the Tools screen and the Wallet tab render a `Connect Wallet` button; hidden screens stay
  mounted, so scope clicks to visible elements (see `../SKILL.md`).
- The route also logs dev warnings (`[Layout children]: No route named "network"/"transaction"`)
  to the console — known noise, not a failure; it appears in the console dump you capture.
