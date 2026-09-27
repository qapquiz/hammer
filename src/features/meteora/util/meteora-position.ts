import {
  DEFAULT_SLIPPAGE_PERCENT,
  METEORA_STRATEGY_PRESETS,
  type MeteoraActiveBin,
  type MeteoraBinRange,
  type MeteoraPositionDraft,
  type MeteoraPositionPlan,
  type MeteoraPositionPreview,
  type MeteoraStrategyPreset,
} from '../data-access/meteora-types'

export function getStrategyPreset(presetId: MeteoraPositionDraft['presetId']): MeteoraStrategyPreset {
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

export function binPrice(activePrice: number, binStep: number, binDelta: number): number {
  return activePrice * (1 + binStep / 10_000) ** binDelta
}

export function derivePresetPreview(draft: MeteoraPositionDraft, activeBin: MeteoraActiveBin): MeteoraPositionPreview {
  const preset = getStrategyPreset(draft.presetId)
  const range = derivePresetRange(preset, activeBin)
  return {
    presetId: draft.presetId,
    minBinId: range.minBinId,
    maxBinId: range.maxBinId,
    binCount: range.maxBinId - range.minBinId + 1,
    minPrice: binPrice(activeBin.price, activeBin.binStep, range.minBinId - activeBin.binId),
    maxPrice: binPrice(activeBin.price, activeBin.binStep, range.maxBinId - activeBin.binId),
  }
}

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
  const preset = getStrategyPreset(draft.presetId)
  const range = derivePresetRange(preset, activeBin)
  const amountXBaseUnits = toBaseUnits(draft.amountX, tokenX.decimals)
  const amountYBaseUnits = toBaseUnits(draft.amountY, tokenY.decimals)
  if (amountXBaseUnits === null || amountYBaseUnits === null) {
    throw new Error('Cannot plan a position from invalid amounts.')
  }
  return {
    poolAddress: draft.poolAddress,
    presetId: draft.presetId,
    strategyType: preset.strategyType,
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
