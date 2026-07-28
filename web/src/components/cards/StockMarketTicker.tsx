import { useState, useMemo, useEffect, useCallback } from 'react'
import {
  TrendingUp, TrendingDown, Clock, BarChart3,
  Loader2
} from 'lucide-react'
import { CardControlsRow, CardPaginationFooter } from '../../lib/cards/CardComponents'
import { useCardData, commonComparators } from '../../lib/cards/cardHooks'
import { useCardLoadingState } from './CardDataContext'
import { useCache } from '../../lib/cache'
import { useTranslation } from 'react-i18next'
import { FETCH_EXTERNAL_TIMEOUT_MS } from '../../lib/constants'
import { safeGetJSON, safeSetJSON } from '../../lib/utils/localStorage'
import { StockRow } from './stockMarketTicker/StockRow'
import { SymbolSearch, type StockSearchResult } from './stockMarketTicker/SymbolSearch'

const SAVED_STOCKS_STORAGE_KEY = 'stock-ticker-saved-stocks'

// Saved stock interface
interface SavedStock {
  symbol: string
  name: string
  price: number
  changePercent: number
  favorite?: boolean
}

// Stock data interface
interface StockData {
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
  displayName?: string
  longName?: string
  shortName?: string
  symbol: string
}

// Config interface
interface StockMarketTickerConfig {
  symbols?: string[]
  refreshInterval?: number // in seconds
  dataSource?: string
}

interface StockMarketTickerProps {
  config?: StockMarketTickerConfig
}

type SortByOption = 'symbol' | 'price' | 'change' | 'volume' | 'marketCap'

const SORT_OPTIONS = [
  { value: 'symbol' as const, label: 'Name' },
  { value: 'price' as const, label: 'Price' },
  { value: 'change' as const, label: 'Change %' },
  { value: 'volume' as const, label: 'Volume' },
  { value: 'marketCap' as const, label: 'Market Cap' },
]

const SORT_COMPARATORS: Record<SortByOption, (a: StockData, b: StockData) => number> = {
  symbol: commonComparators.string<StockData>('symbol'),
  price: commonComparators.number<StockData>('price'),
  change: commonComparators.number<StockData>('changePercent'),
  volume: commonComparators.number<StockData>('volume'),
  marketCap: commonComparators.number<StockData>('marketCap') }

// Default stock symbols to track
const DEFAULT_SYMBOLS = ['AAPL', 'GOOGL', 'MSFT', 'AMZN', 'TSLA', 'META', 'NVDA']

// CORS proxy to bypass browser restrictions for Yahoo Finance API
const CORS_PROXY = 'https://corsproxy.io/?'

// Fetch real stock data from Yahoo Finance API (via CORS proxy)
async function fetchRealStockData(symbols: string[]): Promise<StockData[]> {
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

// Market status
function getMarketStatus(t: (key: string) => string): { isOpen: boolean; statusText: string } {
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
function generateMockStockData(symbols: string[]): StockData[] {
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


export function StockMarketTicker({ config }: StockMarketTickerProps) {
  const { t } = useTranslation(['cards', 'common'])
  const symbols = config?.symbols || DEFAULT_SYMBOLS
  const dataSource = config?.dataSource || 'Yahoo Finance'

  const [expandedStocks, setExpandedStocks] = useState<Set<string>>(new Set())
  // Default to demo mode - live data uses CORS proxy which may have rate limits
  const [useLiveData, setUseLiveData] = useState(false)

  const [savedStocks, setSavedStocks] = useState<SavedStock[]>(
    () => safeGetJSON<SavedStock[]>(SAVED_STOCKS_STORAGE_KEY) || []
  )
  const [activeSymbols, setActiveSymbols] = useState<string[]>(symbols)

  // Save stocks to localStorage whenever they change
  useEffect(() => {
    safeSetJSON(SAVED_STOCKS_STORAGE_KEY, savedStocks)
  }, [savedStocks])

  // Stock data via useCache (persists across navigation)
  const symbolsKey = [...activeSymbols].sort().join(',')
  // eslint-disable-next-line react-hooks/exhaustive-deps -- symbolsKey is the stable string derived from activeSymbols
  const demoStockData = useMemo(() => generateMockStockData(activeSymbols), [symbolsKey])

  const { data: stockData, isLoading: isLoadingData, isRefreshing: stockRefreshing } = useCache<StockData[]>({
    key: `stocks:${symbolsKey}:${useLiveData ? 'live' : 'demo'}`,
    category: 'default',
    initialData: [],
    demoData: demoStockData,
    persist: true,
    fetcher: async () => {
      return useLiveData
        ? await fetchRealStockData(activeSymbols)
        : generateMockStockData(activeSymbols)
    } })

  const hasStockData = stockData.length > 0
  useCardLoadingState({ isLoading: isLoadingData && !hasStockData, isRefreshing: stockRefreshing, hasAnyData: hasStockData, isDemoData: false })

  // Update saved stocks when data changes
  useEffect(() => {
    if (stockData.length > 0) {
      setSavedStocks(prev => {
        let changed = false
        const next = prev.map(saved => {
          const stock = stockData.find(s => s.symbol === saved.symbol)
          if (stock && (saved.price !== stock.price || saved.changePercent !== stock.changePercent)) {
            changed = true
            return { ...saved, price: stock.price, changePercent: stock.changePercent }
          }
          return saved
        })
        return changed ? next : prev
      })
    }
  }, [stockData])

  // --- useCardData hook replaces manual sort/pagination state ---
  const {
    items: stocks,
    totalItems,
    currentPage,
    totalPages,
    goToPage,
    needsPagination,
    itemsPerPage,
    setItemsPerPage,
    sorting,
    containerRef,
    containerStyle } = useCardData<StockData, SortByOption>(stockData, {
    filter: {
      searchFields: ['symbol', 'name'] as (keyof StockData)[],
      storageKey: 'stock-ticker' },
    sort: {
      defaultField: 'change',
      defaultDirection: 'desc',
      comparators: SORT_COMPARATORS },
    defaultLimit: 10 })

  // Add stock from search results
  const addStock = useCallback((stock: StockSearchResult) => {
    if (!activeSymbols.includes(stock.symbol)) {
      setActiveSymbols(prev => [...prev, stock.symbol])
      if (!savedStocks.find(s => s.symbol === stock.symbol)) {
        setSavedStocks(prev => [...prev, {
          symbol: stock.symbol,
          name: stock.name,
          price: 0,
          changePercent: 0,
          favorite: true }])
      }
    }
  }, [activeSymbols, savedStocks])

  // Remove stock from active list
  const removeStock = (symbol: string) => {
    setActiveSymbols(prev => prev.filter(s => s !== symbol))
  }

  // Toggle favorite status
  const toggleFavorite = (symbol: string) => {
    const existingStock = savedStocks.find(s => s.symbol === symbol)
    const currentStock = stockData.find(s => s.symbol === symbol)

    if (existingStock) {
      setSavedStocks(prev => prev.map(s =>
        s.symbol === symbol ? { ...s, favorite: !s.favorite } : s
      ))
    } else if (currentStock) {
      setSavedStocks(prev => [...prev, {
        symbol: currentStock.symbol,
        name: currentStock.name,
        price: currentStock.price,
        changePercent: currentStock.changePercent,
        favorite: true }])
    }
  }

  const toggleExpanded = (symbol: string) => {
    setExpandedStocks(prev => {
      const next = new Set(prev)
      if (next.has(symbol)) {
        next.delete(symbol)
      } else {
        next.add(symbol)
      }
      return next
    })
  }

  const marketStatus = getMarketStatus(t)

  // Calculate portfolio summary
  const portfolioSummary = useMemo(() => {
    const totalChange = stockData.reduce((sum, stock) => sum + stock.changePercent, 0)
    const avgChange = stockData.length > 0 ? totalChange / stockData.length : 0
    const gainers = stockData.filter(s => s.change > 0).length
    const losers = stockData.filter(s => s.change < 0).length

    return { avgChange, gainers, losers }
  }, [stockData])

  return (
    <div className="h-full flex flex-col">
      {/* Header with market status and controls */}
      <div className="flex flex-wrap items-center justify-between gap-y-2 mb-3">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-muted-foreground" />
          <div className="text-xs">
            <div className="flex items-center gap-2">
              <span className={`inline-flex items-center gap-1 ${marketStatus.isOpen ? 'text-green-500' : 'text-muted-foreground'}`}>
                <Clock className="w-3 h-3" />
                {marketStatus.statusText}
              </span>
              <button
                onClick={() => setUseLiveData(!useLiveData)}
                className="text-xs px-2 py-0.5 rounded bg-accent hover:bg-accent/80 transition-colors"
                title={useLiveData ? t('stockMarket.usingLiveData') : t('stockMarket.usingDemoData')}
              >
                {useLiveData ? t('stockMarket.liveButton') : t('stockMarket.demoButton')}
              </button>
            </div>
          </div>
        </div>

        <CardControlsRow
          cardControls={{
            limit: itemsPerPage,
            onLimitChange: setItemsPerPage,
            sortBy: sorting.sortBy,
            sortOptions: SORT_OPTIONS,
            onSortChange: (v) => sorting.setSortBy(v as SortByOption),
            sortDirection: sorting.sortDirection,
            onSortDirectionChange: sorting.setSortDirection }}
        />
      </div>

      {/* Search and add stock */}
      <SymbolSearch activeSymbols={activeSymbols} onAddStock={addStock} />

      {/* Portfolio summary */}
      <div className="grid grid-cols-2 @md:grid-cols-3 gap-2 mb-3 p-2 bg-accent/30 rounded-lg text-xs">
        <div className="text-center">
          <div className="text-muted-foreground">{t('stockMarket.avgChange')}</div>
          <div className={`font-semibold ${portfolioSummary.avgChange >= 0 ? 'text-green-500' : 'text-red-500'}`}>
            {portfolioSummary.avgChange >= 0 ? '+' : ''}{portfolioSummary.avgChange.toFixed(2)}%
          </div>
        </div>
        <div className="text-center border-l border-r border-border/30">
          <div className="text-muted-foreground">{t('stockMarket.gainers')}</div>
          <div className="font-semibold text-green-500">{portfolioSummary.gainers}</div>
        </div>
        <div className="text-center">
          <div className="text-muted-foreground">{t('stockMarket.losers')}</div>
          <div className="font-semibold text-red-500">{portfolioSummary.losers}</div>
        </div>
      </div>

      {/* Stock list */}
      {isLoadingData && stockData.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div ref={containerRef} className="flex-1 overflow-y-auto border border-border/30 rounded-lg" style={containerStyle}>
          {stocks.map(stock => (
            <StockRow
              key={stock.symbol}
              stock={stock}
              expanded={expandedStocks.has(stock.symbol)}
              onToggle={() => toggleExpanded(stock.symbol)}
              onToggleFavorite={() => toggleFavorite(stock.symbol)}
              onRemove={() => removeStock(stock.symbol)}
              isFavorite={savedStocks.find(s => s.symbol === stock.symbol)?.favorite || false}
              canRemove={activeSymbols.length > 1}
            />
          ))}
        </div>
      )}

      {/* Footer with pagination and data source */}
      <div className="flex flex-wrap items-center justify-between gap-y-2 mt-2 pt-2 border-t border-border/30">
        <div className="text-xs text-muted-foreground flex items-center gap-1">
          <span>{t('stockMarket.dataFrom', { source: dataSource })}</span>
          {useLiveData && <span className="text-green-500">{t('stockMarket.liveLabel')}</span>}
          {!useLiveData && <span className="text-muted-foreground">{t('stockMarket.demoLabel')}</span>}
        </div>

        <CardPaginationFooter
          currentPage={currentPage}
          totalPages={totalPages}
          totalItems={totalItems}
          itemsPerPage={typeof itemsPerPage === 'number' ? itemsPerPage : totalItems}
          onPageChange={goToPage}
          needsPagination={needsPagination}
        />
      </div>
    </div>
  )
}
