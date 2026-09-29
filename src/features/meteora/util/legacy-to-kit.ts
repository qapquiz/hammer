import { AccountRole, address } from '@solana/kit'
import type { Address, Instruction } from '@solana/kit'
import type { TransactionInstruction } from '@solana/web3.js'

/**
 * The single legacy→kit conversion seam. The DLMM SDK emits web3.js instructions; the MWA
 * send rail is kit-typed. Everything crossing that boundary goes through this function,
 * exactly once.
 */
export function legacyToKitInstruction(instruction: TransactionInstruction): Instruction {
  return {
    programAddress: address(instruction.programId.toBase58()),
    accounts: instruction.keys.map((key) => ({
      address: address(key.pubkey.toBase58()) as Address,
      role: accountRoleFor({ isSigner: key.isSigner, isWritable: key.isWritable }),
    })),
    // Copy: the legacy Buffer must become a plain Uint8Array for the kit encoders.
    data: new Uint8Array(instruction.data),
  }
}

function accountRoleFor({ isSigner, isWritable }: { isSigner: boolean; isWritable: boolean }): AccountRole {
  if (isSigner && isWritable) {
    return AccountRole.WRITABLE_SIGNER
  }
  if (isSigner) {
    return AccountRole.READONLY_SIGNER
  }
  return isWritable ? AccountRole.WRITABLE : AccountRole.READONLY
}
