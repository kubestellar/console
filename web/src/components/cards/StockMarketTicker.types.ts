/**
 * Type definitions for StockMarketTicker component
 */

export interface StockSearchResult {
  symbol: string
  name: string
  type: string
  region: string
  currency: string
}

export interface YahooSearchQuote {
  symbol: string
  longname?: string
  shortname?: string
  quoteType: string
  exchDisp?: string
  exchange?: string
  currency?: string
}

export interface SavedStock {
  symbol: string
  name: string
  price: number
  changePercent: number
  favorite?: boolean
}

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

export interface StockMarketTickerConfig {
  symbols?: string[]
  refreshInterval?: number // in seconds
  dataSource?: string
}

export interface StockMarketTickerProps {
  config?: StockMarketTickerConfig
}

export type SortByOption = 'symbol' | 'price' | 'change' | 'volume' | 'marketCap'
