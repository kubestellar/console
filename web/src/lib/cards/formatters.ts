const THROUGHPUT_LOCALE_MIN_FRACTION = 0

export function formatThroughput(value: number): string {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: THROUGHPUT_LOCALE_MIN_FRACTION,
  })
}
