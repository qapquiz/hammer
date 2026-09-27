// Throwaway prototype entry. Not production code.
import { runGate } from './dlmm-gate'

runGate()
  .then((steps) => {
    for (const s of steps) console.log(`GATE ${s.step} ${s.ok ? 'OK' : 'FAIL'} ${s.detail ?? s.error}`)
    console.log('GATE DONE')
  })
  .catch((e) => console.log('GATE FATAL ' + String(e)))
