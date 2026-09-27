import { Stack } from 'expo-router/stack'

import { ClusterUiSelect } from '@/features/cluster/ui/cluster-ui-select'
import { useTheme } from '@/features/shell/data-access/use-theme'
import { ShellUiHeaderTitle } from '@/features/shell/ui/shell-ui-page-header'

export default function ToolsLayout() {
  const { foregroundColor, navigationHeaderOptions, tintColor } = useTheme()

  return (
    <Stack
      screenOptions={{
        gestureEnabled: true,
        ...navigationHeaderOptions,
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          headerTitle: () => (
            <ShellUiHeaderTitle
              foregroundColor={foregroundColor}
              icon="construct-outline"
              tintColor={tintColor}
              title="Tools"
            />
          ),
          title: 'Tools',
        }}
      />
      <Stack.Screen name="network" options={{ title: 'Network tools' }} />
      <Stack.Screen name="transaction" options={{ title: 'Transaction tools' }} />
      <Stack.Screen
        name="meteora/index"
        options={{
          headerRight: () => <ClusterUiSelect contentWidth={280} triggerClassName="min-w-36 rounded-xl px-3 py-2" />,
          headerTitle: () => (
            <ShellUiHeaderTitle
              foregroundColor={foregroundColor}
              icon="water-outline"
              tintColor={tintColor}
              title="Meteora DLMM"
            />
          ),
          title: 'Meteora DLMM',
        }}
      />
      <Stack.Screen
        name="meteora/[address]"
        options={{
          headerRight: () => <ClusterUiSelect contentWidth={280} triggerClassName="min-w-36 rounded-xl px-3 py-2" />,
          title: 'Pool',
        }}
      />
      <Stack.Screen
        name="wallet-actions"
        options={{
          headerTitle: () => (
            <ShellUiHeaderTitle
              foregroundColor={foregroundColor}
              icon="wallet-outline"
              tintColor={tintColor}
              title="Wallet actions"
            />
          ),
          title: 'Wallet actions',
        }}
      />
    </Stack>
  )
}
