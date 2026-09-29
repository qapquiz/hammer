import {
  address,
  getBase58Decoder,
  getBase64Decoder,
  getBase64Encoder,
  type Address,
  type Lamports,
  type ReadonlyUint8Array,
  type Signature,
  type TransactionMessageBytesBase64,
} from '@solana/kit'
import type { Account, SolanaCluster, useMobileWallet } from '@wallet-ui/react-native-kit'
import { PublicKey } from '@solana/web3.js'

import type { SolanaClient } from '@/features/cluster/data-access/create-solana-client'
import { assertCanPayTransactionFee } from '@/features/wallet/util/assert-can-pay-transaction-fee'

import {
  isDlmmClusterSupported,
  METEORA_CONFIRMATION_TIMEOUT_MS,
  type MeteoraPartialProgress,
  type MeteoraPositionPlan,
  type MeteoraRentQuote,
} from '../data-access/meteora-types'
import { createDlmmPool } from './dlmm-sdk'

export type MeteoraCreatePositionStage =
  | { stage: 'building' }
  | { stage: 'signing' }
  | { stage: 'confirming'; signatures: readonly string[]; positionAddress: Address }

export interface MeteoraCreatePositionResult {
  signatures: readonly string[]
  positionAddress: Address
  confirmationSlot: bigint | null
}

export class MeteoraConfirmationTimeoutError extends Error implements MeteoraPartialProgress {
  readonly signatures: readonly string[]
  readonly confirmedCount: number
  readonly totalCount: number

  constructor(progress: MeteoraPartialProgress) {
    super(
      `Meteora transactions were not confirmed within ${METEORA_CONFIRMATION_TIMEOUT_MS / 1000}s (${progress.confirmedCount} of ${progress.totalCount} confirmed).`,
    )
    this.name = 'MeteoraConfirmationTimeoutError'
    this.signatures = progress.signatures
    this.confirmedCount = progress.confirmedCount
    this.totalCount = progress.totalCount
  }
}

/** A sent transaction was rejected on-chain; carries the same per-step progress shape. */
export class MeteoraTransactionFailedError extends Error implements MeteoraPartialProgress {
  readonly signatures: readonly string[]
  readonly confirmedCount: number
  readonly totalCount: number

  constructor(progress: MeteoraPartialProgress, failedSignature: string, error: unknown) {
    super(`Meteora transaction ${failedSignature} failed on-chain: ${String(error)}`)
    this.name = 'MeteoraTransactionFailedError'
    this.signatures = progress.signatures
    this.confirmedCount = progress.confirmedCount
    this.totalCount = progress.totalCount
  }
}

const CONFIRM_POLL_INTERVAL_MS = 500

const WRAPPED_SOL_MINT = 'So11111111111111111111111111111111111111112'
const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA')
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL')

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
}): Promise<MeteoraCreatePositionResult> {
  if (!isDlmmClusterSupported(cluster.id)) {
    throw new Error('Meteora DLMM positions can only be created on the Mainnet cluster.')
  }

  onStage({ stage: 'building' })
  const dlmm = await createDlmmPool({ cluster, poolAddress: plan.poolAddress })

  // One blockhash fetch serves both the builder (blockhash string) and the send rail (slot).
  const {
    context: { slot: minContextSlot },
    value: latestBlockhash,
  } = await client.rpc.getLatestBlockhash({ commitment: 'confirmed' }).send()

  const built = await dlmm.buildCreatePosition(plan, account.address, latestBlockhash.blockhash)
  const rent = await dlmm.quoteRentSol({ minBinId: plan.minBinId, maxBinId: plan.maxBinId })

  const [{ value: balance }, { value: fee }] = await Promise.all([
    client.rpc.getBalance(account.address, { commitment: 'confirmed' }).send(),
    client.rpc
      .getFeeForMessage(
        getBase64Decoder().decode(built.transactions[0].messageBytes) as TransactionMessageBytesBase64,
        { commitment: 'confirmed' },
      )
      .send(),
  ])

  // Same compute-budget ix and signature shape per transaction, so first-fee × count tracks total.
  const totalFee = feeForAllTransactions(fee, built.transactions.length)
  const feeWithRent = foldInRent(totalFee, rent)
  assertCanPayTransactionFee({ balance, fee: feeWithRent })
  const committedSol = feeWithRent === null ? 0n : feeWithRent

  await assertPlanTokenBalances({ account, client, plan, solLamports: balance - committedSol })

  onStage({ stage: 'signing' })
  const signatures: string[] = []
  for (const transaction of built.transactions) {
    const rawSignature: unknown = await signAndSendTransaction(transaction, minContextSlot)
    signatures.push(normalizeSignature(rawSignature))
  }

  onStage({ stage: 'confirming', signatures, positionAddress: built.positionAddress })

  const confirmationSlot = await awaitConfirmations({ client, signatures })
  return { signatures, positionAddress: built.positionAddress, confirmationSlot }
}

/**
 * MWA resolves to a base64 signature string even though wallet-ui brands the value as bytes;
 * normalize either shape to the standard base58 signature.
 */
function normalizeSignature(raw: unknown): string {
  const signatureBytes = typeof raw === 'string' ? getBase64Encoder().encode(raw) : (raw as Uint8Array)
  const signature = getBase58Decoder().decode(signatureBytes)
  if (!signature) {
    throw new Error('Transaction submitted but no signature was returned by the wallet adapter.')
  }
  return signature
}

async function awaitConfirmations({
  client,
  signatures,
}: {
  client: SolanaClient
  signatures: readonly string[]
}): Promise<bigint | null> {
  const signatureIds = signatures as unknown as Signature[]
  let confirmedCount = 0
  const deadline = Date.now() + METEORA_CONFIRMATION_TIMEOUT_MS
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, CONFIRM_POLL_INTERVAL_MS))
    const response = await client.rpc.getSignatureStatuses(signatureIds, { searchTransactionHistory: false }).send()
    confirmedCount = 0
    for (let index = 0; index < response.value.length; index++) {
      const status = response.value[index]
      if (status === null) {
        continue
      }
      if (status.err !== null) {
        throw new MeteoraTransactionFailedError(
          { signatures, confirmedCount, totalCount: signatures.length },
          signatures[index],
          typeof status.err === 'string' ? status.err : JSON.stringify(status.err),
        )
      }
      if (status.confirmationStatus === 'confirmed' || status.confirmationStatus === 'finalized') {
        confirmedCount++
      }
    }
    if (confirmedCount === signatures.length) {
      return response.context.slot
    }
  }
  throw new MeteoraConfirmationTimeoutError({ signatures, confirmedCount, totalCount: signatures.length })
}

function feeForAllTransactions(fee: Lamports | null, transactionCount: number): Lamports | null {
  return fee === null ? null : ((fee * BigInt(transactionCount)) as Lamports)
}

function foldInRent(fee: Lamports | null, rent: MeteoraRentQuote): Lamports | null {
  const rentLamports = BigInt(Math.round(rent.totalSol * 1_000_000_000))
  return fee === null ? null : ((fee + rentLamports) as Lamports)
}

/**
 * The @solana/spl-token ATA helper is not in the pinned web3.js, but the address is a plain
 * PDA over [owner, mint, tokenProgram]; this mirrors getAssociatedTokenAddressSync exactly.
 */
function deriveAssociatedTokenAddress({ mint, owner }: { mint: Address; owner: Address }): Address {
  const [ata] = PublicKey.findProgramAddressSync(
    [new PublicKey(owner).toBytes(), new PublicKey(mint).toBytes(), TOKEN_PROGRAM_ID.toBytes()],
    ASSOCIATED_TOKEN_PROGRAM_ID,
  )
  return address(ata.toBase58())
}

/**
 * SPL token account layout: mint(32) owner(32) amount(u64 LE at offset 64). The account's
 * lamports field is rent, not balance, so affordability must read the data field.
 */
export function splTokenAmountFromAccountData(data: ReadonlyUint8Array): bigint {
  if (data.length < 72) {
    return 0n
  }
  return new DataView(data.buffer, data.byteOffset, data.byteLength).getBigUint64(64, true)
}

/**
 * Affordability beyond SOL: every nonzero plan amount needs a token balance behind it.
 * wSOL is funded from SOL, so it is compared against what is left after fees and rent.
 */
async function assertPlanTokenBalances({
  account,
  client,
  plan,
  solLamports,
}: {
  account: Account
  client: SolanaClient
  plan: MeteoraPositionPlan
  solLamports: bigint
}): Promise<void> {
  const required: { amount: bigint; mint: Address; label: string }[] = []
  if (plan.amountXBaseUnits > 0n) {
    required.push({ amount: plan.amountXBaseUnits, mint: plan.tokenX.address, label: plan.tokenX.symbol || 'token X' })
  }
  if (plan.amountYBaseUnits > 0n) {
    required.push({ amount: plan.amountYBaseUnits, mint: plan.tokenY.address, label: plan.tokenY.symbol || 'token Y' })
  }
  if (required.length === 0) {
    return
  }

  const wrappedSolMint = address(WRAPPED_SOL_MINT)
  const solBacked = required.filter((entry) => entry.mint === wrappedSolMint)
  const tokenBacked = required.filter((entry) => entry.mint !== wrappedSolMint)

  const ataAddresses = tokenBacked.map(({ mint }) => deriveAssociatedTokenAddress({ mint, owner: account.address }))
  const accounts = ataAddresses.length
    ? (await client.rpc.getMultipleAccounts(ataAddresses, { commitment: 'confirmed', encoding: 'base64' }).send()).value
    : []

  for (const [index, entry] of tokenBacked.entries()) {
    const account = accounts[index]
    const available = account ? splTokenAmountFromAccountData(getBase64Encoder().encode(account.data[0])) : 0n
    assertSufficientBalance({ label: entry.label, required: entry.amount, available })
  }
  for (const entry of solBacked) {
    assertSufficientBalance({ label: entry.label, required: entry.amount, available: solLamports })
  }
}

function assertSufficientBalance({
  available,
  label,
  required,
}: {
  available: bigint
  label: string
  required: bigint
}): void {
  if (available >= required) {
    return
  }
  throw new Error(
    `Insufficient ${label} balance: short by ${required - available} base units (have ${available}, need ${required}).`,
  )
}
