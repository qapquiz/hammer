import { AccountRole } from '@solana/kit'
import { PublicKey, TransactionInstruction } from '@solana/web3.js'
import { describe, expect, test } from 'bun:test'

import { legacyToKitInstruction } from './legacy-to-kit'

const TOKEN_PROGRAM = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA')
const OWNER = new PublicKey('9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM')
const MINT = new PublicKey('So11111111111111111111111111111111111111112')
const RANDOM = new PublicKey(new Uint8Array(32).fill(7))

function syntheticInstruction() {
  return new TransactionInstruction({
    programId: TOKEN_PROGRAM,
    keys: [
      { pubkey: OWNER, isSigner: true, isWritable: true },
      { pubkey: RANDOM, isSigner: false, isWritable: true },
      { pubkey: MINT, isSigner: false, isWritable: false },
    ],
    data: Buffer.from([1, 2, 3, 255]),
  })
}

describe('legacyToKitInstruction', () => {
  test('maps program, roles, and data bytes to literal kit fields', () => {
    const result = legacyToKitInstruction(syntheticInstruction())

    expect(result.programAddress).toBe('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA')
    expect(result.accounts).toEqual([
      { address: OWNER.toBase58(), role: AccountRole.WRITABLE_SIGNER },
      { address: RANDOM.toBase58(), role: AccountRole.WRITABLE },
      { address: MINT.toBase58(), role: AccountRole.READONLY },
    ])
    expect(Array.from(result.data ?? [])).toEqual([1, 2, 3, 255])
  })

  test('copies data instead of aliasing the legacy buffer', () => {
    const instruction = syntheticInstruction()
    const result = legacyToKitInstruction(instruction)

    expect(result.data).not.toBe(instruction.data)
    const copiedData = result.data as Uint8Array
    copiedData[0] = 99
    expect(instruction.data[0]).toBe(1)
  })

  test('maps a read-only signer to READONLY_SIGNER', () => {
    const instruction = new TransactionInstruction({
      programId: TOKEN_PROGRAM,
      keys: [{ pubkey: OWNER, isSigner: true, isWritable: false }],
      data: Buffer.alloc(0),
    })

    const result = legacyToKitInstruction(instruction)

    expect(result.accounts).toEqual([{ address: OWNER.toBase58(), role: AccountRole.READONLY_SIGNER }])
  })
})
