import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query'

import { fetchMeteoraPools } from './meteora-datapi'
import { meteoraQueryKeys, type MeteoraPoolCriteria } from './meteora-types'

export function useMeteoraPools(criteria: MeteoraPoolCriteria) {
  return useInfiniteQuery({
    queryKey: meteoraQueryKeys.pools(criteria),
    queryFn: ({ pageParam }) => fetchMeteoraPools(criteria, pageParam),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => (lastPage.page < lastPage.totalPages ? lastPage.page + 1 : undefined),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  })
}
