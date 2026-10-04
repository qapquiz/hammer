import { useMobileWallet } from '@wallet-ui/react-native-kit'
import type { Account } from '@wallet-ui/react-native-kit'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useCallback, useReducer } from 'react'

import { useAppCluster } from '@/features/cluster/data-access/cluster-provider'
import type { SolanaClient } from '@/features/cluster/data-access/create-solana-client'
import { isWalletConnectionCanceled } from '@/features/wallet/util/is-wallet-connection-canceled'

import {
  meteoraPositionHasLiquidity,
  meteoraPositionHasPendingRewards,
  meteoraQueryKeys,
  type MeteoraDepositDraft,
  type MeteoraPool,
  type MeteoraPosition,
  type MeteoraPositionActionPlan,
  type MeteoraPositionFlow,
} from './meteora-types'
import { positionActionFlowReducer } from '../util/position-action-flow'
import { executeMeteoraPositionAction } from '../util/execute-meteora-position-action'
import {
  planClose,
  planDeposit,
  planWithdraw,
  validateDepositDraft,
  validateWithdrawPercent,
} from '../util/meteora-position'

export interface UseMeteoraPositionActionsProps {
  account: Account
  client: SolanaClient
  pool: MeteoraPool
}

export function useMeteoraPositionActions({ account, client, pool }: UseMeteoraPositionActionsProps) {
  const { cluster } = useAppCluster()
  const wallet = useMobileWallet()
  const queryClient = useQueryClient()
  const [flow, dispatch] = useReducer(positionActionFlowReducer, { status: 'idle' } satisfies MeteoraPositionFlow)

  const send = useMutation({
    mutationFn: (plan: MeteoraPositionActionPlan) =>
      executeMeteoraPositionAction({
        account,
        client,
        cluster,
        onStage: (stage) => {
          if (stage.stage === 'confirming') {
            dispatch({ type: 'confirming', signatures: stage.signatures })
          } else if (stage.stage === 'signing') {
            dispatch({ type: 'signing' })
          } else {
            dispatch({ type: 'building', plan })
          }
        },
        plan,
        signAndSendTransaction: wallet.signAndSendTransaction,
      }),
    onSuccess: ({ confirmationSlot }, plan) => {
      // Success only after every signature polled to confirmation; the reducer no-ops this
      // if a reset raced the polling.
      dispatch({ type: 'confirmed', confirmationSlot })
      void queryClient.invalidateQueries({
        queryKey: meteoraQueryKeys.positions(cluster, plan.poolAddress, account.address),
      })
      void queryClient.invalidateQueries({ queryKey: meteoraQueryKeys.activeBin(cluster, plan.poolAddress) })
      void queryClient.invalidateQueries({ queryKey: meteoraQueryKeys.pool(plan.poolAddress) })
      void queryClient.invalidateQueries({ queryKey: ['get-balance'] })
    },
    onError: (error) => {
      if (isWalletConnectionCanceled(error)) {
        dispatch({ type: 'dismissed' })
      } else {
        dispatch({ type: 'failed', error })
      }
    },
  })

  const start = useCallback(
    (plan: MeteoraPositionActionPlan) => {
      dispatch({ type: 'building', plan })
      send.mutate(plan)
    },
    [send],
  )

  const deposit = useCallback(
    (draft: MeteoraDepositDraft, position: MeteoraPosition) => {
      const issue = validateDepositDraft({
        activeBinId: position.activeBinId,
        draft,
        position,
        tokenX: pool.tokenX,
        tokenY: pool.tokenY,
      })
      if (issue) {
        dispatch({ type: 'failed', error: new Error(issue) })
        return
      }
      const plan = planDeposit({
        activeBinId: position.activeBinId,
        draft,
        position,
        tokenX: pool.tokenX,
        tokenY: pool.tokenY,
      })
      start(plan)
    },
    [pool.tokenX, pool.tokenY, start],
  )

  const withdraw = useCallback(
    (percent: number, position: MeteoraPosition) => {
      const issue = validateWithdrawPercent(percent)
      if (issue) {
        dispatch({ type: 'failed', error: new Error(issue) })
        return
      }
      start(planWithdraw({ percent, position }))
    },
    [start],
  )

  const close = useCallback(
    (position: MeteoraPosition) => {
      if (meteoraPositionHasLiquidity(position)) {
        dispatch({ type: 'failed', error: new Error('Withdraw the remaining liquidity before closing this position.') })
        return
      }
      if (meteoraPositionHasPendingRewards(position)) {
        dispatch({
          type: 'failed',
          error: new Error('Claim the pending farm rewards before closing, or they are lost.'),
        })
        return
      }
      start(planClose({ position }))
    },
    [start],
  )

  const reset = useCallback(() => {
    dispatch({ type: 'reset' })
  }, [])

  return { close, deposit, flow, reset, withdraw }
}
