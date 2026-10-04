import { getExplorerUrl } from '@wallet-ui/react-native-kit'
import { Card } from 'heroui-native/card'
import { Chip } from 'heroui-native/chip'
import { ActivityIndicator, Linking, Pressable, Text, View } from 'react-native'
import type { Address } from '@solana/kit'

import { useAppCluster } from '@/features/cluster/data-access/cluster-provider'

import { meteoraPositionHasLiquidity, type MeteoraPool, type MeteoraPosition } from '../data-access/meteora-types'
import { formatBaseUnits } from '../util/meteora-format'

export function MeteoraUiPositionsList({
  isLoading,
  isError,
  error,
  onRefresh,
  onSelect,
  positions,
  selectedAddress,
  pool,
}: {
  isLoading: boolean
  isError: boolean
  error: Error | null
  onRefresh: () => void
  onSelect: (address: Address) => void
  positions: MeteoraPosition[] | undefined
  selectedAddress: Address | null
  pool: MeteoraPool
}) {
  return (
    <Card className="w-full gap-3 p-4">
      <View className="flex-row items-center justify-between">
        <Card.Title className="text-lg font-bold">Your positions</Card.Title>
        <Pressable accessibilityRole="button" accessibilityLabel="Refresh positions" onPress={onRefresh}>
          <Text className="text-muted text-sm">Refresh</Text>
        </Pressable>
      </View>
      {isLoading ? <ActivityIndicator /> : null}
      {isError && error ? <Text className="text-danger">{error.message}</Text> : null}
      {positions && positions.length === 0 ? (
        <Card.Description>No positions in this pool yet — create one above.</Card.Description>
      ) : null}
      <View className="gap-2">
        {(positions ?? []).map((position) => (
          <PositionRow
            key={position.address}
            position={position}
            pool={pool}
            selected={position.address === selectedAddress}
            onSelect={onSelect}
          />
        ))}
      </View>
    </Card>
  )
}

function PositionRow({
  position,
  pool,
  selected,
  onSelect,
}: {
  position: MeteoraPosition
  pool: MeteoraPool
  selected: boolean
  onSelect: (address: Address) => void
}) {
  const { cluster } = useAppCluster()
  const inRange = position.activeBinId >= position.lowerBinId && position.activeBinId <= position.upperBinId
  const explorerUrl = getExplorerUrl({
    network: { id: cluster.id, url: cluster.url },
    path: `/address/${position.address}`,
    provider: 'solana',
  })
  const pendingFees =
    position.feeXBaseUnits > 0n || position.feeYBaseUnits > 0n
      ? `${formatBaseUnits(position.feeXBaseUnits, pool.tokenX.decimals)} ${pool.tokenX.symbol} + ${formatBaseUnits(position.feeYBaseUnits, pool.tokenY.decimals)} ${pool.tokenY.symbol}`
      : null

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Manage position ${position.address}`}
      onPress={() => onSelect(position.address)}
      className={`rounded-xl p-3 ${selected ? 'bg-primary/20' : 'bg-content2'}`}
    >
      <View className="gap-1">
        <View className="flex-row items-center gap-2">
          <Text className="flex-1 text-sm font-semibold">
            {position.lowerBinId} → {position.upperBinId}
          </Text>
          <Chip size="sm" variant={inRange ? 'secondary' : 'soft'}>
            {inRange ? 'In range' : 'Out of range'}
          </Chip>
          {meteoraPositionHasLiquidity(position) ? null : (
            <Chip size="sm" variant="soft">
              Empty
            </Chip>
          )}
        </View>
        <Text className="text-muted text-xs">
          {formatBaseUnits(position.amountXBaseUnits, pool.tokenX.decimals)} {pool.tokenX.symbol}
          {' · '}
          {formatBaseUnits(position.amountYBaseUnits, pool.tokenY.decimals)} {pool.tokenY.symbol}
        </Text>
        {pendingFees ? <Text className="text-muted text-xs">Claimable fees: {pendingFees}</Text> : null}
        <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(explorerUrl)}>
          <Text className="text-blue-600 text-xs underline dark:text-blue-400">View on explorer</Text>
        </Pressable>
      </View>
    </Pressable>
  )
}
