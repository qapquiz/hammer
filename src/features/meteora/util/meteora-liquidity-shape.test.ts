import { describe, expect, test } from 'bun:test'

import {
  allocateLiquidity,
  binSide,
  liquidityWeights,
  placementIssue,
  type MeteoraBinAllocation,
} from './meteora-liquidity-shape'

const RANGE = { minBinId: 990, maxBinId: 1010 }
const ACTIVE_BIN_ID = 1000

describe('binSide', () => {
  test('maps bins around the active bin exactly', () => {
    expect(binSide(1001, ACTIVE_BIN_ID)).toBe('above')
    expect(binSide(989, ACTIVE_BIN_ID)).toBe('below')
    expect(binSide(ACTIVE_BIN_ID, ACTIVE_BIN_ID)).toBe('active')
  })
})

describe('liquidityWeights', () => {
  test('spot weights are uniform, positive, and sum to 1', () => {
    const weights = liquidityWeights({ range: RANGE, activeBinId: ACTIVE_BIN_ID, strategyType: 'spot' })
    expect(weights.length).toBe(21)
    weights.forEach((bar) => expect(bar.weight).toBeCloseTo(1 / 21, 12))
    expect(weights.reduce((sum, bar) => sum + bar.weight, 0)).toBeCloseTo(1, 12)
  })

  test('bidAsk peaks at the active bin and falls off toward both edges', () => {
    const weights = liquidityWeights({ range: RANGE, activeBinId: ACTIVE_BIN_ID, strategyType: 'bidAsk' })
    const byBin = new Map(weights.map((bar) => [bar.binId, bar.weight]))
    const peak = byBin.get(ACTIVE_BIN_ID)
    weights.forEach((bar) => {
      if (bar.binId !== ACTIVE_BIN_ID) {
        expect((peak as number) > bar.weight).toBe(true)
      }
    })
    expect(byBin.get(990)).toBeCloseTo(byBin.get(1010) as number, 12)
    expect(weights.reduce((sum, bar) => sum + bar.weight, 0)).toBeCloseTo(1, 12)
  })

  test('bidAsk degrades to uniform when the active bin is outside the range', () => {
    const weights = liquidityWeights({ range: RANGE, activeBinId: 980, strategyType: 'bidAsk' })
    weights.forEach((bar) => expect(bar.weight).toBeCloseTo(1 / 21, 12))
  })
})

describe('allocateLiquidity', () => {
  test('splits each side exactly over its eligible bins, in BigInt', () => {
    const allocations = allocateLiquidity({
      range: RANGE,
      activeBinId: ACTIVE_BIN_ID,
      strategyType: 'spot',
      amountXBaseUnits: 1_000_001n,
      amountYBaseUnits: 700_000n,
    })
    expect(allocations.length).toBe(21)
    expect(allocations.reduce((sum, a) => sum + a.amountXBaseUnits, 0n)).toBe(1_000_001n)
    expect(allocations.reduce((sum, a) => sum + a.amountYBaseUnits, 0n)).toBe(700_000n)
    // X lands above+active only; Y below+active only — the side rule, not a symmetric split.
    allocations.forEach((allocation) => {
      if (allocation.binId < ACTIVE_BIN_ID) {
        expect(allocation.amountXBaseUnits).toBe(0n)
      }
      if (allocation.binId > ACTIVE_BIN_ID) {
        expect(allocation.amountYBaseUnits).toBe(0n)
      }
    })
  })

  test('null or zero amounts keep the weights and allocate 0n', () => {
    const empty = allocateLiquidity({
      range: RANGE,
      activeBinId: ACTIVE_BIN_ID,
      strategyType: 'bidAsk',
      amountXBaseUnits: null,
      amountYBaseUnits: 0n,
    })
    expect(empty.length).toBe(21)
    expect(empty.every((allocation) => allocation.amountXBaseUnits === 0n && allocation.amountYBaseUnits === 0n)).toBe(
      true,
    )
    expect(empty.reduce((sum, allocation) => sum + allocation.weight, 0)).toBeCloseTo(1, 12)
  })

  test('bidAsk concentrates each side toward the active bin', () => {
    const allocations = allocateLiquidity({
      range: RANGE,
      activeBinId: ACTIVE_BIN_ID,
      strategyType: 'bidAsk',
      amountXBaseUnits: 10_000n,
      amountYBaseUnits: null,
    })
    const atActive = allocations.find((allocation) => allocation.binId === ACTIVE_BIN_ID)
    const adjacent = allocations.find((allocation) => allocation.binId === ACTIVE_BIN_ID + 1)
    expect((atActive?.amountXBaseUnits ?? 0n) > (adjacent?.amountXBaseUnits ?? 0n)).toBe(true)
  })
})

describe('placementIssue', () => {
  test('a range entirely above the active bin rejects token Y with symbolY named', () => {
    expect(
      placementIssue({
        range: { minBinId: 1001, maxBinId: 1010 },
        activeBinId: 1000,
        amountXBaseUnits: 1n,
        amountYBaseUnits: 1n,
        symbolX: 'USDC',
        symbolY: 'wSOL',
      }),
    ).toBe('This range sits above the active bin — wSOL cannot be deposited into it.')
    expect(
      placementIssue({
        range: { minBinId: 1001, maxBinId: 1010 },
        activeBinId: 1000,
        amountXBaseUnits: 1n,
        amountYBaseUnits: 0n,
        symbolX: 'USDC',
        symbolY: 'wSOL',
      }),
    ).toBeNull()
  })

  test('a range entirely below the active bin rejects token X with symbolX named', () => {
    expect(
      placementIssue({
        range: { minBinId: 985, maxBinId: 999 },
        activeBinId: 1000,
        amountXBaseUnits: 1n,
        amountYBaseUnits: 1n,
        symbolX: 'USDC',
        symbolY: 'wSOL',
      }),
    ).toBe('This range sits below the active bin — USDC cannot be deposited into it.')
  })

  test('a straddling range is fine with both sides', () => {
    expect(
      placementIssue({
        range: RANGE,
        activeBinId: ACTIVE_BIN_ID,
        amountXBaseUnits: 1n,
        amountYBaseUnits: 1n,
        symbolX: 'USDC',
        symbolY: 'wSOL',
      }),
    ).toBeNull()
  })
})
