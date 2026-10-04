import { BN } from '@coral-xyz/anchor'
import {
  address,
  appendTransactionMessageInstructions,
  assertIsTransactionWithinSizeLimit,
  compileTransaction,
  createKeyPairFromBytes,
  createTransactionMessage,
  partiallySignTransaction,
  pipe,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  type Address,
  type Blockhash,
  type Transaction as KitTransaction,
} from '@solana/kit'
import { getSetComputeUnitLimitInstruction, getSetComputeUnitPriceInstruction } from '@solana-program/compute-budget'
import { ComputeBudgetProgram, Connection, Keypair, PublicKey } from '@solana/web3.js'
import type { Transaction } from '@solana/web3.js'
import * as dlmmNamespace from '@meteora-ag/dlmm'
import type DLMM from '@meteora-ag/dlmm'
import type { StrategyType } from '@meteora-ag/dlmm'

import type { SolanaCluster } from '@wallet-ui/react-native-kit'

import {
  isDlmmClusterSupported,
  METEORA_COMPUTE_UNIT_LIMIT,
  METEORA_PRIORITY_FEE_MICROLAMPORTS,
  METEORA_STRATEGY_TYPE_CODE,
  type MeteoraActiveBin,
  type MeteoraBinRange,
  type MeteoraBuiltPosition,
  type MeteoraPosition,
  type MeteoraPositionActionPlan,
  type MeteoraPositionPlan,
  type MeteoraRentQuote,
} from '../data-access/meteora-types'
import { legacyToKitInstruction } from './legacy-to-kit'

type DlmmClass = typeof DLMM
type DlmmInstance = DLMM

export interface DlmmPool {
  getActiveBin(): Promise<MeteoraActiveBin>
  quoteRentSol(range: MeteoraBinRange): Promise<MeteoraRentQuote>
  buildCreatePosition(plan: MeteoraPositionPlan, user: Address, recentBlockhash: string): Promise<MeteoraBuiltPosition>
  /** Every position the user owns on this pool, with fresh amounts, fees, and the active bin. */
  getPositions(user: Address): Promise<MeteoraPosition[]>
  /** Builds the deposit/withdraw/close transactions for one plan. */
  buildPositionAction(
    plan: MeteoraPositionActionPlan,
    user: Address,
    recentBlockhash: string,
  ): Promise<{ transactions: readonly KitTransaction[] }>
}

/**
 * Pools are cached per cluster+address: the SDK's DLMM.create refetches and decodes the full
 * LbPair on every call, so re-running it per query would multiply RPC load. The promise is
 * cached (not the instance) so concurrent queries share one create, and a rejected create is
 * evicted so a transient failure does not poison the cache.
 */
const poolCache = new Map<string, Promise<DlmmPool>>()

export function createDlmmPool({
  cluster,
  poolAddress,
}: {
  cluster: SolanaCluster
  poolAddress: Address
}): Promise<DlmmPool> {
  const key = `${cluster.id}:${poolAddress}`
  const cached = poolCache.get(key)
  if (cached) {
    return cached
  }
  const created = doCreateDlmmPool({ cluster, poolAddress }).catch((error: unknown) => {
    poolCache.delete(key)
    throw error
  })
  poolCache.set(key, created)
  return created
}

/**
 * The SDK's CJS dist replaces module.exports with the DLMM class, so every named runtime export
 * is undefined under Metro. Resolve the class through the namespace here, once.
 */
function resolveDlmmClass(): DlmmClass {
  return (dlmmNamespace as { default?: DlmmClass }).default ?? (dlmmNamespace as unknown as DlmmClass)
}

async function doCreateDlmmPool({
  cluster,
  poolAddress,
}: {
  cluster: SolanaCluster
  poolAddress: Address
}): Promise<DlmmPool> {
  if (!isDlmmClusterSupported(cluster.id)) {
    throw new Error('Meteora DLMM is available on the Mainnet cluster only.')
  }
  const sdk = resolveDlmmClass()
  const connection = new Connection(cluster.url, { commitment: 'confirmed' })
  const dlmm: DlmmInstance = await sdk.create(connection, new PublicKey(poolAddress))

  return {
    async getActiveBin(): Promise<MeteoraActiveBin> {
      const bin = await dlmm.getActiveBin()
      return {
        poolAddress,
        binId: bin.binId,
        // pricePerToken is decimals-adjusted (token Y per token X); bin.price is per-lamport.
        price: Number(bin.pricePerToken),
        binStep: dlmm.lbPair.binStep,
        minBinId: dlmm.lbPair.parameters.minBinId,
        maxBinId: dlmm.lbPair.parameters.maxBinId,
      }
    },

    async quoteRentSol(range: MeteoraBinRange): Promise<MeteoraRentQuote> {
      const quote = await dlmm.quoteCreatePosition({
        strategy: {
          minBinId: range.minBinId,
          maxBinId: range.maxBinId,
          strategyType: METEORA_STRATEGY_TYPE_CODE.spot as StrategyType,
        },
      })
      const positionCostSol = quote.positionCost + quote.positionReallocCost
      const binArrayCostSol = quote.binArrayCost + quote.bitmapExtensionCost
      return {
        positionCostSol,
        binArrayCostSol,
        totalSol: positionCostSol + binArrayCostSol,
      }
    },

    /**
     * Compiles every SDK transaction to kit, prepending compute-budget instructions. The
     * blockhash arrives as a parameter (one fetch total, in the executor); legacy/v0 wire
     * format carries only the blockhash, so lastValidBlockHeight is client-side metadata
     * that the send rail and the status poller never consult.
     */
    async buildCreatePosition(
      plan: MeteoraPositionPlan,
      user: Address,
      recentBlockhash: string,
    ): Promise<MeteoraBuiltPosition> {
      const positionKeypair = Keypair.generate()
      const built = await dlmm.initializePositionAndAddLiquidityByStrategy({
        positionPubKey: positionKeypair.publicKey,
        totalXAmount: new BN(plan.amountXBaseUnits.toString()),
        totalYAmount: new BN(plan.amountYBaseUnits.toString()),
        strategy: {
          minBinId: plan.minBinId,
          maxBinId: plan.maxBinId,
          strategyType: METEORA_STRATEGY_TYPE_CODE[plan.strategyType] as StrategyType,
        },
        user: new PublicKey(user),
        slippage: plan.slippagePercent,
      })
      const legacyTransactions: Transaction[] = Array.isArray(built) ? built : [built]

      const positionKeyPair = await createKeyPairFromBytes(positionKeypair.secretKey)
      const transactions = []
      for (const legacyTransaction of legacyTransactions) {
        transactions.push(
          await compileToKitTransaction({
            feePayer: user,
            recentBlockhash,
            // The SDK auto-estimates and prepends its own compute-unit limit; stripping it keeps
            // our constants the single source and avoids the compute-budget duplicate-
            // instruction rejection, and our prepend adds the priority fee the SDK never sets.
            instructions: legacyTransaction.instructions
              .filter((instruction) => instruction.programId.toBase58() !== COMPUTE_BUDGET_PROGRAM_ADDRESS)
              .map(legacyToKitInstruction),
            // The position account must sign itself (initialize_position has no base account);
            // later transactions of a wide build only reference it writable, and kit refuses
            // to sign an address that is not a required signer.
            signers: requiresPositionSignature(legacyTransaction, positionKeypair.publicKey) ? [positionKeyPair] : [],
            onFailure: () =>
              new Error(
                `Transaction for preset '${plan.presetId}' (${plan.binCount} bins, ${plan.minBinId}..${plan.maxBinId}) exceeds the transaction size limit. Try a narrower range.`,
              ),
          }),
        )
      }

      return {
        positionAddress: address(positionKeypair.publicKey.toBase58()),
        transactions,
      }
    },

    async getPositions(user: Address): Promise<MeteoraPosition[]> {
      const { activeBin, userPositions } = await dlmm.getPositionsByUserAndLbPair(new PublicKey(user))
      return userPositions.map((position) => ({
        address: address(position.publicKey.toBase58()),
        poolAddress,
        lowerBinId: position.positionData.lowerBinId,
        upperBinId: position.positionData.upperBinId,
        // The SDK surfaces total amounts as decimal strings and BN for fees/rewards; BigInt everywhere.
        amountXBaseUnits: BigInt(position.positionData.totalXAmount),
        amountYBaseUnits: BigInt(position.positionData.totalYAmount),
        feeXBaseUnits: BigInt(position.positionData.feeX.toString()),
        feeYBaseUnits: BigInt(position.positionData.feeY.toString()),
        rewardOneBaseUnits: BigInt(position.positionData.rewardOne.toString()),
        rewardTwoBaseUnits: BigInt(position.positionData.rewardTwo.toString()),
        activeBinId: activeBin.binId,
      }))
    },

    async buildPositionAction(
      plan: MeteoraPositionActionPlan,
      user: Address,
      recentBlockhash: string,
    ): Promise<{ transactions: readonly KitTransaction[] }> {
      const legacyTransactions: Transaction[] = []
      if (plan.kind === 'deposit') {
        const built = await dlmm.addLiquidityByStrategyChunkable({
          positionPubKey: new PublicKey(plan.positionAddress),
          totalXAmount: new BN(plan.amountXBaseUnits.toString()),
          totalYAmount: new BN(plan.amountYBaseUnits.toString()),
          strategy: {
            minBinId: plan.minBinId,
            maxBinId: plan.maxBinId,
            strategyType: METEORA_STRATEGY_TYPE_CODE.spot as StrategyType,
          },
          user: new PublicKey(user),
          slippage: plan.slippagePercent,
        })
        legacyTransactions.push(...built)
      } else if (plan.kind === 'withdraw') {
        const built = await dlmm.removeLiquidity({
          user: new PublicKey(user),
          position: new PublicKey(plan.positionAddress),
          fromBinId: plan.minBinId,
          toBinId: plan.maxBinId,
          // The program takes basis points per bin, so 10_000 removes every bin fully.
          bps: new BN(plan.percentBps),
        })
        legacyTransactions.push(...built)
      } else {
        // Close on-chain requires an empty position; the plan is built from possibly stale
        // list data, so re-read the position and enforce emptiness and pending claims here.
        const position = await dlmm.getPosition(new PublicKey(plan.positionAddress))
        const data = position.positionData
        if (BigInt(data.totalXAmount) > 0n || BigInt(data.totalYAmount) > 0n) {
          throw new Error('This position still has liquidity. Withdraw 100% before closing.')
        }
        if (data.rewardOne.isZero() === false || data.rewardTwo.isZero() === false) {
          throw new Error(
            'This position has pending farm rewards. Claim them (e.g. in the Meteora web app) before closing, or the rewards are lost.',
          )
        }
        if (data.feeX.isZero() === false || data.feeY.isZero() === false) {
          const claimTxs = await dlmm.claimSwapFee({ owner: new PublicKey(user), position })
          legacyTransactions.push(...claimTxs)
        }
        legacyTransactions.push(await dlmm.closePosition({ owner: new PublicKey(user), position }))
      }

      // Existing positions are referenced writable, never signers, so no extra keypairs here.
      const transactions: KitTransaction[] = []
      for (const legacyTransaction of legacyTransactions) {
        transactions.push(
          await compileToKitTransaction({
            feePayer: user,
            recentBlockhash,
            instructions: legacyTransaction.instructions
              .filter((instruction) => instruction.programId.toBase58() !== COMPUTE_BUDGET_PROGRAM_ADDRESS)
              .map(legacyToKitInstruction),
            signers: [],
            onFailure: () =>
              new Error(
                `A ${plan.kind} transaction for position ${plan.positionAddress} exceeds the transaction size limit.`,
              ),
          }),
        )
      }
      return { transactions }
    },
  }
}

const COMPUTE_BUDGET_PROGRAM_ADDRESS = ComputeBudgetProgram.programId.toBase58()

function requiresPositionSignature(
  transaction: { instructions: { keys: { pubkey: PublicKey; isSigner: boolean }[] }[] },
  position: PublicKey,
): boolean {
  return transaction.instructions.some((instruction) =>
    instruction.keys.some((key) => key.pubkey.equals(position) && key.isSigner),
  )
}

async function compileToKitTransaction({
  feePayer,
  recentBlockhash,
  instructions,
  signers,
  onFailure,
}: {
  feePayer: Address
  recentBlockhash: string
  instructions: ReturnType<typeof legacyToKitInstruction>[]
  signers: Awaited<ReturnType<typeof createKeyPairFromBytes>>[]
  onFailure: () => Error
}): Promise<ReturnType<typeof compileTransaction>> {
  const message = pipe(
    createTransactionMessage({ version: 0 }),
    (transactionMessage) => setTransactionMessageFeePayer(feePayer, transactionMessage),
    (transactionMessage) =>
      setTransactionMessageLifetimeUsingBlockhash(
        { blockhash: recentBlockhash as Blockhash, lastValidBlockHeight: 0n },
        transactionMessage,
      ),
    (transactionMessage) =>
      appendTransactionMessageInstructions(
        [
          getSetComputeUnitLimitInstruction({ units: METEORA_COMPUTE_UNIT_LIMIT }),
          getSetComputeUnitPriceInstruction({ microLamports: METEORA_PRIORITY_FEE_MICROLAMPORTS }),
          ...instructions,
        ],
        transactionMessage,
      ),
  )
  const compiled = compileTransaction(message)
  try {
    assertIsTransactionWithinSizeLimit(compiled)
  } catch {
    throw onFailure()
  }
  if (signers.length === 0) {
    return compiled
  }
  return partiallySignTransaction(signers, compiled)
}
