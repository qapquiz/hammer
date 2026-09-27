/** USD formatters for datapi values; pure display math. */
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

/** Fraction (0.05 = 5%) to a percent string. */
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
