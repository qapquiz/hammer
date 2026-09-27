import { useQuery } from '@tanstack/react-query'
import type { Address } from '@solana/kit'

import { useAppCluster } from '@/features/cluster/data-access/cluster-provider'

import { isDlmmClusterSupported, meteoraQueryKeys, type MeteoraBinRange } from './meteora-types'
import { createDlmmPool } from '../util/dlmm-sdk'

export function useMeteoraRentQuote(
  poolAddress: Address,
  range: MeteoraBinRange | null,
  { enabled = true }: { enabled?: boolean } = {},
) {
  const { cluster } = useAppCluster()

  return useQuery({
    queryKey: meteoraQueryKeys.rentQuote(cluster, poolAddress, range),
    queryFn: async () => {
      const dlmm = await createDlmmPool({ cluster, poolAddress })
      return dlmm.quoteRentSol(range as MeteoraBinRange)
    },
    enabled: enabled && isDlmmClusterSupported(cluster.id) && range !== null,
    staleTime: 30_000,
  })
}
