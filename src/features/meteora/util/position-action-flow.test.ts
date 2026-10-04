import { address } from '@solana/kit'
import { describe, expect, test } from 'bun:test'

import type { MeteoraDepositPlan, MeteoraPositionActionPlan } from '../data-access/meteora-types'
import { positionActionFlowReducer } from './position-action-flow'

const POOL = address('58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2')
const POSITION = address('3UCq1jBRhVQog8Br6o7dwxpvLbNfEYZLPKRMqG7dWNqf')

const DEPOSIT_PLAN: MeteoraDepositPlan = {
  kind: 'deposit',
  poolAddress: POOL,
  positionAddress: POSITION,
  minBinId: 990,
  maxBinId: 1010,
  amountXBaseUnits: 1_000_000n,
  amountYBaseUnits: 0n,
  tokenX: {
    address: address('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'),
    symbol: 'USDC',
    decimals: 6,
    isVerified: true,
    priceUsd: 1,
  },
  tokenY: {
    address: address('So11111111111111111111111111111111111111112'),
    symbol: 'wSOL',
    decimals: 9,
    isVerified: true,
    priceUsd: 100,
  },
  slippagePercent: 1,
  activeBinIdAtPlanTime: 1000,
}

const CLOSE_PLAN: MeteoraPositionActionPlan = {
  kind: 'close',
  poolAddress: POOL,
  positionAddress: POSITION,
  feeXBaseUnits: 0n,
  feeYBaseUnits: 0n,
}

describe('positionActionFlowReducer', () => {
  test('happy path: building → signing → confirming → confirmed', () => {
    let state = positionActionFlowReducer({ status: 'idle' }, { type: 'building', plan: DEPOSIT_PLAN })
    expect(state).toEqual({ status: 'building', plan: DEPOSIT_PLAN })
    state = positionActionFlowReducer(state, { type: 'signing' })
    expect(state).toEqual({ status: 'signing', plan: DEPOSIT_PLAN })
    state = positionActionFlowReducer(state, { type: 'confirming', signatures: ['sig1'] })
    expect(state).toEqual({ status: 'confirming', plan: DEPOSIT_PLAN, signatures: ['sig1'] })
    state = positionActionFlowReducer(state, { type: 'confirmed', confirmationSlot: 123n })
    expect(state).toEqual({
      status: 'confirmed',
      plan: DEPOSIT_PLAN,
      signatures: ['sig1'],
      confirmationSlot: 123n,
    })
  })

  test('validation issues enter as failed with plan null from idle', () => {
    const state = positionActionFlowReducer({ status: 'idle' }, { type: 'failed', error: new Error('bad input') })
    expect(state).toEqual({ status: 'failed', plan: null, error: new Error('bad input'), progress: undefined })
  })

  test('stale events are no-ops', () => {
    const idle = { status: 'idle' as const }
    expect(positionActionFlowReducer(idle, { type: 'signing' })).toBe(idle)
    expect(positionActionFlowReducer(idle, { type: 'confirming', signatures: ['sig'] })).toBe(idle)
    expect(positionActionFlowReducer(idle, { type: 'confirmed', confirmationSlot: null })).toBe(idle)
    expect(positionActionFlowReducer(idle, { type: 'dismissed' })).toBe(idle)
    const signing = positionActionFlowReducer({ status: 'idle' }, { type: 'building', plan: CLOSE_PLAN })
    const signed = positionActionFlowReducer(signing, { type: 'signing' })
    // A duplicate building cannot hijack a flow that already left the ground.
    expect(positionActionFlowReducer(signed, { type: 'building', plan: DEPOSIT_PLAN })).toBe(signed)
    // A late confirm cannot confirm a flow that was already reset.
    expect(positionActionFlowReducer(idle, { type: 'confirming', signatures: ['sig'] })).toBe(idle)
  })

  test('dismissed only from signing', () => {
    const building = positionActionFlowReducer({ status: 'idle' }, { type: 'building', plan: DEPOSIT_PLAN })
    expect(positionActionFlowReducer(building, { type: 'dismissed' })).toBe(building)
    const signing = positionActionFlowReducer(building, { type: 'signing' })
    expect(positionActionFlowReducer(signing, { type: 'dismissed' })).toEqual({
      status: 'dismissed',
      plan: DEPOSIT_PLAN,
    })
  })

  test('confirming failure without typed progress falls back to zero-confirmed progress', () => {
    const confirming = positionActionFlowReducer(
      positionActionFlowReducer({ status: 'idle' }, { type: 'building', plan: DEPOSIT_PLAN }),
      { type: 'signing' },
    )
    const failed = positionActionFlowReducer(
      positionActionFlowReducer(confirming, { type: 'confirming', signatures: ['a', 'b'] }),
      { type: 'failed', error: new Error('boom') },
    )
    expect(failed.status).toBe('failed')
    if (failed.status === 'failed') {
      expect(failed.plan).toBe(DEPOSIT_PLAN)
      expect(failed.progress).toEqual({ signatures: ['a', 'b'], confirmedCount: 0, totalCount: 2 })
    }
  })

  test('a new plan restarts from confirmed, failed, and dismissed — but not mid-flight', () => {
    const confirmed = positionActionFlowReducer(
      positionActionFlowReducer(
        positionActionFlowReducer(
          positionActionFlowReducer({ status: 'idle' }, { type: 'building', plan: DEPOSIT_PLAN }),
          { type: 'signing' },
        ),
        { type: 'confirming', signatures: ['sig'] },
      ),
      { type: 'confirmed', confirmationSlot: null },
    )
    for (const prior of [
      confirmed,
      positionActionFlowReducer({ status: 'idle' }, { type: 'failed', error: new Error('x') }),
      positionActionFlowReducer(
        positionActionFlowReducer(
          positionActionFlowReducer({ status: 'idle' }, { type: 'building', plan: DEPOSIT_PLAN }),
          { type: 'signing' },
        ),
        { type: 'dismissed' },
      ),
    ]) {
      expect(positionActionFlowReducer(prior, { type: 'building', plan: CLOSE_PLAN })).toEqual({
        status: 'building',
        plan: CLOSE_PLAN,
      })
    }
    // In-flight states never restart.
    const building = positionActionFlowReducer({ status: 'idle' }, { type: 'building', plan: DEPOSIT_PLAN })
    expect(positionActionFlowReducer(building, { type: 'building', plan: CLOSE_PLAN })).toBe(building)
  })
})
