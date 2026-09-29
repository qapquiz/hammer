import { address } from '@solana/kit'
import { describe, expect, test } from 'bun:test'

import type { MeteoraActiveBin, MeteoraPositionDraft } from '../data-access/meteora-types'
import {
  binPrice,
  derivePresetRange,
  planPosition,
  resolveStrategy,
  toBaseUnits,
  validatePositionDraft,
} from './meteora-position'

const ACTIVE_BIN: MeteoraActiveBin = {
  poolAddress: address('58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2'),
  binId: 1000,
  price: 100,
  binStep: 10,
  minBinId: 980,
  maxBinId: 1020,
}

const TOKEN_X = {
  address: address('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'),
  symbol: 'USDC',
  decimals: 6,
  isVerified: true,
  priceUsd: 1,
}

const TOKEN_Y = {
  address: address('So11111111111111111111111111111111111111112'),
  symbol: 'wSOL',
  decimals: 9,
  isVerified: true,
  priceUsd: 100,
}

function draft(overrides: Partial<MeteoraPositionDraft> = {}): MeteoraPositionDraft {
  return {
    poolAddress: ACTIVE_BIN.poolAddress,
    presetId: 'spot-narrow',
    amountX: '1',
    amountY: '2',
    ...overrides,
  }
}

describe('toBaseUnits', () => {
  test('parses human amounts to exact base units', () => {
    expect(toBaseUnits('1.5', 9)).toBe(1500000000n)
    expect(toBaseUnits('1', 6)).toBe(1000000n)
    expect(toBaseUnits('0.000000001', 9)).toBe(1n)
    expect(toBaseUnits('12', 0)).toBe(12n)
    expect(toBaseUnits(' 2.25 ', 2)).toBe(225n)
  })

  test('rejects invalid strings with null', () => {
    expect(toBaseUnits('', 9)).toBeNull()
    expect(toBaseUnits('.', 9)).toBeNull()
    expect(toBaseUnits('abc', 9)).toBeNull()
    expect(toBaseUnits('-1', 9)).toBeNull()
    expect(toBaseUnits('1e3', 9)).toBeNull()
    expect(toBaseUnits('1,5', 9)).toBeNull()
  })

  test('rejects more fraction digits than decimals', () => {
    expect(toBaseUnits('1.234', 2)).toBeNull()
    expect(toBaseUnits('0.0000000001', 9)).toBeNull()
  })
})

describe('derivePresetRange', () => {
  test('clamps at the pool min and max bin', () => {
    const clamped = derivePresetRange(
      { ...resolveStrategy(draft({ presetId: 'spot-wide' })), id: 'spot-wide' },
      ACTIVE_BIN,
    )
    expect(clamped.minBinId).toBe(980)
    expect(clamped.maxBinId).toBe(1020)

    const unclamped = derivePresetRange(resolveStrategy(draft({ presetId: 'spot-narrow' })), ACTIVE_BIN)
    expect(unclamped.minBinId).toBe(992)
    expect(unclamped.maxBinId).toBe(1008)
  })
})

describe('binPrice', () => {
  test('is the identity at bin delta zero', () => {
    expect(binPrice(123.45, 25, 0)).toBe(123.45)
  })

  test('computes one bin up and down for a known binStep', () => {
    // 100 * (1 + 10/10000)^1 = 100.1, and ^-1 = 100/1.001 = 99.9000999...
    expect(binPrice(100, 10, 1)).toBeCloseTo(100.1, 10)
    expect(binPrice(100, 10, -1)).toBeCloseTo(99.9000999000999, 10)
  })
})

describe('planPosition', () => {
  test('parses amounts to bigint base units exactly once and stamps plan fields', () => {
    const plan = planPosition({
      activeBin: ACTIVE_BIN,
      draft: draft({ amountX: '1.5', amountY: '0' }),
      tokenX: TOKEN_X,
      tokenY: TOKEN_Y,
    })

    expect(plan.amountXBaseUnits).toBe(1500000n)
    expect(plan.amountYBaseUnits).toBe(0n)
    expect(plan.minBinId).toBe(992)
    expect(plan.maxBinId).toBe(1008)
    expect(plan.binCount).toBe(17)
    expect(plan.strategyType).toBe('spot')
    expect(plan.slippagePercent).toBe(1)
    expect(plan.activeBinIdAtPlanTime).toBe(1000)
  })

  test('honors an explicit binsPerSide override over the preset width', () => {
    const plan = planPosition({
      activeBin: ACTIVE_BIN,
      draft: draft({ binsPerSide: 3 }),
      tokenX: TOKEN_X,
      tokenY: TOKEN_Y,
    })

    expect(plan.minBinId).toBe(997)
    expect(plan.maxBinId).toBe(1003)
    expect(plan.binCount).toBe(7)
  })

  test('honors a strategyType override', () => {
    const plan = planPosition({
      activeBin: ACTIVE_BIN,
      draft: draft({ strategyType: 'bidAsk' }),
      tokenX: TOKEN_X,
      tokenY: TOKEN_Y,
    })

    expect(plan.strategyType).toBe('bidAsk')
  })

  test('throws on amounts the token decimals cannot express', () => {
    expect(() =>
      planPosition({
        activeBin: ACTIVE_BIN,
        draft: draft({ amountX: '1.0000001' }),
        tokenX: TOKEN_X,
        tokenY: TOKEN_Y,
      }),
    ).toThrow('Cannot plan a position from invalid amounts.')
  })
})

describe('validatePositionDraft', () => {
  test('returns null for a valid draft', () => {
    expect(validatePositionDraft(draft({ amountX: '1', amountY: '0' }), 6, 9)).toBeNull()
  })

  test('rejects all-zero and malformed amounts with messages', () => {
    expect(validatePositionDraft(draft({ amountX: '0', amountY: '0' }), 6, 9)).toBe(
      'Enter an amount for at least one token.',
    )
    expect(validatePositionDraft(draft({ amountX: '1.2345678901' }), 6, 9)).toBe(
      'Enter valid amounts (numbers only, within token precision).',
    )
  })
})
