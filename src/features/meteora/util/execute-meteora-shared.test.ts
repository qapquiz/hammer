import { address } from '@solana/kit'
import { describe, expect, test } from 'bun:test'

import { deriveAssociatedTokenAddress, splTokenAmountFromAccountData } from './execute-meteora-shared'

describe('splTokenAmountFromAccountData', () => {
  test('decodes the u64 LE amount at offset 64', () => {
    const data = new Uint8Array(165)
    const view = new DataView(data.buffer)
    // mint(32) owner(32), then amount 1_500_000 as u64 LE.
    view.setBigUint64(64, 1_500_000n, true)
    expect(splTokenAmountFromAccountData(data)).toBe(1_500_000n)
  })

  test('decodes a large amount above Number.MAX_SAFE_INTEGER', () => {
    const data = new Uint8Array(165)
    new DataView(data.buffer).setBigUint64(64, 2n ** 64n - 1n, true)
    expect(splTokenAmountFromAccountData(data)).toBe(18_446_744_073_709_551_615n)
  })

  test('truncated data reads as zero balance, not a crash', () => {
    expect(splTokenAmountFromAccountData(new Uint8Array(64))).toBe(0n)
    expect(splTokenAmountFromAccountData(new Uint8Array(0))).toBe(0n)
  })
})

describe('deriveAssociatedTokenAddress', () => {
  const OWNER = address('CVWEAtwtc5xf69FdASBrJSjWB3T3vHqEehGRGTswhX67')

  // Ground truth: these are getAssociatedTokenAddressSync outputs, verified on-chain against
  // the reference create tx's account list on the Surfpool fork (2026-10-04 verification run).
  const KNOWN_GOOD: readonly [mint: ReturnType<typeof address>, ata: ReturnType<typeof address>][] = [
    [address('DrZ26cKJDksVRWib3DVVsjo9eeXccc7hKhDJviiYEEZY'), address('5MhbLY3FSir6kzcAfJ2MhoirxwwKCJFW613uqJagX5go')],
    [address('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'), address('Ecd47zQKb7DJTH4QTV19RnnZ9cLW4tjuEabyVZyt26Te')],
  ]

  test('derives the canonical ATA (matches on-chain verified ground truth)', () => {
    for (const [mint, expected] of KNOWN_GOOD) {
      expect(deriveAssociatedTokenAddress({ mint, owner: OWNER })).toBe(expected)
    }
  })

  test('does not regress to the swapped seed order [owner, mint, tokenProgram]', () => {
    // The buggy derivation (pre-fix) produced this address for OWNER + YZY.
    const wrongOrderPda = address('EMehQ6ZMpTGfy5YBxdicGjDcNiz7QMqNtuw5UFdxfrz6')
    expect(
      deriveAssociatedTokenAddress({
        mint: address('DrZ26cKJDksVRWib3DVVsjo9eeXccc7hKhDJviiYEEZY'),
        owner: OWNER,
      }),
    ).not.toBe(wrongOrderPda)
  })
})
