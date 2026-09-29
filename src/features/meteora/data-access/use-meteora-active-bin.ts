import { useQuery } from '@tanstack/react-query'
import type { Address } from '@solana/kit'
import type { SolanaCluster } from '@wallet-ui/react-native-kit'

import { useAppCluster } from '@/features/cluster/data-access/cluster-provider'

import { isDlmmClusterSupported, meteoraQueryKeys } from './meteora-types'
import { createDlmmPool } from '../util/dlmm-sdk'

export function meteoraActiveBinQueryOptions(cluster: SolanaCluster, poolAddress: Address) {
  return {
    queryKey: meteoraQueryKeys.activeBin(cluster, poolAddress),
    queryFn: async () => {
      const dlmm = await createDlmmPool({ cluster, poolAddress })
      return dlmm.getActiveBin()
    },
    staleTime: 5_000,
  }
}

export function useMeteoraActiveBin(poolAddress: Address, { enabled = true }: { enabled?: boolean } = {}) {
  const { cluster } = useAppCluster()

  return useQuery({
    ...meteoraActiveBinQueryOptions(cluster, poolAddress),
    enabled: enabled && isDlmmClusterSupported(cluster.id),
  })
}
