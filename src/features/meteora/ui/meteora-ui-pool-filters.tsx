import { SearchField } from 'heroui-native/search-field'
import { Select } from 'heroui-native/select'
import { Button } from 'heroui-native/button'
import { Card } from 'heroui-native/card'
import { View } from 'react-native'

import type { MeteoraPoolCriteria, MeteoraPoolSort } from '../data-access/meteora-types'

const SORT_OPTIONS: { label: string; value: MeteoraPoolSort }[] = [
  { label: 'TVL', value: 'tvl' },
  { label: 'Volume 24h', value: 'volume24h' },
  { label: 'Fees 24h', value: 'fees24h' },
  { label: 'Fee / TVL 24h', value: 'feeTvlRatio24h' },
  { label: 'Farm APY', value: 'farmApy' },
]

const MIN_TVL_OPTIONS: { label: string; value: number }[] = [
  { label: 'All', value: 0 },
  { label: '$1K', value: 1_000 },
  { label: '$10K', value: 10_000 },
  { label: '$100K', value: 100_000 },
  { label: '$1M', value: 1_000_000 },
]

export function MeteoraUiPoolFilters({
  criteria,
  onChange,
}: {
  criteria: MeteoraPoolCriteria
  onChange: (criteria: MeteoraPoolCriteria) => void
}) {
  return (
    <Card className="w-full gap-3 p-4">
      <SearchField onChange={(search) => onChange({ ...criteria, search })} value={criteria.search}>
        <SearchField.Input placeholder="Search pools" />
      </SearchField>
      <View className="flex-row items-center gap-2">
        <View className="w-36">
          <Select
            onValueChange={(option) => {
              if (option) {
                onChange({ ...criteria, sortBy: option.value as MeteoraPoolSort })
              }
            }}
            value={{
              label: SORT_OPTIONS.find((option) => option.value === criteria.sortBy)?.label ?? '',
              value: criteria.sortBy,
            }}
          >
            <Select.Trigger>
              <Select.Value placeholder="Sort by" />
            </Select.Trigger>
            <Select.Portal>
              <Select.Overlay />
              <Select.Content align="start" placement="bottom" presentation="popover" width="trigger">
                <Select.ListLabel>Sort by</Select.ListLabel>
                {SORT_OPTIONS.map((option) => (
                  <Select.Item key={option.value} label={option.label} value={option.value} />
                ))}
              </Select.Content>
            </Select.Portal>
          </Select>
        </View>
        <View className="flex-1 flex-row flex-wrap justify-end gap-2">
          {MIN_TVL_OPTIONS.map((option) => {
            const selected = criteria.minTvlUsd === option.value
            return (
              <Button
                key={option.value}
                size="sm"
                variant={selected ? 'primary' : 'outline'}
                onPress={() => onChange({ ...criteria, minTvlUsd: option.value })}
              >
                {option.label}
              </Button>
            )
          })}
        </View>
      </View>
    </Card>
  )
}
