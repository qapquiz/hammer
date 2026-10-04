# Meteora DLMM

The Tools tab's Meteora card leads to pool discovery, the create-position flow, and — since the
deposit/withdraw feature — per-position management. The list screen searches Meteora's Data API
(cluster-independent), shows pool cards (pair, bin step, TVL, 24h APR/volume/fees) with filters
(search, TVL floor, sort) and a Load-more control. Tapping a pool opens the detail screen: pool
stats, an explorer link, and — only on a Mainnet-cluster RPC with a connected wallet — the
create-position form (strategy presets, amount fields, derived bin/price range, rent estimate)
with the owned-positions list ("Your positions") below it; selecting a position opens the manage
card with Deposit / Withdraw / Close. On any other cluster the detail screen shows a "Mainnet
required" gate; disconnected on Mainnet it shows a "Connect to create a position" gate.

## Sub-features

- `pools-list` — the list screen renders live Data API pools with the active cluster label in the
  header; filters and Load more re-query the API. **Proven end to end (incl. 2026-10-04 runs).**
- `pool-detail` — tapping a card opens the detail route `/tools/meteora/<address>` with the pool's
  stats and explorer link. **Proven.**
- `mainnet-gate` — on a non-mainnet cluster the detail screen shows the "Mainnet required" alert
  instead of the form. **Proven.**
- `connect-gate` — on Mainnet while disconnected, the detail screen shows "Connect to create a
  position" with a `Connect Wallet` button. **Proven.**
- `position-form` — connected on Mainnet: strategy presets (Spot narrow / Spot wide / Bid-Ask),
  amount fields, derived bin range / price range / rent, `Preview position` → `Confirm position`
  → `Start over` flow states. **Proven.**
- `position-create` — confirming builds the transaction (DLMM SDK over the cluster RPC), runs a
  CU-estimation simulation and balance asserts, hands it to the wallet to sign, and surfaces
  "Position created" with explorer links; failures land in a danger alert with `Try again`.
  **Proven end to end 2026-10-04 (`../artifacts/fakewallet-flow/`).** Failed simulations surface
  an honest `Try again` state (re-proven 2026-10-04, `../artifacts/maintenance-2026-10-04-b/`).
- `positions-list` — connected on Mainnet, the detail screen lists owned positions below the
  create form: range, In-range/Empty chips, token amounts, claimable fees, explorer link,
  `Refresh` control, and an empty state ("No positions in this pool yet — create one above.").
  **Empty state proven 2026-10-04. Rows with an existing position: not yet proven live** (needs a
  position, see `position-create` precondition).
- `deposit` — manage card, Deposit tab: amount fields spread evenly (spot) across the
  position's own bin range; side rules enforced client-side (above active bin → X only, below →
  Y only; an empty field means "this side empty"). **Not yet proven live** — needs a funded
  position; funding recipe per Gotchas.
- `withdraw` — manage card, Withdraw tab: 25/50/75/100% chips; removes that share of every bin
  (100% = bps 10000). Fees stay claimable; closing claims them. **Not yet proven live.**
- `close` — manage card, Close tab: reclaims the position's rent; refuses while liquidity
  remains (button label "Withdraw liquidity first") and warns about pending farm rewards; claims
  pending swap fees before closing. **Not yet proven live.**

## How to get to it (user POV)

- Tools tab → `Meteora DLMM` card → list; tap any pool card → detail.
- The create form and the positions section require, in order: active cluster id
  `solana:mainnet` (Settings → Cluster or header select), a connected wallet, and funded token
  balances for the chosen amounts.
- Positions section sits **below the create form** — scroll down on the detail screen.

## Driving it with adb + uiautomator

Preconditions:

- App session up, `doctor.sh` passes.
- For `mainnet-gate`: any non-mainnet active cluster (e.g. Devnet) — the gate alert is the proof.
- For `position-form` / `position-create` / positions features: active cluster `solana:mainnet`
  pointed at a fork (Surfpool `:8899` via adb reverse), wallet connected (fakewallet), and the
  dev account funded with SOL plus both pool tokens **at the canonical ATAs** (see Gotchas —
  derive them with the spl-token helper, never hand-rolled seed order).

- **List.** `tap.sh "Meteora DLMM"` from the Tools tab, wait ~7s for the Data API, capture; assert
  pool card texts (`<A>-<B>` pairs, `TVL`) in the dump.

- **Detail + gates.** `tap.sh "<POOL-NAME>"`; on Devnet assert the `Mainnet required` alert text;
  on Mainnet disconnected assert `Connect to create a position`; on Mainnet connected assert the
  form (`Amount X` / `Amount Y` fields, strategy chips) and — after scrolling — `Your positions`.

- **Create.** Tap an amount field, type the amount, **`KEYCODE_BACK` to close the keyboard before
  tapping anything else**, fill the second field the same way, then `Preview position` →
  `Confirm position`. The wallet comes foreground — approve there (fakewallet:
  `SEND TRANSACTION TO CLUSTER`). Assert back in Hammer: `Position created` plus
  `View position on explorer`; second-view via the fork RPC
  (`getSignaturesForAddress` on the wallet → the tx with `err: null`).

- **Positions + manage (unproven path — drive it to prove it).** After a successful create,
  scroll down: the positions list shows a row with `In range`/`Out of range`, amounts, and the
  position's bin range. Tap the row → the manage card (Deposit default). Deposit: fill one or
  both amounts, `Deposit`, approve in the wallet, assert `Deposit confirmed`. Withdraw: pick a
  percent chip, `Withdraw`, approve, assert `Withdrawal confirmed`. Close: `Close position`,
  approve (fee claim runs first when fees are pending), assert `Position closed`; the list
  refreshes and the row disappears.

## Gotchas

- **Keyboard discipline.** With the soft keyboard open, on-screen buttons shift and the tap
  helper can hit keyboard keys instead (digits get appended to the focused field — read both
  field values back from a fresh dump before proceeding). Close the keyboard with ONE
  `KEYCODE_BACK` before tapping `Preview`/`Confirm`; extra BACKs pop the route and eventually
  exit the app to the launcher — recover with `launch.sh`.
- **RN LogBox overlay.** A failed simulation surfaces the SDK error in a dev-mode LogBox overlay
  whose buttons are zero-bounds (not adb-targetable). `KEYCODE_BACK` collapses it (a `!` bubble
  stays until the next app relaunch). A full relaunch clears it.
- **Below-the-fold virtualization.** The detail screen's lower content (form buttons, positions
  list) is not in the UI dump until you scroll — swipe up before asserting on it.
- **Data API decimals can disagree with the chain.** The form derives base units from the Data
  API's decimals; for the YZY-USDC fork pool the API says 6 while the on-chain mint has 0 — so a
  typed `8` becomes 8,000,000 base units. Fund token balances at the **Data API's decimal scale**
  or the simulation fails with `insufficient funds` regardless of how much you seeded.
- **Canonical ATA derivation.** The ATA PDA seeds are `[owner, tokenProgram, mint]` — derive with
  the spl-token helper (`getAssociatedTokenAddressSync`), not a hand-rolled
  `[owner, mint, tokenProgram]` order (that yields a different, wrong address; the app's own
  balance pre-check has this bug — see the run notes / report).
- The detail screen's SDK queries are gated on a connected wallet (`enabled: !!account`) — with
  no wallet connected the screen makes no RPC calls, so a fork can be tested UI-only only down to
  the connect gate.
- `position-create` fails honestly when balances are missing: the CU-estimation simulation runs
  the real instructions and surfaces the program error (`insufficient funds`) with a `Try again`
  state. Fund before asserting create success.
- The DLMM program only exists on mainnet — there is no devnet deployment; the "Mainnet required"
  gate is correct behavior, not drift. Testing without mainnet funds = point the Mainnet cluster
  at a fork (Surfpool).
- `Try again` re-validates the wallet session — fakewallet may come foreground with a fresh
  `AUTHORIZE` prompt mid-flow; approve and continue.
- Proven reference runs: `../artifacts/fakewallet-flow/` (position created + confirmed on the
  fork, incl. funding recipe with the canonical-ATA trap) and
  `../artifacts/maintenance-2026-10-04-b/` (gates, positions-list empty state, honest-failure
  states, keyboard/LogBox traps).
