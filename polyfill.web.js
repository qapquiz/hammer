// Web polyfill. react-native-quick-crypto is a native-only Nitro module and browsers
// provide WebCrypto via globalThis.crypto for @solana/kit, but the DLMM SDK stack still
// needs Node's Buffer global.
import { installBufferPolyfill } from './polyfill-buffer'

installBufferPolyfill()
