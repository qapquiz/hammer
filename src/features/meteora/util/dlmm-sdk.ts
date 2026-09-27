import { BN } from '@coral-xyz/anchor'
import {
  AccountRole,
  address,
  appendTransactionMessageInstructions,
  compileTransaction,
  createKeyPairFromBytes,
  createTransactionMessage,
  partiallySignTransaction,
  pipe,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  type Address,
  type Blockhash,
  type Instruction,
} from '@solana/kit'
import { Connection, Keypair, PublicKey } from '@solana/web3.js'
import * as dlmmNamespace from '@meteora-ag/dlmm'
import type DLMM from '@meteora-ag/dlmm'
import type { StrategyType } from '@meteora-ag/dlmm'

import type { SolanaCluster } from '@wallet-ui/react-native-kit'

import {
  isDlmmClusterSupported,
  METEORA_STRATEGY_TYPE_CODE,
  type MeteoraActiveBin,
  type MeteoraBinRange,
  type MeteoraBuiltPosition,
  type MeteoraPositionPlan,
  type MeteoraRentQuote,
} from '../data-access/meteora-types'

type DlmmClass = typeof DLMM
type DlmmInstance = DLMM

export interface DlmmPool {
  getActiveBin(): Promise<MeteoraActiveBin>
  quoteRentSol(range: MeteoraBinRange): Promise<MeteoraRentQuote>
  buildCreatePosition(plan: MeteoraPositionPlan, user: Address): Promise<MeteoraBuiltPosition>
}

/**
 * The SDK's CJS dist replaces module.exports with the DLMM class, so every named runtime export
 * is undefined under Metro. Resolve the class through the namespace here, once.
 */
export async function createDlmmPool({
  cluster,
  poolAddress,
}: {
  cluster: SolanaCluster
  poolAddress: Address
}): Promise<DlmmPool> {
  if (!isDlmmClusterSupported(cluster.id)) {
    throw new Error('Meteora DLMM is available on the Mainnet cluster only.')
  }
  const sdk = (dlmmNamespace as { default?: DlmmClass }).default ?? (dlmmNamespace as unknown as DlmmClass)
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
     * The program's initialize_position requires the position account itself to sign (there is
     * no base account, and creating the position at the owner's address fails on-chain), so the
     * position keypair is generated here and its signature is baked into the compiled kit
     * transaction. Legacy signatures do not survive the legacy-to-kit conversion and the
     * wallet only ever signs its own fee payer, so partial signing is the only hand-off that
     * reaches MWA with all required signatures accounted for.
     */
    async buildCreatePosition(plan: MeteoraPositionPlan, user: Address): Promise<MeteoraBuiltPosition> {
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
      const transaction = Array.isArray(built) ? built[0] : built
      const kitInstructions = transaction.instructions.map(toKitInstruction)

      const latestBlockhash = await connection.getLatestBlockhash({ commitment: 'confirmed' })
      const message = pipe(
        createTransactionMessage({ version: 0 }),
        (transactionMessage) => setTransactionMessageFeePayer(address(user), transactionMessage),
        (transactionMessage) =>
          setTransactionMessageLifetimeUsingBlockhash(
            {
              blockhash: latestBlockhash.blockhash as Blockhash,
              lastValidBlockHeight: BigInt(latestBlockhash.lastValidBlockHeight),
            },
            transactionMessage,
          ),
        (transactionMessage) => appendTransactionMessageInstructions(kitInstructions, transactionMessage),
      )
      const compiled = compileTransaction(message)
      const positionKeyPair = await createKeyPairFromBytes(positionKeypair.secretKey)
      const partiallySigned = await partiallySignTransaction([positionKeyPair], compiled)

      return {
        positionAddress: address(positionKeypair.publicKey.toBase58()),
        transaction: partiallySigned,
      }
    },
  }
}

function roleForAccount(isSigner: boolean, isWritable: boolean): AccountRole {
  if (isSigner && isWritable) {
    return AccountRole.WRITABLE_SIGNER
  }
  if (isSigner) {
    return AccountRole.READONLY_SIGNER
  }
  return isWritable ? AccountRole.WRITABLE : AccountRole.READONLY
}

/** web3.js TransactionInstruction, referenced type-only; instances never leave this file. */
function toKitInstruction(instruction: {
  programId: { toBase58(): string }
  keys: { pubkey: { toBase58(): string }; isSigner: boolean; isWritable: boolean }[]
  data: Uint8Array
}): Instruction {
  return {
    programAddress: address(instruction.programId.toBase58()),
    accounts: instruction.keys.map((key) => ({
      address: address(key.pubkey.toBase58()),
      role: roleForAccount(key.isSigner, key.isWritable),
    })),
    // Copy: the legacy Buffer must become a plain Uint8Array for the kit encoders.
    data: new Uint8Array(instruction.data),
  }
}
