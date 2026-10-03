# Tools and wallet actions

The Tools tab lists two cards — `Meteora DLMM` (pool discovery + create-position, see the Android
map's `meteora-dlmm.md` for behavior; its list/detail render on web) and `Wallet actions`, the
example screen for sign-in, sign-message, and sign-and-send wallet requests. When no wallet is
connected (always true on web) the actions screen shows only the gated `Connect Wallet` button.
(Source: `src/features/tools/tools-feature-entry.tsx` — two `toolItems` since the Meteora commit.)

## Sub-features

- `tools-list` renders **both** cards, `Meteora DLMM` and `Wallet actions`, with their
  descriptions. **Proven (2026-10-04).**
- `tools-push` a card navigates to its route (`/tools/wallet-actions`, `/tools/meteora`) with a
  back link. **Proven for Wallet actions (2026-10-04).**
- `actions-gated` unconnected state renders `Connect Wallet` instead of the four action cards
  (Sign and Send Transaction, Sign In, Sign Message, Sign Transaction). **Proven (2026-10-04).**
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
