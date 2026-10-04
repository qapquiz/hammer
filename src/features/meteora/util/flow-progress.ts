import type { MeteoraPartialProgress } from '../data-access/meteora-types'

/**
 * The executors' typed errors carry signatures plus a confirmedCount so a mid-send failure or
 * a polling timeout can be reported per step ("step 2 of 3 failed"). Both flow reducers parse
 * that shape out of an unknown error with this one helper.
 */
export function partialProgressFromError(error: unknown): MeteoraPartialProgress | undefined {
  if (typeof error !== 'object' || error === null) {
    return undefined
  }
  const candidate = error as { signatures?: unknown; confirmedCount?: unknown; totalCount?: unknown }
  if (
    Array.isArray(candidate.signatures) &&
    candidate.signatures.every((signature) => typeof signature === 'string') &&
    typeof candidate.confirmedCount === 'number' &&
    typeof candidate.totalCount === 'number'
  ) {
    return {
      signatures: candidate.signatures as readonly string[],
      confirmedCount: candidate.confirmedCount,
      totalCount: candidate.totalCount,
    }
  }
  return undefined
}
