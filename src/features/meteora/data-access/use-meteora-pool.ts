import { useQuery } from '@tanstack/react-query'
import type { Address } from '@solana/kit'

import { fetchMeteoraPool } from './meteora-datapi'
import { meteoraQueryKeys } from './meteora-types'

export function useMeteoraPool(poolAddress: Address) {
  return useQuery({
    queryKey: meteoraQueryKeys.pool(poolAddress),
    queryFn: () => fetchMeteoraPool(poolAddress),
    staleTime: 30_000,
  })
}
