import { describe, expect, test } from 'bun:test'

import { formatBaseUnits } from './meteora-format'

describe('formatBaseUnits', () => {
  test('converts base units to human strings without float precision loss', () => {
    expect(formatBaseUnits(1_500_000_000n, 9)).toBe('1.5')
    expect(formatBaseUnits(1_000_000n, 6)).toBe('1')
    expect(formatBaseUnits(1n, 9)).toBe('0.000000001')
    expect(formatBaseUnits(12n, 0)).toBe('12')
    expect(formatBaseUnits(2_25n, 2)).toBe('2.25')
  })

  test('handles values above Number.MAX_SAFE_INTEGER exactly', () => {
    expect(formatBaseUnits(18_446_744_073_709_551_615n, 0)).toBe('18446744073709551615')
    expect(formatBaseUnits(2n ** 64n - 1n, 9)).toBe('18446744073.709551615')
  })

  test('trims trailing zeros and keeps zero as zero', () => {
    expect(formatBaseUnits(1_500_000n, 9)).toBe('0.0015')
    expect(formatBaseUnits(1_000n, 9)).toBe('0.000001')
    expect(formatBaseUnits(0n, 6)).toBe('0')
    expect(formatBaseUnits(1_000_000n, 6)).toBe('1')
  })

  test('parses decimal strings and signs', () => {
    expect(formatBaseUnits('1500000000', 9)).toBe('1.5')
    expect(formatBaseUnits(-1_500_000_000n, 9)).toBe('-1.5')
  })
})
