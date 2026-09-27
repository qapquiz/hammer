import { Alert } from 'heroui-native/alert'
import { Text, Linking, Pressable } from 'react-native'

import type { MeteoraCreatePositionFlow } from '../data-access/meteora-types'
import { formatError } from '@/features/wallet/util/format-error'

export function MeteoraUiFlowStatus({
  flow,
  explorerPoolUrl,
  explorerTxUrl,
}: {
  flow: MeteoraCreatePositionFlow
  explorerPoolUrl?: string
  explorerTxUrl?: string
}) {
  if (flow.status === 'signing') {
    return (
      <Alert>
        <Alert.Title>Check your wallet</Alert.Title>
        <Alert.Description>Approve the position request to continue.</Alert.Description>
      </Alert>
    )
  }
  if (flow.status === 'building') {
    return (
      <Alert>
        <Alert.Title>Building transaction</Alert.Title>
        <Alert.Description>Fetching pool state and preparing your position.</Alert.Description>
      </Alert>
    )
  }
  if (flow.status === 'sent') {
    return (
      <Alert>
        <Alert.Title>Position created</Alert.Title>
        <Alert.Description>
          {explorerTxUrl ? <ExplorerLink label="View transaction" url={explorerTxUrl} /> : null}
          {explorerPoolUrl ? <ExplorerLink label="View wallet on explorer" url={explorerPoolUrl} /> : null}
        </Alert.Description>
      </Alert>
    )
  }
  if (flow.status === 'dismissed') {
    return (
      <Alert>
        <Alert.Title>Request canceled</Alert.Title>
        <Alert.Description>The wallet request was dismissed. Confirm the position again to retry.</Alert.Description>
      </Alert>
    )
  }
  if (flow.status === 'failed') {
    return (
      <Alert status="danger">
        <Alert.Title>Creating the position failed</Alert.Title>
        <Alert.Description>{formatError(flow.error)}</Alert.Description>
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
