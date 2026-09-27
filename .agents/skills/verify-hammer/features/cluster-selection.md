# Cluster selection

Cluster selection decides which Solana cluster the app reads (balance, activity) and which network
a wallet authorization targets. The active cluster is shown as the header select on the Wallet and
Activity screens; the full manager lives in Settings → Cluster. Localhost and Mainnet stay
disabled (dimmed, non-selectable) until they are given an RPC URL. The choice persists across app
restarts via MMKV.

## Sub-features

- `select-open` — the header select opens a popover listing Devnet, Testnet, Localhost (disabled),
  Mainnet (disabled), and a `Cluster settings` entry.
- `select-switch` — choosing a cluster updates the header label immediately and everywhere.
- `select-persist` — the chosen cluster survives a full app restart.
- `settings-manage` — Settings → Cluster lists all four clusters with their URLs and an
  Active marker, and offers URL editing with a status message.
- `enable-localnet` — entering an RPC URL for Localhost enables it in both pickers; clearing it
  (`Reset clusters`) disables it again.

## How to get to it (user POV)

- Tap the cluster label (`Devnet`) in the header of the Wallet tab.
- Tap the cluster label in the header of the Activity screen (connected wallet only).
- Settings tab → the `Cluster` card.
- Inside the popover: `Cluster settings` jumps to the same Settings screen.

## Driving it with adb + uiautomator

Preconditions:

- Baseline state per `README.md`: app session up, cluster Devnet, no wallet connected.
- `helpers/doctor.sh` passes.

- **Inspect the header popover (inspect-only).** Run `$HELPERS/tap.sh "Devnet"` (the header
  trigger). A popover titled `Cluster` appears listing `Devnet`, `Testnet`, `Localhost` (dimmed),
  `Mainnet` (dimmed), and `Cluster settings`.

  ```bash
  HELPERS=.agents/skills/verify-hammer/helpers
  $HELPERS/capture.sh artifacts/cluster-selection/01-baseline-devnet
  $HELPERS/tap.sh "Devnet"
  sleep 2
  $HELPERS/capture.sh artifacts/cluster-selection/02-popover-open
  adb shell input keyevent KEYCODE_BACK   # close it again
  sleep 1
  ```

  Its items cannot be tapped by label from adb (zero-bounds a11y nodes — see Gotchas); switching
  happens on the Settings screen below.

- **Switch to Testnet (Settings path).** Navigate and tap the Testnet row:

  ```bash
  $HELPERS/tap.sh "Settings" && sleep 2
  $HELPERS/tap.sh "Cluster" && sleep 2
  $HELPERS/capture.sh artifacts/cluster-selection/03-cluster-screen-devnet-active
  $HELPERS/tap.sh "Testnet" && sleep 2
  $HELPERS/capture.sh artifacts/cluster-selection/04-testnet-selected
  ```

  Proof of selection+switch (Testnet has a default URL, so selecting it also activates it): the
  dump shows the editor heading `Testnet URL`, and after backing out to the Wallet tab the
  clickable header trigger reads `Testnet`:

  ```bash
  adb shell input keyevent KEYCODE_BACK && sleep 2   # back out of the Cluster screen
  $HELPERS/tap.sh "Wallet" && sleep 2                # Wallet tab mounts its header
  $HELPERS/capture.sh artifacts/cluster-selection/05-header-testnet
  ```

- **Prove persistence.** Restart the whole JS session and re-read the header:

  ```bash
  adb shell am force-stop com.anonymous.hammer
  $HELPERS/launch.sh   # wait for readiness
  $HELPERS/tap.sh "Connect Wallet" --check
  $HELPERS/capture.sh artifacts/cluster-selection/06-persisted-after-restart
  ```

  The dump must show the header trigger desc `Testnet`.

- **Restore baseline.** Same path back: `$HELPERS/tap.sh "Settings"`, `$HELPERS/tap.sh
  "Cluster"`, then `$HELPERS/tap.sh "Devnet"`. Capture `07-restored-devnet` and confirm the
  Wallet header reads `Devnet`.

- **URL editing / enabling Localhost.** On the Cluster screen tap the `Localhost` row (disabled:
  this only selects it for editing — the Active marker stays put), then tap the `RPC URL` input,
  clear it with `KEYCODE_MOVE_END` + repeated `DEL` if prefilled, and type
  `adb shell input text 'http://10.0.2.2:8899'` (10.0.2.2 = host loopback from the emulator; for a
  host validator also run `adb reverse tcp:8899 tcp:8899` and use `http://127.0.0.1:8899`). Tap
  `Update URL` — the status line `Localhost URL updated.` appears and the row's chip flips from
  `Disabled` to `Ready`. Restore with `Reset to Default` (clears the URL and disables the cluster
  again).

## Gotchas

- While the popover is open, `$HELPERS/tap.sh "Devnet"` would re-tap the trigger (exact desc wins)
  and close it.
- The header Select popover's items are Compose-hosted and expose no tap geometry to adb (their
  a11y nodes report zero bounds in every dump mode). Treat the popover as inspect-only: open it,
  capture it, but switch clusters through the Settings → Cluster screen, whose rows are plain RN
  touch targets.
- The Settings tab is desc `, Settings` (leading comma); the Settings → Cluster card matches the
  contained text `Cluster`. The largest-bounds rule keeps them apart, but check the captured dump
  to confirm what was actually tapped.
- Cluster changes on the Settings screen apply immediately for already-enabled clusters; disabled
  clusters only highlight for editing.
- A restart without `launch.sh` lands on the dev-client launcher — that screen shows the cluster
  label of nothing. Always come back through the deep link.
