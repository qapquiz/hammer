import { useQuery } from '@tanstack/react-query'
import type { Address } from '@solana/kit'
import { useEffect, useState } from 'react'

import { fetchMeteoraOhlcv, ohlcvBucketWindow } from './meteora-datapi'
import { meteoraQueryKeys, type MeteoraOhlcvResolution } from './meteora-types'

/* The datapi ohlcv endpoint ignores resolution/window params and serves a fixed window of
 * daily candles (verified 2026-10-06: every resolution and window variant returns the same
 * ~10 candles at 86400s spacing). Request daily over 10 days so the bucketed query key
 * matches the served cadence; the params stay plumbed for when the API honors them. */
const DEFAULT_RESOLUTION: MeteoraOhlcvResolution = 1440
const DEFAULT_LOOKBACK_MS = 10 * 24 * 60 * 60 * 1000

/** Renders whatever the API returns — candle count is never assumed. `candles === null` means loading. */
export function useMeteoraOhlcv(
  poolAddress: Address,
  {
    resolution = DEFAULT_RESOLUTION,
    lookbackMs = DEFAULT_LOOKBACK_MS,
    enabled = true,
  }: { resolution?: MeteoraOhlcvResolution; lookbackMs?: number; enabled?: boolean } = {},
) {
  // The clock is sampled outside render; the tick only matters when the bucket window rolls,
  // which is exactly when the query key changes and the next period fetches.
  const [nowMs, setNowMs] = useState(() => Date.now())
  useEffect(() => {
    const ticker = setInterval(() => setNowMs(Date.now()), 30_000)
    return () => clearInterval(ticker)
  }, [])
  const { startMs, endMs } = ohlcvBucketWindow(resolution, lookbackMs, nowMs)
  return useQuery({
    queryKey: meteoraQueryKeys.ohlcv(poolAddress, resolution, startMs, endMs),
    queryFn: () => fetchMeteoraOhlcv({ poolAddress, resolution, startMs, endMs }),
    enabled,
    // The forming daily candle still moves; the closed ones do not.
    staleTime: 60_000,
  })
}
