import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import { Text, useColorScheme, View } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, {
  runOnJS,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated'
import Svg, { G, Line, Rect, Text as SvgText } from 'react-native-svg'

import type { MeteoraActiveBin, MeteoraBinRange, MeteoraCandle } from '../data-access/meteora-types'
import type { MeteoraBinWeight } from '../util/meteora-liquidity-shape'
import {
  binToFraction,
  candleSlots,
  chartPriceDomain,
  fractionToBin,
  priceToFraction,
  profileBars,
  resolveDraggedRange,
} from '../util/meteora-chart-scale'
import { formatTokenPrice } from '../util/meteora-format'
import { binPrice } from '../util/meteora-position'

const CHART_HEIGHT = 220
const PROFILE_WIDTH = 64
const HANDLE_HIT_HEIGHT = 36
const GRIP_WIDTH = 26
const GRIP_HEIGHT = 14
const MAX_CANDLES = 200
const GRID_LINE_COUNT = 5

/** Tailwind classes do not reach SVG attributes, so fills live here per theme. */
const PALETTE = {
  dark: {
    up: '#34d399',
    down: '#f87171',
    band: '#38bdf8',
    bandOpacity: 0.08,
    handle: '#38bdf8',
    handleText: '#e4e4e7',
    activeLine: '#eab308',
    grid: '#a1a1aa',
    gridOpacity: 0.3,
    profileX: '#38bdf8',
    profileY: '#a78bfa',
  },
  light: {
    up: '#16a34a',
    down: '#dc2626',
    band: '#0284c7',
    bandOpacity: 0.08,
    handle: '#0284c7',
    handleText: '#3f3f46',
    activeLine: '#ca8a04',
    grid: '#52525b',
    gridOpacity: 0.25,
    profileX: '#0284c7',
    profileY: '#7c3aed',
  },
} as const

const AnimatedRect = Animated.createAnimatedComponent(Rect)
const AnimatedLine = Animated.createAnimatedComponent(Line)

const HIT_BASE_STYLE = {
  height: HANDLE_HIT_HEIGHT,
  left: 0,
  position: 'absolute',
  right: PROFILE_WIDTH,
  top: 0,
} as const

type DragCommit = (edge: 'min' | 'max', targetBinId: number) => void

/**
 * One RNGH Pan per handle. Handle visuals move on the UI thread through shared values;
 * each quantized bin crossing hops to JS (runOnJS), where resolveDraggedRange applies the
 * drag policy and commits. The worklet reads live state exclusively from shared values,
 * so the gesture is built once per edge and never goes stale mid-drag.
 */
function useHandleGesture(
  edge: 'min' | 'max',
  {
    commit,
    svActiveBinId,
    svActivePrice,
    svEdgeY,
    svDragging,
    svLogHi,
    svLogLo,
    svLogStep,
    svRangeEdge,
  }: {
    commit: DragCommit
    svActiveBinId: SharedValue<number>
    svActivePrice: SharedValue<number>
    svEdgeY: SharedValue<number>
    svDragging: SharedValue<boolean>
    svLogHi: SharedValue<number>
    svLogLo: SharedValue<number>
    svLogStep: SharedValue<number>
    svRangeEdge: SharedValue<number>
  },
) {
  const startY = useSharedValue(0)
  const lastBin = useSharedValue(Number.NaN)
  /* eslint-disable react-hooks/immutability -- reanimated worklets mutate shared values by design */
  return useMemo(
    () =>
      Gesture.Pan()
        .onBegin(() => {
          svDragging.value = true
          startY.value = svEdgeY.value
          lastBin.value = Number.NaN
        })
        .onUpdate((event) => {
          const y = Math.min(Math.max(startY.value + event.translationY, 0), CHART_HEIGHT)
          svEdgeY.value = y
          // fractionToBin inlined: worklets cannot call the pure helpers from chart-scale.
          const fraction = 1 - y / CHART_HEIGHT
          const logPrice = svLogLo.value + fraction * (svLogHi.value - svLogLo.value)
          const bin = Math.round(svActiveBinId.value + (logPrice - Math.log(svActivePrice.value)) / svLogStep.value)
          if (bin !== lastBin.value) {
            lastBin.value = bin
            runOnJS(commit)(edge, bin)
          }
        })
        .onFinalize(() => {
          svDragging.value = false
          // Snap to the committed edge; the props effect re-syncs once React lands the final commit.
          const logPrice = Math.log(svActivePrice.value) + (svRangeEdge.value - svActiveBinId.value) * svLogStep.value
          const fraction = Math.min(Math.max((logPrice - svLogLo.value) / (svLogHi.value - svLogLo.value), 0), 1)
          svEdgeY.value = (1 - fraction) * CHART_HEIGHT
        }),
    [
      commit,
      edge,
      lastBin,
      svActiveBinId,
      svActivePrice,
      svEdgeY,
      svDragging,
      svLogHi,
      svLogLo,
      svLogStep,
      svRangeEdge,
      startY,
    ],
  )
  /* eslint-enable react-hooks/immutability */
}

export function MeteoraUiPriceChart({
  activeBin,
  candles,
  disabled = false,
  onRangeChange,
  range,
  shape,
}: {
  activeBin: MeteoraActiveBin
  /** null = loading, [] = the API returned nothing. */
  candles: readonly MeteoraCandle[] | null
  disabled?: boolean
  onRangeChange: (range: MeteoraBinRange) => void
  range: MeteoraBinRange
  shape: readonly MeteoraBinWeight[]
}): ReactElement | null {
  const colorScheme = useColorScheme()
  const colors = PALETTE[colorScheme === 'dark' ? 'dark' : 'light']
  const [width, setWidth] = useState(0)
  const plotWidth = Math.max(width - PROFILE_WIDTH, 1)

  const domain = useMemo(() => chartPriceDomain({ activeBin, range, candles }), [activeBin, range, candles])
  const yOfBin = useCallback(
    (binId: number) => (1 - binToFraction(binId, activeBin, domain)) * CHART_HEIGHT,
    [activeBin, domain],
  )
  const yOfPrice = (price: number) => (1 - priceToFraction(price, domain)) * CHART_HEIGHT

  const svMinY = useSharedValue(0)
  const svMaxY = useSharedValue(0)
  const svDraggingMin = useSharedValue(false)
  const svDraggingMax = useSharedValue(false)
  const svLogLo = useSharedValue(0)
  const svLogHi = useSharedValue(0)
  const svActivePrice = useSharedValue(activeBin.price)
  const svActiveBinId = useSharedValue(activeBin.binId)
  const svLogStep = useSharedValue(Math.log(1 + activeBin.binStep / 10_000))
  const svRangeMin = useSharedValue(range.minBinId)
  const svRangeMax = useSharedValue(range.maxBinId)

  const stateRef = useRef({ bounds: activeBin, range })
  useEffect(() => {
    stateRef.current = { bounds: activeBin, range }
  }, [activeBin, range])
  const onRangeChangeRef = useRef(onRangeChange)
  useEffect(() => {
    onRangeChangeRef.current = onRangeChange
  }, [onRangeChange])

  useEffect(() => {
    svLogLo.value = Math.log(domain.min)
    svLogHi.value = Math.log(domain.max)
    svActivePrice.value = activeBin.price
    svActiveBinId.value = activeBin.binId
    svLogStep.value = Math.log(1 + activeBin.binStep / 10_000)
    svRangeMin.value = range.minBinId
    svRangeMax.value = range.maxBinId
    // A live drag owns its edge's visuals; everything else tracks the committed props.
    if (!svDraggingMin.value) {
      svMinY.value = yOfBin(range.minBinId)
    }
    if (!svDraggingMax.value) {
      svMaxY.value = yOfBin(range.maxBinId)
    }
  }, [
    activeBin,
    domain,
    range,
    svActiveBinId,
    svActivePrice,
    svDraggingMax,
    svDraggingMin,
    svLogHi,
    svLogLo,
    svLogStep,
    svMaxY,
    svMinY,
    svRangeMax,
    svRangeMin,
    yOfBin,
  ])

  const commit = useCallback((edge: 'min' | 'max', targetBinId: number) => {
    const { bounds, range: current } = stateRef.current
    const next = resolveDraggedRange({ current, edge, targetBinId, bounds })
    if (next.minBinId === current.minBinId && next.maxBinId === current.maxBinId) {
      return
    }
    // The ref advances immediately so back-to-back crossings resolve against the latest commit.
    stateRef.current = { bounds, range: next }
    onRangeChangeRef.current(next)
  }, [])

  const minGesture = useHandleGesture('min', {
    commit,
    svActiveBinId,
    svActivePrice,
    svEdgeY: svMinY,
    svDragging: svDraggingMin,
    svLogHi,
    svLogLo,
    svLogStep,
    svRangeEdge: svRangeMin,
  })
  const maxGesture = useHandleGesture('max', {
    commit,
    svActiveBinId,
    svActivePrice,
    svEdgeY: svMaxY,
    svDragging: svDraggingMax,
    svLogHi,
    svLogLo,
    svLogStep,
    svRangeEdge: svRangeMax,
  })

  const bandProps = useAnimatedProps(() => ({
    y: Math.min(svMinY.value, svMaxY.value),
    height: Math.max(Math.abs(svMaxY.value - svMinY.value), 2),
  }))
  const minLineProps = useAnimatedProps(() => ({ y1: svMinY.value, y2: svMinY.value }))
  const maxLineProps = useAnimatedProps(() => ({ y1: svMaxY.value, y2: svMaxY.value }))
  const minGripProps = useAnimatedProps(() => ({ y: svMinY.value - GRIP_HEIGHT / 2 }))
  const maxGripProps = useAnimatedProps(() => ({ y: svMaxY.value - GRIP_HEIGHT / 2 }))
  const minHitStyle = useAnimatedStyle(() => ({ transform: [{ translateY: svMinY.value - HANDLE_HIT_HEIGHT / 2 }] }))
  const maxHitStyle = useAnimatedStyle(() => ({ transform: [{ translateY: svMaxY.value - HANDLE_HIT_HEIGHT / 2 }] }))

  const sampledCandles = useMemo(() => {
    if (candles === null || candles.length <= MAX_CANDLES) {
      return candles ?? []
    }
    const stride = Math.ceil(candles.length / MAX_CANDLES)
    return candles.filter((_, index) => index % stride === 0 || index === candles.length - 1)
  }, [candles])
  const slots = useMemo(() => candleSlots(sampledCandles.length, plotWidth), [sampledCandles.length, plotWidth])

  // Without candles the bin grid charts the price ladder through the same scale.
  const gridLines = useMemo(() => {
    const topBin = fractionToBin(0.97, activeBin, domain)
    const bottomBin = fractionToBin(0.03, activeBin, domain)
    if (topBin <= bottomBin) {
      return []
    }
    const step = Math.max(1, Math.ceil((topBin - bottomBin + 1) / GRID_LINE_COUNT))
    const lines: { binId: number; y: number }[] = []
    for (let binId = bottomBin; binId <= topBin; binId += step) {
      lines.push({ binId, y: yOfBin(binId) })
    }
    return lines
  }, [activeBin, domain, yOfBin])

  const bars = useMemo(
    () =>
      profileBars({
        activeBin,
        domain,
        frame: { height: CHART_HEIGHT, profileLength: PROFILE_WIDTH - 10 },
        shape,
      }),
    [activeBin, domain, shape],
  )

  const yActive = yOfPrice(activeBin.price)
  const minPriceText = formatTokenPrice(binPrice(activeBin.price, activeBin.binStep, range.minBinId - activeBin.binId))
  const maxPriceText = formatTokenPrice(binPrice(activeBin.price, activeBin.binStep, range.maxBinId - activeBin.binId))

  return (
    <View className="gap-1" onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
      <View style={{ height: CHART_HEIGHT, opacity: disabled ? 0.55 : 1 }}>
        <Svg height={CHART_HEIGHT} width={width}>
          {gridLines.length > 0
            ? gridLines.map((line) => (
                <G key={line.binId}>
                  <Line
                    stroke={colors.grid}
                    strokeOpacity={colors.gridOpacity}
                    strokeWidth={1}
                    x1={0}
                    x2={plotWidth}
                    y1={line.y}
                    y2={line.y}
                  />
                  <SvgText fill={colors.grid} fontSize={9} x={4} y={line.y - 3}>
                    {formatTokenPrice(binPrice(activeBin.price, activeBin.binStep, line.binId - activeBin.binId))}
                  </SvgText>
                </G>
              ))
            : null}
          {sampledCandles.map((candle, index) => {
            const slot = slots[index]
            const x = slot.x + slot.width / 2
            const yHigh = yOfPrice(candle.high)
            const yLow = yOfPrice(candle.low)
            const yOpen = yOfPrice(candle.open)
            const yClose = yOfPrice(candle.close)
            const color = candle.close >= candle.open ? colors.up : colors.down
            return (
              <G key={`${candle.timestampMs}-${index}`}>
                <Line stroke={color} strokeWidth={1} x1={x} x2={x} y1={yHigh} y2={yLow} />
                <Rect
                  fill={color}
                  height={Math.max(Math.abs(yClose - yOpen), 1)}
                  width={slot.width}
                  x={slot.x}
                  y={Math.min(yOpen, yClose)}
                />
              </G>
            )
          })}
          <Line
            stroke={colors.activeLine}
            strokeDasharray="4 4"
            strokeWidth={1}
            x1={0}
            x2={plotWidth}
            y1={yActive}
            y2={yActive}
          />
          <SvgText fill={colors.activeLine} fontSize={10} fontWeight="600" x={4} y={yActive - 4}>
            {formatTokenPrice(activeBin.price)}
          </SvgText>
          <AnimatedRect
            animatedProps={bandProps}
            fill={colors.band}
            fillOpacity={colors.bandOpacity}
            width={plotWidth}
            x={0}
          />
          <AnimatedLine animatedProps={minLineProps} stroke={colors.handle} strokeWidth={2} x1={0} x2={plotWidth} />
          <AnimatedLine animatedProps={maxLineProps} stroke={colors.handle} strokeWidth={2} x1={0} x2={plotWidth} />
          <AnimatedRect
            animatedProps={minGripProps}
            fill={colors.handle}
            height={GRIP_HEIGHT}
            rx={4}
            width={GRIP_WIDTH}
            x={plotWidth - GRIP_WIDTH}
          />
          <AnimatedRect
            animatedProps={maxGripProps}
            fill={colors.handle}
            height={GRIP_HEIGHT}
            rx={4}
            width={GRIP_WIDTH}
            x={plotWidth - GRIP_WIDTH}
          />
          <SvgText fill={colors.handleText} fontSize={10} x={6} y={yOfBin(range.maxBinId) - 4}>
            {maxPriceText}
          </SvgText>
          <SvgText fill={colors.handleText} fontSize={10} x={6} y={yOfBin(range.minBinId) + 12}>
            {minPriceText}
          </SvgText>
          {bars.map((bar) => (
            <Rect
              fill={
                bar.binId > activeBin.binId
                  ? colors.profileX
                  : bar.binId < activeBin.binId
                    ? colors.profileY
                    : colors.band
              }
              fillOpacity={0.6}
              height={bar.height}
              key={bar.binId}
              width={Math.max(bar.length, 1)}
              x={width - Math.max(bar.length, 1)}
              y={bar.y}
            />
          ))}
        </Svg>
        <GestureDetector gesture={minGesture}>
          <Animated.View
            accessibilityLabel="Drag minimum price handle"
            accessible
            pointerEvents={disabled ? 'none' : 'auto'}
            style={[HIT_BASE_STYLE, minHitStyle]}
          />
        </GestureDetector>
        <GestureDetector gesture={maxGesture}>
          <Animated.View
            accessibilityLabel="Drag maximum price handle"
            accessible
            pointerEvents={disabled ? 'none' : 'auto'}
            style={[HIT_BASE_STYLE, maxHitStyle]}
          />
        </GestureDetector>
      </View>
      {candles === null ? (
        <Text className="text-muted text-xs">Loading price history…</Text>
      ) : candles.length === 0 ? (
        <Text className="text-muted text-xs">No price history for this pool</Text>
      ) : null}
    </View>
  )
}
