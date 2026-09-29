// Shared Buffer/TypedArray glue for the DLMM SDK stack (web3.js, Anchor, bn.js all
// assume Node's Buffer global). Used by both platform polyfills.
import { Buffer } from 'buffer'

export function installBufferPolyfill() {
  global.Buffer = global.Buffer ?? Buffer

  // Hermes' %TypedArray%.prototype.subarray drops the Buffer prototype for the
  // buffer@5/@solana buffer copies (species construction fails for non-class
  // constructors), so anchors/layouts receive method-less Uint8Arrays. Restore
  // Buffer-ness on every subarray of a Buffer from any buffer package copy.
  const uint8Subarray = Uint8Array.prototype.subarray
  Object.defineProperty(Uint8Array.prototype, 'subarray', {
    value: function subarray(start, end) {
      const out = uint8Subarray.call(this, start, end)
      const ctor = this.constructor
      if (ctor && typeof ctor.isBuffer === 'function' && ctor.isBuffer(this)) {
        Object.setPrototypeOf(out, ctor.prototype)
      }
      return out
    },
    writable: true,
    configurable: true,
  })
}
