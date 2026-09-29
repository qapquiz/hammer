# Navigation tabs

Bottom tab navigation (expo-router `Tabs`) across the app's three screens: Wallet, Tools,
Settings, plus stack pushes into sub-screens with back buttons.

## Sub-features

- `tabs-switch` selects each of the three tabs and renders its screen.
- `tabs-stack` pushes `/tools/wallet-actions` and `/settings/cluster` from their cards.
- `tabs-back` returns from a pushed screen via its back button.

## How to get to it (user POV)

- Tap `Wallet`, `Tools`, or `Settings` in the bottom tab bar (visible on every screen).
- On Tools, tap the `Wallet actions` card.
- On Settings, tap the `Cluster` card.
- On a pushed screen, tap the back button (`Tools, back` / `Settings, back`).

## Driving it with agent-browser

Preconditions:

- Instance healthy per doctor; app rendered (`Connect Wallet` text visible).

- **Switch tabs.** Snapshot, then click each `[role=tab]` ref. Run `agent-browser click @e<N>` for
  the `Tools` tab — a link `Wallet actions` appears; for `Settings` — a `Cluster` card link and
  `Dark`/`Light`/`System` buttons appear; for `Wallet` — the `Connect Wallet` button returns.
  The clicked tab shows `[selected]` in the snapshot.
- **Push a sub-screen.** From Settings run `agent-browser click` on the `Cluster` card link ref —
  the URL becomes `/settings/cluster` and a `Settings, back` link appears.
- **Navigate back.** Click the `Settings, back` link — URL returns to `/settings`.
- **Proof.** Screenshot each screen into `../evidence/<run-name>/`; the transcript must show the
  `[selected]` tab and one pushed URL transition.

## Gotchas

- react-navigation keeps hidden tab screens mounted: a DOM-wide text search finds elements from
  hidden screens. Only click snapshot refs (agent-browser resolves coverage) or scope JS clicks
  with `offsetParent !== null`.
- The LogBox overlay (see `../SKILL.md`) can cover the tab bar after console errors; neutralize
  before tab clicks.
- Wallet tab root is `/` — `agent-browser get url` shows the path only after client routing
  settles; wait ~1s after a tab click before asserting URLs.
