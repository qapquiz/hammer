import { useQuery } from '@tanstack/react-query'
import type { Address } from '@solana/kit'
import type { SolanaCluster } from '@wallet-ui/react-native-kit'

import { useAppCluster } from '@/features/cluster/data-access/cluster-provider'

import { isDlmmClusterSupported, meteoraQueryKeys } from './meteora-types'
import { createDlmmPool } from '../util/dlmm-sdk'

export function meteoraPositionsQueryOptions(cluster: SolanaCluster, poolAddress: Address, user: Address) {
  return {
    queryKey: meteoraQueryKeys.positions(cluster, poolAddress, user),
    queryFn: async () => {
      const dlmm = await createDlmmPool({ cluster, poolAddress })
      return dlmm.getPositions(user)
    },
    staleTime: 5_000,
  }
}

export function useMeteoraPositions(
  poolAddress: Address,
  user: Address | null,
  { enabled = true }: { enabled?: boolean } = {},
) {
  const { cluster } = useAppCluster()

  return useQuery({
    ...meteoraPositionsQueryOptions(cluster, poolAddress, user ?? poolAddress),
    enabled: enabled && !!user && isDlmmClusterSupported(cluster.id),
  })
}
