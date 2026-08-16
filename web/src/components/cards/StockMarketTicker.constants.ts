/**
 * Constants for StockMarketTicker component
 */

import { commonComparators } from '../../lib/cards/cardHooks'
import type { SortByOption, StockData } from './StockMarketTicker.types'

export const SEARCH_DEBOUNCE_MS = 300
export const SAVED_STOCKS_STORAGE_KEY = 'stock-ticker-saved-stocks'
export const CORS_PROXY = 'https://corsproxy.io/?'

export const SORT_OPTIONS = [
  { value: 'symbol' as const, label: 'Name' },
  { value: 'price' as const, label: 'Price' },
  { value: 'change' as const, label: 'Change %' },
  { value: 'volume' as const, label: 'Volume' },
  { value: 'marketCap' as const, label: 'Market Cap' },
]

export const SORT_COMPARATORS: Record<SortByOption, (a: StockData, b: StockData) => number> = {
  symbol: commonComparators.string<StockData>('symbol'),
  price: commonComparators.number<StockData>('price'),
  change: commonComparators.number<StockData>('changePercent'),
  volume: commonComparators.number<StockData>('volume'),
  marketCap: commonComparators.number<StockData>('marketCap'),
}

export const DEFAULT_SYMBOLS = ['AAPL', 'GOOGL', 'MSFT', 'AMZN', 'TSLA', 'META', 'NVDA']
