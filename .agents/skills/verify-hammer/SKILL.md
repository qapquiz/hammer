---
name: verify-hammer
description: "Drive the Hammer Solana mobile app (Expo/React Native Android) on the emulator the way a user does and capture proof of behavior. Use to verify UI changes, cluster selection, theme, connect-wallet flows, or any user-facing behavior in this repo — launch, doctor, drive, evidence, cleanup."
---

# Verify Hammer

Hammer is a Solana mobile dapp template: it connects to a phone wallet via Mobile Wallet Adapter
(MWA), reads balance/activity for the selected cluster, runs example wallet actions (sign message,
sign transaction, sign-in, sign-and-send memo), and manages cluster + theme settings. The surface a
user touches is the Android app, driven on the emulator through Expo dev-client. This skill launches
that app, checks it is worth driving, taps through real user paths by label (never coordinates),
captures screenshot + UI-dump evidence, and cleans up what it started.

Read `features/README.md` before driving; it indexes one recipe file per user-facing feature.

## Launch

Prerequisites: Android emulator (AVD `solana-mobile`), dev-client build installed on it
(`android/app/build/outputs/apk/debug/app-debug.apk` — rebuild with `npm run android` after native
dependency changes; JS-only changes need no rebuild).

```bash
.agents/skills/verify-hammer/helpers/launch.sh
```

`launch.sh` is idempotent and does, in order:

1. Starts Metro (`npm run dev`) in tmux session `metro-verify` unless something already answers on
   `localhost:8081`. Reuses a running Metro rather than starting a second one.
2. Verifies `adb get-state` = device.
3. `adb reverse tcp:8081 tcp:8081` — routes the emulator's localhost:8081 to the host Metro.
   Skipping this is the classic cause of the dev client hanging on a stale `Bundling 82%...` bar.
4. `am force-stop com.anonymous.hammer`, then opens the session with the dev-client deep link
   `exp+hammer://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8081`. A plain
   `am start -n .../.MainActivity` after force-stop lands on the dev-client launcher instead of the
   app session — that is the launcher screen with "DEVELOPMENT SERVERS"; if you see it, use the
   deep link.

Readiness (first bundle takes ~60s; Metro logs `Android Bundled ... (NNNN modules)` when done):

```bash
.agents/skills/verify-hammer/helpers/tap.sh "Connect Wallet" --check   # exit 0 when the UI is up
```

The emulator is slow on cold boot; a "System UI isn't responding" ANR right after boot is normal —
tap **Wait** and give it a minute. Teardown is in Cleanup below.

## Doctor

Run first whenever anything looks off — every check is read-only:

```bash
.agents/skills/verify-hammer/helpers/doctor.sh
```

It answers: is a device attached, is `com.anonymous.hammer` installed, is Metro answering on 8081
(`curl localhost:8081/status` = `packager-status:running`), and is Hammer's MainActivity the
foreground activity. Fix the first FAIL before driving anything; the foreground WARN is fixed by
re-running `launch.sh`.

## Drive

Drive through what a user touches: labels, not coordinates. The tap helper dumps the Android UI
hierarchy, finds the clickable element matching a label, taps its center, and prints what it tapped:

```bash
HELPERS=.agents/skills/verify-hammer/helpers
$HELPERS/tap.sh "Settings"          # bottom tab (desc ", Settings")
$HELPERS/tap.sh "Devnet"            # cluster trigger in the Wallet header (desc "Devnet")
$HELPERS/tap.sh "Connect Wallet"    # button (desc "Connect Wallet")
$HELPERS/tap.sh "Testnet"           # a row/card containing that text, e.g. on Settings → Cluster
```

Matching rules (clickable nodes only): match by substring of `content-desc` or contained `text`;
 among matches the LARGEST bounds wins — in React Native the enclosing row/card/Pressable is the
 real touch target, and small matching a11y virtual leaves (even with an exact desc) can swallow
 taps without firing the handler. Zero-bounds nodes are skipped (Compose-hosted dialogs like the
 header Select popover typically report none and are not adb-targetable — see
 features/cluster-selection.md). On no match the helper lists every clickable label currently on
 screen — use that list to re-aim.

Typed input: tap the field first, then `adb shell input text`. Spaces must be `%s`
(`adb shell input text 'Hello%sSolana'`); the `://` and `.` in RPC URLs type fine. To replace a
prefilled value: `adb shell input keyevent KEYCODE_MOVE_END` then repeat
`adb shell input keyevent DEL` before typing. Always read back the field's value from the next
`capture.sh` UI dump — `input text` silently drops characters on slow emulators.

After JS code changes: re-run `launch.sh` (force-stop + deep link forces a fresh bundle). Metro hot
reload is not relied on.

Stable handles seen in dumps, for writing assertions:

- Tabs: clickable nodes with desc `, Wallet` / `, Tools` / `, Settings` (yes, the leading `", "`)
- Cluster trigger: desc `Devnet`/`Testnet` (label of the active cluster)
- `Button desc="Connect Wallet"` when disconnected
- `accessibilityLabel` values that become descs: `Refresh balance`, `Refresh activity`,
  `Disconnect wallet`, `Open transaction <signature>` (role `link`, opens Solana Explorer)
- Tool cards (title texts): `Sign Message` (default input `Hello Solana!`), plus sign-in,
  sign-transaction, and sign-and-send cards on the Wallet actions screen

## Evidence

Every proof step captures a named pair — screenshot + UI hierarchy dump — into the skill's
artifacts directory, which cleanup never touches:

```bash
HELPERS=.agents/skills/verify-hammer/helpers
$HELPERS/capture.sh artifacts/cluster-selection/02-testnet-selected
#   → artifacts/cluster-selection/02-testnet-selected.png
#   → artifacts/cluster-selection/02-testnet-selected.ui.xml
```

Proof standards:

- Exercise the real user path — taps on the screen a user sees. No test-only endpoints, no
  calling Metro/HMR or RN internals to set state.
- Capture the action and the result: the screen before the tap and the screen after, with the
  change visible in the `.ui.xml` (text/desc values), not just in pixels.
- Verify side effects through a second view. App state (cluster, theme) persists via MMKV across
  process death: force-stop, re-run `launch.sh`, and show the value survived. On-chain side
  effects (sign-and-send) are proven by the signature in the status alert plus the transaction
  appearing on the Activity screen.
- Native/MWA failures are evidenced by logcat:
  `adb shell "logcat -d | grep -iE 'SolanaMobileWalletAdapterModule' | grep -vE 'at (kotlin|androidx|kotlinx)'"`.
- Metro-side evidence (bundle line, JS errors) comes from the `metro-verify` tmux session:
  `tmux capture-pane -t metro-verify -p`.

The wallet-approval boundary: Connect / sign / sign-in / sign-and-send all hand off to an external
MWA wallet app. This emulator has **none installed**, so the only provable path for those flows is
the error path (danger toast `Could not connect wallet` + the logcat line `Found no installed wallet
that supports the mobile wallet protocol`). If an MWA wallet app is installed, the approve path
becomes drivable by walking the wallet's own UI over adb — record that precondition in the run, and
never claim approve-path verification without it.

## Cleanup

Kill only what the run started; keep every artifact.

```bash
# 1. Metro: only if this run's launch.sh started it (it names the session 'metro-verify')
tmux has-session -t metro-verify 2>/dev/null && tmux kill-session -t metro-verify
# 2. The JS session started by launch.sh
adb shell am force-stop com.anonymous.hammer
# 3. Restore app state you mutated (e.g. cluster back to Devnet) unless the mutation is the proof
```

- Never kill by process name (`pkill -f metro` takes down unrelated processes).
- Never `adb shell pm clear com.anonymous.hammer` except as a deliberate factory reset: it wipes
  the dev client's server list and all app state. It is the documented way to get first-run state
  (cluster Devnet, no MMKV) — announce it when you use it.
- Do not uninstall the app; the dev-client APK is shared.
- Artifacts under `.agents/skills/verify-hammer/artifacts/` survive cleanup — after teardown, `ls`
  them to confirm the proof still exists.

## Isolation

One emulator + one Metro per machine. App state (cluster/theme via MMKV, dev-client server list)
is global to the install, so two verification runs sharing the emulator corrupt each other — if a
device is already running a verification session, refuse and wait. Multiple emulators are fine
(adb targets one device at a time; pin with `ANDROID_SERIAL=<serial>` when more than one is
attached).

## Helpers

| Script | Invocation | What it does |
| --- | --- | --- |
| `helpers/doctor.sh` | `helpers/doctor.sh` | Read-only health check: device, install, Metro, foreground |
| `helpers/launch.sh` | `helpers/launch.sh` | Start/reuse Metro, `adb reverse`, open dev-client session |
| `helpers/tap.sh` | `helpers/tap.sh "Testnet"` / `--check` | Tap (or probe) the clickable element by label |
| `helpers/capture.sh` | `helpers/capture.sh artifacts/<feature>/<step>` | Save screenshot + UI dump pair |
| `helpers/tap_match.py` | (internal — called by `tap.sh`) | Label-matching engine over the UI dump |

All helpers are safe to re-run; none of them delete anything.
