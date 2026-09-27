// Throwaway Node-side proof: SDK ix build + legacy->kit conversion + Kit compile + simulate.
const { Connection, PublicKey, VersionedTransaction, TransactionMessage } = require('@solana/web3.js')
const DLMM = require('@meteora-ag/dlmm')
const {
  address,
  appendTransactionMessageInstruction,
  compileTransaction,
  createTransactionMessage,
  getBase64EncodedWireTransaction,
  pipe,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
} = require('@solana/kit')

const RPC = 'https://api.mainnet-beta.solana.com'

function legacyToKitIx(ix) {
  const role = (k) =>
    k.isSigner && k.isWritable
      ? 3 // WRITABLE_SIGNER
      : k.isSigner
        ? 2 // READONLY_SIGNER
        : k.isWritable
          ? 1 // WRITABLE
          : 0 // READONLY
  return {
    programAddress: address(ix.programId.toBase58()),
    accounts: ix.keys.map((k) => ({ address: address(k.pubkey.toBase58()), role: role(k) })),
    data: new Uint8Array(ix.data),
  }
}

async function main() {
  const res = await fetch(
    'https://dlmm.datapi.meteora.ag/pools?page=1&page_size=5&sort_by=tvl:desc&filter_by=is_blacklisted=false&query=SOL-USDC',
  )
  const json = await res.json()
  const poolAddress = json.data[0].address
  console.log('pool', json.data[0].name, poolAddress)

  const connection = new Connection(RPC)
  const dlmm = await DLMM.create(connection, new PublicKey(poolAddress))
  const active = await dlmm.getActiveBin()
  console.log('active bin', active.binId, active.price)

  const user = DLMM.SIMULATION_USER || new PublicKey('HrY9qR5TiB2xPzzvbBu5KrBorMfYGQXh9osXydz4jy9s')
  console.log('fixture user:', user.toBase58())

  const positionKp = KeypairRandom()
  const tx = await dlmm.initializePositionAndAddLiquidityByStrategy({
    positionPubKey: new PublicKey(KeypairRandom()),
    totalXAmount: toBN(1_000_000),
    totalYAmount: toBN(2_000_000),
    strategy: { minBinId: active.binId - 2, maxBinId: active.binId + 2, strategyType: 0 },
    user,
    slippage: 0.005,
  })
  const single = Array.isArray(tx) ? tx[0] : tx
  console.log('legacy tx instructions:', single.instructions.length)

  const kitIxs = single.instructions.map(legacyToKitIx)
  console.log('kit instructions:', kitIxs.length)

  const blockhash = await new Connection(RPC).getLatestBlockhash()
  const message = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayer(user, m),
    (m) =>
      setTransactionMessageLifetimeUsingBlockhash(
        { blockhash: blockhash.blockhash, lastValidBlockHeight: blockhash.lastValidBlockHeight },
        m,
      ),
    ...kitIxs.map((ix) => (m) => appendTransactionMessageInstruction(ix, m)),
  )
  const wire = getBase64EncodedWireTransaction(compileTransaction(message))
  const rpcRes = await fetch(RPC, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'simulateTransaction',
      params: [wire, { encoding: 'base64', sigVerify: false, replaceRecentBlockhash: true }],
    }),
  })
  const sim = { value: (await rpcRes.json()).result.value }
  if (sim.value.err) process.exit(1)
}

function KeypairRandom() {
  const arr = new Uint8Array(32)
  require('crypto').randomFillSync(arr)
  return arr
}
function toBN(n) {
  const BN = require('bn.js')
  return new BN(n)
}

main().catch((e) => {
  console.error('FAIL', e && e.stack ? e.stack.split('\n').slice(0, 5).join('\n') : e)
  process.exit(1)
})
