import { Button } from 'heroui-native/button'
import { Card } from 'heroui-native/card'
import { Input } from 'heroui-native/input'
import { View } from 'react-native'

import { formatTokenPrice } from '../util/meteora-format'
import type {
  MeteoraActiveBin,
  MeteoraBinRange,
  MeteoraCandle,
  MeteoraCreatePositionFlow,
  MeteoraPool,
  MeteoraPositionDraft,
  MeteoraPositionPreview,
  MeteoraRentQuote,
  MeteoraStrategyPreset,
  MeteoraStrategyType,
} from '../data-access/meteora-types'
import { METEORA_STRATEGY_PRESETS } from '../data-access/meteora-types'
import type { MeteoraBinWeight } from '../util/meteora-liquidity-shape'
import { draftFromPreset } from '../util/meteora-position'
import { MeteoraUiPriceChart } from './meteora-ui-price-chart'

const STRATEGY_LABELS: readonly { strategyType: MeteoraStrategyType; label: string }[] = [
  { strategyType: 'spot', label: 'Spot' },
  { strategyType: 'bidAsk', label: 'Bid-Ask' },
]

/** Presets are macros, not state: a chip is "selected" while the draft still matches its width + strategy. */
function matchesPreset(draft: MeteoraPositionDraft, preset: MeteoraStrategyPreset): boolean {
  return draft.strategyType === preset.strategyType && (draft.maxBinId - draft.minBinId) / 2 === preset.binsPerSide
}

export function MeteoraUiPositionForm({
  activeBin,
  candles,
  candlesError,
  draft,
  flow,
  onConfirm,
  onDraftChange,
  onPreview,
  onRangeChange,
  onReset,
  pool,
  positionPreview,
  rentQuote,
  shape,
}: {
  activeBin: MeteoraActiveBin | undefined
  candles: readonly MeteoraCandle[] | null
  candlesError?: string | null
  draft: MeteoraPositionDraft
  flow: MeteoraCreatePositionFlow
  onConfirm: () => void
  onDraftChange: (draft: MeteoraPositionDraft) => void
  onPreview: () => void
  onRangeChange: (range: MeteoraBinRange) => void
  onReset: () => void
  pool: MeteoraPool
  positionPreview: MeteoraPositionPreview | null
  rentQuote: MeteoraRentQuote | undefined
  shape: readonly MeteoraBinWeight[]
}) {
  const inFlight =
    flow.status === 'previewing' ||
    flow.status === 'building' ||
    flow.status === 'signing' ||
    flow.status === 'confirming'
  const canConfirm =
    flow.status === 'previewed' || flow.status === 'dismissed' || (flow.status === 'failed' && flow.plan !== null)
  const canPreview = !inFlight && flow.status !== 'previewed'

  return (
    <Card className="w-full gap-4 p-4">
      <Card.Body className="gap-4">
        <View className="gap-1">
          <Card.Title className="text-xl font-bold">Create position</Card.Title>
          <Card.Description className="leading-relaxed">
            Pick a strategy, enter amounts, and confirm to sign in your wallet.
          </Card.Description>
        </View>

        <View className="flex-row flex-wrap gap-2">
          {METEORA_STRATEGY_PRESETS.map((preset) => (
            <Button
              key={preset.id}
              isDisabled={!activeBin || inFlight}
              size="sm"
              variant={activeBin && matchesPreset(draft, preset) ? 'primary' : 'outline'}
              onPress={() => {
                if (!activeBin) {
                  return
                }
                const presetDraft = draftFromPreset({ poolAddress: draft.poolAddress, presetId: preset.id, activeBin })
                onDraftChange({
                  ...draft,
                  minBinId: presetDraft.minBinId,
                  maxBinId: presetDraft.maxBinId,
                  strategyType: presetDraft.strategyType,
                })
              }}
            >
              {preset.label}
            </Button>
          ))}
        </View>
        <Card.Description>
          {(activeBin && METEORA_STRATEGY_PRESETS.find((preset) => matchesPreset(draft, preset))?.description) ??
            'Custom range — drag the chart handles or tap a preset.'}
        </Card.Description>

        <View className="flex-row items-center gap-2">
          <Card.Description className="text-sm">Strategy</Card.Description>
          {STRATEGY_LABELS.map(({ strategyType, label }) => (
            <Button
              isDisabled={inFlight}
              key={strategyType}
              size="sm"
              variant={draft.strategyType === strategyType ? 'primary' : 'secondary'}
              onPress={() => onDraftChange({ ...draft, strategyType })}
            >
              {label}
            </Button>
          ))}
        </View>

        {activeBin ? (
          <MeteoraUiPriceChart
            activeBin={activeBin}
            candles={candles}
            disabled={inFlight}
            onRangeChange={onRangeChange}
            range={{ minBinId: draft.minBinId, maxBinId: draft.maxBinId }}
            shape={shape}
          />
        ) : null}
        {candlesError && (candles === null || candles.length === 0) ? (
          <Card.Description className="text-danger">Price history unavailable: {candlesError}</Card.Description>
        ) : null}

        <View className="gap-2">
          <Input
            autoCapitalize="none"
            editable={!inFlight}
            inputMode="decimal"
            keyboardType="decimal-pad"
            onChangeText={(amountX) => onDraftChange({ ...draft, amountX })}
            placeholder={`Amount ${pool.tokenX.symbol}`}
            value={draft.amountX}
          />
          <Input
            autoCapitalize="none"
            editable={!inFlight}
            inputMode="decimal"
            keyboardType="decimal-pad"
            onChangeText={(amountY) => onDraftChange({ ...draft, amountY })}
            placeholder={`Amount ${pool.tokenY.symbol}`}
            value={draft.amountY}
          />
        </View>

        {positionPreview && activeBin ? (
          <View className="gap-1 rounded-xl bg-content2 p-3">
            <FormStat label="Bin range" value={`${positionPreview.minBinId} → ${positionPreview.maxBinId}`} />
            <FormStat label="Bins" value={String(positionPreview.binCount)} />
            <FormStat
              label="Price range"
              value={`${formatTokenPrice(positionPreview.minPrice)} → ${formatTokenPrice(positionPreview.maxPrice)}`}
            />
            <FormStat label="Est. rent" value={rentQuote ? `${rentQuote.totalSol.toFixed(4)} SOL` : '…'} />
          </View>
        ) : null}

        <View className="gap-2">
          {canPreview ? (
            <Button isDisabled={!activeBin} variant="primary" onPress={onPreview}>
              Preview position
            </Button>
          ) : null}
          {canConfirm ? (
            <Button onPress={onConfirm}>{flow.status === 'previewed' ? 'Confirm position' : 'Try again'}</Button>
          ) : null}
          {flow.status === 'building' ? <Button isDisabled>Building transaction…</Button> : null}
          {flow.status === 'signing' ? <Button isDisabled>Check your wallet…</Button> : null}
          {flow.status === 'confirming' ? <Button isDisabled>Confirming transactions…</Button> : null}
          {flow.status !== 'idle' ? (
            <Button isDisabled={inFlight} variant="ghost" onPress={onReset}>
              Start over
            </Button>
          ) : null}
        </View>
      </Card.Body>
    </Card>
  )
}

function FormStat({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row justify-between">
      <Card.Description className="text-sm">{label}</Card.Description>
      <Card.Description className="text-sm font-semibold">{value}</Card.Description>
    </View>
  )
}
