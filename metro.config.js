const { getDefaultConfig } = require('expo/metro-config')
const { withUniwindConfig } = require('uniwind/metro') // make sure this import exists
const path = require('path')

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname)

// Apply uniwind modifications before exporting
const uniwindConfig = withUniwindConfig(config, {
  // relative path to your global.css file
  cssEntryFile: './src/global.css',
  // optional: path to typings
  dtsFile: './src/uniwind-types.d.ts',
})

// Cache transforms per project; the machine-wide Metro cache can serve stale transforms from other projects.
uniwindConfig.cacheStores = ({ FileStore }) => [
  new FileStore({ root: path.join(__dirname, 'node_modules', '.cache', 'metro') }),
]

// Workaround for a Metro resolution bug: some directory-style subpath imports inside
// react-native-web (e.g. `./exports/InputAccessoryView`) fail to resolve even though the
// files exist on disk. Wrap uniwind's resolver (must stay active - it redirects
// react-native-web components to uniwind's className-aware implementations) and fall
// back to manual file-based resolution only when it throws.
const fs = require('fs')

const uniwindResolveRequest = uniwindConfig.resolver.resolveRequest

uniwindConfig.resolver.resolveRequest = (context, specifier, platform) => {
  try {
    return uniwindResolveRequest(context, specifier, platform)
  } catch (error) {
    const isResolutionError =
      error.candidates != null ||
      /Unable to resolve|could not be resolved|Failed to resolve|does not exist/i.test(String(error.message))
    if (!isResolutionError || !specifier.startsWith('.') || !context.originModulePath) throw error

    const absolute = path.resolve(path.dirname(context.originModulePath), specifier)
    const sourceExts = (context.sourceExts ?? ['js', 'jsx', 'json']).map((ext) => `.${ext}`)
    const candidates = [
      absolute,
      ...sourceExts.map((ext) => absolute + ext),
      ...sourceExts.map((ext) => path.join(absolute, `index${ext}`)),
    ]
    for (const candidate of candidates) {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        return { type: 'sourceFile', filePath: candidate }
      }
    }
    throw error
  }
}

// Resolve every 'buffer' require (including nested copies under @solana/*) to the root buffer
// copy so there is exactly one Buffer implementation in the bundle; multiple copies break
// cross-module instanceof and the subarray patch in polyfill.js. Installed OUTERMOST so the
// buffer pin runs before uniwind's resolver intercepts, and the web fallback above stays in
// the chain for react-native-web subpaths.
const uniwindOrWebFallbackResolveRequest = uniwindConfig.resolver.resolveRequest

uniwindConfig.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'buffer') {
    const next = { ...context, originPath: path.join(__dirname, 'package.json'), resolveRequest: undefined }
    return context.resolveRequest(next, 'buffer', platform)
  }
  return uniwindOrWebFallbackResolveRequest(context, moduleName, platform)
}

module.exports = uniwindConfig
