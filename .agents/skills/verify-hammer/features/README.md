# Hammer verification map

This directory is the maintained source for verifying the user-facing behavior of the Hammer Solana
mobile app. Read this index before driving the app, then use the matching feature file as the
recipe.

## Baseline preconditions

- The app runs on an Android emulator (AVD `solana-mobile`) through Expo dev-client, launched with
  `../helpers/launch.sh`; `../helpers/doctor.sh` passes.
- Baseline state: no wallet connected (no MWA wallet app is installed on the emulator), cluster
  **Devnet** (shown in the Wallet header), theme follows the emulator default.
- Never drive an app session you did not start this way; the dev-client launcher screen is not the
  app.
- No other verification run is using this emulator. App state (cluster, theme) is global to the
  install via MMKV.
- Proof artifacts go under `../artifacts/<feature-id>/` via `../helpers/capture.sh`.

## Driving conventions

- Start every recipe from the baseline state unless its preconditions say otherwise.
- Tap by label through `../helpers/tap.sh` — never by coordinates. If a label matches nothing, the
  helper prints every clickable label on screen; use that to re-aim.
- Capture a `../helpers/capture.sh` pair (PNG + `.ui.xml`) before and after every asserted action.
- Assert on the `.ui.xml` (text/desc values), not on pixels alone.
- After mutating app state, prove persistence with force-stop + `launch.sh` + second view, then
  restore the baseline (e.g. cluster back to Devnet).
- `adb shell input text` needs `%s` for spaces and drops characters on slow emulators — always read
  the value back from a capture.

## Proof and skip reporting

- Capture the user action and the resulting state, not only the final screen.
- Record the feature ID and the entry point used with every artifact set.
- Wallet-approval flows require an MWA wallet app installed on the emulator. None is installed
  today: their provable path is the documented error path, and everything behind approval is
  **unreachable**. Report an unreachable path with the attempted entry point and the unmet
  precondition — never as verified through a different path.
- Native wallet-protocol failures are evidenced with logcat (see SKILL.md → Evidence), UI failures
  with the captured pair.

## Feature entry contract

Each feature file starts with an H1 title and one paragraph describing the user-visible behavior.
It then uses exactly four H2 sections in this order.

1. `Sub-features` lists short IDs with one line for each behavior.
2. `How to get to it (user POV)` lists every user entry point.
3. `Driving it with adb + uiautomator` starts with `Preconditions:` and uses labeled bullets that
   pair each user action with an exact command and observable result.
4. `Gotchas` lists traps that can waste or invalidate a verification run.

Keep implementation details out of the map. Name only user paths, stable handles, required state,
commands, and observable proof.

## Features

- [Cluster selection](./cluster-selection.md) — header cluster switcher and the Settings → Cluster
  screen: switching, disabled clusters, RPC URL editing, persistence. **Proven end to end.**
- [Connect wallet](./connect-wallet.md) — connect button and the no-wallet error path.
  **Error path proven; approve path preconditioned on an MWA wallet app.**
- [Appearance (theme)](./appearance-theme.md) — Light/Dark/System switcher in Settings.
- [Balance & activity](./wallet-balance-activity.md) — balance card and Activity screen for a
  connected wallet. Unreachable without an MWA wallet app today.
- [Wallet actions (Tools)](./wallet-actions-tools.md) — sign message, sign transaction, sign-in,
  sign-and-send memo. Approval-gated like above.
