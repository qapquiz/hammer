// Throwaway prototype gate. Not production code.
// Decision this exists to make: does @meteora-ag/dlmm (web3.js v1 + Anchor)
// bundle and run inside this Expo/Hermes kit-stack app, and do its instructions
// convert cleanly to @solana/kit Instructions for the MWA send path.
import { Buffer } from 'buffer'
import { Connection, Keypair, PublicKey, TransactionInstruction } from '@solana/web3.js'
import { BN } from '@coral-xyz/anchor'
import * as dlmmModule from '@meteora-ag/dlmm'
import type DLMMClass from '@meteora-ag/dlmm'
import { AccountRole, address } from '@solana/kit'
import type { Instruction } from '@solana/kit'

// The SDK's CJS dist replaces module.exports with the DLMM class, so the named
// import does not exist at runtime under Metro. Resolve through the namespace.
const DLMM = ((dlmmModule as Record<string, unknown>).DLMM ??
  (dlmmModule as Record<string, unknown>).default ??
  dlmmModule) as typeof DLMMClass

global.Buffer = global.Buffer ?? Buffer

const RPC = 'https://solana-rpc.publicnode.com'

type Step = { step: string; ok: boolean; detail?: string; error?: string }

function legacyToKitIx(ix: TransactionInstruction): Instruction {
  const role = (k: { isSigner: boolean; isWritable: boolean }) =>
    k.isSigner && k.isWritable
      ? AccountRole.WRITABLE_SIGNER
      : k.isSigner
        ? AccountRole.READONLY_SIGNER
        : k.isWritable
          ? AccountRole.WRITABLE
          : AccountRole.READONLY
  return {
    programAddress: address(ix.programId.toBase58()),
    accountAddresses: ix.keys.map((k) => address(k.pubkey.toBase58())),
    accounts: ix.keys.map((k) => ({ address: address(k.pubkey.toBase58()), role: role(k) })),
    data: new Uint8Array(ix.data),
  }
}

export async function runGate(): Promise<Step[]> {
  const steps: Step[] = []
  const record = (step: string, fn: () => Promise<string> | string) =>
    Promise.resolve()
      .then(fn)
      .then((detail) => steps.push({ step, ok: true, detail }))
      .catch((e: Error) => {
        const stack = (e?.stack ?? '').split('\n').slice(0, 4).join(' | ')
        steps.push({ step, ok: false, error: `${String(e?.message ?? e)} :: ${stack}` })
      })

  await record('module-shape', () => {
    return `resolved typeof DLMM=${typeof DLMM} typeof DLMM.create=${typeof (DLMM as unknown as Record<string, unknown>).create}`
  })

  await record('capability-probe', () => {
    const g = globalThis as unknown as Record<string, unknown>
    const probe = (name: string) => `${name}:${typeof g[name]}`
    return [
      probe('TextDecoder'),
      probe('TextEncoder'),
      probe('BigInt'),
      probe('performance'),
      probe('URL'),
      probe('Headers'),
      probe('Request'),
      `Buffer.from:${typeof (globalThis as unknown as { Buffer?: { from?: unknown } }).Buffer?.from}`,
      `Buffer.alloc:${typeof (globalThis as unknown as { Buffer?: { alloc?: unknown } }).Buffer?.alloc}`,
      `Buffer.readBigUInt64LE:${typeof (globalThis as unknown as { Buffer?: { readBigUInt64LE?: unknown } }).Buffer?.readBigUInt64LE}`,
    ].join(' ')
  })

  let poolAddress = ''
  let activeBinCache: { binId: number; price: string } | undefined
  let builtTx: import('@solana/web3.js').Transaction | import('@solana/web3.js').Transaction[] | undefined
  let txCount = 0

  await record('api-pool-list', async () => {
    const res = await fetch(
      'https://dlmm.datapi.meteora.ag/pools?page=1&page_size=5&sort_by=tvl:desc&filter_by=is_blacklisted=false&query=SOL-USDC',
    )
    const json = (await res.json()) as { data: Array<{ address: string; name: string }> }
    poolAddress = json.data[0].address
    return `SOL/USDC pool: ${json.data[0].name}`
  })

  const connection = new Connection(RPC)
  let dlmm: DLMM | undefined

  await record('isolated-decode', async () => {
    const { BorshAccountsCoder } = await import('@coral-xyz/anchor')
    const info = await connection.getAccountInfo(new PublicKey(poolAddress))
    if (!info) throw new Error('no account info')
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const idl = (dlmmModule as unknown as { IDL: unknown }).IDL
    const coder = new BorshAccountsCoder(idl as never)
    const b = Buffer.from(info.data)
    const ctor = b.constructor?.name ?? 'unknown'
    const protoRead = typeof Object.getPrototypeOf(b).readUIntLE
    const selfRead = typeof (b as unknown as Record<string, unknown>).readUIntLE
    const sliceCtor = b.subarray(8).constructor?.name
    try {
      const decoded = coder.decodeUnchecked('LbPair', b as never) as unknown as {
        binStep: number
        activeId: number
      }
      return `binStep=${decoded.binStep} activeId=${decoded.activeId} ctor=${ctor} protoRead=${protoRead} selfRead=${selfRead} subCtor=${sliceCtor}`
    } catch (e: unknown) {
      const detail = `ctor=${ctor} protoRead=${protoRead} selfRead=${selfRead} subCtor=${sliceCtor} bytes=${b.length}`
      throw new Error(`${String((e as Error)?.message)} [${detail}]`)
    }
  })

  await record('sdk-create', async () => {
    dlmm = await DLMM.create(connection, new PublicKey(poolAddress))
    activeBinCache = await dlmm.getActiveBin()
    return `binStep=${dlmm.lbPair.binStep} activeId=${activeBinCache.binId}`
  })

  await record('active-bin', () => {
    const bin = activeBinCache
    return `binId=${bin.binId} price=${bin.price}`
  })

  // Binance hot wallet: known top holder of USDC and wSOL, so both user token
  // accounts exist and the ix builder's non-nullable ATA fetches succeed.
  const USER = new PublicKey('9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM')

  await record('add-liquidity-ix', async () => {
    const positionKp = Keypair.generate()
    const active = activeBinCache
    const dist = [0, 1, 2].map((i) => ({
      binId: active.binId + i,
      distributionX: i === 0 ? 0.6 : 0.2,
      distributionY: i === 0 ? 0.6 : 0.2,
    }))
    builtTx = await dlmm.addLiquidityByWeight({
      positionPubKey: positionKp.publicKey,
      totalXAmount: new BN(1_000_000),
      totalYAmount: new BN(2_000_000),
      xYAmountDistribution: dist,
      user: USER,
      slippage: 0.005,
    })
    txCount = Array.isArray(builtTx) ? builtTx.length : 1
    return `transactions=${txCount}`
  })

  await record('kit-conversion', () => {
    const single = Array.isArray(builtTx) ? builtTx[0] : builtTx
    const kitIx = legacyToKitIx(single.instructions[single.instructions.length - 1])
    return `programAddress=${kitIx.programAddress} accounts=${kitIx.accounts.length} dataBytes=${kitIx.data.length}`
  })

  return steps
}
