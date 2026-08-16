import { FETCH_EXTERNAL_TIMEOUT_MS } from '../../lib/constants'
import type { TFunction } from 'i18next'
import type { StockData, StockSearchResult } from './StockMarketTicker.helpers'

interface YahooSearchQuote {
  symbol: string
  longname?: string
  shortname?: string
  quoteType: string
  exchDisp?: string
  exchange?: string
  currency?: string
}

interface YahooQuoteResponse {
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
  longName?: string
  shortName?: string
  symbol: string
}

const CORS_PROXY = 'https://corsproxy.io/?'
const PRICE_FLOOR_MULTIPLIER = 0.95
const MAX_VOLUME = 50_000_000
const MIN_VOLUME = 10_000_000
const MAX_MARKET_CAP = 1_000_000_000_000
const MIN_MARKET_CAP = 100_000_000_000

const COMMON_STOCKS: StockSearchResult[] = [
  { symbol: 'AAPL', name: 'Apple Inc.', type: 'EQUITY', region: 'US', currency: 'USD' },
  { symbol: 'GOOGL', name: 'Alphabet Inc.', type: 'EQUITY', region: 'US', currency: 'USD' },
  { symbol: 'MSFT', name: 'Microsoft Corporation', type: 'EQUITY', region: 'US', currency: 'USD' },
  { symbol: 'AMZN', name: 'Amazon.com Inc.', type: 'EQUITY', region: 'US', currency: 'USD' },
  { symbol: 'TSLA', name: 'Tesla Inc.', type: 'EQUITY', region: 'US', currency: 'USD' },
  { symbol: 'META', name: 'Meta Platforms Inc.', type: 'EQUITY', region: 'US', currency: 'USD' },
  { symbol: 'NVDA', name: 'NVIDIA Corporation', type: 'EQUITY', region: 'US', currency: 'USD' },
  { symbol: 'NFLX', name: 'Netflix Inc.', type: 'EQUITY', region: 'US', currency: 'USD' },
  { symbol: 'AMD', name: 'Advanced Micro Devices Inc.', type: 'EQUITY', region: 'US', currency: 'USD' },
  { symbol: 'INTC', name: 'Intel Corporation', type: 'EQUITY', region: 'US', currency: 'USD' },
]

export async function fetchRealStockData(symbols: string[]): Promise<StockData[]> {
  try {
    const yahooUrl = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbols.join(',')}&fields=symbol,longName,regularMarketPrice,regularMarketChange,regularMarketChangePercent,regularMarketOpen,regularMarketDayHigh,regularMarketDayLow,regularMarketVolume,marketCap,fiftyTwoWeekHigh,fiftyTwoWeekLow`
    const response = await fetch(`${CORS_PROXY}${encodeURIComponent(yahooUrl)}`, { signal: AbortSignal.timeout(FETCH_EXTERNAL_TIMEOUT_MS) })
    if (!response.ok) throw new Error('Failed to fetch stock data')
    const data = await response.json()
    return (data.quoteResponse?.result || []).map((quote: YahooQuoteResponse) => {
      const currentPrice = quote.regularMarketPrice || 0
      const change = quote.regularMarketChange || 0
      const openPrice = quote.regularMarketOpen || currentPrice
      const sparklineData: number[] = []
      const priceRange = Math.abs(change) * 2
      for (let i = 0; i < 21; i++) {
        const progress = i / 20
        const trendValue = openPrice + (change * progress)
        const noise = (Math.random() - 0.5) * (priceRange * 0.1)
        sparklineData.push(Math.max(trendValue + noise, openPrice * PRICE_FLOOR_MULTIPLIER))
      }
      return { symbol: quote.symbol || '', name: quote.longName || quote.shortName || quote.symbol || 'Unknown', price: currentPrice, change, changePercent: quote.regularMarketChangePercent || 0, dayOpen: openPrice, dayHigh: quote.regularMarketDayHigh || currentPrice, dayLow: quote.regularMarketDayLow || currentPrice, volume: quote.regularMarketVolume || 0, marketCap: quote.marketCap || 0, week52High: quote.fiftyTwoWeekHigh || currentPrice, week52Low: quote.fiftyTwoWeekLow || currentPrice, sparklineData, lastUpdated: new Date() }
    })
  } catch {
    return generateMockStockData(symbols)
  }
}

export async function searchStocks(query: string): Promise<StockSearchResult[]> {
  if (!query || query.length < 1) return []
  try {
    const yahooSearchUrl = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=10&newsCount=0`
    const response = await fetch(`${CORS_PROXY}${encodeURIComponent(yahooSearchUrl)}`, { signal: AbortSignal.timeout(FETCH_EXTERNAL_TIMEOUT_MS) })
    if (!response.ok) throw new Error('Failed to search stocks')
    const data = await response.json()
    return (data.quotes || []).filter((q: YahooSearchQuote) => q.quoteType === 'EQUITY' || q.quoteType === 'ETF').map((q: YahooSearchQuote) => ({ symbol: q.symbol, name: q.longname || q.shortname || q.symbol, type: q.quoteType, region: q.exchDisp || q.exchange || 'US', currency: q.currency || 'USD' })).slice(0, 10)
  } catch {
    const queryLower = query.toLowerCase()
    return COMMON_STOCKS.filter(stock => stock.symbol.toLowerCase().includes(queryLower) || stock.name.toLowerCase().includes(queryLower)).slice(0, 10)
  }
}

export function getMarketStatus(t: TFunction<['cards', 'common']>): { isOpen: boolean; statusText: string } {
  const now = new Date()
  const hour = now.getHours()
  const minutes = now.getMinutes()
  const day = now.getDay()
  if (day === 0 || day === 6) return { isOpen: false, statusText: t('stockMarket.marketClosedWeekend') }
  const isMarketHours = (hour === 9 && minutes >= 30) || (hour > 9 && hour < 16)
  if (isMarketHours) return { isOpen: true, statusText: t('stockMarket.marketOpen') }
  if (hour >= 4 && hour < 9) return { isOpen: false, statusText: t('stockMarket.preMarket') }
  return { isOpen: false, statusText: t('stockMarket.afterHours') }
}

export function generateMockStockData(symbols: string[]): StockData[] {
  const stockNames: Record<string, string> = { AAPL: 'Apple Inc.', GOOGL: 'Alphabet Inc.', MSFT: 'Microsoft Corporation', AMZN: 'Amazon.com Inc.', TSLA: 'Tesla Inc.', META: 'Meta Platforms Inc.', NVDA: 'NVIDIA Corporation', NFLX: 'Netflix Inc.', AMD: 'Advanced Micro Devices', INTC: 'Intel Corporation' }
  const basePrices: Record<string, number> = { AAPL: 175.5, GOOGL: 142.3, MSFT: 380.25, AMZN: 155.8, TSLA: 245.6, META: 385.4, NVDA: 495.3, NFLX: 485.2, AMD: 165.75, INTC: 45.3 }
  return symbols.map(symbol => {
    const basePrice = basePrices[symbol] || 100
    const seed = symbol.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
    const random = (offset: number) => { const x = Math.sin(seed + offset) * 10000; return x - Math.floor(x) }
    const changePercent = (random(1000) - 0.5) * 10
    const change = (basePrice * changePercent) / 100
    const price = basePrice + change
    const sparklineData: number[] = []
    let currentPrice = price - change
    for (let i = 0; i < 20; i++) {
      const variation = (random(2000 + i * 100) - 0.5) * (basePrice * 0.02)
      currentPrice = Math.max(currentPrice + variation, basePrice * PRICE_FLOOR_MULTIPLIER)
      sparklineData.push(currentPrice)
    }
    sparklineData.push(price)
    return { symbol, name: stockNames[symbol] || `${symbol} Company`, price, change, changePercent, dayOpen: basePrice - (change * 0.8), dayHigh: price + Math.abs(change * 0.5), dayLow: price - Math.abs(change * 0.5), volume: Math.floor(random(3000) * MAX_VOLUME) + MIN_VOLUME, marketCap: Math.floor(random(4000) * MAX_MARKET_CAP) + MIN_MARKET_CAP, week52High: price + (basePrice * 0.15), week52Low: price - (basePrice * 0.15), sparklineData, lastUpdated: new Date() }
  })
}
