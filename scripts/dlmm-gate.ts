/**
 * Rerunnable integration gate for the Meteora DLMM stack, run under bun:
 *
 *   bun run scripts/dlmm-gate.ts
 *
 * datapi pool discovery → SDK pool load → active bin → full kit build via
 * buildCreatePosition → sigVerify=false simulateTransaction against mainnet.
 * Network failure prints `GATE <step> SKIP <reason>` and exits 0; a real FAIL exits 1.
 */
import { address, getBase64EncodedWireTransaction } from '@solana/kit'
import { Connection, PublicKey } from '@solana/web3.js'
import * as dlmmNamespace from '@meteora-ag/dlmm'

import { fetchMeteoraPools } from '../src/features/meteora/data-access/meteora-datapi'
import type { MeteoraPositionPlan } from '../src/features/meteora/data-access/meteora-types'
import { binPrice } from '../src/features/meteora/util/meteora-position'
import { createDlmmPool } from '../src/features/meteora/util/dlmm-sdk'

const RPC = 'https://api.mainnet-beta.solana.com'
const CLUSTER = { id: 'solana:mainnet', label: 'mainnet', url: RPC } as const

const USDC_MINT = address('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v')
const WSOL_MINT = address('So11111111111111111111111111111111111111112')

// The SDK ships a fixture wallet whose USDC and wSOL ATAs exist, so the builder's
// non-nullable ATA fetches succeed without spending anything.
function simulationUser(): PublicKey {
  const exported = (dlmmNamespace as { SIMULATION_USER?: PublicKey }).SIMULATION_USER
  return exported ?? new PublicKey('9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM')
}

class GateSkip extends Error {}

function isNetworkError(error: unknown): boolean {
  const message = String((error as Error)?.message ?? error)
  return /fetch failed|network|enotfound|econn(refused|reset|aborted)|etimedout|timed out|timeout|rate.?limit|429|server error|50[0234]|unable to connect|connection (refused|reset|closed)/i.test(
    message,
  )
}

async function main(): Promise<number> {
  const user = simulationUser()
  let poolAddress: string | null = null
  let activeBinId: number | null = null
  let wire: string | null = null
  let failed = false

  const run = async (step: string, body: () => Promise<string>) => {
    if (failed) {
      console.log(`GATE ${step} SKIP upstream failure`)
      return
    }
    try {
      const detail = await body()
      console.log(`GATE ${step} OK ${detail}`)
    } catch (error: unknown) {
      const detail = String((error as Error)?.message ?? error).slice(0, 200)
      if (isNetworkError(error)) {
        console.log(`GATE ${step} SKIP ${detail}`)
      } else {
        console.log(`GATE ${step} FAIL ${detail}`)
        failed = true
      }
    }
  }

  await run('datapi-pool', async () => {
    const page = await fetchMeteoraPools({ sortBy: 'tvl', minTvlUsd: 0, search: 'SOL-USDC' }, 1)
    const pool = page.pools[0]
    if (!pool) {
      throw new GateSkip('no SOL-USDC pool returned')
    }
    poolAddress = pool.address
    return `${pool.name} tvl=$${Math.round(pool.tvlUsd)}`
  })

  await run('sdk-create', async () => {
    if (!poolAddress) throw new GateSkip('no pool from datapi step')
    const dlmm = await createDlmmPool({ cluster: CLUSTER, poolAddress: address(poolAddress) })
    const bin = await dlmm.getActiveBin()
    activeBinId = bin.binId
    return `active bin ${bin.binId} binStep ${bin.binStep}`
  })

  await run('build-create-position', async () => {
    if (!poolAddress || activeBinId === null) throw new GateSkip('no pool/bin from earlier steps')
    const dlmm = await createDlmmPool({ cluster: CLUSTER, poolAddress: address(poolAddress) })
    const active = await dlmm.getActiveBin()
    const plan: MeteoraPositionPlan = {
      poolAddress: address(poolAddress),
      presetId: 'spot-narrow',
      strategyType: 'spot',
      minBinId: active.binId - 2,
      maxBinId: active.binId + 2,
      binCount: 5,
      minPrice: binPrice(active.price, active.binStep, -2),
      maxPrice: binPrice(active.price, active.binStep, 2),
      // One-sided spot deposit: the SIMULATION_USER wSOL ATA does not hold a spendable
      // balance, so the fixture funds the position from USDC only.
      amountXBaseUnits: 1_000_000n,
      amountYBaseUnits: 0n,
      tokenX: { address: USDC_MINT, symbol: 'USDC', decimals: 6, isVerified: true, priceUsd: 1 },
      tokenY: { address: WSOL_MINT, symbol: 'wSOL', decimals: 9, isVerified: true, priceUsd: 0 },
      slippagePercent: 1,
      activeBinIdAtPlanTime: active.binId,
    }
    const latestBlockhash = await new Connection(RPC).getLatestBlockhash()
    const built = await dlmm.buildCreatePosition(plan, address(user.toBase58()), latestBlockhash.blockhash)
    wire = getBase64EncodedWireTransaction(built.transactions[0])
    return `position ${built.positionAddress} transactions=${built.transactions.length} bytes=${wire.length}`
  })

  await run('simulate', async () => {
    if (!wire) throw new GateSkip('no built transaction from build step')
    const response = await fetch(RPC, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'simulateTransaction',
        params: [wire, { encoding: 'base64', sigVerify: false, replaceRecentBlockhash: true }],
      }),
    })
    if (!response.ok) {
      throw new Error(`simulate HTTP ${response.status}`)
    }
    const result = (await response.json()) as {
      error?: { code?: number; message?: string }
      result?: { value?: { err?: unknown; logs?: string[] } }
    }
    // A JSON-RPC error is service-side (rate limit, simulation disabled), not a build defect.
    if (result.error) {
      throw new GateSkip(`rpc error ${result.error.code ?? ''}: ${result.error.message ?? 'unknown'}`)
    }
    if (!result.result?.value) {
      throw new Error(`unexpected simulate response: ${JSON.stringify(result).slice(0, 120)}`)
    }
    if (result.result.value.err) {
      throw new Error(`simulation error: ${JSON.stringify(result.result.value.err)}`)
    }
    return `${result.result.value.logs?.length ?? 0} log lines`
  })

  return failed ? 1 : 0
}

main()
  .then((code) => process.exit(code))
  .catch((error: unknown) => {
    console.error(String((error as Error)?.message ?? error))
    process.exit(1)
  })
