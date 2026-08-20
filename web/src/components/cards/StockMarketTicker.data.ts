/**
 * Data fetching and generation helpers for StockMarketTicker component
 */

import type { TFunction } from 'i18next'
import { FETCH_EXTERNAL_TIMEOUT_MS } from '../../lib/constants'
import { CORS_PROXY } from './StockMarketTicker.constants'
import type { StockData, StockSearchResult, YahooQuoteResponse, YahooSearchQuote } from './StockMarketTicker.types'

// Fetch real stock data from Yahoo Finance API (via CORS proxy)
export async function fetchRealStockData(symbols: string[]): Promise<StockData[]> {
  try {
    const symbolsString = symbols.join(',')
    const yahooUrl = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbolsString}&fields=symbol,longName,regularMarketPrice,regularMarketChange,regularMarketChangePercent,regularMarketOpen,regularMarketDayHigh,regularMarketDayLow,regularMarketVolume,marketCap,fiftyTwoWeekHigh,fiftyTwoWeekLow`
    const response = await fetch(
      `${CORS_PROXY}${encodeURIComponent(yahooUrl)}`,
      { signal: AbortSignal.timeout(FETCH_EXTERNAL_TIMEOUT_MS) }
    )

    if (!response.ok) {
      throw new Error('Failed to fetch stock data')
    }

    const data = await response.json()
    const quotes = data.quoteResponse?.result || []

    return quotes.map((quote: YahooQuoteResponse) => {
      // Generate sparkline from recent price changes (mock for now, would need historical API)
      const currentPrice = quote.regularMarketPrice || 0
      const change = quote.regularMarketChange || 0
      const openPrice = quote.regularMarketOpen || currentPrice

      // Simple sparkline generation - in production would fetch intraday data
      const sparklineData: number[] = []
      const priceRange = Math.abs(change) * 2
      for (let i = 0; i < 21; i++) {
        const progress = i / 20
        const trendValue = openPrice + (change * progress)
        const noise = (Math.random() - 0.5) * (priceRange * 0.1)
        sparklineData.push(Math.max(trendValue + noise, openPrice * 0.95))
      }

      return {
        symbol: quote.symbol || '',
        name: quote.longName || quote.shortName || quote.symbol || 'Unknown',
        price: currentPrice,
        change: change,
        changePercent: quote.regularMarketChangePercent || 0,
        dayOpen: openPrice,
        dayHigh: quote.regularMarketDayHigh || currentPrice,
        dayLow: quote.regularMarketDayLow || currentPrice,
        volume: quote.regularMarketVolume || 0,
        marketCap: quote.marketCap || 0,
        week52High: quote.fiftyTwoWeekHigh || currentPrice,
        week52Low: quote.fiftyTwoWeekLow || currentPrice,
        sparklineData,
        lastUpdated: new Date() }
    })
  } catch {
    // Fallback to mock data on error (#8816 — silent fallback is the intended UX)
    return generateMockStockData(symbols)
  }
}

// Common stock symbols database for fallback search
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
  { symbol: 'ORCL', name: 'Oracle Corporation', type: 'EQUITY', region: 'US', currency: 'USD' },
  { symbol: 'IBM', name: 'International Business Machines', type: 'EQUITY', region: 'US', currency: 'USD' },
  { symbol: 'DIS', name: 'The Walt Disney Company', type: 'EQUITY', region: 'US', currency: 'USD' },
  { symbol: 'BABA', name: 'Alibaba Group Holding Ltd', type: 'EQUITY', region: 'US', currency: 'USD' },
  { symbol: 'V', name: 'Visa Inc.', type: 'EQUITY', region: 'US', currency: 'USD' },
  { symbol: 'MA', name: 'Mastercard Incorporated', type: 'EQUITY', region: 'US', currency: 'USD' },
  { symbol: 'JPM', name: 'JPMorgan Chase & Co.', type: 'EQUITY', region: 'US', currency: 'USD' },
  { symbol: 'BAC', name: 'Bank of America Corporation', type: 'EQUITY', region: 'US', currency: 'USD' },
  { symbol: 'WMT', name: 'Walmart Inc.', type: 'EQUITY', region: 'US', currency: 'USD' },
  { symbol: 'JNJ', name: 'Johnson & Johnson', type: 'EQUITY', region: 'US', currency: 'USD' },
  { symbol: 'PG', name: 'Procter & Gamble Company', type: 'EQUITY', region: 'US', currency: 'USD' },
  { symbol: 'UNH', name: 'UnitedHealth Group Inc.', type: 'EQUITY', region: 'US', currency: 'USD' },
  { symbol: 'HD', name: 'The Home Depot Inc.', type: 'EQUITY', region: 'US', currency: 'USD' },
  { symbol: 'PYPL', name: 'PayPal Holdings Inc.', type: 'EQUITY', region: 'US', currency: 'USD' },
  { symbol: 'ADBE', name: 'Adobe Inc.', type: 'EQUITY', region: 'US', currency: 'USD' },
  { symbol: 'CRM', name: 'Salesforce Inc.', type: 'EQUITY', region: 'US', currency: 'USD' },
  { symbol: 'CSCO', name: 'Cisco Systems Inc.', type: 'EQUITY', region: 'US', currency: 'USD' },
  { symbol: 'PEP', name: 'PepsiCo Inc.', type: 'EQUITY', region: 'US', currency: 'USD' },
  { symbol: 'KO', name: 'The Coca-Cola Company', type: 'EQUITY', region: 'US', currency: 'USD' },
  { symbol: 'NKE', name: 'NIKE Inc.', type: 'EQUITY', region: 'US', currency: 'USD' },
]

// Search for stocks by symbol or company name
export async function searchStocks(query: string): Promise<StockSearchResult[]> {
  if (!query || query.length < 1) {
    return []
  }

  try {
    // Using Yahoo Finance search API via CORS proxy
    const yahooSearchUrl = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=10&newsCount=0`
    const response = await fetch(
      `${CORS_PROXY}${encodeURIComponent(yahooSearchUrl)}`,
      { signal: AbortSignal.timeout(FETCH_EXTERNAL_TIMEOUT_MS) }
    )

    if (!response.ok) {
      throw new Error('Failed to search stocks')
    }

    const data = await response.json()
    const quotes = data.quotes || []

    return quotes
      .filter((q: YahooSearchQuote) => q.quoteType === 'EQUITY' || q.quoteType === 'ETF')
      .map((q: YahooSearchQuote) => ({
        symbol: q.symbol,
        name: q.longname || q.shortname || q.symbol,
        type: q.quoteType,
        region: q.exchDisp || q.exchange || 'US',
        currency: q.currency || 'USD' }))
      .slice(0, 10)
  } catch {
    // Fallback to local search when API fails (e.g., CORS issues) — #8816
    const queryLower = query.toLowerCase()
    return COMMON_STOCKS.filter(stock =>
      stock.symbol.toLowerCase().includes(queryLower) ||
      stock.name.toLowerCase().includes(queryLower)
    ).slice(0, 10)
  }
}

// Market status
export function getMarketStatus(t: TFunction<['cards', 'common']>): { isOpen: boolean; statusText: string } {
  const now = new Date()
  const hour = now.getHours()
  const minutes = now.getMinutes()
  const day = now.getDay()

  // Weekend
  if (day === 0 || day === 6) {
    return { isOpen: false, statusText: t('stockMarket.marketClosedWeekend') }
  }

  // Weekday hours (9:30 AM - 4:00 PM EST)
  // Simple approximation without timezone handling
  const isMarketHours = (hour === 9 && minutes >= 30) || (hour > 9 && hour < 16)
  if (isMarketHours) {
    return { isOpen: true, statusText: t('stockMarket.marketOpen') }
  } else if (hour >= 4 && hour < 9) {
    return { isOpen: false, statusText: t('stockMarket.preMarket') }
  } else {
    return { isOpen: false, statusText: t('stockMarket.afterHours') }
  }
}

// Constants for mock data generation
const PRICE_FLOOR_MULTIPLIER = 0.95 // 5% floor for sparkline prices
const MAX_VOLUME = 50_000_000
const MIN_VOLUME = 10_000_000
const MAX_MARKET_CAP = 1_000_000_000_000 // 1 trillion
const MIN_MARKET_CAP = 100_000_000_000 // 100 billion

// Generate mock stock data with seeded randomness
export function generateMockStockData(symbols: string[]): StockData[] {
  const stockNames: Record<string, string> = {
    'AAPL': 'Apple Inc.',
    'GOOGL': 'Alphabet Inc.',
    'MSFT': 'Microsoft Corporation',
    'AMZN': 'Amazon.com Inc.',
    'TSLA': 'Tesla Inc.',
    'META': 'Meta Platforms Inc.',
    'NVDA': 'NVIDIA Corporation',
    'NFLX': 'Netflix Inc.',
    'AMD': 'Advanced Micro Devices',
    'INTC': 'Intel Corporation' }

  // Base prices for known stocks
  const basePrices: Record<string, number> = {
    'AAPL': 175.50,
    'GOOGL': 142.30,
    'MSFT': 380.25,
    'AMZN': 155.80,
    'TSLA': 245.60,
    'META': 385.40,
    'NVDA': 495.30,
    'NFLX': 485.20,
    'AMD': 165.75,
    'INTC': 45.30 }

  return symbols.map(symbol => {
    const basePrice = basePrices[symbol] || 100
    const seed = symbol.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
    const random = (offset: number) => {
      const x = Math.sin(seed + offset) * 10000
      return x - Math.floor(x)
    }

    // Generate random change (-5% to +5%)
    const changePercent = (random(1000) - 0.5) * 10
    const change = (basePrice * changePercent) / 100
    const price = basePrice + change

    // Generate sparkline data (20 points)
    const sparklineData: number[] = []
    let currentPrice = price - change // Start from opening price
    for (let i = 0; i < 20; i++) {
      const variation = (random(2000 + i * 100) - 0.5) * (basePrice * 0.02)
      currentPrice = Math.max(currentPrice + variation, basePrice * PRICE_FLOOR_MULTIPLIER)
      sparklineData.push(currentPrice)
    }
    sparklineData.push(price) // End at current price

    return {
      symbol,
      name: stockNames[symbol] || `${symbol} Company`,
      price,
      change,
      changePercent,
      dayOpen: basePrice - (change * 0.8),
      dayHigh: price + Math.abs(change * 0.5),
      dayLow: price - Math.abs(change * 0.5),
      volume: Math.floor(random(3000) * MAX_VOLUME) + MIN_VOLUME,
      marketCap: Math.floor(random(4000) * MAX_MARKET_CAP) + MIN_MARKET_CAP,
      week52High: price + (basePrice * 0.15),
      week52Low: price - (basePrice * 0.15),
      sparklineData,
      lastUpdated: new Date() }
  })
}
