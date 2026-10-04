import { address } from '@solana/kit'
import { describe, expect, test } from 'bun:test'

import type { MeteoraActiveBin, MeteoraDepositDraft, MeteoraPositionDraft } from '../data-access/meteora-types'
import {
  binPrice,
  derivePresetRange,
  planClose,
  planDeposit,
  planPosition,
  planWithdraw,
  resolveStrategy,
  toBaseUnits,
  validateDepositDraft,
  validatePositionDraft,
  validateWithdrawPercent,
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

const POSITION = {
  poolAddress: ACTIVE_BIN.poolAddress,
  address: address('3UCq1jBRhVQog8Br6o7dwxpvLbNfEYZLPKRMqG7dWNqf'),
  lowerBinId: 995,
  upperBinId: 1005,
  amountXBaseUnits: 1_000_000n,
  amountYBaseUnits: 2_000_000_000n,
  feeXBaseUnits: 500n,
  feeYBaseUnits: 0n,
  rewardOneBaseUnits: 0n,
  rewardTwoBaseUnits: 0n,
  activeBinId: 1000,
}

function depositDraft(overrides: Partial<MeteoraDepositDraft> = {}): MeteoraDepositDraft {
  return {
    poolAddress: POSITION.poolAddress,
    positionAddress: POSITION.address,
    amountX: '1',
    amountY: '',
    ...overrides,
  }
}

describe('validateDepositDraft', () => {
  test('accepts a valid two-sided deposit into a straddling position', () => {
    expect(
      validateDepositDraft({
        activeBinId: 1000,
        draft: depositDraft({ amountX: '1', amountY: '2' }),
        position: POSITION,
        tokenX: TOKEN_X,
        tokenY: TOKEN_Y,
      }),
    ).toBeNull()
  })

  test('rejects empty and malformed amounts', () => {
    expect(
      validateDepositDraft({
        activeBinId: 1000,
        draft: depositDraft({ amountX: '', amountY: '' }),
        position: POSITION,
        tokenX: TOKEN_X,
        tokenY: TOKEN_Y,
      }),
    ).toBe('Enter an amount for at least one token.')
    expect(
      validateDepositDraft({
        activeBinId: 1000,
        draft: depositDraft({ amountX: 'abc' }),
        position: POSITION,
        tokenX: TOKEN_X,
        tokenY: TOKEN_Y,
      }),
    ).toBe('Enter valid amounts (numbers only, within token precision).')
  })

  test('a position entirely above the active bin accepts token X only', () => {
    const above = { ...POSITION, lowerBinId: 1001, upperBinId: 1011 }
    expect(
      validateDepositDraft({
        activeBinId: 1000,
        draft: depositDraft({ amountY: '1' }),
        position: above,
        tokenX: TOKEN_X,
        tokenY: TOKEN_Y,
      }),
    ).toBe('This position sits above the active bin — only USDC can be deposited.')
    expect(
      validateDepositDraft({
        activeBinId: 1000,
        draft: depositDraft(),
        position: above,
        tokenX: TOKEN_X,
        tokenY: TOKEN_Y,
      }),
    ).toBeNull()
  })

  test('a position entirely below the active bin accepts token Y only', () => {
    const below = { ...POSITION, lowerBinId: 985, upperBinId: 995 }
    expect(
      validateDepositDraft({
        activeBinId: 1000,
        draft: depositDraft(),
        position: below,
        tokenX: TOKEN_X,
        tokenY: TOKEN_Y,
      }),
    ).toBe('This position sits below the active bin — only wSOL can be deposited.')
    expect(
      validateDepositDraft({
        activeBinId: 1000,
        draft: depositDraft({ amountX: '', amountY: '3' }),
        position: below,
        tokenX: TOKEN_X,
        tokenY: TOKEN_Y,
      }),
    ).toBeNull()
  })
})

describe('planDeposit', () => {
  test("deposits target the position's own range with spot slippage stamped", () => {
    const plan = planDeposit({
      activeBinId: 1000,
      draft: depositDraft({ amountX: '1.5', amountY: '0' }),
      position: POSITION,
      tokenX: TOKEN_X,
      tokenY: TOKEN_Y,
    })
    expect(plan.kind).toBe('deposit')
    expect(plan.poolAddress).toBe(POSITION.poolAddress)
    expect(plan.positionAddress).toBe(POSITION.address)
    expect(plan.minBinId).toBe(995)
    expect(plan.maxBinId).toBe(1005)
    expect(plan.amountXBaseUnits).toBe(1_500_000n)
    expect(plan.amountYBaseUnits).toBe(0n)
    expect(plan.slippagePercent).toBe(1)
    expect(plan.activeBinIdAtPlanTime).toBe(1000)
  })

  test('throws on all-zero amounts', () => {
    expect(() =>
      planDeposit({
        activeBinId: 1000,
        draft: depositDraft({ amountX: '', amountY: '' }),
        position: POSITION,
        tokenX: TOKEN_X,
        tokenY: TOKEN_Y,
      }),
    ).toThrow('Enter an amount for at least one token.')
  })
})

describe('planWithdraw', () => {
  test('maps percent to basis points over the position range', () => {
    expect(planWithdraw({ percent: 50, position: POSITION })).toEqual({
      kind: 'withdraw',
      poolAddress: POSITION.poolAddress,
      positionAddress: POSITION.address,
      minBinId: 995,
      maxBinId: 1005,
      percentBps: 5_000,
      percent: 50,
    })
    expect(planWithdraw({ percent: 100, position: POSITION }).percentBps).toBe(10_000)
  })
})

describe('validateWithdrawPercent', () => {
  test('accepts whole percents 1..100', () => {
    expect(validateWithdrawPercent(1)).toBeNull()
    expect(validateWithdrawPercent(100)).toBeNull()
  })

  test('rejects non-integers and out-of-range values', () => {
    expect(validateWithdrawPercent(0)).toBe('Withdraw percent must be a whole number between 1 and 100.')
    expect(validateWithdrawPercent(101)).toBe('Withdraw percent must be a whole number between 1 and 100.')
    expect(validateWithdrawPercent(12.5)).toBe('Withdraw percent must be a whole number between 1 and 100.')
  })
})

const EMPTY_POSITION = { ...POSITION, amountXBaseUnits: 0n, amountYBaseUnits: 0n }

describe('planClose', () => {
  test('stamps the position and pending fees', () => {
    expect(planClose({ position: EMPTY_POSITION })).toEqual({
      kind: 'close',
      poolAddress: POSITION.poolAddress,
      positionAddress: POSITION.address,
      feeXBaseUnits: 500n,
      feeYBaseUnits: 0n,
    })
  })

  test('refuses a position that still has liquidity', () => {
    expect(() => planClose({ position: EMPTY_POSITION })).not.toThrow()
    expect(() =>
      planClose({
        position: { ...POSITION, amountXBaseUnits: 0n, amountYBaseUnits: 1n },
      }),
    ).toThrow('Withdraw the remaining liquidity before closing this position.')
    expect(() =>
      planClose({
        position: { ...POSITION, amountXBaseUnits: 1n, amountYBaseUnits: 0n },
      }),
    ).toThrow('Withdraw the remaining liquidity before closing this position.')
  })
})
