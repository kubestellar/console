// Stock search result interface
export interface StockSearchResult {
  symbol: string
  name: string
  type: string
  region: string
  currency: string
}

// Raw search result from Yahoo Finance API
export interface YahooSearchQuote {
  symbol: string
  longname?: string
  shortname?: string
  quoteType: string
  exchDisp?: string
  exchange?: string
  currency?: string
}

// Saved stock interface
export interface SavedStock {
  symbol: string
  name: string
  price: number
  changePercent: number
  favorite?: boolean
}

// Stock data interface
export interface StockData {
  symbol: string
  name: string
  price: number
  change: number
  changePercent: number
  dayOpen: number
  dayHigh: number
  dayLow: number
  volume: number
  marketCap: number
  week52High: number
  week52Low: number
  sparklineData: number[]
  lastUpdated: Date
}

// Raw stock data from Yahoo Finance API
export interface YahooQuoteResponse {
  regularMarketPrice?: number
  regularMarketChange?: number
  regularMarketChangePercent?: number
  regularMarketOpen?: number
  regularMarketDayHigh?: number
  regularMarketDayLow?: number
  regularMarketVolume?: number
  marketCap?: number
  fiftyTwoWeekHigh?: number
  fiftyTwoWeekLow?: number
  displayName?: string
  longName?: string
  shortName?: string
  symbol: string
}

// Config interface
export interface StockMarketTickerConfig {
  symbols?: string[]
  refreshInterval?: number // in seconds
  dataSource?: string
}

export interface StockMarketTickerProps {
  config?: StockMarketTickerConfig
}

export type SortByOption = 'symbol' | 'price' | 'change' | 'volume' | 'marketCap'

// Default stock symbols to track
export const DEFAULT_SYMBOLS = ['AAPL', 'GOOGL', 'MSFT', 'AMZN', 'TSLA', 'META', 'NVDA']

export const SAVED_STOCKS_STORAGE_KEY = 'stock-ticker-saved-stocks'
export const SEARCH_DEBOUNCE_MS = 300
