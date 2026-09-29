// Minimal ambient types for bun:test. The repo does not depend on bun-types, but the
// Meteora unit tests run under `bun test` and must typecheck under `bunx tsc --noEmit`.
declare module 'bun:test' {
  export interface ExpectStatic {
    toBe(expected: unknown): void
    toEqual(expected: unknown): void
    toBeNull(): void
    toThrow(expected?: string | RegExp): void
    toBeCloseTo(expected: number, precision?: number): void
    not: ExpectStatic
  }

  export function expect(actual: unknown): ExpectStatic
  export function describe(name: string, factory: () => void): void
  export function test(name: string, fn: () => void | Promise<void>): void
  export function it(name: string, fn: () => void | Promise<void>): void
}
