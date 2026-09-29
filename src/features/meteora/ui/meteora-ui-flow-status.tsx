import { getExplorerUrl } from '@wallet-ui/react-native-kit'
import { Alert } from 'heroui-native/alert'
import { ActivityIndicator, Linking, Pressable, Text, View } from 'react-native'

import { useAppCluster } from '@/features/cluster/data-access/cluster-provider'

import type { MeteoraCreatePositionFlow } from '../data-access/meteora-types'
import { formatError } from '@/features/wallet/util/format-error'

/**
 * Renders exclusively from the flow state machine: success copy only for `confirmed`
 * (every signature polled to confirmation), a spinner plus signature links for
 * `confirming`, and per-step links when a failure carries partial progress.
 */
export function MeteoraUiFlowStatus({ flow }: { flow: MeteoraCreatePositionFlow }) {
  const { cluster } = useAppCluster()
  const network = { id: cluster.id, url: cluster.url }

  if (flow.status === 'building') {
    return (
      <Alert>
        <Alert.Title>Building transaction</Alert.Title>
        <Alert.Description>Fetching pool state and preparing your position.</Alert.Description>
      </Alert>
    )
  }
  if (flow.status === 'signing') {
    return (
      <Alert status="accent">
        <Alert.Title>Check your wallet</Alert.Title>
        <Alert.Description>Approve the position request to continue.</Alert.Description>
      </Alert>
    )
  }
  if (flow.status === 'confirming') {
    return (
      <Alert status="accent">
        <Alert.Title>Confirming transactions</Alert.Title>
        <Alert.Description>
          <View className="flex-row items-center gap-2">
            <ActivityIndicator size="small" />
            <Text className="text-muted">
              Waiting for {flow.signatures.length} transaction{flow.signatures.length === 1 ? '' : 's'} to confirm…
            </Text>
          </View>
          {flow.signatures.map((signature, index) => (
            <ExplorerLink
              key={signature}
              label={`Transaction ${index + 1}`}
              url={getExplorerUrl({ network, path: `/tx/${signature}`, provider: 'solana' })}
            />
          ))}
        </Alert.Description>
      </Alert>
    )
  }
  if (flow.status === 'confirmed') {
    const { plan, positionAddress, signatures } = flow
    return (
      <Alert status="success">
        <Alert.Title>Position created</Alert.Title>
        <Alert.Description>
          {signatures.map((signature, index) => (
            <ExplorerLink
              key={signature}
              label={`Transaction ${index + 1}`}
              url={getExplorerUrl({ network, path: `/tx/${signature}`, provider: 'solana' })}
            />
          ))}
          <ExplorerLink
            label="View position on explorer"
            url={getExplorerUrl({ network, path: `/address/${positionAddress}`, provider: 'solana' })}
          />
          <ExplorerLink
            label="View pool on explorer"
            url={getExplorerUrl({ network, path: `/address/${plan.poolAddress}`, provider: 'solana' })}
          />
        </Alert.Description>
      </Alert>
    )
  }
  if (flow.status === 'dismissed') {
    return (
      <Alert status="warning">
        <Alert.Title>Request canceled</Alert.Title>
        <Alert.Description>The wallet request was dismissed. Confirm the position again to retry.</Alert.Description>
      </Alert>
    )
  }
  if (flow.status === 'failed') {
    const progress = flow.progress
    return (
      <Alert status="danger">
        <Alert.Title>Creating the position failed</Alert.Title>
        <Alert.Description>
          {formatError(flow.error)}
          {progress
            ? progress.signatures.map((signature, index) => (
                <ExplorerLink
                  key={signature}
                  label={`Step ${index + 1} of ${progress.totalCount}${index < progress.confirmedCount ? ' (confirmed)' : ''}`}
                  url={getExplorerUrl({ network, path: `/tx/${signature}`, provider: 'solana' })}
                />
              ))
            : null}
        </Alert.Description>
      </Alert>
    )
  }
  return null
}

function ExplorerLink({ label, url }: { label: string; url: string }) {
  return (
    <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(url)}>
      <Text className="text-blue-600 underline dark:text-blue-400">{label}</Text>
    </Pressable>
  )
}
