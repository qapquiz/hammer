import { useMobileWallet } from '@wallet-ui/react-native-kit'
import type { Account } from '@wallet-ui/react-native-kit'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useCallback, useReducer } from 'react'

import { useAppCluster } from '@/features/cluster/data-access/cluster-provider'
import type { SolanaClient } from '@/features/cluster/data-access/create-solana-client'
import { isWalletConnectionCanceled } from '@/features/wallet/util/is-wallet-connection-canceled'

import {
  meteoraQueryKeys,
  type MeteoraCreatePositionFlow,
  type MeteoraPositionDraft,
  type MeteoraPositionPlan,
  type MeteoraPool,
} from './meteora-types'
import { meteoraActiveBinQueryOptions } from './use-meteora-active-bin'
import { createPositionFlowReducer } from '../util/create-position-flow'
import { executeMeteoraCreatePosition } from '../util/execute-meteora-create-position'
import { planPosition, validatePositionDraft } from '../util/meteora-position'

export interface UseMeteoraCreatePositionProps {
  account: Account
  client: SolanaClient
  pool: MeteoraPool
}

export function useMeteoraCreatePosition({ account, client, pool }: UseMeteoraCreatePositionProps) {
  const { cluster } = useAppCluster()
  const wallet = useMobileWallet()
  const queryClient = useQueryClient()
  const [flow, dispatch] = useReducer(createPositionFlowReducer, { status: 'idle' } satisfies MeteoraCreatePositionFlow)

  const send = useMutation({
    mutationFn: (plan: MeteoraPositionPlan) =>
      executeMeteoraCreatePosition({
        account,
        client,
        cluster,
        onStage: (stage) => {
          if (stage.stage === 'confirming') {
            dispatch({
              type: 'confirming',
              signatures: stage.signatures,
              positionAddress: stage.positionAddress,
            })
          } else {
            dispatch({ type: stage.stage })
          }
        },
        plan,
        signAndSendTransaction: wallet.signAndSendTransaction,
      }),
    onSuccess: ({ confirmationSlot }, plan) => {
      // Success only after every signature polled to confirmation; the reducer no-ops this
      // if a reset raced the polling.
      dispatch({ type: 'confirmed', confirmationSlot })
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

  const preview = useCallback(
    async (draft: MeteoraPositionDraft) => {
      const issue = validatePositionDraft(draft, pool.tokenX.decimals, pool.tokenY.decimals)
      if (issue) {
        dispatch({ type: 'previewFailed', error: new Error(issue) })
        return
      }
      dispatch({ type: 'preview', draft })
      try {
        const activeBin = await queryClient.fetchQuery(meteoraActiveBinQueryOptions(cluster, draft.poolAddress))
        dispatch({
          type: 'previewed',
          plan: planPosition({ activeBin, draft, tokenX: pool.tokenX, tokenY: pool.tokenY }),
        })
      } catch (error) {
        dispatch({ type: 'previewFailed', error })
      }
    },
    [cluster, pool.tokenX, pool.tokenY, queryClient],
  )

  const confirm = useCallback(() => {
    if (flow.status !== 'previewed' && flow.status !== 'failed' && flow.status !== 'dismissed') {
      return
    }
    if (!flow.plan) {
      return
    }
    send.mutate(flow.plan)
  }, [flow, send])

  const reset = useCallback(() => {
    dispatch({ type: 'reset' })
  }, [])

  return { confirm, flow, preview, reset }
}
