import type { MeteoraActiveBin, MeteoraBinRange, MeteoraCandle } from '../data-access/meteora-types'
import type { MeteoraBinWeight } from './meteora-liquidity-shape'
import { MIN_RANGE_BINS, binPrice, clampBinRange } from './meteora-position'

/** binPrice stays the single source of the compound formula; this module owns its inverse and the pixel mapping. */

export interface PriceDomain {
  min: number
  max: number
}

/**
 * Union of candle low/high, range edge prices, and the active price, padded 8% in log
 * space so lines and bars are not clipped at the plot edges. Absent or empty candles
 * fall back to range ∪ active via binPrice.
 */
export function chartPriceDomain({
  activeBin,
  range,
  candles,
}: {
  activeBin: MeteoraActiveBin
  range: MeteoraBinRange
  candles: readonly MeteoraCandle[] | null
}): PriceDomain {
  let min = Infinity
  let max = -Infinity
  const consider = (price: number) => {
    if (Number.isFinite(price) && price > 0) {
      min = Math.min(min, price)
      max = Math.max(max, price)
    }
  }
  consider(activeBin.price)
  consider(binPrice(activeBin.price, activeBin.binStep, range.minBinId - activeBin.binId))
  consider(binPrice(activeBin.price, activeBin.binStep, range.maxBinId - activeBin.binId))
  for (const candle of candles ?? []) {
    consider(candle.low)
    consider(candle.high)
  }
  if (min > max || min <= 0) {
    const mid = Math.max(activeBin.price, Number.EPSILON)
    min = mid / 2
    max = mid * 2
  } else if (min === max) {
    min /= 1.05
    max *= 1.05
  }
  const logMin = Math.log(min)
  const logMax = Math.log(max)
  // Proportional margin, floored at ±2% so a narrow range's handles are never clipped at the plot edges.
  const pad = Math.max((logMax - logMin) * 0.08, Math.log(1.02))
  return { min: Math.exp(logMin - pad), max: Math.exp(logMax + pad) }
}

/** Log-scale price → plot fraction, 0 at the domain floor (bottom) to 1 at the ceiling (top); clamped. */
export function priceToFraction(price: number, domain: PriceDomain): number {
  const logMin = Math.log(domain.min)
  const logMax = Math.log(domain.max)
  if (logMax <= logMin) {
    return 0.5
  }
  const clamped = Math.min(Math.max(price, domain.min), domain.max)
  return (Math.log(clamped) - logMin) / (logMax - logMin)
}

export function fractionToPrice(fraction: number, domain: PriceDomain): number {
  const logMin = Math.log(domain.min)
  const logMax = Math.log(domain.max)
  if (logMax <= logMin) {
    return domain.min
  }
  const clamped = Math.min(Math.max(fraction, 0), 1)
  return Math.exp(logMin + clamped * (logMax - logMin))
}

/**
 * Linear-in-binId y geometry: log(binPrice) is affine in binId, so equal bin steps are
 * equal pixel steps and the drag lattice matches the price scale exactly.
 */
export function binToFraction(binId: number, activeBin: MeteoraActiveBin, domain: PriceDomain): number {
  return priceToFraction(binPrice(activeBin.price, activeBin.binStep, binId - activeBin.binId), domain)
}

export function fractionToBin(fraction: number, activeBin: MeteoraActiveBin, domain: PriceDomain): number {
  const logMin = Math.log(domain.min)
  const logMax = Math.log(domain.max)
  if (logMax <= logMin) {
    return activeBin.binId
  }
  const clamped = Math.min(Math.max(fraction, 0), 1)
  const logPrice = logMin + clamped * (logMax - logMin)
  return activeBin.binId + Math.round((logPrice - Math.log(activeBin.price)) / Math.log(1 + activeBin.binStep / 10_000))
}

/** The drag's entire policy: clamp to pool bounds, never cross the other edge, honor min width. Idempotent. */
export function resolveDraggedRange({
  current,
  edge,
  targetBinId,
  bounds,
  minBins = MIN_RANGE_BINS,
}: {
  current: MeteoraBinRange
  edge: 'min' | 'max'
  targetBinId: number
  bounds: { minBinId: number; maxBinId: number }
  minBins?: number
}): MeteoraBinRange {
  const span = minBins - 1
  if (edge === 'min') {
    const target = Math.min(Math.max(targetBinId, bounds.minBinId), current.maxBinId - span)
    return clampBinRange({ minBinId: target, maxBinId: current.maxBinId }, bounds, minBins)
  }
  const target = Math.max(Math.min(targetBinId, bounds.maxBinId), current.minBinId + span)
  return clampBinRange({ minBinId: current.minBinId, maxBinId: target }, bounds, minBins)
}

/** Index-spaced slots, honest to sparse data: the API returns whatever candles it returns. */
export function candleSlots(count: number, plotWidth: number): { x: number; width: number }[] {
  if (count <= 0 || plotWidth <= 0) {
    return []
  }
  const slot = plotWidth / count
  const width = Math.min(Math.max(slot * 0.7, 1), slot)
  return Array.from({ length: count }, (_, index) => ({ x: index * slot, width }))
}

export interface ChartFrame {
  height: number
  profileLength: number
}

export interface ProfileBar {
  binId: number
  y: number
  height: number
  length: number
}

/** Aggregates weights to at most one bar per pixel row for the right-edge liquidity profile. */
export function profileBars({
  activeBin,
  domain,
  frame,
  shape,
}: {
  activeBin: MeteoraActiveBin
  domain: PriceDomain
  frame: ChartFrame
  shape: readonly MeteoraBinWeight[]
}): ProfileBar[] {
  if (frame.height <= 0 || frame.profileLength <= 0 || shape.length === 0) {
    return []
  }
  const rows = Math.max(1, Math.floor(frame.height))
  const rowOfBin = (binId: number) => {
    const fraction = binToFraction(binId, activeBin, domain)
    return Math.min(rows - 1, Math.max(0, Math.floor((1 - fraction) * frame.height)))
  }
  const sorted = [...shape].sort((a, b) => a.binId - b.binId)
  const maxWeight = sorted.reduce((max, bar) => Math.max(max, bar.weight), 0)
  if (maxWeight <= 0) {
    return []
  }
  // Rows are monotone in binId, so consecutive bins sharing a row merge without overlap.
  const groups: MeteoraBinWeight[][] = []
  for (const bar of sorted) {
    const group = groups[groups.length - 1]
    if (group && rowOfBin(group[0].binId) === rowOfBin(bar.binId)) {
      group.push(bar)
    } else {
      groups.push([bar])
    }
  }
  return groups.map((bars) => {
    const first = bars[0]
    const last = bars[bars.length - 1]
    const yTop = (1 - binToFraction(last.binId, activeBin, domain)) * frame.height
    const yBottom = (1 - binToFraction(first.binId, activeBin, domain)) * frame.height
    return {
      binId: first.binId,
      y: yTop,
      height: Math.max(yBottom - yTop, 1),
      length: (bars.reduce((max, bar) => Math.max(max, bar.weight), 0) / maxWeight) * frame.profileLength,
    }
  })
}
