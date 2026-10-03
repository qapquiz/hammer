# Wallet actions (Tools)

The Tools tab leads to Wallet actions, a screen of four example requests a connected wallet can
fulfill: **Sign and send transaction** (a memo transaction, submitted on-chain after a fee
affordability check), **Sign in** (SIWS-style payload), **Sign message**, and **Sign transaction**.
Each card takes a text input (Sign message defaults to `Hello Solana!`), runs the wallet request on
tap, and renders a success or danger status alert with the result. Disconnected, the whole screen
collapses to a `Connect Wallet` button.

The status alerts and their on-chain side effects are the proof. All four cards are drivable with
fakewallet installed (sign/send prompts expose `AUTHORIZE` to approve and `SEND TRANSACTION TO
CLUSTER` to submit). `sign-message` and `sign-and-send` were proven live on 2026-10-04;
`sign-transaction` and `sign-in` reuse the same prompt pattern — drive and assert them the same
way, per card.

## Sub-features

- `actions-entry` — Tools tab shows the `Wallet actions` card; connected, it opens the four action
  cards; disconnected, it shows `Connect Wallet`.
- `sign-message` — the wallet signs the entered text; a success alert carries the signature.
- `sign-transaction` — the wallet signs the built memo transaction without submitting.
- `sign-in` — the wallet returns a sign-in payload for the active cluster; the alert shows the
  payload/account.
- `sign-and-send` — the memo transaction is submitted; the alert carries a signature, and the
  transaction later appears on the Activity screen.

## How to get to it (user POV)

- Tools tab (second bottom tab) → the `Wallet actions` card → the action cards, top to bottom:
  sign-and-send, sign-in, sign-message, sign-transaction.

## Driving it with adb + uiautomator

Preconditions:

- Without a wallet app: only `actions-entry` (disconnected variant) is drivable —
  `$HELPERS/tap.sh "Tools"`, `$HELPERS/tap.sh "Wallet actions"`, capture the `Connect Wallet`
  state, and report the four actions as unreachable behind wallet approval.
- With an MWA wallet app installed and a connection approved: proceed below.

- **Sign message.** Tap the message input, clear prefill if needed
  (`KEYCODE_MOVE_END` + `DEL` repeats), type
  `adb shell input text 'verify-hammer%sproof'`, capture the filled card
  (`artifacts/wallet-actions/01-sign-message-input`), then tap the card's action button (its label
  is the card's call-to-action, e.g. `Sign message`) and capture immediately
  (`02-sign-message-result`). Proof: the dump contains a success alert with a base58 signature and
  the entered text echoed in the payload view.

- **Sign transaction / Sign in.** Same shape: fill or accept defaults, tap the card's action,
  capture. Each success alert is distinguishable by its card title text in the same dump.

- **Sign and send (the side-effect proof).** Ensure the wallet holds SOL on the active cluster
  (devnet faucet via the wallet's tooling). Tap the sign-and-send action with the default memo or a
  typed one, wait for the alert, capture `03-sign-and-send`. Then prove the on-chain effect in a
  second user-facing view: navigate to the Wallet tab → `Activity` (see
  [wallet-balance-activity.md](./wallet-balance-activity.md)) and find the matching signature row;
  capture `04-activity-row`. The alert signature and the Activity row must agree.

- **Fee guard.** With a wallet that cannot pay the fee (empty account), the sign-and-send card must
  refuse with a danger alert mentioning the fee/balance instead of submitting — capture
  `05-fee-guard` and confirm no new row appears in Activity afterwards.

## Gotchas

- Status alerts are transient like all toasts — capture within a couple of seconds of the tap.
- `adb shell input text` cannot type spaces (use `%s`) and silently drops characters on slow
  emulators; always read the input's value back from the pre-tap capture.
- The four cards stack on one screen; the largest-bounds rule of `tap.sh` picks the enclosing
  card/Pressable, but verify the tapped bounds in the helper's output before asserting on results.
- Submissions target the active cluster — a devnet proof under a Testnet header is invalid. Record
  the cluster (visible in the header select dump of the same screen group).
- Transaction finality lags: the Activity row may take a few seconds; poll with a re-dump up to
  ~30s before failing.
