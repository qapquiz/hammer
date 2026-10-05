import type { MeteoraBinRange, MeteoraStrategyType } from '../data-access/meteora-types'

/** DLMM side rule, exact: above the active bin accepts token X only, below token Y only, the active bin both. */
export type MeteoraBinSide = 'above' | 'active' | 'below'

export function binSide(binId: number, activeBinId: number): MeteoraBinSide {
  if (binId > activeBinId) {
    return 'above'
  }
  if (binId < activeBinId) {
    return 'below'
  }
  return 'active'
}

export interface MeteoraBinWeight {
  binId: number
  /** Relative share, > 0, summing to 1 across the range. */
  weight: number
}

/**
 * Integer weight per bin, index-aligned with rangeBinIds. Spot is uniform; bidAsk is a
 * triangle peaking at the active bin (edge weight 1, peak = max distance + 1), degrading
 * to uniform when the active bin falls outside the range so the peak is unreachable.
 */
function integerWeights(binIds: readonly number[], activeBinId: number, strategyType: MeteoraStrategyType): number[] {
  if (strategyType === 'spot' || binIds.length === 0) {
    return binIds.map(() => 1)
  }
  const minBinId = binIds[0]
  const maxBinId = binIds[binIds.length - 1]
  if (activeBinId < minBinId || activeBinId > maxBinId) {
    return binIds.map(() => 1)
  }
  const peak = Math.max(activeBinId - minBinId, maxBinId - activeBinId) + 1
  return binIds.map((binId) => peak - Math.abs(binId - activeBinId))
}

export function liquidityWeights(input: {
  range: MeteoraBinRange
  activeBinId: number
  strategyType: MeteoraStrategyType
}): MeteoraBinWeight[] {
  const binIds: number[] = []
  for (let binId = input.range.minBinId; binId <= input.range.maxBinId; binId += 1) {
    binIds.push(binId)
  }
  const integers = integerWeights(binIds, input.activeBinId, input.strategyType)
  const total = integers.reduce((sum, weight) => sum + weight, 0)
  return binIds.map((binId, index) => ({ binId, weight: integers[index] / total }))
}

export interface MeteoraBinAllocation {
  binId: number
  weight: number
  amountXBaseUnits: bigint
  amountYBaseUnits: bigint
}

/**
 * Largest-remainder split of one side's total over its eligible bins, in BigInt, so the
 * per-bin sums equal the input exactly. Ties on the fractional part go to the lower bin.
 */
function splitExact(total: bigint, weights: readonly number[]): bigint[] {
  const sum = weights.reduce((acc, weight) => acc + weight, 0)
  const scaled = weights.map((weight) => total * BigInt(weight))
  const shares = scaled.map((value) => value / BigInt(sum))
  let leftover = total - shares.reduce((acc, share) => acc + share, 0n)
  const byLargestRemainder = scaled
    .map((value, index) => ({ index, remainder: value % BigInt(sum) }))
    .sort((a, b) => (a.remainder < b.remainder ? 1 : a.remainder > b.remainder ? -1 : a.index - b.index))
  for (const { index } of byLargestRemainder) {
    if (leftover === 0n) {
      break
    }
    shares[index] += 1n
    leftover -= 1n
  }
  return shares
}

/**
 * Splits amounts over the range per the strategy weights and the DLMM side rule
 * (X: above + active, Y: below + active). Null or 0n on a side allocates 0n everywhere
 * while the weights stay intact, so the chart can render a shape with empty amounts.
 * A side with no eligible bins allocates 0n — placementIssue rejects such drafts first.
 */
export function allocateLiquidity(input: {
  range: MeteoraBinRange
  activeBinId: number
  strategyType: MeteoraStrategyType
  amountXBaseUnits: bigint | null
  amountYBaseUnits: bigint | null
}): MeteoraBinAllocation[] {
  const weights = liquidityWeights({
    range: input.range,
    activeBinId: input.activeBinId,
    strategyType: input.strategyType,
  })
  const integers = integerWeights(
    weights.map((bar) => bar.binId),
    input.activeBinId,
    input.strategyType,
  )
  const sideShares = (side: 'x' | 'y') => {
    const eligible = weights.map((_, index) =>
      side === 'x' ? weights[index].binId >= input.activeBinId : weights[index].binId <= input.activeBinId,
    )
    const total = (side === 'x' ? input.amountXBaseUnits : input.amountYBaseUnits) ?? 0n
    const eligibleWeights = integers.filter((_, index) => eligible[index])
    if (total === 0n || eligibleWeights.length === 0) {
      return weights.map(() => 0n)
    }
    const shares = splitExact(total, eligibleWeights)
    let cursor = 0
    return weights.map((_, index) => (eligible[index] ? shares[cursor++] : 0n))
  }
  const amountX = sideShares('x')
  const amountY = sideShares('y')
  return weights.map((bar, index) => ({
    binId: bar.binId,
    weight: bar.weight,
    amountXBaseUnits: amountX[index],
    amountYBaseUnits: amountY[index],
  }))
}

/** Shared by create validation: refuses wrong-side liquidity with the token the user actually typed. */
export function placementIssue(input: {
  range: MeteoraBinRange
  activeBinId: number
  amountXBaseUnits: bigint
  amountYBaseUnits: bigint
  symbolX: string
  symbolY: string
}): string | null {
  const symbolX = input.symbolX || 'token X'
  const symbolY = input.symbolY || 'token Y'
  if (input.range.minBinId > input.activeBinId && input.amountYBaseUnits > 0n) {
    return `This range sits above the active bin — ${symbolY} cannot be deposited into it.`
  }
  if (input.range.maxBinId < input.activeBinId && input.amountXBaseUnits > 0n) {
    return `This range sits below the active bin — ${symbolX} cannot be deposited into it.`
  }
  return null
}
