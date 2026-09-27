import type { Address, Transaction } from '@solana/kit'
import type { SolanaCluster, SolanaClusterId } from '@wallet-ui/react-native-kit'

export interface MeteoraToken {
  address: Address
  symbol: string
  decimals: number
  isVerified: boolean
  priceUsd: number | null
}

export interface MeteoraPool {
  address: Address
  name: string
  binStep: number
  currentPrice: number
  tvlUsd: number
  /** Fraction (0.01 = 1%); null when the API omits it. */
  apr24h: number | null
  volume24hUsd: number
  fees24hUsd: number
  farmApy: number | null
  tokenX: MeteoraToken
  tokenY: MeteoraToken
  createdAtMs: number | null
}

export type MeteoraPoolSort = 'tvl' | 'volume24h'

export interface MeteoraPoolCriteria {
  sortBy: MeteoraPoolSort
  minTvlUsd: number
  /** Trimmed user text; '' means no query filter. */
  search: string
}

export const DEFAULT_METEORA_POOL_CRITERIA: MeteoraPoolCriteria = {
  sortBy: 'tvl',
  minTvlUsd: 1_000,
  search: '',
}

export interface MeteoraPoolsPage {
  pools: MeteoraPool[]
  page: number
  totalPages: number
  total: number
}

export interface MeteoraActiveBin {
  poolAddress: Address
  binId: number
  /** Human UI price (token Y per token X), decimals-adjusted by the SDK. */
  price: number
  binStep: number
  /** Pool's static bin-id bounds; range derivation clamps into these. */
  minBinId: number
  maxBinId: number
}

export interface MeteoraRentQuote {
  totalSol: number
  positionCostSol: number
  binArrayCostSol: number
}

/** Strategy codes the SDK expects on the wire; the enum is unreachable at runtime under Metro. */
export const METEORA_STRATEGY_TYPE_CODE = { spot: 0, bidAsk: 2 } as const

export type MeteoraStrategyType = keyof typeof METEORA_STRATEGY_TYPE_CODE

export type MeteoraStrategyPresetId = 'spot-narrow' | 'spot-wide' | 'bid-ask'

export interface MeteoraStrategyPreset {
  id: MeteoraStrategyPresetId
  label: string
  description: string
  strategyType: MeteoraStrategyType
  binsPerSide: number
}

export const METEORA_STRATEGY_PRESETS: readonly MeteoraStrategyPreset[] = [
  {
    id: 'spot-narrow',
    label: 'Spot narrow',
    description: 'Even deposit, tight range around the active bin.',
    strategyType: 'spot',
    binsPerSide: 8,
  },
  {
    id: 'spot-wide',
    label: 'Spot wide',
    description: 'Even deposit, wide range around the active bin.',
    strategyType: 'spot',
    binsPerSide: 34,
  },
  {
    id: 'bid-ask',
    label: 'Bid-Ask',
    description: 'Curved deposit concentrated around the active bin.',
    strategyType: 'bidAsk',
    binsPerSide: 16,
  },
]

export const DEFAULT_SLIPPAGE_PERCENT = 1

/** What the form produces. Amounts are human-unit strings exactly as typed. */
export interface MeteoraPositionDraft {
  poolAddress: Address
  presetId: MeteoraStrategyPresetId
  amountX: string
  amountY: string
}

/** What preview derives and what execute consumes. Base units are parsed exactly once, here. */
export interface MeteoraPositionPlan {
  poolAddress: Address
  presetId: MeteoraStrategyPresetId
  strategyType: MeteoraStrategyType
  minBinId: number
  maxBinId: number
  binCount: number
  /** UI price bounds of the range (token Y per token X). */
  minPrice: number
  maxPrice: number
  amountXBaseUnits: bigint
  amountYBaseUnits: bigint
  tokenX: MeteoraToken
  tokenY: MeteoraToken
  slippagePercent: number
  activeBinIdAtPlanTime: number
}

/** Derived for display while the user edits, before a plan exists. */
export interface MeteoraPositionPreview {
  presetId: MeteoraStrategyPresetId
  minBinId: number
  maxBinId: number
  binCount: number
  minPrice: number
  maxPrice: number
}

export type MeteoraCreatePositionFlow =
  | { status: 'idle' }
  | { status: 'previewing'; draft: MeteoraPositionDraft }
  | { status: 'preview'; plan: MeteoraPositionPlan }
  | { status: 'building'; plan: MeteoraPositionPlan }
  | { status: 'signing'; plan: MeteoraPositionPlan }
  | { status: 'sent'; plan: MeteoraPositionPlan; signature: string; positionAddress: Address }
  | { status: 'failed'; plan: MeteoraPositionPlan | null; error: unknown }
  | { status: 'dismissed'; plan: MeteoraPositionPlan }

/**
 * The position account must be created fresh and sign the transaction itself (the program's
 * initialize_position has no base account), so the flow carries the built position address
 * for the sent state and explorer links.
 */
export interface MeteoraBuiltPosition {
  positionAddress: Address
  /** Kit transaction, partially signed by the position keypair; the wallet signs the fee payer. */
  transaction: Transaction
}

/**
 * REST keys omit the cluster because the datapi serves mainnet data only. On-chain keys embed
 * cluster id + url per repo convention, since they read the active cluster.
 */
export const meteoraQueryKeys = {
  pools: (criteria: MeteoraPoolCriteria) =>
    ['meteora-pools', criteria.sortBy, criteria.minTvlUsd, criteria.search] as const,
  pool: (poolAddress: Address) => ['meteora-pool', poolAddress] as const,
  activeBin: (cluster: SolanaCluster, poolAddress: Address) =>
    ['meteora-active-bin', cluster.id, cluster.url, poolAddress] as const,
  rentQuote: (cluster: SolanaCluster, poolAddress: Address, range: MeteoraBinRange | null) =>
    [
      'meteora-rent-quote',
      cluster.id,
      cluster.url,
      poolAddress,
      range?.minBinId ?? null,
      range?.maxBinId ?? null,
    ] as const,
}

export interface MeteoraBinRange {
  minBinId: number
  maxBinId: number
}

export const METEORA_SUPPORTED_CLUSTER_ID: SolanaClusterId = 'solana:mainnet'

export function isDlmmClusterSupported(clusterId: SolanaClusterId): boolean {
  return clusterId === METEORA_SUPPORTED_CLUSTER_ID
}
