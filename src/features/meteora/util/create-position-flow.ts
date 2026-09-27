import type { Address } from '@solana/kit'

import type { MeteoraCreatePositionFlow, MeteoraPositionDraft, MeteoraPositionPlan } from '../data-access/meteora-types'

export type MeteoraCreatePositionEvent =
  | { type: 'preview'; draft: MeteoraPositionDraft }
  | { type: 'previewed'; plan: MeteoraPositionPlan }
  | { type: 'previewFailed'; error: unknown }
  | { type: 'building' }
  | { type: 'signing' }
  | { type: 'sent'; signature: string; positionAddress: Address }
  | { type: 'failed'; error: unknown }
  | { type: 'dismissed' }
  | { type: 'reset' }

/**
 * Stale or out-of-order events are no-ops: a dispatch racing a reset (or a
 * double-tap) can never corrupt the flow.
 */
export function createPositionFlowReducer(
  state: MeteoraCreatePositionFlow,
  event: MeteoraCreatePositionEvent,
): MeteoraCreatePositionFlow {
  switch (event.type) {
    case 'preview':
      if (
        state.status === 'idle' ||
        state.status === 'sent' ||
        state.status === 'failed' ||
        state.status === 'dismissed'
      ) {
        return { status: 'previewing', draft: event.draft }
      }
      return state
    case 'previewed':
      return state.status === 'previewing' ? { status: 'preview', plan: event.plan } : state
    case 'previewFailed':
      return state.status === 'previewing' ? { status: 'failed', plan: null, error: event.error } : state
    case 'building':
      if ((state.status === 'preview' || state.status === 'failed' || state.status === 'dismissed') && state.plan) {
        return { status: 'building', plan: state.plan }
      }
      return state
    case 'signing':
      return state.status === 'building' ? { status: 'signing', plan: state.plan } : state
    case 'sent':
      return state.status === 'signing'
        ? { status: 'sent', plan: state.plan, signature: event.signature, positionAddress: event.positionAddress }
        : state
    case 'failed':
      if (state.status === 'previewing' || state.status === 'building' || state.status === 'signing') {
        return {
          status: 'failed',
          plan: 'plan' in state ? state.plan : null,
          error: event.error,
        }
      }
      return state
    case 'dismissed':
      return state.status === 'signing' ? { status: 'dismissed', plan: state.plan } : state
    case 'reset':
      return { status: 'idle' }
  }
}
