# Meteora DLMM

The Tools tab's Meteora card leads to pool discovery and the create-position flow. The list screen
searches Meteora's Data API (cluster-independent), shows pool cards (pair, bin step, TVL, 24h
APR/volume/fees) with filters (search, TVL floor, sort) and a Load-more control. Tapping a pool
opens the detail screen: pool stats, an explorer link, and — only on a Mainnet-cluster RPC with a
connected wallet — the create-position form (strategy presets, amount fields, derived bin/price
range, rent estimate) that hands the built transaction to the connected wallet to sign. On any
other cluster the detail screen shows a "Mainnet required" gate; disconnected on Mainnet it shows
a "Connect to create a position" gate.

## Sub-features

- `pools-list` — the list screen renders live Data API pools with the active cluster label in the
  header; filters and Load more re-query the API.
- `pool-detail` — tapping a card opens the detail route `/tools/meteora/<address>` with the pool's
  stats and explorer link.
- `mainnet-gate` — on a non-mainnet cluster the detail screen shows the "Mainnet required" alert
  instead of the form.
- `connect-gate` — on Mainnet while disconnected, the detail screen shows "Connect to create a
  position" with a `Connect Wallet` button.
- `position-form` — connected on Mainnet: strategy presets (Spot narrow / Spot wide / Bid-Ask),
  amount fields, derived bin range / price range / rent, `Preview position` → `Confirm position`
  → `Start over` flow states.
- `position-create` — confirming builds the transaction (DLMM SDK over the cluster RPC), runs a
  CU-estimation simulation and balance asserts, hands it to the wallet to sign, and surfaces
  "Position created" with explorer links; failures land in a danger alert with `Try again`.

## How to get to it (user POV)

- Tools tab → `Meteora DLMM` card → list; tap any pool card → detail.
- The form requires, in order: active cluster id `solana:mainnet` (Settings → Cluster or header
  select), a connected wallet, and funded token balances for the chosen amounts.

## Driving it with adb + uiautomator

Preconditions:

- App session up, `doctor.sh` passes.
- For `mainnet-gate`: any non-mainnet active cluster (e.g. Devnet) — the gate alert is the proof.
- For `position-form` / `position-create`: active cluster `solana:mainnet` pointed at a fork
  (Surfpool `:8899` via adb reverse), wallet connected (fakewallet), and the dev account funded
  with SOL plus both pool tokens **at the canonical ATAs** (see RUN-NOTES below).

- **List.** `tap.sh "Meteora DLMM"` from the Tools tab, wait ~7s for the Data API, capture; assert
  pool card texts (`<A>-<B>` pairs, `TVL`) in the dump.

- **Detail + gates.** `tap.sh "<POOL-NAME>"`; on Devnet assert the `Mainnet required` alert text;
  on Mainnet disconnected assert `Connect to create a position`; on Mainnet connected assert the
  form (`Amount X` / `Amount Y` fields, strategy chips).

- **Create.** Tap an amount field, type the amount (`input text`; read it back from a fresh dump),
  `Preview position`, then `Confirm position`. The wallet comes foreground — approve there
  (fakewallet: `SEND TRANSACTION TO CLUSTER`). Assert back in Hammer: `Position created` plus
  `View position on explorer`; second-view via the fork RPC
  (`getSignaturesForAddress` on the wallet → the tx with `err: null`).

## Gotchas

- The detail screen's SDK queries are gated on a connected wallet (`enabled: !!account`) — with no
  wallet connected the screen makes no RPC calls, so a fork can be tested UI-only only down to the
  connect gate.
- `position-create` fails honestly when balances are missing: the CU-estimation simulation runs the
  real instructions and surfaces the program error (`insufficient funds`) with a `Try again` state.
  Fund before asserting create success.
- The DLMM program only exists on mainnet — there is no devnet deployment; the "Mainnet required"
  gate is correct behavior, not drift. Testing without mainnet funds = point the Mainnet cluster
  at a fork (Surfpool).
- `Try again` re-validates the wallet session — fakewallet may come foreground with a fresh
  `AUTHORIZE` prompt mid-flow; approve and continue.
- Proven reference run: `../artifacts/fakewallet-flow/` (position tx confirmed on the fork) and
  `../artifacts/fakewallet-flow/RUN-NOTES.md` (funding recipe incl. the canonical-ATA trap).
