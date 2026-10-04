import {
  DEFAULT_SLIPPAGE_PERCENT,
  METEORA_STRATEGY_PRESETS,
  type MeteoraActiveBin,
  type MeteoraBinRange,
  type MeteoraClosePlan,
  type MeteoraDepositDraft,
  type MeteoraDepositPlan,
  type MeteoraPositionDraft,
  type MeteoraPositionPlan,
  type MeteoraPositionPreview,
  type MeteoraStrategyPreset,
  type MeteoraStrategyPresetId,
  type MeteoraToken,
  type MeteoraWithdrawPlan,
} from '../data-access/meteora-types'

export function getStrategyPreset(presetId: MeteoraStrategyPresetId): MeteoraStrategyPreset {
  const preset = METEORA_STRATEGY_PRESETS.find((candidate) => candidate.id === presetId)
  if (!preset) {
    throw new Error(`Unknown strategy preset: ${presetId}`)
  }
  return preset
}

export function derivePresetRange(preset: MeteoraStrategyPreset, activeBin: MeteoraActiveBin): MeteoraBinRange {
  return {
    minBinId: Math.max(activeBin.binId - preset.binsPerSide, activeBin.minBinId),
    maxBinId: Math.min(activeBin.binId + preset.binsPerSide, activeBin.maxBinId),
  }
}

/** Conservative SDK-safety floor on range width; presets never produce fewer than 16 bins. */
export const MIN_RANGE_BINS = 2

/** The one enforcer of order, pool bounds, and minimum width; re-checked in planPosition. */
export function clampBinRange(
  range: MeteoraBinRange,
  bounds: { minBinId: number; maxBinId: number },
  minBins = MIN_RANGE_BINS,
): MeteoraBinRange {
  let minBinId = Math.max(Math.min(range.minBinId, range.maxBinId), bounds.minBinId)
  let maxBinId = Math.min(Math.max(range.minBinId, range.maxBinId), bounds.maxBinId)
  const missing = minBins - 1 - (maxBinId - minBinId)
  if (missing > 0) {
    // Widen downward first; when the pool itself is narrower than minBins, the bounds win.
    const lower = Math.min(missing, minBinId - bounds.minBinId)
    minBinId -= lower
    maxBinId = Math.min(maxBinId + (missing - lower), bounds.maxBinId)
  }
  return { minBinId, maxBinId }
}

/** The one preset→state generator; chip taps and the default draft both go through it. */
export function draftFromPreset({
  poolAddress,
  presetId,
  activeBin,
}: {
  poolAddress: MeteoraPositionDraft['poolAddress']
  presetId: MeteoraStrategyPresetId
  activeBin: MeteoraActiveBin
}): MeteoraPositionDraft {
  const preset = getStrategyPreset(presetId)
  const range = derivePresetRange(preset, activeBin)
  return {
    poolAddress,
    minBinId: range.minBinId,
    maxBinId: range.maxBinId,
    strategyType: preset.strategyType,
    amountX: '',
    amountY: '',
  }
}

export function binPrice(activePrice: number, binStep: number, binDelta: number): number {
  return activePrice * (1 + binStep / 10_000) ** binDelta
}

/** Reads the draft's range as-is — never re-centers on the active bin; prices via binPrice. */
export function derivePositionPreview(
  draft: MeteoraPositionDraft,
  activeBin: MeteoraActiveBin,
): MeteoraPositionPreview {
  return {
    minBinId: draft.minBinId,
    maxBinId: draft.maxBinId,
    binCount: draft.maxBinId - draft.minBinId + 1,
    minPrice: binPrice(activeBin.price, activeBin.binStep, draft.minBinId - activeBin.binId),
    maxPrice: binPrice(activeBin.price, activeBin.binStep, draft.maxBinId - activeBin.binId),
  }
}

/**
 * Human amount string → base units, without floats: regex check, zero-pad the fraction,
 * one BigInt over the digit concatenation. Returns null for anything the UI should reject.
 */
export function toBaseUnits(amount: string, decimals: number): bigint | null {
  const trimmed = amount.trim()
  if (!/^\d*(\.\d*)?$/.test(trimmed) || trimmed === '' || trimmed === '.') {
    return null
  }
  const [whole, fraction = ''] = trimmed.split('.')
  if (fraction.length > decimals) {
    return null
  }
  const normalizedFraction = fraction.padEnd(decimals, '0')
  return BigInt((whole || '0') + normalizedFraction)
}

export function validatePositionDraft(
  draft: MeteoraPositionDraft,
  decimalsX: number,
  decimalsY: number,
): string | null {
  const amountX = toBaseUnits(draft.amountX, decimalsX)
  const amountY = toBaseUnits(draft.amountY, decimalsY)
  if (amountX === null || amountY === null) {
    return 'Enter valid amounts (numbers only, within token precision).'
  }
  if (amountX === 0n && amountY === 0n) {
    return 'Enter an amount for at least one token.'
  }
  return null
}

export function planWithdraw({
  percent,
  position,
}: {
  percent: number
  position: {
    poolAddress: MeteoraWithdrawPlan['poolAddress']
    address: MeteoraWithdrawPlan['positionAddress']
    lowerBinId: number
    upperBinId: number
  }
}): MeteoraWithdrawPlan {
  const issue = validateWithdrawPercent(percent)
  if (issue) {
    throw new Error(issue)
  }
  return {
    kind: 'withdraw',
    poolAddress: position.poolAddress,
    positionAddress: position.address,
    minBinId: position.lowerBinId,
    maxBinId: position.upperBinId,
    percentBps: percent * 100,
    percent,
  }
}

export function validateWithdrawPercent(percent: number): string | null {
  if (!Number.isInteger(percent) || percent < 1 || percent > 100) {
    return 'Withdraw percent must be a whole number between 1 and 100.'
  }
  return null
}

export function planClose({
  position,
}: {
  position: {
    poolAddress: MeteoraClosePlan['poolAddress']
    address: MeteoraClosePlan['positionAddress']
    amountXBaseUnits: bigint
    amountYBaseUnits: bigint
    feeXBaseUnits: bigint
    feeYBaseUnits: bigint
  }
}): MeteoraClosePlan {
  if (position.amountXBaseUnits > 0n || position.amountYBaseUnits > 0n) {
    throw new Error('Withdraw the remaining liquidity before closing this position.')
  }
  return {
    kind: 'close',
    poolAddress: position.poolAddress,
    positionAddress: position.address,
    feeXBaseUnits: position.feeXBaseUnits,
    feeYBaseUnits: position.feeYBaseUnits,
  }
}

/**
 * Deposits spread evenly (spot) across the position's own range. DLMM mechanics cap the
 * sides: bins above the active bin accept token X only, bins below accept token Y only.
 * Precision is checked against the real token decimals via the plan step; this check only
 * needs shape validity, so a generous 18-digit parse suffices.
 */
export function validateDepositDraft({
  activeBinId,
  draft,
  position,
  tokenX,
  tokenY,
}: {
  activeBinId: number
  draft: MeteoraDepositDraft
  position: { lowerBinId: number; upperBinId: number }
  tokenX: Pick<MeteoraToken, 'symbol'>
  tokenY: Pick<MeteoraToken, 'symbol'>
}): string | null {
  const amountX = draft.amountX.trim() === '' ? 0n : toBaseUnits(draft.amountX, 18)
  const amountY = draft.amountY.trim() === '' ? 0n : toBaseUnits(draft.amountY, 18)
  if (amountX === null || amountY === null) {
    return 'Enter valid amounts (numbers only, within token precision).'
  }
  if (amountX === 0n && amountY === 0n) {
    return 'Enter an amount for at least one token.'
  }
  const symbolX = tokenX.symbol || 'token X'
  const symbolY = tokenY.symbol || 'token Y'
  if (position.lowerBinId > activeBinId && amountY > 0n) {
    return `This position sits above the active bin — only ${symbolX} can be deposited.`
  }
  if (position.upperBinId < activeBinId && amountX > 0n) {
    return `This position sits below the active bin — only ${symbolY} can be deposited.`
  }
  return null
}

export function planDeposit({
  activeBinId,
  draft,
  position,
  tokenX,
  tokenY,
}: {
  activeBinId: number
  draft: MeteoraDepositDraft
  position: {
    poolAddress: MeteoraDepositPlan['poolAddress']
    address: MeteoraDepositPlan['positionAddress']
    lowerBinId: number
    upperBinId: number
  }
  tokenX: MeteoraToken
  tokenY: MeteoraToken
}): MeteoraDepositPlan {
  const amountXBaseUnits = draft.amountX.trim() === '' ? 0n : toBaseUnits(draft.amountX, tokenX.decimals)
  const amountYBaseUnits = draft.amountY.trim() === '' ? 0n : toBaseUnits(draft.amountY, tokenY.decimals)
  if (amountXBaseUnits === null || amountYBaseUnits === null) {
    throw new Error('Cannot plan a deposit from invalid amounts.')
  }
  if (amountXBaseUnits === 0n && amountYBaseUnits === 0n) {
    throw new Error('Enter an amount for at least one token.')
  }
  return {
    kind: 'deposit',
    poolAddress: position.poolAddress,
    positionAddress: position.address,
    minBinId: position.lowerBinId,
    maxBinId: position.upperBinId,
    amountXBaseUnits,
    amountYBaseUnits,
    tokenX,
    tokenY,
    slippagePercent: DEFAULT_SLIPPAGE_PERCENT,
    activeBinIdAtPlanTime: activeBinId,
  }
}

export function planPosition({
  activeBin,
  draft,
  tokenX,
  tokenY,
}: {
  activeBin: MeteoraActiveBin
  draft: MeteoraPositionDraft
  tokenX: MeteoraPositionPlan['tokenX']
  tokenY: MeteoraPositionPlan['tokenY']
}): MeteoraPositionPlan {
  const amountXBaseUnits = toBaseUnits(draft.amountX, tokenX.decimals)
  const amountYBaseUnits = toBaseUnits(draft.amountY, tokenY.decimals)
  if (amountXBaseUnits === null || amountYBaseUnits === null) {
    throw new Error('Cannot plan a position from invalid amounts.')
  }
  const range = clampBinRange({ minBinId: draft.minBinId, maxBinId: draft.maxBinId }, activeBin)
  return {
    poolAddress: draft.poolAddress,
    strategyType: draft.strategyType,
    minBinId: range.minBinId,
    maxBinId: range.maxBinId,
    binCount: range.maxBinId - range.minBinId + 1,
    minPrice: binPrice(activeBin.price, activeBin.binStep, range.minBinId - activeBin.binId),
    maxPrice: binPrice(activeBin.price, activeBin.binStep, range.maxBinId - activeBin.binId),
    amountXBaseUnits,
    amountYBaseUnits,
    tokenX,
    tokenY,
    slippagePercent: DEFAULT_SLIPPAGE_PERCENT,
    activeBinIdAtPlanTime: activeBin.binId,
  }
}
