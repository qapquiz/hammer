import type { Address } from '@solana/kit'

import type { MeteoraCreatePositionFlow, MeteoraPositionDraft, MeteoraPositionPlan } from '../data-access/meteora-types'
import { partialProgressFromError } from './flow-progress'

export type MeteoraCreatePositionEvent =
  | { type: 'preview'; draft: MeteoraPositionDraft }
  | { type: 'previewed'; plan: MeteoraPositionPlan }
  | { type: 'previewFailed'; error: unknown }
  | { type: 'building' }
  | { type: 'signing' }
  | { type: 'confirming'; signatures: readonly string[]; positionAddress: Address }
  | { type: 'confirmed'; confirmationSlot: bigint | null }
  | { type: 'failed'; error: unknown }
  | { type: 'dismissed' }
  | { type: 'reset' }

/**
 * Stale or out-of-order events are no-ops: a dispatch racing a reset (or a double-tap) can
 * never corrupt the flow. `dismissed` only from `signing` — cancelling the wallet prompt is
 * the one user exit mid-flight.
 */
export function createPositionFlowReducer(
  state: MeteoraCreatePositionFlow,
  event: MeteoraCreatePositionEvent,
): MeteoraCreatePositionFlow {
  switch (event.type) {
    case 'preview':
      if (
        state.status === 'idle' ||
        state.status === 'confirmed' ||
        state.status === 'failed' ||
        state.status === 'dismissed'
      ) {
        return { status: 'previewing', draft: event.draft }
      }
      return state
    case 'previewed':
      return state.status === 'previewing' ? { status: 'previewed', plan: event.plan } : state
    case 'previewFailed':
      return state.status === 'previewing' ? { status: 'failed', plan: null, error: event.error } : state
    case 'building':
      if ((state.status === 'previewed' || state.status === 'failed' || state.status === 'dismissed') && state.plan) {
        return { status: 'building', plan: state.plan }
      }
      return state
    case 'signing':
      return state.status === 'building' ? { status: 'signing', plan: state.plan } : state
    case 'confirming':
      return state.status === 'signing'
        ? {
            status: 'confirming',
            plan: state.plan,
            signatures: event.signatures,
            positionAddress: event.positionAddress,
          }
        : state
    case 'confirmed':
      return state.status === 'confirming'
        ? {
            status: 'confirmed',
            plan: state.plan,
            signatures: state.signatures,
            positionAddress: state.positionAddress,
            confirmationSlot: event.confirmationSlot,
          }
        : state
    case 'failed':
      if (state.status === 'previewing') {
        return { status: 'failed', plan: null, error: event.error }
      }
      if (state.status === 'building' || state.status === 'signing' || state.status === 'confirming') {
        return {
          status: 'failed',
          plan: state.plan,
          error: event.error,
          progress:
            partialProgressFromError(event.error) ??
            (state.status === 'confirming'
              ? { signatures: state.signatures, confirmedCount: 0, totalCount: state.signatures.length }
              : undefined),
        }
      }
      return state
    case 'dismissed':
      return state.status === 'signing' ? { status: 'dismissed', plan: state.plan } : state
    case 'reset':
      return { status: 'idle' }
  }
}
