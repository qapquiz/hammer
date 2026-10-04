import { getExplorerUrl } from '@wallet-ui/react-native-kit'
import { Alert } from 'heroui-native/alert'
import { ActivityIndicator, Linking, Pressable, Text, View } from 'react-native'

import { useAppCluster } from '@/features/cluster/data-access/cluster-provider'
import { formatError } from '@/features/wallet/util/format-error'

import type { MeteoraPositionActionPlan, MeteoraPositionFlow } from '../data-access/meteora-types'

const VERB: Record<MeteoraPositionActionPlan['kind'], { building: string; confirmed: string; failed: string }> = {
  deposit: {
    building: 'Preparing your deposit.',
    confirmed: 'Deposit confirmed',
    failed: 'The deposit failed',
  },
  withdraw: {
    building: 'Preparing your withdrawal.',
    confirmed: 'Withdrawal confirmed',
    failed: 'The withdrawal failed',
  },
  close: {
    building: 'Preparing to close the position.',
    confirmed: 'Position closed',
    failed: 'Closing the position failed',
  },
}

/**
 * Renders exclusively from the position-action flow state machine: success copy only for
 * `confirmed` (every signature polled to confirmation), a spinner plus signature links for
 * `confirming`, and per-step links when a failure carries partial progress.
 */
export function MeteoraUiPositionFlowStatus({ flow }: { flow: MeteoraPositionFlow }) {
  const { cluster } = useAppCluster()
  const network = { id: cluster.id, url: cluster.url }

  if (flow.status === 'building') {
    return (
      <Alert>
        <Alert.Title>Building transaction</Alert.Title>
        <Alert.Description>{VERB[flow.plan.kind].building}</Alert.Description>
      </Alert>
    )
  }
  if (flow.status === 'signing') {
    return (
      <Alert status="accent">
        <Alert.Title>Check your wallet</Alert.Title>
        <Alert.Description>Approve the request to continue.</Alert.Description>
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
    const { plan, signatures } = flow
    return (
      <Alert status="success">
        <Alert.Title>{VERB[plan.kind].confirmed}</Alert.Title>
        <Alert.Description>
          {signatures.map((signature, index) => (
            <ExplorerLink
              key={signature}
              label={`Transaction ${index + 1}`}
              url={getExplorerUrl({ network, path: `/tx/${signature}`, provider: 'solana' })}
            />
          ))}
          {plan.kind !== 'close' ? (
            <ExplorerLink
              label="View position on explorer"
              url={getExplorerUrl({ network, path: `/address/${plan.positionAddress}`, provider: 'solana' })}
            />
          ) : null}
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
        <Alert.Description>The wallet request was dismissed. Confirm again to retry.</Alert.Description>
      </Alert>
    )
  }
  if (flow.status === 'failed') {
    const progress = flow.progress
    return (
      <Alert status="danger">
        <Alert.Title>{flow.plan ? VERB[flow.plan.kind].failed : 'The request failed'}</Alert.Title>
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
