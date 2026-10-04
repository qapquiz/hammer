import { getBase64Decoder, type Address, type TransactionMessageBytesBase64 } from '@solana/kit'
import type { Account, SolanaCluster, useMobileWallet } from '@wallet-ui/react-native-kit'

import type { SolanaClient } from '@/features/cluster/data-access/create-solana-client'
import { assertCanPayTransactionFee } from '@/features/wallet/util/assert-can-pay-transaction-fee'

import { isDlmmClusterSupported, type MeteoraPositionActionPlan } from '../data-access/meteora-types'
import { createDlmmPool } from './dlmm-sdk'
import {
  assertTokenBalances,
  awaitConfirmations,
  feeForAllTransactions,
  normalizeSignature,
} from './execute-meteora-shared'

export type MeteoraPositionActionStage =
  { stage: 'building' } | { stage: 'signing' } | { stage: 'confirming'; signatures: readonly string[] }

export interface MeteoraPositionActionResult {
  signatures: readonly string[]
  confirmationSlot: bigint | null
}

/**
 * One send rail for deposit, withdraw, and close: build per plan kind, check fee
 * affordability (plus token balances for a deposit), then send and poll to confirmation.
 */
export async function executeMeteoraPositionAction({
  account,
  client,
  cluster,
  onStage,
  plan,
  signAndSendTransaction,
}: {
  account: Account
  client: SolanaClient
  cluster: SolanaCluster
  onStage: (stage: MeteoraPositionActionStage) => void
  plan: MeteoraPositionActionPlan
  signAndSendTransaction: ReturnType<typeof useMobileWallet>['signAndSendTransaction']
}): Promise<MeteoraPositionActionResult> {
  if (!isDlmmClusterSupported(cluster.id)) {
    throw new Error('Meteora DLMM positions can only be managed on the Mainnet cluster.')
  }

  onStage({ stage: 'building' })
  const dlmm = await createDlmmPool({ cluster, poolAddress: plan.poolAddress })

  // One blockhash fetch serves both the builder (blockhash string) and the send rail (slot).
  const {
    context: { slot: minContextSlot },
    value: latestBlockhash,
  } = await client.rpc.getLatestBlockhash({ commitment: 'confirmed' }).send()

  const built = await dlmm.buildPositionAction(plan, account.address, latestBlockhash.blockhash)

  const [{ value: balance }, { value: fee }] = await Promise.all([
    client.rpc.getBalance(account.address, { commitment: 'confirmed' }).send(),
    client.rpc
      .getFeeForMessage(
        getBase64Decoder().decode(built.transactions[0].messageBytes) as TransactionMessageBytesBase64,
        { commitment: 'confirmed' },
      )
      .send(),
  ])
  const totalFee = feeForAllTransactions(fee, built.transactions.length)
  assertCanPayTransactionFee({ balance, fee: totalFee })

  if (plan.kind === 'deposit') {
    const committedSol = totalFee === null ? 0n : totalFee
    const required: { amount: bigint; mint: Address; label: string }[] = []
    if (plan.amountXBaseUnits > 0n) {
      required.push({
        amount: plan.amountXBaseUnits,
        mint: plan.tokenX.address,
        label: plan.tokenX.symbol || 'token X',
      })
    }
    if (plan.amountYBaseUnits > 0n) {
      required.push({
        amount: plan.amountYBaseUnits,
        mint: plan.tokenY.address,
        label: plan.tokenY.symbol || 'token Y',
      })
    }
    await assertTokenBalances({ account, client, entries: required, solLamports: balance - committedSol })
  }

  onStage({ stage: 'signing' })
  const signatures: string[] = []
  for (const transaction of built.transactions) {
    const rawSignature: unknown = await signAndSendTransaction(transaction, minContextSlot)
    signatures.push(normalizeSignature(rawSignature))
  }

  onStage({ stage: 'confirming', signatures })
  const confirmationSlot = await awaitConfirmations({ client, signatures })
  return { signatures, confirmationSlot }
}
