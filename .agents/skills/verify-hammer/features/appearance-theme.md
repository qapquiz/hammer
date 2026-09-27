# Appearance (theme)

The Settings tab offers a three-way theme switcher — Dark, Light, System — that restyles the whole
app (background, text, status bar) immediately. System follows the emulator's UI mode. Whether the
choice persists across restarts is an implementation question: prove it by restarting, never by
assuming.

## Sub-features

- `theme-switch` — tapping `Dark` turns the app dark (black background, light text); tapping
  `Light` turns it light (white background, dark text), instantly, no restart.
- `theme-system` — `System` defers to the emulator UI mode; toggling the emulator's night mode
  flips the app.
- `theme-persist` — the chosen theme survives an app restart. **Verify before claiming** — if the
  switch resets after restart, that is the finding, not a failed run.

## How to get to it (user POV)

- Settings tab → the segmented control directly under the `Cluster` card, three buttons labeled
  `Dark`, `Light`, `System` (selected one is highlighted blue and carries
  `accessibilityState selected=true`).

## Driving it with adb + uiautomator

Preconditions:

- App session up, `doctor.sh` passes. Baseline theme: whatever the emulator shows on landing —
  capture it first so the after-state is comparable.

- **Switch to Dark.** Navigate and capture before/after; assert on pixels for color and on the
  dump for the selected state.

  ```bash
  HELPERS=.agents/skills/verify-hammer/helpers
  $HELPERS/tap.sh "Settings"
  $HELPERS/capture.sh artifacts/appearance-theme/01-before
  $HELPERS/tap.sh "Dark"
  sleep 2
  $HELPERS/capture.sh artifacts/appearance-theme/02-dark
  ```

  Proof: `02-dark.png` shows a near-black background; the `02-dark.ui.xml` marks the `Dark` button
  `selected="true"` and the `Light` button `selected="false"`.

- **Switch to Light.** `$HELPERS/tap.sh "Light"`, capture `03-light`, and confirm the flip.

- **System follows the emulator.** Tap `System`, then drive the emulator's night mode and capture
  both sides:

  ```bash
  $HELPERS/tap.sh "System"
  adb shell cmd uimode night yes; sleep 2
  $HELPERS/capture.sh artifacts/appearance-theme/04-system-dark
  adb shell cmd uimode night no; sleep 2
  $HELPERS/capture.sh artifacts/appearance-theme/05-system-light
  ```

  The two captures must differ the same way the explicit Dark/Light captures did.

- **Persistence (decide it, don't assume it).** Force-stop, `launch.sh`, capture again:

  ```bash
  adb shell am force-stop com.anonymous.hammer
  $HELPERS/launch.sh
  $HELPERS/tap.sh "Connect Wallet" --check
  $HELPERS/tap.sh "Settings"
  $HELPERS/capture.sh artifacts/appearance-theme/06-after-restart
  ```

  Compare against the pre-restart choice. Record whichever behavior you observe.

## Gotchas

- The theme buttons are three separate clickable buttons whose texts are exactly `Dark`, `Light`,
  `System`; there is no container to match, so the labels are the handles.
- `cmd uimode night yes|no` changes the emulator globally — other apps' screenshots taken during
  the run inherit it. Restore `night no` (or the original value) when the run ends.
- Screenshot-only color assertions are fragile on JPEG-ish artifacts; always pair with the
  `selected="true"` state in the dump.
- The Settings screen also contains the `Cluster` card and a version footer
  (`Hammer v<version>`); it is a good screen for smoke-checking that a build rendered at all.
