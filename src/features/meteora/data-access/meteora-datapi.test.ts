import { describe, expect, test } from 'bun:test'

import { ohlcvBucketWindow, parseMeteoraCandle } from './meteora-datapi'

describe('parseMeteoraCandle', () => {
  test('parses wire fields, converting seconds to milliseconds', () => {
    expect(
      parseMeteoraCandle({
        timestamp: 1_733_078_400,
        timestamp_str: 'irrelevant sibling field',
        open: '0.2901',
        high: 0.295,
        low: '0.288',
        close: 0.2911,
        volume: '12345.6',
      }),
    ).toEqual({
      timestampMs: 1_733_078_400_000,
      open: 0.2901,
      high: 0.295,
      low: 0.288,
      close: 0.2911,
      volume: 12345.6,
    })
  })

  test('rejects non-object wire with a named error', () => {
    expect(() => parseMeteoraCandle(null)).toThrow('Unexpected Meteora API candle shape')
    expect(() => parseMeteoraCandle('candle')).toThrow('Unexpected Meteora API candle shape')
  })

  test('rejects bad numeric fields with the field named', () => {
    expect(() => parseMeteoraCandle({ timestamp: 1, open: 'NaN', high: 1, low: 1, close: 1, volume: 1 })).toThrow(
      'Unexpected Meteora API value for "open": "NaN"',
    )
    expect(() => parseMeteoraCandle({ timestamp: 'x', open: 1, high: 1, low: 1, close: 1, volume: 1 })).toThrow(
      'Unexpected Meteora API value for "timestamp": "x"',
    )
  })
})

describe('ohlcvBucketWindow', () => {
  // 15m buckets: 2024-12-01T12:00:00Z = 1_733_054_400_000 is a bucket boundary.
  const BUCKET = 15 * 60_000
  const BOUNDARY = 1_733_054_400_000
  const LOOKBACK = 24 * 60 * 60 * 1000

  test('floors to bucket boundaries and covers the lookback', () => {
    const window = ohlcvBucketWindow(15, LOOKBACK, BOUNDARY + 7 * 60_000 + 123)
    expect(window.endMs % BUCKET).toBe(0)
    expect(window.startMs % BUCKET).toBe(0)
    expect(window.endMs - window.startMs).toBe(LOOKBACK)
  })

  test('is stable across the whole candle period, then rolls', () => {
    const early = ohlcvBucketWindow(15, LOOKBACK, BOUNDARY + 1)
    const late = ohlcvBucketWindow(15, LOOKBACK, BOUNDARY + BUCKET - 1)
    expect(late).toEqual(early)
    const next = ohlcvBucketWindow(15, LOOKBACK, BOUNDARY + BUCKET + 1)
    expect(next.endMs).toBe(early.endMs + BUCKET)
  })
})
