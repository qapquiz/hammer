export function formatUsdCompact(value: number): string {
  if (value >= 1_000_000_000) {
    return `$${(value / 1_000_000_000).toFixed(2)}B`
  }
  if (value >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(2)}M`
  }
  if (value >= 1_000) {
    return `$${(value / 1_000).toFixed(1)}K`
  }
  return `$${value.toFixed(2)}`
}

export function formatPercentFraction(fraction: number): string {
  return `${(fraction * 100).toFixed(2)}%`
}

export function formatTokenPrice(price: number): string {
  if (price >= 1_000) {
    return price.toFixed(0)
  }
  if (price >= 1) {
    return price.toFixed(2)
  }
  return price.toPrecision(4)
}

/** Base units → human token string, BigInt end to end: no float precision loss. */
export function formatBaseUnits(amount: bigint | string, decimals: number): string {
  const value = typeof amount === 'bigint' ? amount : BigInt(amount)
  const negative = value < 0n
  const digits = (negative ? -value : value).toString().padStart(decimals + 1, '0')
  const split = digits.length - decimals
  const whole = digits.slice(0, split)
  const fraction = decimals > 0 ? digits.slice(split).replace(/0+$/, '') : ''
  const text = fraction ? `${whole}.${fraction}` : whole
  return negative ? `-${text}` : text
}
