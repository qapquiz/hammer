import { useRouter } from 'expo-router'
import type { Href } from 'expo-router'
import { ActivityIndicator, Text } from 'react-native'
import { useEffect, useState } from 'react'
import { Button } from 'heroui-native/button'

import { ShellUiPage } from '@/features/shell/ui/shell-ui-page'

import { DEFAULT_METEORA_POOL_CRITERIA, type MeteoraPoolCriteria } from './data-access/meteora-types'
import { useMeteoraPools } from './data-access/use-meteora-pools'
import { MeteoraUiPoolCard } from './ui/meteora-ui-pool-card'
import { MeteoraUiPoolFilters } from './ui/meteora-ui-pool-filters'

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timeout = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(timeout)
  }, [value, delayMs])
  return debounced
}

export function MeteoraFeatureEntry() {
  const router = useRouter()
  const [criteria, setCriteria] = useState<MeteoraPoolCriteria>(DEFAULT_METEORA_POOL_CRITERIA)
  const debouncedSearch = useDebouncedValue(criteria.search, 400)
  const pools = useMeteoraPools({ ...criteria, search: debouncedSearch.trim() })

  return (
    <ShellUiPage>
      <MeteoraUiPoolFilters criteria={criteria} onChange={setCriteria} />
      {pools.isError ? (
        <Text className="text-danger">{String(pools.error)}</Text>
      ) : pools.isPending ? (
        <ActivityIndicator />
      ) : pools.data?.pages[0]?.pools.length === 0 ? (
        <Text className="text-muted text-center">No pools match these filters.</Text>
      ) : null}
      {pools.data?.pages.flatMap((page) =>
        page.pools.map((pool) => (
          <MeteoraUiPoolCard
            key={pool.address}
            pool={pool}
            onPress={() => router.push(`/tools/meteora/${pool.address}` as Href)}
          />
        )),
      )}
      {pools.isFetching && !pools.isPending ? <ActivityIndicator /> : null}
      {pools.hasNextPage ? (
        <Button variant="outline" onPress={() => void pools.fetchNextPage()}>
          {pools.isFetchingNextPage ? 'Loading…' : 'Load more'}
        </Button>
      ) : null}
    </ShellUiPage>
  )
}
