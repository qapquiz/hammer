# Maintenance run B — 2026-10-04 — verify-hammer feature map upkeep

## Outcome: changed (map + README corrections). New-feature approve paths: NOT proven live.

## Covered live (artifacts in this dir)
- cluster-selection: popover inspect (02), Testnet switch + header (03-05), restore Devnet (48)
- appearance-theme: Dark/Light/System + selected-state dumps (06-09), night-mode flip (10-11)
- meteora pools-list on Testnet (12), pool-detail + mainnet-gate on Testnet (13)
- meteora on Mainnet: form (15), positions-list EMPTY state (16) — new surface renders
- honest-failure states: sim failures → `Try again`/`Start over` (19-25, 37-41)
- balance-show (header dumps, cluster-scoped 0 SOL on Testnet vs 99.99 SOL on fork)
- activity-list with Success chips on the fork (42)
- sign-message via fakewallet AUTHORIZE → "Message signed" (45-46)
- disconnect → Connect Wallet returns (47)

## NOT proven live this run
- position-create approve path (re-drive failed at the app's SDK-internal simulation,
  "insufficient funds", even with u63-scale balances seeded at the true canonical ATAs and a
  raw-transfer sim proving the balance is visible to simulation — host-side reproduction of the
  exact build PASSES). Reference proof from earlier today stands:
  `../fakewallet-flow/` (same day, same fork).
- deposit / withdraw / close + populated positions list: blocked behind the above.

## Root causes found while triaging (for the next run)
1. **App product bug (reported, NOT fixed — product code out of scope):**
   `deriveAssociatedTokenAddress` (execute-meteora-shared.ts, inherited from
   execute-meteora-create-position.ts, landed in 2fd4085) derives the ATA PDA with seed order
   `[owner, mint, tokenProgram]` — the spec is `[owner, tokenProgram, mint]`. The deposit/create
   balance pre-check therefore reads a wrong, usually nonexistent account and would falsely
   reject funded users ("Insufficient balance"). On this fork it silently passes because earlier
   mis-seeds created exactly those wrong-PDA accounts.
2. **Data API decimals ≠ chain decimals:** the YZY-USDC pool's YZY has 0 decimals on-chain but
   the Data API says 6, so a typed `8` becomes 8,000,000 base units. Fund at API scale.
3. **My funding bug (fixed mid-run):** I first seeded ATAs at a hand-rolled wrong PDA
   (`[owner, mint, program]`) — the SDK created the true ATAs empty. Correct derivation:
   `getAssociatedTokenAddressSync` (seeds `[owner, program, mint]`); true ATAs for the fakewallet
   account CVWE...: YZY = 5MhbLY3FSir6kzcAfJ2MhoirxwwKCJFW613uqJagX5go, USDC =
   Ecd47zQKb7DJTH4QTV19RnnZ9cLW4tjuEabyVZyt26Te.
4. Unexplained residual: with correct addresses + huge balances, host-side simulation of the
   exact build passes, the in-app build still fails `insufficient funds` at AddLiquidity
   (InstructionError[2]). Pool DQ9weJhfiU4iL5LUoeshDrm5KxDHCMiSbnnKJz7buMcf, range -132..-116,
   activeId -124. Next run: capture the app's exact failing sim via a temporary console.log in
   the SDK build path (used once this run, reverted), compare ix-by-ix.

## Environment at end of run
- Cluster restored to Devnet (header dump 48); wallet disconnected (47); app force-stopped;
  Metro (metro-verify) killed — this run started it.
- Left in place: surfpool :8899, adb reverse 8081/8899/8900, seeded fork token accounts
  (harmless shadow state; fakewallet's next authorization mints a fresh keypair anyway).
