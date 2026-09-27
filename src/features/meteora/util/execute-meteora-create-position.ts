import {
  getBase58Decoder,
  getBase64Decoder,
  getBase64Encoder,
  type Lamports,
  type TransactionMessageBytesBase64,
} from '@solana/kit'
import type { Account, SolanaCluster, useMobileWallet } from '@wallet-ui/react-native-kit'

import type { SolanaClient } from '@/features/cluster/data-access/create-solana-client'
import { assertCanPayTransactionFee } from '@/features/wallet/util/assert-can-pay-transaction-fee'

import { isDlmmClusterSupported, type MeteoraPositionPlan, type MeteoraRentQuote } from '../data-access/meteora-types'
import { createDlmmPool } from './dlmm-sdk'

export type MeteoraCreatePositionStage = 'building' | 'signing'

export async function executeMeteoraCreatePosition({
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
  onStage: (stage: MeteoraCreatePositionStage) => void
  plan: MeteoraPositionPlan
  signAndSendTransaction: ReturnType<typeof useMobileWallet>['signAndSendTransaction']
}): Promise<{ signature: string; positionAddress: MeteoraPositionPlan['poolAddress'] }> {
  if (!isDlmmClusterSupported(cluster.id)) {
    throw new Error('Meteora DLMM positions can only be created on the Mainnet cluster.')
  }

  onStage('building')
  const dlmm = await createDlmmPool({ cluster, poolAddress: plan.poolAddress })
  const built = await dlmm.buildCreatePosition(plan, account.address)
  const rent = await dlmm.quoteRentSol({ minBinId: plan.minBinId, maxBinId: plan.maxBinId })

  const [
    {
      context: { slot: minContextSlot },
    },
    { value: balance },
    { value: fee },
  ] = await Promise.all([
    client.rpc.getLatestBlockhash({ commitment: 'confirmed' }).send(),
    client.rpc.getBalance(account.address, { commitment: 'confirmed' }).send(),
    client.rpc
      .getFeeForMessage(getBase64Decoder().decode(built.transaction.messageBytes) as TransactionMessageBytesBase64, {
        commitment: 'confirmed',
      })
      .send(),
  ])

  assertCanPayTransactionFee({ balance, fee: foldInRent(fee, rent) })

  onStage('signing')
  const rawSignature: unknown = await signAndSendTransaction(built.transaction, minContextSlot)
  // MWA resolves to a base64 signature string even though wallet-ui brands the value as bytes;
  // normalize either shape to the standard base58 signature.
  const signatureBytes =
    typeof rawSignature === 'string' ? getBase64Encoder().encode(rawSignature) : (rawSignature as Uint8Array)
  const signature = getBase58Decoder().decode(signatureBytes)
  if (!signature) {
    throw new Error('Transaction submitted but no signature was returned by the wallet adapter.')
  }

  return { signature, positionAddress: built.positionAddress }
}

function foldInRent(fee: Lamports | null, rent: MeteoraRentQuote): Lamports | null {
  const rentLamports = BigInt(Math.round(rent.totalSol * 1_000_000_000))
  return fee === null ? null : ((fee + rentLamports) as Lamports)
}
