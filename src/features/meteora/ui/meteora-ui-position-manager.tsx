import { Button } from 'heroui-native/button'
import { Card } from 'heroui-native/card'
import { Input } from 'heroui-native/input'
import { Text, View } from 'react-native'
import { useState } from 'react'

import {
  meteoraPositionHasLiquidity,
  meteoraPositionHasPendingRewards,
  type MeteoraDepositDraft,
  type MeteoraPool,
  type MeteoraPosition,
} from '../data-access/meteora-types'
import type { useMeteoraPositionActions } from '../data-access/use-meteora-position-actions'
import { formatBaseUnits } from '../util/meteora-format'

type ManageMode = 'deposit' | 'withdraw' | 'close'

type PositionActions = ReturnType<typeof useMeteoraPositionActions>

const WITHDRAW_PRESETS = [25, 50, 75, 100] as const

type DepositAmounts = Pick<MeteoraDepositDraft, 'amountX' | 'amountY'>

export function MeteoraUiPositionManager({
  actions,
  onDismiss,
  pool,
  position,
}: {
  actions: PositionActions
  onDismiss: () => void
  pool: MeteoraPool
  position: MeteoraPosition
}) {
  const [mode, setMode] = useState<ManageMode>('deposit')
  const [amounts, setAmounts] = useState<DepositAmounts>({ amountX: '', amountY: '' })
  const [percent, setPercent] = useState<number>(100)

  const flow = actions.flow
  const inFlight = flow.status === 'building' || flow.status === 'signing' || flow.status === 'confirming'
  const canAct =
    flow.status === 'idle' || flow.status === 'failed' || flow.status === 'dismissed' || flow.status === 'confirmed'
  const hasLiquidity = meteoraPositionHasLiquidity(position)

  const submitDeposit = () => {
    if (!canAct) {
      return
    }
    actions.deposit({ poolAddress: pool.address, positionAddress: position.address, ...amounts }, position)
  }
  const submitWithdraw = () => {
    if (!canAct) {
      return
    }
    actions.withdraw(percent, position)
  }
  const submitClose = () => {
    if (!canAct) {
      return
    }
    actions.close(position)
  }

  return (
    <Card className="w-full gap-4 p-4">
      <Card.Body className="gap-4">
        <View className="flex-row items-center justify-between">
          <Card.Title className="text-lg font-bold">Manage position</Card.Title>
          <Button isDisabled={inFlight} size="sm" variant="ghost" onPress={onDismiss}>
            Back
          </Button>
        </View>

        <View className="gap-1 rounded-xl bg-content2 p-3">
          <ManagerStat label="Bin range" value={`${position.lowerBinId} → ${position.upperBinId}`} />
          <ManagerStat
            label="Liquidity"
            value={
              hasLiquidity
                ? `${formatBaseUnits(position.amountXBaseUnits, pool.tokenX.decimals)} ${pool.tokenX.symbol} · ${formatBaseUnits(position.amountYBaseUnits, pool.tokenY.decimals)} ${pool.tokenY.symbol}`
                : 'Empty'
            }
          />
          {position.feeXBaseUnits > 0n || position.feeYBaseUnits > 0n ? (
            <ManagerStat
              label="Claimable fees"
              value={`${formatBaseUnits(position.feeXBaseUnits, pool.tokenX.decimals)} ${pool.tokenX.symbol} · ${formatBaseUnits(position.feeYBaseUnits, pool.tokenY.decimals)} ${pool.tokenY.symbol}`}
            />
          ) : null}
        </View>

        <View className="flex-row flex-wrap gap-2">
          {(['deposit', 'withdraw', 'close'] as const).map((candidate) => (
            <Button
              key={candidate}
              isDisabled={inFlight}
              size="sm"
              variant={mode === candidate ? 'primary' : 'outline'}
              onPress={() => setMode(candidate)}
            >
              {candidate[0]!.toUpperCase() + candidate.slice(1)}
            </Button>
          ))}
        </View>

        {mode === 'deposit' ? (
          <View className="gap-2">
            <Card.Description className="leading-relaxed">
              Deposits spread evenly across the existing bin range of the position. Bins above the active price accept
              {` ${pool.tokenX.symbol} `}
              only; bins below accept {` ${pool.tokenY.symbol} `} only.
            </Card.Description>
            <Input
              autoCapitalize="none"
              editable={!inFlight}
              inputMode="decimal"
              keyboardType="decimal-pad"
              onChangeText={(amountX) => setAmounts({ ...amounts, amountX })}
              placeholder={`Amount ${pool.tokenX.symbol}`}
              value={amounts.amountX}
            />
            <Input
              autoCapitalize="none"
              editable={!inFlight}
              inputMode="decimal"
              keyboardType="decimal-pad"
              onChangeText={(amountY) => setAmounts({ ...amounts, amountY })}
              placeholder={`Amount ${pool.tokenY.symbol}`}
              value={amounts.amountY}
            />
            <Button isDisabled={inFlight} variant="primary" onPress={submitDeposit}>
              Deposit
            </Button>
          </View>
        ) : null}

        {mode === 'withdraw' ? (
          <View className="gap-2">
            <Card.Description className="leading-relaxed">
              Removes a share of the liquidity from every bin. Withdrawing does not claim swap fees — closing does.
            </Card.Description>
            <View className="flex-row flex-wrap gap-2">
              {WITHDRAW_PRESETS.map((preset) => (
                <Button
                  key={preset}
                  isDisabled={inFlight}
                  size="sm"
                  variant={percent === preset ? 'primary' : 'outline'}
                  onPress={() => setPercent(preset)}
                >
                  {preset}%
                </Button>
              ))}
            </View>
            <Button
              isDisabled={inFlight || !hasLiquidity}
              variant={percent === 100 ? 'danger' : 'primary'}
              onPress={submitWithdraw}
            >
              {hasLiquidity ? `Withdraw ${percent}%` : 'Nothing to withdraw'}
            </Button>
          </View>
        ) : null}

        {mode === 'close' ? (
          <View className="gap-2">
            <Card.Description className="leading-relaxed">
              Closing reclaims the rent of the position. Any pending swap fees are claimed first; the position must be
              empty.
            </Card.Description>
            {meteoraPositionHasPendingRewards(position) ? (
              <Text className="text-warning text-sm">
                This position has pending farm rewards. Claim them before closing, or the rewards are lost.
              </Text>
            ) : null}
            <Button isDisabled={inFlight || hasLiquidity} variant="danger" onPress={submitClose}>
              {hasLiquidity ? 'Withdraw liquidity first' : 'Close position'}
            </Button>
          </View>
        ) : null}

        {flow.status !== 'idle' ? (
          <Button isDisabled={inFlight} variant="ghost" onPress={actions.reset}>
            {flow.status === 'confirmed' ? 'Done' : 'Start over'}
          </Button>
        ) : null}
      </Card.Body>
    </Card>
  )
}

function ManagerStat({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row justify-between gap-2">
      <Card.Description className="text-sm">{label}</Card.Description>
      <Card.Description className="flex-1 text-right text-sm font-semibold">{value}</Card.Description>
    </View>
  )
}
