import { address } from '@solana/kit'

import type { MeteoraPool, MeteoraPoolCriteria, MeteoraPoolsPage, MeteoraToken } from './meteora-types'

const METEORA_DAAPI_BASE = 'https://dlmm.datapi.meteora.ag'
const POOLS_PAGE_SIZE = 20

const SORT_BY_PARAM: Record<MeteoraPoolCriteria['sortBy'], string> = {
  tvl: 'tvl:desc',
  volume24h: 'volume_24h:desc',
}

/** Wire values drift between strings and numbers across datapi versions; both parse to number. */
function toNumber(value: unknown, field: string): number {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN
  if (!Number.isFinite(parsed)) {
    throw new Error(`Unexpected Meteora API value for "${field}": ${JSON.stringify(value)}`)
  }
  return parsed
}

function toNumberOrNull(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN
  return Number.isFinite(parsed) ? parsed : null
}

function parseToken(wire: unknown, field: string): MeteoraToken {
  if (typeof wire !== 'object' || wire === null) {
    throw new Error(`Unexpected Meteora API token shape for "${field}"`)
  }
  const record = wire as Record<string, unknown>
  return {
    address: address(String(record.address)),
    symbol: String(record.symbol ?? ''),
    decimals: toNumber(record.decimals, `${field}.decimals`),
    isVerified: record.is_verified === true,
    priceUsd: toNumberOrNull(record.price),
  }
}

function parseStats(wire: unknown, timeframe: string): number {
  if (typeof wire !== 'object' || wire === null) {
    return 0
  }
  return toNumber((wire as Record<string, unknown>)[timeframe], `${timeframe}`)
}

export function parseMeteoraPool(wire: unknown): MeteoraPool {
  if (typeof wire !== 'object' || wire === null) {
    throw new Error('Unexpected Meteora API pool shape')
  }
  const record = wire as Record<string, unknown>
  const poolConfig = record.pool_config as Record<string, unknown> | undefined
  return {
    address: address(String(record.address)),
    name: String(record.name ?? ''),
    binStep: toNumber(poolConfig?.bin_step, 'pool_config.bin_step'),
    currentPrice: toNumber(record.current_price, 'current_price'),
    tvlUsd: toNumber(record.tvl, 'tvl'),
    apr24h: toNumberOrNull(record.apr),
    volume24hUsd: parseStats(record.volume, '24h'),
    fees24hUsd: parseStats(record.fees, '24h'),
    farmApy: toNumberOrNull(record.farm_apy),
    tokenX: parseToken(record.token_x, 'token_x'),
    tokenY: parseToken(record.token_y, 'token_y'),
    createdAtMs: toNumberOrNull(record.created_at),
  }
}

async function requestJson(url: string): Promise<unknown> {
  const response = await fetch(url)
  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`Meteora API request failed (${response.status}): ${body.slice(0, 200)}`)
  }
  return response.json()
}

export async function fetchMeteoraPools(criteria: MeteoraPoolCriteria, page: number): Promise<MeteoraPoolsPage> {
  const params = new URLSearchParams({
    page: String(page),
    page_size: String(POOLS_PAGE_SIZE),
    sort_by: SORT_BY_PARAM[criteria.sortBy],
  })
  const filters = ['is_blacklisted=false']
  if (criteria.minTvlUsd > 0) {
    filters.unshift(`tvl>${criteria.minTvlUsd}`)
  }
  params.set('filter_by', filters.join(','))
  if (criteria.search) {
    params.set('query', criteria.search)
  }

  const wire = (await requestJson(`${METEORA_DAAPI_BASE}/pools?${params}`)) as {
    total?: unknown
    pages?: unknown
    current_page?: unknown
    data?: unknown[]
  }
  return {
    total: toNumber(wire.total, 'total'),
    totalPages: toNumber(wire.pages, 'pages'),
    page: toNumber(wire.current_page ?? page, 'current_page'),
    pools: (wire.data ?? []).map(parseMeteoraPool),
  }
}

export async function fetchMeteoraPool(poolAddress: MeteoraPool['address']): Promise<MeteoraPool> {
  const wire = await requestJson(`${METEORA_DAAPI_BASE}/pools/${poolAddress}`)
  return parseMeteoraPool(wire)
}
