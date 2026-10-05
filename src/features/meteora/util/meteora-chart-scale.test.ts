import { address } from '@solana/kit'
import { describe, expect, test } from 'bun:test'

import type { MeteoraActiveBin, MeteoraCandle } from '../data-access/meteora-types'
import type { MeteoraBinWeight } from './meteora-liquidity-shape'
import { binPrice } from './meteora-position'
import {
  candleSlots,
  chartPriceDomain,
  fractionToBin,
  fractionToPrice,
  binToFraction,
  priceToFraction,
  profileBars,
  resolveDraggedRange,
} from './meteora-chart-scale'

const ACTIVE_BIN: MeteoraActiveBin = {
  poolAddress: address('58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2'),
  binId: 1000,
  price: 100,
  binStep: 10,
  minBinId: 980,
  maxBinId: 1020,
}

const BOUNDS = { minBinId: ACTIVE_BIN.minBinId, maxBinId: ACTIVE_BIN.maxBinId }
const RANGE = { minBinId: 995, maxBinId: 1005 }

function candle(overrides: Partial<MeteoraCandle> = {}): MeteoraCandle {
  return { timestampMs: 0, open: 100, high: 101, low: 99, close: 100, volume: 0, ...overrides }
}

describe('chartPriceDomain', () => {
  test('without candles, covers the range edges and active price, padded', () => {
    const domain = chartPriceDomain({ activeBin: ACTIVE_BIN, range: RANGE, candles: null })
    expect(domain.min < binPrice(100, 10, -5)).toBe(true)
    expect(domain.max > binPrice(100, 10, 5)).toBe(true)
    expect(priceToFraction(100, domain) > 0).toBe(true)
    expect(priceToFraction(100, domain) < 1).toBe(true)
  })

  test('with candles, covers candle lows and highs', () => {
    const domain = chartPriceDomain({
      activeBin: ACTIVE_BIN,
      range: RANGE,
      candles: [candle({ low: 90, high: 110 })],
    })
    expect(domain.min < 90).toBe(true)
    expect(domain.max > 110).toBe(true)
  })

  test('empty candles behave like absent candles', () => {
    expect(chartPriceDomain({ activeBin: ACTIVE_BIN, range: RANGE, candles: [] })).toEqual(
      chartPriceDomain({ activeBin: ACTIVE_BIN, range: RANGE, candles: null }),
    )
  })
})

describe('price ↔ fraction', () => {
  const domain = chartPriceDomain({ activeBin: ACTIVE_BIN, range: RANGE, candles: null })

  test('maps the domain bounds to 0 and 1 and clamps outside', () => {
    expect(priceToFraction(domain.min, domain)).toBe(0)
    expect(priceToFraction(domain.max, domain)).toBe(1)
    expect(priceToFraction(domain.min / 10, domain)).toBe(0)
    expect(priceToFraction(domain.max * 10, domain)).toBe(1)
  })

  test('round-trips interior prices through the log scale', () => {
    for (const price of [98.9, 99.5, 100, 100.5, 101.2]) {
      expect(fractionToPrice(priceToFraction(price, domain), domain)).toBeCloseTo(price, 9)
    }
  })
})

describe('bin ↔ fraction', () => {
  const domain = chartPriceDomain({ activeBin: ACTIVE_BIN, range: RANGE, candles: null })

  test('fractionToBin inverts binToFraction for interior bins', () => {
    for (let binId = 996; binId <= 1004; binId += 1) {
      expect(fractionToBin(binToFraction(binId, ACTIVE_BIN, domain), ACTIVE_BIN, domain)).toBe(binId)
    }
  })

  test('higher bins map toward the top of the plot', () => {
    expect(binToFraction(1004, ACTIVE_BIN, domain) > binToFraction(996, ACTIVE_BIN, domain)).toBe(true)
  })
})

describe('resolveDraggedRange', () => {
  test('clamps the dragged edge to the pool bounds', () => {
    expect(resolveDraggedRange({ current: RANGE, edge: 'max', targetBinId: 5000, bounds: BOUNDS })).toEqual({
      minBinId: 995,
      maxBinId: 1020,
    })
    expect(resolveDraggedRange({ current: RANGE, edge: 'min', targetBinId: -5000, bounds: BOUNDS })).toEqual({
      minBinId: 980,
      maxBinId: 1005,
    })
  })

  test('never crosses the other edge and honors the minimum width', () => {
    expect(resolveDraggedRange({ current: RANGE, edge: 'min', targetBinId: 1010, bounds: BOUNDS })).toEqual({
      minBinId: 1004,
      maxBinId: 1005,
    })
    expect(resolveDraggedRange({ current: RANGE, edge: 'max', targetBinId: 990, bounds: BOUNDS })).toEqual({
      minBinId: 995,
      maxBinId: 996,
    })
  })

  test('is idempotent on repeated input and on its own output', () => {
    const input = { current: RANGE, edge: 'min', targetBinId: 1015, bounds: BOUNDS } as const
    const once = resolveDraggedRange(input)
    expect(resolveDraggedRange(input)).toEqual(once)
    expect(resolveDraggedRange({ current: once, edge: 'min', targetBinId: 1015, bounds: BOUNDS })).toEqual(once)
  })

  test('respects a custom minBins', () => {
    expect(resolveDraggedRange({ current: RANGE, edge: 'max', targetBinId: 990, bounds: BOUNDS, minBins: 8 })).toEqual({
      minBinId: 995,
      maxBinId: 1002,
    })
  })
})

describe('candleSlots', () => {
  test('lays out one index-spaced slot per candle', () => {
    const slots = candleSlots(10, 100)
    expect(slots.length).toBe(10)
    expect(slots[0]).toEqual({ x: 0, width: 7 })
    expect(slots[9]).toEqual({ x: 90, width: 7 })
  })

  test('returns no slots without candles or width', () => {
    expect(candleSlots(0, 100)).toEqual([])
    expect(candleSlots(5, 0)).toEqual([])
  })
})

describe('profileBars', () => {
  const domain = chartPriceDomain({ activeBin: ACTIVE_BIN, range: RANGE, candles: null })

  test('aggregates to at most one bar per pixel row', () => {
    const shape: MeteoraBinWeight[] = Array.from({ length: 21 }, (_, index) => ({
      binId: 990 + index,
      weight: 1 / 21,
    }))
    const bars = profileBars({ activeBin: ACTIVE_BIN, domain, frame: { height: 10, profileLength: 50 }, shape })
    expect(bars.length <= 10).toBe(true)
    expect(bars.length > 0).toBe(true)
    bars.forEach((bar) => {
      expect(bar.height >= 1).toBe(true)
      expect(bar.length <= 50).toBe(true)
    })
  })

  test('scales bar length by weight and keeps bars stacked without overlap', () => {
    const shape: MeteoraBinWeight[] = [
      { binId: 995, weight: 0.25 },
      { binId: 1000, weight: 0.5 },
      { binId: 1005, weight: 0.25 },
    ]
    const bars = profileBars({ activeBin: ACTIVE_BIN, domain, frame: { height: 200, profileLength: 60 }, shape })
    expect(bars.length).toBe(3)
    expect(bars[1].length).toBe(60)
    expect(bars[1].length > bars[0].length).toBe(true)
    // Ascending binId means descending fraction, so pixel y ascends down the bars array.
    expect(bars[1].y > bars[2].y).toBe(true)
    expect(bars[0].y > bars[1].y).toBe(true)
  })

  test('returns nothing for an empty shape or frame', () => {
    expect(
      profileBars({ activeBin: ACTIVE_BIN, domain, frame: { height: 100, profileLength: 50 }, shape: [] }),
    ).toEqual([])
    expect(
      profileBars({
        activeBin: ACTIVE_BIN,
        domain,
        frame: { height: 0, profileLength: 50 },
        shape: [{ binId: 1000, weight: 1 }],
      }),
    ).toEqual([])
  })
})
