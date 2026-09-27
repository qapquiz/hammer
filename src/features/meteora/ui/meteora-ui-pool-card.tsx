import Ionicons from '@expo/vector-icons/Ionicons'
import { Card } from 'heroui-native/card'
import { Chip } from 'heroui-native/chip'
import { Pressable, View } from 'react-native'

import { formatPercentFraction, formatUsdCompact } from '../util/meteora-format'
import type { MeteoraPool } from '../data-access/meteora-types'

export function MeteoraUiPoolCard({ onPress, pool }: { onPress: () => void; pool: MeteoraPool }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress}>
      <Card className="w-full gap-3 p-4">
        <View className="flex-row items-center gap-2">
          <Card.Title className="flex-1 text-lg font-bold">{pool.name}</Card.Title>
          <Chip size="sm" variant="soft">
            {pool.binStep} bps
          </Chip>
          <Ionicons className="text-muted" name="chevron-forward" size={16} />
        </View>
        <View className="flex-row flex-wrap gap-1">
          {pool.tokenX.isVerified ? (
            <Chip size="sm" variant="secondary">
              {pool.tokenX.symbol}
            </Chip>
          ) : null}
          {pool.tokenY.isVerified ? (
            <Chip size="sm" variant="secondary">
              {pool.tokenY.symbol}
            </Chip>
          ) : null}
        </View>
        <View className="gap-1">
          <MeteoraUiPoolStat label="TVL" value={formatUsdCompact(pool.tvlUsd)} />
          {pool.apr24h !== null ? (
            <MeteoraUiPoolStat label="APR 24h" value={formatPercentFraction(pool.apr24h)} />
          ) : null}
          <MeteoraUiPoolStat label="Volume 24h" value={formatUsdCompact(pool.volume24hUsd)} />
          <MeteoraUiPoolStat label="Fees 24h" value={formatUsdCompact(pool.fees24hUsd)} />
        </View>
      </Card>
    </Pressable>
  )
}

function MeteoraUiPoolStat({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row justify-between">
      <Card.Description className="text-sm">{label}</Card.Description>
      <Card.Description className="text-sm font-semibold">{value}</Card.Description>
    </View>
  )
}
