import { useQuery } from '@tanstack/react-query'
import type { Address } from '@solana/kit'
import { useEffect, useState } from 'react'

import { fetchMeteoraOhlcv, ohlcvBucketWindow } from './meteora-datapi'
import { meteoraQueryKeys, type MeteoraOhlcvResolution } from './meteora-types'

const DEFAULT_RESOLUTION: MeteoraOhlcvResolution = 15
const DEFAULT_LOOKBACK_MS = 24 * 60 * 60 * 1000

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
    staleTime: resolution * 60_000,
  })
}
