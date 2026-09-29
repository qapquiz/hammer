// polyfill.js
import { install } from 'react-native-quick-crypto'
import { installBufferPolyfill } from './polyfill-buffer'

installBufferPolyfill()

install()
