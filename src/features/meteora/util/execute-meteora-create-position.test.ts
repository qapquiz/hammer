import { describe, expect, test } from 'bun:test'

import { splTokenAmountFromAccountData } from './execute-meteora-create-position'

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
