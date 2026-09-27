const { getDefaultConfig } = require('expo/metro-config')
const { withUniwindConfig } = require('uniwind/metro') // make sure this import exists
const path = require('path')

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname)

// Resolve every 'buffer' require (including nested copies under @solana/*) to
// the root buffer copy so there is exactly one Buffer implementation in the
// bundle; multiple copies break cross-module instanceof and polyfill patches.
// Installed BEFORE withUniwindConfig so uniwind wraps this resolver (its CSS
// interception must stay in the chain, so this must not replace it).
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'buffer') {
    const next = { ...context, originPath: path.join(__dirname, 'package.json'), resolveRequest: undefined }
    return context.resolveRequest(next, 'buffer', platform)
  }
  return context.resolveRequest(context, moduleName, platform)
}

// Apply uniwind modifications before exporting
const uniwindConfig = withUniwindConfig(config, {
  // relative path to your global.css file
  cssEntryFile: './src/global.css',
  // optional: path to typings
  dtsFile: './src/uniwind-types.d.ts',
})

// Resolve every 'buffer' require (including nested copies under @solana/*) to
// the root buffer copy so there is exactly one Buffer implementation in the
// bundle; multiple copies break cross-module instanceof and polyfill patches.
uniwindConfig.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'buffer') {
    const next = { ...context, originPath: path.join(__dirname, 'package.json'), resolveRequest: undefined }
    return context.resolveRequest(next, 'buffer', platform)
  }
  return context.resolveRequest(context, moduleName, platform)
}

// Cache transforms per project; the machine-wide Metro cache can serve stale transforms from other projects.
uniwindConfig.cacheStores = ({ FileStore }) => [
  new FileStore({ root: path.join(__dirname, 'node_modules', '.cache', 'metro') }),
]

module.exports = uniwindConfig
