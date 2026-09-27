# Connect wallet

Connect wallet hands the app a Solana account through Mobile Wallet Adapter: the user taps
`Connect Wallet`, Android resolves an installed MWA wallet app, the wallet shows an authorization
prompt, and on approval the app swaps the button for the account card, balance, and an Activity
entry. Without any MWA wallet installed, resolution fails and the app surfaces a danger toast —
this is today's only drivable path and it is fully observable.

## Sub-features

- `connect-entry` — the disconnected Wallet tab shows a single `Connect Wallet` button.
- `connect-no-wallet` — with no MWA wallet installed, the tap fails with a danger toast
  (`Could not connect wallet` / `Found no installed wallet that supports the mobile wallet
  protocol.`) and a `Try again` button; logcat records the native cause.
- `connect-approve` — with an MWA wallet installed, the wallet app opens the authorization prompt
  and approval replaces the button with the account card. **Unreachable today** (no wallet app on
  the emulator).
- `disconnect` — the connected account card exposes `Disconnect wallet` and returns to the
  connect button. **Unreachable today** (requires a connection).

## How to get to it (user POV)

- Wallet tab (first tab, default landing): the `Connect Wallet` button when disconnected.
- Tools tab → `Wallet actions` card: the same disconnected state shows `Connect Wallet`.

## Driving it with adb + uiautomator

Preconditions:

- App session up (`launch.sh`), `doctor.sh` passes, no MWA wallet app installed on the emulator
  (`adb shell pm list packages | grep -i solana` returns none beyond system packages).

- **Confirm the entry.** Run
  `$HELPERS/tap.sh "Connect Wallet" --check` — exit 0 and `FOUND: desc='Connect Wallet' ...`
  proves the disconnected state renders.

  ```bash
  HELPERS=.agents/skills/verify-hammer/helpers
  $HELPERS/capture.sh artifacts/connect-wallet/01-disconnected
  ```

- **Clear logcat, then attempt connect.** The toast is transient — capture immediately.

  ```bash
  adb logcat -c
  $HELPERS/tap.sh "Connect Wallet"
  sleep 3
  $HELPERS/capture.sh artifacts/connect-wallet/02-no-wallet-toast
  adb shell "logcat -d | grep -iE 'SolanaMobileWalletAdapterModule' | grep -vE 'at (kotlin|androidx|kotlinx)'" \
    > $HELPERS/../artifacts/connect-wallet/03-logcat.txt
  ```

  Proof: the capture's `.ui.xml` contains `Could not connect wallet` and
  `Found no installed wallet that supports the mobile wallet protocol.`; the logcat file contains
  `Found no installed wallet that supports the mobile wallet protocol` and
  `ActivityNotFoundException ... dat=solana-wallet:`.

- **Second view.** The toast disappears on its own after a few seconds; a later capture without the
  toast plus the retained artifacts above is the paired state evidence.

- **Approve path (only with an MWA wallet installed).** Precondition: install an MWA-compatible
  wallet APK on the emulator and fund/prepare it per the wallet's own docs. Then
  `$HELPERS/tap.sh "Connect Wallet"`, wait for the wallet app to come foreground
  (`adb shell dumpsys window | grep mCurrentFocus`), and walk the wallet's prompt with the same
  tap/dump primitives. Approval must yield the account card (a dump showing `Disconnect wallet`).
  If the wallet app is absent, report `connect-approve` as unreachable with this precondition.

## Gotchas

- The toast lives at the bottom of the screen and auto-dismisses within seconds; a slow
  `sleep` before `capture.sh` loses the proof. Capture first, assert second.
- `Try again` repeats the same resolution — do not use it as evidence of a retry succeeding.
- Tapping `Connect Wallet` from the Tools → Wallet actions screen exercises the same protocol; the
  toast text and logcat lines are identical, so either entry proves `connect-no-wallet`.
- A plain `am start` after force-stop shows the dev-client launcher, which also has no Connect
  button — if `--check` finds nothing, confirm you are in the app session (header shows `Wallet`
  and the cluster label), not the launcher.
