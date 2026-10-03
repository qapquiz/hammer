# Balance & activity

For a connected wallet the Wallet tab shows the account card (label, truncated address,
`Disconnect wallet` control) and a balance card with a `Refresh balance` control; an `Activity`
button opens the Activity screen listing recent transactions for the selected cluster, each with a
status chip and a link that opens the transaction in Solana Explorer, plus `Refresh activity`.

**Reachable and proven with fakewallet (2026-10-04)** against the Surfpool fork: fund the freshly
authorized dev account with `requestAirdrop`, then `Refresh balance` shows the funded amount and
the Activity screen lists transactions with status chips and explorer links.

## Sub-features

- `balance-show` — connected Wallet tab shows the SOL balance for the active cluster.
- `balance-refresh` — `Refresh balance` re-reads from the cluster RPC and updates the number.
- `activity-list` — the Activity screen lists recent transactions with signature links and status
  chips (`Success` / `Confirmed` / `Pending`, or `Failed` for errored transactions).
- `activity-refresh` — `Refresh activity` re-reads the recent signatures.
- `activity-explorer` — tapping a signature link opens Solana Explorer at `/tx/<signature>` in the
  emulator browser.

## How to get to it (user POV)

- Wallet tab, after approving a connection: account card → balance card → `Activity` button.
- Activity tab screen is also reachable from the Wallet tab's connected state only (it is a stack
  screen, not a bottom tab).

## Driving it with adb + uiautomator

Preconditions:

- An MWA wallet app is installed on the emulator, has a keypair, and holds SOL on the active
  cluster (airdrop on the wallet's own tooling for devnet/testnet).
- A connection has been approved (see [connect-wallet.md](./connect-wallet.md) approve path).

- **Balance shows.** On the connected Wallet tab:
  `$HELPERS/capture.sh artifacts/balance-activity/01-balance` — the dump contains a formatted SOL
  amount and `Refresh balance`.

- **Refresh updates.** Note the value, trigger a balance change outside the app (send 0.001 SOL to
  the address from the wallet or CLI), then
  `$HELPERS/tap.sh "Refresh balance"`, wait ~5s, capture `02-refreshed`, and compare the dumps.
  The number must change; an unchanged number after a confirmed inbound transfer is a fail.

- **Activity lists.** `$HELPERS/tap.sh "Activity"` (the outline button on the connected Wallet
  tab), capture `03-activity` — the dump lists rows with
  desc `Open transaction <signature>` and status chip texts.

- **Explorer link.** `$HELPERS/tap.sh "Open transaction <signature>"` (substring matching on the
  signature works), wait ~5s for the browser, then
  `adb shell dumpsys window | grep mCurrentFocus` shows the browser package, and
  `adb shell dumpsys activity recents | grep -m1 Intent` (or the browser's own dump) contains
  `explorer.solana.com/tx/<signature>`. Capture `04-explorer`. Return with
  `adb shell input keyevent KEYCODE_BACK`.

- **Empty state.** On a fresh keypair with no transactions, the screen shows an empty-state
  message instead of rows — capture it as `05-empty` rather than treating it as a failure.

## Gotchas

- Balance and activity are cluster-scoped: a switch on the header cluster select changes what both
  screens show. Always record the active cluster in the run notes (it is in the same dump).
- The balance refresh hits the public RPC and can take seconds or rate-limit; retry once before
  failing the run, and check the `metro-verify` tmux scrollback for the fetch error.
- Signatures render truncated; match links by the visible prefix or by role (`link`) rather than
  the full signature.
- Localnet activity requires a local validator on the host plus `adb reverse tcp:8899 tcp:8899` and
  the Localnet RPC URL set (see cluster-selection.md).
