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
  isBlacklisted: boolean
  tokenX: MeteoraToken
  tokenY: MeteoraToken
  createdAtMs: number | null
}

export type MeteoraPoolSort = 'tvl' | 'volume24h' | 'fees24h' | 'feeTvlRatio24h' | 'farmApy'

export interface MeteoraPoolCriteria {
  sortBy: MeteoraPoolSort
  minTvlUsd: number
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

/** Percent (0..100); the SDK dist guards slippage < 0 and slippage > 100, confirming the unit. */
export const DEFAULT_SLIPPAGE_PERCENT = 1

export const METEORA_PRIORITY_FEE_MICROLAMPORTS = 50_000

export const METEORA_COMPUTE_UNIT_LIMIT = 600_000

export const METEORA_CONFIRMATION_TIMEOUT_MS = 60_000

/**
 * What the form produces. The range is primary state: presets are generators (draftFromPreset)
 * and a chart drag writes these fields directly. Amounts are human-unit strings exactly as typed.
 */
export interface MeteoraPositionDraft {
  poolAddress: Address
  minBinId: number
  maxBinId: number
  strategyType: MeteoraStrategyType
  amountX: string
  amountY: string
}

export interface MeteoraCandle {
  timestampMs: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

/** Candle resolutions the datapi ohlcv endpoint accepts, in minutes. */
export type MeteoraOhlcvResolution = 1 | 15 | 60 | 360 | 1440

/** What preview derives and what execute consumes. Base units are parsed exactly once, in planPosition. */
export interface MeteoraPositionPlan {
  poolAddress: Address
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

export interface MeteoraPositionPreview {
  minBinId: number
  maxBinId: number
  binCount: number
  minPrice: number
  maxPrice: number
}

/**
 * How far a partially sent flow got, so the UI can say "step 2 of 3 failed" with links
 * for the signatures that did land.
 */
export interface MeteoraPartialProgress {
  signatures: readonly string[]
  confirmedCount: number
  totalCount: number
}

/**
 * idle → previewing → previewed → building → signing → confirming → confirmed, plus failed
 * and dismissed. Success may only be rendered from `confirmed` (all signatures polled to
 * confirmation), never from a bare signature.
 */
export type MeteoraCreatePositionFlow =
  | { status: 'idle' }
  | { status: 'previewing'; draft: MeteoraPositionDraft }
  | { status: 'previewed'; plan: MeteoraPositionPlan }
  | { status: 'building'; plan: MeteoraPositionPlan }
  | { status: 'signing'; plan: MeteoraPositionPlan }
  | {
      status: 'confirming'
      plan: MeteoraPositionPlan
      signatures: readonly string[]
      positionAddress: Address
    }
  | {
      status: 'confirmed'
      plan: MeteoraPositionPlan
      signatures: readonly string[]
      positionAddress: Address
      confirmationSlot: bigint | null
    }
  | { status: 'failed'; plan: MeteoraPositionPlan | null; error: unknown; progress?: MeteoraPartialProgress }
  | { status: 'dismissed'; plan: MeteoraPositionPlan }

/**
 * The position account must be created fresh and sign the first transaction itself (the
 * program's initialize_position has no base account), so the flow carries the built position
 * address for confirmation state and explorer links. The executor sends every transaction.
 */
export interface MeteoraBuiltPosition {
  positionAddress: Address
  /** Kit transactions, partially signed by the position keypair where required; the wallet signs the fee payer. */
  transactions: readonly Transaction[]
}

/** One owned position of a pool, as the list query and the manage flows consume it. All amounts base units. */
export interface MeteoraPosition {
  address: Address
  poolAddress: Address
  lowerBinId: number
  upperBinId: number
  amountXBaseUnits: bigint
  amountYBaseUnits: bigint
  /** Unclaimed swap fees. */
  feeXBaseUnits: bigint
  feeYBaseUnits: bigint
  /** Pending farm rewards (reward zero/one on the position). */
  rewardOneBaseUnits: bigint
  rewardTwoBaseUnits: bigint
  /** Pool active bin when the position was fetched, for the in-range chip. */
  activeBinId: number
}

export function meteoraPositionHasLiquidity(position: MeteoraPosition): boolean {
  return position.amountXBaseUnits > 0n || position.amountYBaseUnits > 0n
}

export function meteoraPositionHasPendingRewards(position: MeteoraPosition): boolean {
  return position.rewardOneBaseUnits > 0n || position.rewardTwoBaseUnits > 0n
}

/** What the deposit form produces. Amounts are human-unit strings exactly as typed. */
export interface MeteoraDepositDraft {
  poolAddress: Address
  positionAddress: Address
  amountX: string
  amountY: string
}

/** Deposits spread evenly (spot) across the position's existing bin range. */
export interface MeteoraDepositPlan {
  kind: 'deposit'
  poolAddress: Address
  positionAddress: Address
  /** The position's own range; deposits cannot widen it. */
  minBinId: number
  maxBinId: number
  amountXBaseUnits: bigint
  amountYBaseUnits: bigint
  tokenX: MeteoraToken
  tokenY: MeteoraToken
  slippagePercent: number
  activeBinIdAtPlanTime: number
}

/** What the withdraw form produces. */
export interface MeteoraWithdrawDraft {
  poolAddress: Address
  positionAddress: Address
  /** Integer percent 1..100 of every bin's liquidity to remove. */
  percent: number
}

export interface MeteoraWithdrawPlan {
  kind: 'withdraw'
  poolAddress: Address
  positionAddress: Address
  minBinId: number
  maxBinId: number
  /** Basis points of each bin's liquidity to remove; 10_000 = 100%. */
  percentBps: number
  percent: number
}

/** Close claims pending swap fees first, then reclaims the position's rent. */
export interface MeteoraClosePlan {
  kind: 'close'
  poolAddress: Address
  positionAddress: Address
  feeXBaseUnits: bigint
  feeYBaseUnits: bigint
}

export type MeteoraPositionActionPlan = MeteoraDepositPlan | MeteoraWithdrawPlan | MeteoraClosePlan

/**
 * idle → building → signing → confirming → confirmed, plus failed and dismissed. No preview
 * stage: deposit/withdraw/close validation is local, so the first async step is building.
 */
export type MeteoraPositionFlow =
  | { status: 'idle' }
  | { status: 'building'; plan: MeteoraPositionActionPlan }
  | { status: 'signing'; plan: MeteoraPositionActionPlan }
  | { status: 'confirming'; plan: MeteoraPositionActionPlan; signatures: readonly string[] }
  | {
      status: 'confirmed'
      plan: MeteoraPositionActionPlan
      signatures: readonly string[]
      confirmationSlot: bigint | null
    }
  | { status: 'failed'; plan: MeteoraPositionActionPlan | null; error: unknown; progress?: MeteoraPartialProgress }
  | { status: 'dismissed'; plan: MeteoraPositionActionPlan }

export interface MeteoraBinRange {
  minBinId: number
  maxBinId: number
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
  positions: (cluster: SolanaCluster, poolAddress: Address, user: Address) =>
    ['meteora-positions', cluster.id, cluster.url, poolAddress, user] as const,
  ohlcv: (poolAddress: Address, resolution: MeteoraOhlcvResolution, startMs: number, endMs: number) =>
    ['meteora-ohlcv', poolAddress, resolution, startMs, endMs] as const,
}

export const METEORA_SUPPORTED_CLUSTER_ID: SolanaClusterId = 'solana:mainnet'

export function isDlmmClusterSupported(clusterId: SolanaClusterId): boolean {
  return clusterId === METEORA_SUPPORTED_CLUSTER_ID
}
