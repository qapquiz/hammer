import { Button } from 'heroui-native/button'
import { Card } from 'heroui-native/card'
import { Input } from 'heroui-native/input'
import { View } from 'react-native'

import { formatTokenPrice } from '../util/meteora-format'
import type {
  MeteoraActiveBin,
  MeteoraCreatePositionFlow,
  MeteoraPool,
  MeteoraPositionDraft,
  MeteoraPositionPreview,
  MeteoraRentQuote,
} from '../data-access/meteora-types'
import { METEORA_STRATEGY_PRESETS } from '../data-access/meteora-types'

export function MeteoraUiPositionForm({
  activeBin,
  draft,
  flow,
  onConfirm,
  onDraftChange,
  onPreview,
  onReset,
  pool,
  positionPreview,
  rentQuote,
}: {
  activeBin: MeteoraActiveBin | undefined
  draft: MeteoraPositionDraft
  flow: MeteoraCreatePositionFlow
  onConfirm: () => void
  onDraftChange: (draft: MeteoraPositionDraft) => void
  onPreview: () => void
  onReset: () => void
  pool: MeteoraPool
  positionPreview: MeteoraPositionPreview | null
  rentQuote: MeteoraRentQuote | undefined
}) {
  const inFlight = flow.status === 'previewing' || flow.status === 'building' || flow.status === 'signing'
  const canConfirm =
    flow.status === 'preview' || flow.status === 'dismissed' || (flow.status === 'failed' && flow.plan !== null)
  const canPreview = !inFlight && flow.status !== 'preview'

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
          {METEORA_STRATEGY_PRESETS.map((preset) => {
            const selected = draft.presetId === preset.id
            return (
              <Button
                key={preset.id}
                size="sm"
                variant={selected ? 'primary' : 'outline'}
                onPress={() => onDraftChange({ ...draft, presetId: preset.id })}
              >
                {preset.label}
              </Button>
            )
          })}
        </View>
        <Card.Description>
          {METEORA_STRATEGY_PRESETS.find((preset) => preset.id === draft.presetId)?.description}
        </Card.Description>

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
            <Button onPress={onConfirm}>{flow.status === 'preview' ? 'Confirm position' : 'Try again'}</Button>
          ) : null}
          {flow.status === 'building' ? <Button isDisabled>Building transaction…</Button> : null}
          {flow.status === 'signing' ? <Button isDisabled>Check your wallet…</Button> : null}
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
