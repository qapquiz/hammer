# hammer

This is an [Expo](https://expo.dev) development-client app template for Solana Mobile wallets. It uses
[@solana/kit](https://www.solanakit.com/) and [@wallet-ui/react-native-kit](https://wallet-ui.dev/) to connect to a
mobile wallet, read account state, and run example wallet actions.

## Technologies

- [@solana/kit](https://www.solanakit.com/)
- [@wallet-ui/react-native-kit](https://wallet-ui.dev/)
- [Expo](https://expo.dev)
- [HeroUI Native](https://heroui.com/docs/native)
- [Uniwind](https://uniwind.dev/) (Tailwind CSS for React Native)

## Included wallet flows

- Connect and disconnect a mobile wallet.
- Read the connected account balance and recent activity for the selected cluster.
- Sign a message with the connected account.
- Sign a memo transaction.
- Sign a Solana Sign-In payload.
- Sign and submit a memo transaction after checking the connected account can pay the transaction fee.

## Get started

1. Install dependencies.

   ```bash
   bun install
   ```

2. Build and run the Android development client.

   ```bash
   bun run android
   ```

This template depends on native modules and `expo-dev-client`, so use a development build instead of Expo Go.

3. Or run the web version for a fast UI iteration loop.

   ```bash
   bun run web
   ```

   The browser target is useful for validating UI and app-logic changes without rebuilding the native dev
   client. Mobile Wallet Adapter flows (connecting a wallet, signing) only work on Android, so expect those
   features to be unavailable in the browser. Cluster data is cached in `localStorage` on web.

You can start developing by editing the files inside the `src` directory. Expo Router routes live in `src/app`, and
feature code lives in `src/features`.

## Wallet and network notes

- Devnet and Testnet have default RPC URLs. Localhost and Mainnet are disabled until you add an RPC URL in
  Settings > Cluster.
- The app asks the selected mobile wallet to approve connection, message signing, sign-in, transaction signing, and
  transaction submission requests.
- The sign-and-send demo creates a Memo Program transaction with the text entered in the app. It checks the wallet
  balance for the estimated fee before submitting.

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Solana documentation](https://solana.com/docs): Learn how to build on Solana.
- [Solana Kit documentation](https://www.solanakit.com/): Learn how to use the JavaScript SDK for Solana.
- [Uniwind documentation](https://uniwind.dev/): Learn how to style your app with Tailwind CSS.
- [Wallet UI documentation](https://wallet-ui.dev/): Learn how to build wallet-enabled Solana apps on web and mobile.
