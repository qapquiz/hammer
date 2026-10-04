import type { MeteoraPositionActionPlan, MeteoraPositionFlow } from '../data-access/meteora-types'
import { partialProgressFromError } from './flow-progress'

export type MeteoraPositionActionEvent =
  | { type: 'building'; plan: MeteoraPositionActionPlan }
  | { type: 'signing' }
  | { type: 'confirming'; signatures: readonly string[] }
  | { type: 'confirmed'; confirmationSlot: bigint | null }
  | { type: 'failed'; error: unknown }
  | { type: 'dismissed' }
  | { type: 'reset' }

/**
 * Same stale/out-of-order discipline as the create flow: a dispatch racing a reset (or a
 * double-tap) can never corrupt the flow. `dismissed` only from `signing` — cancelling the
 * wallet prompt is the one user exit mid-flight. No preview stage: validation is local, so
 * a validation issue enters as `failed` with plan null straight from idle.
 */
export function positionActionFlowReducer(
  state: MeteoraPositionFlow,
  event: MeteoraPositionActionEvent,
): MeteoraPositionFlow {
  switch (event.type) {
    case 'building':
      if (
        state.status === 'idle' ||
        state.status === 'confirmed' ||
        state.status === 'failed' ||
        state.status === 'dismissed'
      ) {
        return { status: 'building', plan: event.plan }
      }
      return state
    case 'signing':
      return state.status === 'building' ? { status: 'signing', plan: state.plan } : state
    case 'confirming':
      return state.status === 'signing'
        ? { status: 'confirming', plan: state.plan, signatures: event.signatures }
        : state
    case 'confirmed':
      return state.status === 'confirming'
        ? {
            status: 'confirmed',
            plan: state.plan,
            signatures: state.signatures,
            confirmationSlot: event.confirmationSlot,
          }
        : state
    case 'failed':
      if (state.status === 'building' || state.status === 'signing' || state.status === 'confirming') {
        const progress = partialProgressFromError(event.error)
        return {
          status: 'failed',
          plan: state.plan,
          error: event.error,
          progress:
            progress ??
            (state.status === 'confirming'
              ? { signatures: state.signatures, confirmedCount: 0, totalCount: state.signatures.length }
              : undefined),
        }
      }
      if (state.status === 'idle') {
        return { status: 'failed', plan: null, error: event.error }
      }
      return state
    case 'dismissed':
      return state.status === 'signing' ? { status: 'dismissed', plan: state.plan } : state
    case 'reset':
      return { status: 'idle' }
  }
}
