import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { AppIdentity } from '@wallet-ui/react-native-kit'
import { MobileWalletProvider } from '@wallet-ui/react-native-kit'
import { HeroUINativeProvider } from 'heroui-native/provider'
import { View } from 'react-native'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { PropsWithChildren, ReactNode } from 'react'

import { ClusterProvider, useAppCluster } from '@/features/cluster/data-access/cluster-provider'
import { createClusterProps } from '@/features/cluster/data-access/create-cluster-props'
import { ShellUiThemeStatusBar } from '@/features/shell/ui/shell-ui-theme-status-bar'

const identity: AppIdentity = { name: 'Hammer', uri: 'hammer://hammer' }
const queryClient = new QueryClient()
const clusterConfig = createClusterProps()

/** Standard bottom tab bar content height (RN default) — toasts must clear it. */
const TAB_BAR_CONTENT_HEIGHT = 49
/** Clearance between a bottom toast card and the tab bar. */
const TOAST_TAB_BAR_CLEARANCE = 8

export function AppProviders({ children }: { children: ReactNode }) {
  const safeAreaInsets = useSafeAreaInsets()

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <HeroUINativeProvider
        config={{
          devInfo: { stylingPrinciples: false },
          // A bottom toast card is a full-width touchable strip; at heroui's default
          // inset it lands on the tab bar and blocks tab switching for as long as it
          // shows. Park toasts above the tab bar instead (insets are absolute screen
          // distances in InsetsContainer, so add the safe area ourselves).
          toast: {
            insets: {
              bottom: safeAreaInsets.bottom + TAB_BAR_CONTENT_HEIGHT + TOAST_TAB_BAR_CLEARANCE,
            },
          },
        }}
      >
        <QueryClientProvider client={queryClient}>
          <ClusterProvider store={clusterConfig.store}>
            <AppWalletProviders>{children}</AppWalletProviders>
          </ClusterProvider>
        </QueryClientProvider>
      </HeroUINativeProvider>
    </GestureHandlerRootView>
  )
}

function AppWalletProviders({ children }: PropsWithChildren) {
  const { cluster } = useAppCluster()

  return (
    <MobileWalletProvider cluster={cluster} identity={identity}>
      <View className="flex-1 bg-white dark:bg-black">
        {children}
        <ShellUiThemeStatusBar />
      </View>
    </MobileWalletProvider>
  )
}
