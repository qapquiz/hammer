import { Button, type ButtonRootProps } from 'heroui-native/button'
import { useToast } from 'heroui-native/toast'
import type { PropsWithChildren } from 'react'

import { formatError } from '@/features/wallet/util/format-error'
import { isWalletConnectionCanceled } from '@/features/wallet/util/is-wallet-connection-canceled'

const WALLET_CONNECT_TOAST_ID = 'wallet-connect-error'


export function WalletUiConnectButton({
  children = 'Connect Wallet',
  connect,
  size,
}: PropsWithChildren<{ connect: () => Promise<unknown>; size?: ButtonRootProps['size'] }>) {
  const { toast } = useToast()

  async function handleConnect() {
    try {
      toast.hide(WALLET_CONNECT_TOAST_ID)
      await connect()
    } catch (error) {
      const isCanceled = isWalletConnectionCanceled(error)

      toast.show({
        actionLabel: 'Try again',
        description: isCanceled
          ? 'The wallet connection request was dismissed before authorization completed.'
          : formatError(error),
        duration: 'persistent',
        id: WALLET_CONNECT_TOAST_ID,
        label: isCanceled ? 'Wallet connection canceled' : 'Could not connect wallet',
        onActionPress: ({ hide }) => {
          hide(WALLET_CONNECT_TOAST_ID)
          void handleConnect()
        },
        placement: 'bottom',
        variant: isCanceled ? 'warning' : 'danger',
      })
    }
  }

  return (
    <Button size={size} onPress={() => void handleConnect()}>
      {children}
    </Button>
  )
}
