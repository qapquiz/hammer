import { isAddress } from '@solana/kit'
import { useLocalSearchParams } from 'expo-router'
import { Text } from 'react-native'

import { ShellUiPage } from '@/features/shell/ui/shell-ui-page'

import { MeteoraFeaturePoolDetail } from '@/features/meteora/meteora-feature-pool-detail'

export default function MeteoraPoolDetailRoute() {
  const { address } = useLocalSearchParams<{ address: string }>()
  if (!address || !isAddress(address)) {
    return (
      <ShellUiPage>
        <Text>Invalid pool address.</Text>
      </ShellUiPage>
    )
  }
  return <MeteoraFeaturePoolDetail poolAddress={address} />
}
