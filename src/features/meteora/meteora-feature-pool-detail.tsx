import { getExplorerUrl, useMobileWallet, type Account } from '@wallet-ui/react-native-kit'
import { Alert } from 'heroui-native/alert'
import { Card } from 'heroui-native/card'
import { Chip } from 'heroui-native/chip'
import { ActivityIndicator, Linking, Pressable, Text, View } from 'react-native'
import { useMemo, useState } from 'react'
import type { Address } from '@solana/kit'

import { useAppCluster } from '@/features/cluster/data-access/cluster-provider'
import { ShellUiPage } from '@/features/shell/ui/shell-ui-page'
import { WalletUiConnectButton } from '@/features/wallet/ui/wallet-ui-connect-button'

import { isDlmmClusterSupported, type MeteoraPositionDraft, type MeteoraPool } from './data-access/meteora-types'
import { useMeteoraActiveBin } from './data-access/use-meteora-active-bin'
import { useMeteoraCreatePosition } from './data-access/use-meteora-create-position'
import { useMeteoraPool } from './data-access/use-meteora-pool'
import { useMeteoraPositionActions } from './data-access/use-meteora-position-actions'
import { useMeteoraPositions } from './data-access/use-meteora-positions'
import { useMeteoraRentQuote } from './data-access/use-meteora-rent-quote'
import { MeteoraUiFlowStatus } from './ui/meteora-ui-flow-status'
import { MeteoraUiPositionForm } from './ui/meteora-ui-position-form'
import { MeteoraUiPositionFlowStatus } from './ui/meteora-ui-position-flow-status'
import { MeteoraUiPositionManager } from './ui/meteora-ui-position-manager'
import { MeteoraUiPositionsList } from './ui/meteora-ui-positions-list'
import { formatPercentFraction, formatTokenPrice, formatUsdCompact } from './util/meteora-format'
import { derivePresetPreview, validatePositionDraft } from './util/meteora-position'

const EMPTY_DRAFT = { presetId: 'spot-narrow' as const, amountX: '', amountY: '' }

export function MeteoraFeaturePoolDetail({ poolAddress }: { poolAddress: Address }) {
  const { cluster } = useAppCluster()
  const wallet = useMobileWallet()
  const pool = useMeteoraPool(poolAddress)
  const mainnet = isDlmmClusterSupported(cluster.id)

  return (
    <ShellUiPage>
      {pool.isPending ? <ActivityIndicator /> : null}
      {pool.isError ? <Text className="text-danger">{pool.error.message}</Text> : null}
      {pool.data ? <PoolSummary pool={pool.data} /> : null}
      {!mainnet ? <MainnetOnlyBanner /> : null}
      {pool.data && mainnet ? (
        <CreatePositionSection account={wallet.account} connect={wallet.connect} pool={pool.data} />
      ) : null}
      {pool.data && mainnet && wallet.account ? <PositionsSection account={wallet.account} pool={pool.data} /> : null}
    </ShellUiPage>
  )
}

function PoolSummary({ pool }: { pool: MeteoraPool }) {
  const { cluster } = useAppCluster()
  const explorerUrl = getExplorerUrl({
    network: { id: cluster.id, url: cluster.url },
    path: `/address/${pool.address}`,
    provider: 'solana',
  })

  return (
    <Card className="w-full gap-3 p-4">
      <View className="flex-row items-center gap-2">
        <Card.Title className="flex-1 text-xl font-bold">{pool.name}</Card.Title>
        <Chip size="sm" variant="soft">
          {pool.binStep} bps
        </Chip>
      </View>
      <View className="flex-row flex-wrap gap-1">
        {pool.tokenX.isVerified ? (
          <Chip size="sm" variant="secondary">
            {pool.tokenX.symbol}
          </Chip>
        ) : null}
        {pool.tokenY.isVerified ? (
          <Chip size="sm" variant="secondary">
            {pool.tokenY.symbol}
          </Chip>
        ) : null}
      </View>
      <View className="gap-1">
        <SummaryStat label="Price" value={`$${formatTokenPrice(pool.currentPrice)}`} />
        <SummaryStat label="TVL" value={formatUsdCompact(pool.tvlUsd)} />
        {pool.apr24h !== null ? <SummaryStat label="APR 24h" value={formatPercentFraction(pool.apr24h)} /> : null}
        <SummaryStat label="Volume 24h" value={formatUsdCompact(pool.volume24hUsd)} />
        <SummaryStat label="Fees 24h" value={formatUsdCompact(pool.fees24hUsd)} />
      </View>
      <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(explorerUrl)}>
        <Text className="text-blue-600 underline dark:text-blue-400">View pool on explorer</Text>
      </Pressable>
    </Card>
  )
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row justify-between">
      <Card.Description className="text-sm">{label}</Card.Description>
      <Card.Description className="text-sm font-semibold">{value}</Card.Description>
    </View>
  )
}

function MainnetOnlyBanner() {
  return (
    <Alert status="warning">
      <Alert.Title>Mainnet required</Alert.Title>
      <Alert.Description>
        Meteora pool data and position management only work on the Mainnet cluster. Switch clusters from the header.
      </Alert.Description>
    </Alert>
  )
}

function CreatePositionSection({
  account,
  connect,
  pool,
}: {
  account: ReturnType<typeof useMobileWallet>['account']
  connect: () => Promise<unknown>
  pool: MeteoraPool
}) {
  const { client } = useAppCluster()
  const [draft, setDraft] = useState<MeteoraPositionDraft>({ ...EMPTY_DRAFT, poolAddress: pool.address })

  const activeBin = useMeteoraActiveBin(pool.address, { enabled: !!account })
  const createPosition = useMeteoraCreatePosition({ account: account!, client, pool })

  const positionPreview = useMemo(
    () => (account && activeBin.data ? derivePresetPreview(draft, activeBin.data) : null),
    [account, activeBin.data, draft],
  )
  const rent = useMeteoraRentQuote(
    pool.address,
    positionPreview ? { minBinId: positionPreview.minBinId, maxBinId: positionPreview.maxBinId } : null,
    { enabled: !!account },
  )
  const draftIssue = useMemo(
    () => validatePositionDraft(draft, pool.tokenX.decimals, pool.tokenY.decimals),
    [draft, pool.tokenX.decimals, pool.tokenY.decimals],
  )

  if (!account) {
    return (
      <Card className="w-full gap-3 p-4">
        <Card.Body className="gap-3">
          <Card.Title className="text-lg font-bold">Connect to create a position</Card.Title>
          <Card.Description>Connect your wallet to provide liquidity on {pool.name}.</Card.Description>
          <WalletUiConnectButton connect={connect} size="lg">
            Connect Wallet
          </WalletUiConnectButton>
        </Card.Body>
      </Card>
    )
  }

  if (!activeBin.data) {
    return activeBin.isError ? (
      <Alert status="danger">
        <Alert.Title>Could not read pool state</Alert.Title>
        <Alert.Description>{activeBin.error.message}</Alert.Description>
      </Alert>
    ) : (
      <ActivityIndicator />
    )
  }

  return (
    <>
      <MeteoraUiPositionForm
        activeBin={activeBin.data}
        draft={draft}
        flow={createPosition.flow}
        onConfirm={createPosition.confirm}
        onDraftChange={setDraft}
        onPreview={() => void createPosition.preview(draft)}
        onReset={createPosition.reset}
        pool={pool}
        positionPreview={positionPreview}
        rentQuote={rent.data}
      />
      {draftIssue && createPosition.flow.status === 'idle' ? (
        <Text className="text-muted text-sm">{draftIssue}</Text>
      ) : null}
      <MeteoraUiFlowStatus flow={createPosition.flow} />
    </>
  )
}

function PositionsSection({ account, pool }: { account: Account; pool: MeteoraPool }) {
  const { client } = useAppCluster()
  const positions = useMeteoraPositions(pool.address, account.address)
  const actions = useMeteoraPositionActions({ account, client, pool })
  const [selectedAddress, setSelectedAddress] = useState<Address | null>(null)
  const selected = positions.data?.find((candidate) => candidate.address === selectedAddress) ?? null
  const flowActive =
    actions.flow.status === 'building' || actions.flow.status === 'signing' || actions.flow.status === 'confirming'

  return (
    <View className="gap-4">
      <MeteoraUiPositionsList
        error={positions.error}
        isError={positions.isError}
        isLoading={positions.isPending}
        onRefresh={() => void positions.refetch()}
        onSelect={(address) => {
          // Switching targets mid-flight would orphan the running flow under a new manager.
          if (!flowActive) {
            setSelectedAddress(address)
          }
        }}
        pool={pool}
        positions={positions.data}
        selectedAddress={selectedAddress}
      />
      {selected ? (
        <MeteoraUiPositionManager
          actions={actions}
          onDismiss={() => setSelectedAddress(null)}
          pool={pool}
          position={selected}
        />
      ) : null}
      {actions.flow.status !== 'idle' ? <MeteoraUiPositionFlowStatus flow={actions.flow} /> : null}
    </View>
  )
}
