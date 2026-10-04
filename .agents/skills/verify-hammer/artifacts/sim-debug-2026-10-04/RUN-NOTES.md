# Sim-debug run — deposit/withdraw/close blocked (2026-10-04)

## Result: ALL FOUR SURFACES PROVEN LIVE. Root cause of the block found and fixed in the recipe.

create → deposit → withdraw 100% → close, all signed by fakewallet and confirmed Ok on the
Surfpool fork, by wallet EJNjH1GZDjkTiSfGTk686mLqNoCgQJTDfBRXKDyddDVb:

- create    4Tmbw2F7sGsPbd5HAB6uZ5XVoHLSjjq7GTBLd2LRWAhPk4smSzzHUdimQQNHGDMGUfg5UnsJ5eLkg911eWiJYS22  slot 453153630, "Position created"
- deposit   5Mg5XKGv97Vq1zLwTVEHBhcU6TwDYYa4tY865SUB56PbWsPcQNtWQe6MuKAKa4UTqtkWzTsAxJzfkNBJJG4srmbz  slot 453154247, position 9.71→15.79 YZY / 7.49→12.17 USDC
- withdraw  58L8TnuJ78fGmqraAoLg82Dg6gVA1hrWcn8jmNVAfcbxbJKoEgP9U9SX126mT6KMjhaC9naGXAT8fVTMT44JzGZT  slot 453154439, position 0 YZY · 0 USDC, chip "Empty"
- close     4m6n3pRpvTLKHSij5LzvkusYgwPHxRouoL9BHRTcia76WySLJvhER7zAnmTFY9DSV9GY6pptQS51z22u1pkbMNF6  slot 453154607, position account HMEh5mC966Qg65hUzufTYRqoGexCJWJpF2RSKuZPJ3kF = null on fork

Pool DQ9weJhfiU4iL5LUoeshDrm5KxDHCMiSbnnKJz7buMcf (YZY-USDC, activeId -124), amounts 8/8 typed,
deposit 5/5. Proof pairs 22-44 in this dir; positions row ("In range", amounts, manage card) is
the first live proof of a populated positions list.

## Root cause of "cannot deposit/withdraw/close" (maintenance run B residual)

The fork-funding recipe wrote raw 165-byte SPL token accounts with the `state` field
(offset 108) left at 0 = uninitialized. Reads (getAccountInfo/getMultipleAccounts) accept the
account, so balance checks and any probe based on reads pass, but the SPL Token program refuses
it during transaction execution:

- Minimal repro: a raw token `Transfer` out of the seeded ATA fails
  `InstructionError[0] "instruction requires an initialized account"`.
- The app's exact failing tx (captured via a temporary wire-bytes log in the executors):
  AddLiquidityByStrategy2 fails `InstructionError[3] UninitializedAccount caused by account:
  user_token_x`.
- Rewriting the same account with `state=1` at offset 108 makes the identical transfer sim pass,
  and the full app flow then lands first try.

This is also run B's "unexplained residual" (host-side sim passed, in-app failed): host-side
probes read state, the wallet's preflight executes it. Run B's "insufficient funds at
AddLiquidityByStrategy2" is the same defect seen through the DLMM program's error surface.

Fix encoded in `features/meteora-dlmm.md` Gotchas (canonical-ATA bullet): seed with
`state=1` (initialized) at offset 108.

## Two non-bugs met on the way (for the next runner)

1. After fakewallet's AUTHORIZE, the send is NOT automatic. The SendTransactionFragment waits
   for a second human tap on `SEND TRANSACTION TO CLUSTER` (reference MWA wallet). Skipping it
   leaves the app waiting until its 90s MWA client timeout
   (`SolanaMobileWalletAdapterError: TimeoutException, id=2`). The verify-hammer SKILL already
   documents the button; drive both taps every time.
2. The app-side balance pre-check bug from run B (`deriveAssociatedTokenAddress` seed order) is
   already fixed at HEAD 67fb38d: the code derives `[owner, tokenProgram, mint]` with a warning
   comment.

## Method notes

- Captured the exact wire tx via a temporary `console.log` of `getBase64EncodedWireTransaction`
  in both executors (reverted after the run; tree back to HEAD).
- Observed the wallet's RPC through a logging proxy on the adb reverse (8899→9999→8899),
  which showed the zero-request hang of (1) and the 118ms successful send once fixed.
- simulateTransaction against the fork needs a full wire tx (signature placeholder + message),
  not a bare message; and old blockhashes age out of the fork in ~1 min, so host-side replays
  need `replaceRecentBlockhash: true`.
