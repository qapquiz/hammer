// Throwaway Node-side proof for the base-signer decision (Meteora create-position send path).
// Question: does the SDK's initializePositionAndAddLiquidityByStrategy accept a FIXED
// (user-derived) position key, i.e. can we use owner-as-base with the single-wallet-signer
// send path? Or does the assembled ix require the position account itself to sign?
// Run: node prototype/base-signer-proof.cjs
const { Connection, Keypair, PublicKey, Transaction } = require('@solana/web3.js')
const DLMM = require('@meteora-ag/dlmm')
const {
  address,
  appendTransactionMessageInstructions,
  compileTransaction,
  createTransactionMessage,
  createKeyPairFromBytes,
  getBase64EncodedWireTransaction,
  getBase58Decoder,
  partiallySignTransaction,
  pipe,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
} = require('@solana/kit')
const nodeCrypto = require('crypto')

const RPC = 'https://api.mainnet-beta.solana.com'

// Anchor 8-byte discriminators from the SDK IDL (anchor 0.30 sha256('global:<name>').slice(0,8))
function anchorDisc(name) {
  return nodeCrypto.createHash('sha256').update(`global:${name}`).digest().subarray(0, 8)
}
const DISC_INITIALIZE_POSITION = anchorDisc('initialize_position')
const DISC_INITIALIZE_POSITION_PDA = anchorDisc('initialize_position_pda')

function roleFor(k) {
  return k.isSigner && k.isWritable ? 3 : k.isSigner ? 2 : k.isWritable ? 1 : 0
}
function legacyToKitIxs(tx) {
  return tx.instructions.map((ix) => ({
    programAddress: address(ix.programId.toBase58()),
    accounts: ix.keys.map((k) => ({ address: address(k.pubkey.toBase58()), role: roleFor(k) })),
    data: new Uint8Array(ix.data),
  }))
}

async function main() {
  const res = await fetch(
    'https://dlmm.datapi.meteora.ag/pools?page=1&page_size=5&sort_by=tvl:desc&filter_by=is_blacklisted=false&query=SOL-USDC',
  )
  const poolAddress = (await res.json()).data[0].address
  const connection = new Connection(RPC)
  const dlmm = await DLMM.create(connection, new PublicKey(poolAddress))
  const active = await dlmm.getActiveBin()
  console.log('pool', poolAddress, 'activeBin', active.binId, 'price', active.price)

  const fixedPositionKey = DLMM.SIMULATION_USER
  const user = fixedPositionKey // fee payer/owner stand-in for inspection purposes

  // Step 1: build with a FIXED position key (owner-as-base hypothesis).
  const txFixed = await dlmm.initializePositionAndAddLiquidityByStrategy({
    positionPubKey: fixedPositionKey,
    totalXAmount: new (require('bn.js'))(1_000_000),
    totalYAmount: new (require('bn.js'))(1_000_000),
    strategy: { minBinId: active.binId - 2, maxBinId: active.binId + 2, strategyType: 0 },
    user,
    slippage: 1,
  })
  const singleFixed = Array.isArray(txFixed) ? txFixed[0] : txFixed
  const initIxFixed = singleFixed.instructions.find((ix) =>
    ix.data.subarray(0, 8).equals(DISC_INITIALIZE_POSITION),
  )
  const initIxFixedPda = singleFixed.instructions.find((ix) =>
    ix.data.subarray(0, 8).equals(DISC_INITIALIZE_POSITION_PDA),
  )
  console.log('initialize_position ix found:', !!initIxFixed, '| initialize_position_pda ix found:', !!initIxFixedPda)
  const signerCount = singleFixed.instructions.reduce(
    (n, ix) => n + ix.keys.filter((k) => k.isSigner).length,
    0,
  )
  const signerAddrs = new Set(
    singleFixed.instructions.flatMap((ix) => ix.keys.filter((k) => k.isSigner).map((k) => k.pubkey.toBase58())),
  )
  console.log('required signers in built tx:', signerCount, [...signerAddrs])
  const positionIsSigner = initIxFixed
    ? initIxFixed.keys.some((k) => k.pubkey.equals(fixedPositionKey) && k.isSigner)
    : false
  console.log('fixed position key is a required signer:', positionIsSigner)

  // Step 2: kit hand-off — real position keypair, compile, partial sign, wire round-trip.
  const freshSeed = nodeCrypto.randomBytes(32)
  const freshKp = Keypair.fromSeed(freshSeed)
  const txReal = await dlmm.initializePositionAndAddLiquidityByStrategy({
    positionPubKey: freshKp.publicKey,
    totalXAmount: new (require('bn.js'))(1_000_000),
    totalYAmount: new (require('bn.js'))(1_000_000),
    strategy: { minBinId: active.binId - 2, maxBinId: active.binId + 2, strategyType: 0 },
    user,
    slippage: 1,
  })
  const singleReal = Array.isArray(txReal) ? txReal[0] : txReal
  const kitIxs = legacyToKitIxs(singleReal)
  const positionAddress = address(freshKp.publicKey.toBase58())
  const userAddress = address(user.toBase58())
  const latestBlockhash = await connection.getLatestBlockhash()
  const message = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayer(userAddress, m),
    (m) =>
      setTransactionMessageLifetimeUsingBlockhash(
        { blockhash: latestBlockhash.blockhash, lastValidBlockHeight: latestBlockhash.lastValidBlockHeight },
        m,
      ),
    (m) => appendTransactionMessageInstructions(kitIxs, m),
  )
  const compiled = compileTransaction(message)
  const keyPair = await createKeyPairFromBytes(freshKp.secretKey)
  const partiallySigned = await partiallySignTransaction([keyPair], compiled)
  const wire = getBase64EncodedWireTransaction(partiallySigned)

  // Round-trip: decode and verify the position slot carries a valid ed25519 signature.
  const { VersionedTransaction } = require('@solana/web3.js')
  const decoded = VersionedTransaction.deserialize(Buffer.from(wire, 'base64'))
  const accountKeys = decoded.message.getAccountKeys({ accountKeysFromLookups: { writable: [], readonly: [] } })
  const positionSigIndex = decoded.signatures.findIndex((s, i) => accountKeys.get(i).equals(freshKp.publicKey))
  const positionSig = decoded.signatures[positionSigIndex]
  const ok = positionSig && positionSig.some((b) => b !== 0)
  console.log('position signature slot present on wire:', !!ok, 'slot index', positionSigIndex)
  const messageData = decoded.message.serialize()
  const verified = nodeCrypto.verify(
    null,
    messageData,
    nodeCrypto.createPrivateKey({
      key: Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'), freshSeed]),
      format: 'der',
      type: 'pkcs8',
    }),
    positionSig,
  )
  console.log('position signature verifies over message:', verified)
  if (!verified || !initIxFixed || positionIsSigner !== true) {
    throw new Error('unexpected result — do not ship the assumed send path')
  }
  console.log(
    'CONCLUSION: initialize_position (non-PDA) requires the position account itself to sign; a fixed user-derived position key cannot be used. Position keypair + partiallySignTransaction + signAndSendTransaction(tx, minContextSlot) is the correct path.',
  )
}

main().catch((e) => {
  console.error('FAIL', e && e.stack ? e.stack.split('\n').slice(0, 6).join('\n') : e)
  process.exit(1)
})
