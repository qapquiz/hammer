# Cluster settings

Settings > Cluster manages the Solana RPC target: four clusters (Devnet, Testnet, Localhost,
Mainnet) with Active/Ready/Disabled status chips, an RPC URL editor (`Update URL`), and
`Reset to Default`. State persists across reloads in localStorage (react-native-mmkv on web).

## Sub-features

- `cluster-view` lists all four clusters with URL text and status chips; active cluster has an
  `Active` chip, URL-less clusters show `No RPC URL configured.` and a `Disabled` chip.
- `cluster-select` tapping an **enabled** row switches the active cluster (chip moves).
- `cluster-edit-url` selecting any row loads its URL into the `RPC URL` textbox; `Update URL`
  saves it, shows `<Label> URL updated.`, and flips a Disabled cluster to `Ready`.
- `cluster-persist` the saved config lands in localStorage and survives a page reload.
- `cluster-reset` `Reset to Default` restores default URLs, shows a reset status, and persists.

## How to get to it (user POV)

- Tabs: `Settings` → `Cluster` card. Direct route: `/settings/cluster`.
- A cluster dropdown also lives in the Wallet tab header (combobox, shows e.g. `Devnet`).

## Driving it with agent-browser

Preconditions:

- Instance healthy; app rendered; note the localStorage value before mutating:
  `agent-browser eval --stdin` with `localStorage.getItem('hammer\\wallet-ui:cluster')`.

- **Open the page.** Click the `Settings` tab ref, then the `Cluster` card link ref. Snapshot shows
  rows `Devnet … Active`, `Testnet … Ready`, `Localhost … Disabled`, `Mainnet … Disabled` and a
  `RPC URL` textbox. Screenshot `cluster-before.png`.
- **Select a disabled cluster.** Click the `Localhost` row — the textbox empties (no URL yet).
- **Edit and save.** Run `agent-browser fill @<textbox-ref> "http://127.0.0.1:8899"`, click
  `Update URL`. Assert the status text `Localhost URL updated.` and the Localhost row now reads
  `Ready` with the new URL. Screenshot `cluster-updated.png`.
- **Prove persistence.** Run the localStorage eval again — the JSON for `solana:localnet` must
  equal `http://127.0.0.1:8899`. Then `agent-browser open http://localhost:<port>/settings/cluster`
  (reload) and re-snapshot: the Localhost row still shows the saved URL.
- **Reset.** Click `Reset to Default`; assert status `Cluster settings reset to default.` and that
  localStorage shows the empty localnet URL again. Screenshot `cluster-reset.png`.
- **Proof.** Pair every rendered change with the localStorage dump — pixels alone are not proof.

## Gotchas

- The storage key contains a **backslash**: `hammer\wallet-ui:cluster`. In JS write it as
  `'hammer\\wallet-ui:cluster'`.
- Selecting an enabled row also switches the active cluster; selecting a Disabled row only loads
  it into the editor. Editing Mainnet/Localhost with an empty URL is allowed (row stays Disabled)
  — assert chip text, not assumptions.
- `Update URL` with every cluster disabled throws (`At least one cluster must have an RPC URL.`)
  surfaced as the inline status text — valid negative test, but restore state afterwards.
- Apply the LogBox neutralizer before clicking rows; the colorKit console error re-shows it.
