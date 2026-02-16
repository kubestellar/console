import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import {
  TrendingUp, TrendingDown, Clock, BarChart3,
  ChevronDown, ChevronRight, Search as SearchIcon,
  Star, X, Loader2
} from 'lucide-react'
import {
  useCardData,
  commonComparators,
  CardControlsRow,
  CardPaginationFooter,
} from '../../lib/cards'
import { useCardLoadingState } from './CardDataContext'
import { useCache } from '../../lib/cache'
import { useTranslation } from 'react-i18next'

// Stock search result interface
interface StockSearchResult {
  symbol: string
  name: string
  type: string
  region: string
  currency: string
}

// Raw search result from Yahoo Finance API
interface YahooSearchQuote {
  symbol: string
  longname?: string
  shortname?: string
  quoteType: string
  exchDisp?: string
  exchange?: string
  currency?: string
}

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
  marketCap: commonComparators.number<StockData>('marketCap'),
}

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
      `${CORS_PROXY}${encodeURIComponent(yahooUrl)}`
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
        lastUpdated: new Date(),
      }
    })
  } catch (error) {
    console.error('Error fetching real stock data:', error)
    // Fallback to mock data on error
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
async function searchStocks(query: string): Promise<StockSearchResult[]> {
  if (!query || query.length < 1) {
    return []
  }

  try {
    // Using Yahoo Finance search API via CORS proxy
    const yahooSearchUrl = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=10&newsCount=0`
    const response = await fetch(
      `${CORS_PROXY}${encodeURIComponent(yahooSearchUrl)}`
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
        currency: q.currency || 'USD',
      }))
      .slice(0, 10)
  } catch (error) {
    console.error('Error searching stocks, using fallback:', error)
    // Fallback to local search when API fails (e.g., CORS issues)
    const queryLower = query.toLowerCase()
    return COMMON_STOCKS.filter(stock =>
      stock.symbol.toLowerCase().includes(queryLower) ||
      stock.name.toLowerCase().includes(queryLower)
    ).slice(0, 10)
  }
}

// Default stock symbols to track (keeping for backwards compatibility)

// Market status
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getMarketStatus(t: (...args: any[]) => string): { isOpen: boolean; statusText: string } {
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
    'INTC': 'Intel Corporation',
  }

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
    'INTC': 45.30,
  }

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
      lastUpdated: new Date(),
    }
  })
}

// Format large numbers (market cap, volume)
function formatLargeNumber(num: number): string {
  if (num >= 1000000000000) {
    return `$${(num / 1000000000000).toFixed(2)}T`
  } else if (num >= 1000000000) {
    return `$${(num / 1000000000).toFixed(2)}B`
  } else if (num >= 1000000) {
    return `$${(num / 1000000).toFixed(2)}M`
  }
  return `$${num.toLocaleString()}`
}

// Format volume
function formatVolume(num: number): string {
  if (num >= 1000000) {
    return `${(num / 1000000).toFixed(2)}M`
  } else if (num >= 1000) {
    return `${(num / 1000).toFixed(2)}K`
  }
  return num.toLocaleString()
}

// Sparkline component
function Sparkline({ data, isPositive }: { data: number[]; isPositive: boolean }) {
  if (data.length < 2) return null

  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1

  const points = data.map((value, index) => {
    const x = (index / (data.length - 1)) * 100
    const y = 100 - ((value - min) / range) * 100
    return `${x},${y}`
  }).join(' ')

  return (
    <svg
      className="w-20 h-8"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
    >
      <polyline
        points={points}
        fill="none"
        stroke={isPositive ? 'rgb(34, 197, 94)' : 'rgb(239, 68, 68)'}
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}

// Stock row component
function StockRow({
  stock,
  expanded,
  onToggle,
  onToggleFavorite,
  onRemove,
  isFavorite,
  canRemove
}: {
  stock: StockData
  expanded: boolean
  onToggle: () => void
  onToggleFavorite: () => void
  onRemove: () => void
  isFavorite: boolean
  canRemove: boolean
}) {
  const { t } = useTranslation(['cards', 'common'])
  const isPositive = stock.change >= 0

  return (
    <div className="border-b border-border/30 last:border-0 relative">
      {/* Action buttons - Left side */}
      <div className="absolute left-2 top-1/2 -translate-y-1/2 z-10 flex items-center gap-1">
        <button
          onClick={(e) => {
            e.stopPropagation()
            onToggleFavorite()
          }}
          className="p-1 rounded hover:bg-accent transition-colors"
          title={isFavorite ? t('stockMarket.unfavorite') : t('stockMarket.favorite')}
        >
          <Star
            className={`w-3 h-3 ${isFavorite ? 'text-yellow-400 fill-current' : 'text-muted-foreground'}`}
          />
        </button>
        {canRemove && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onRemove()
            }}
            className="p-1 rounded hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
            title={t('stockMarket.removeFromList')}
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* Main row */}
      <div
        className="flex items-center gap-3 p-3 pl-16 pr-4 hover:bg-accent/50 cursor-pointer transition-colors"
        onClick={onToggle}
      >
        {/* Symbol and name */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-bold text-sm">{stock.symbol}</span>
            {expanded ? <ChevronDown className="w-3 h-3 text-muted-foreground" /> : <ChevronRight className="w-3 h-3 text-muted-foreground" />}
          </div>
          <div className="text-xs text-muted-foreground truncate">{stock.name}</div>
        </div>

        {/* Sparkline */}
        <div className="hidden sm:block flex-shrink-0">
          <Sparkline data={stock.sparklineData} isPositive={isPositive} />
        </div>

        {/* Price and change */}
        <div className="text-right flex-shrink-0">
          <div className="font-semibold text-sm">${stock.price.toFixed(2)}</div>
          <div className={`text-xs flex items-center justify-end gap-1 ${isPositive ? 'text-green-500' : 'text-red-500'}`}>
            {isPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            <span>{isPositive ? '+' : ''}{stock.changePercent.toFixed(2)}%</span>
          </div>
        </div>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="px-3 pb-3 pt-1 bg-accent/30 border-t border-border/30">
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('stockMarket.open')}:</span>
              <span className="font-medium">${stock.dayOpen.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('stockMarket.high')}:</span>
              <span className="font-medium">${stock.dayHigh.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('stockMarket.low')}:</span>
              <span className="font-medium">${stock.dayLow.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('stockMarket.volume')}:</span>
              <span className="font-medium">{formatVolume(stock.volume)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('stockMarket.mktCap')}:</span>
              <span className="font-medium">{formatLargeNumber(stock.marketCap)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('stockMarket.fiftyTwoWeekRange')}:</span>
              <span className="font-medium text-xs">${stock.week52Low.toFixed(0)} - ${stock.week52High.toFixed(0)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export function StockMarketTicker({ config }: StockMarketTickerProps) {
  const { t } = useTranslation(['cards', 'common'])
  const symbols = config?.symbols || DEFAULT_SYMBOLS
  const dataSource = config?.dataSource || 'Yahoo Finance'

  const [expandedStocks, setExpandedStocks] = useState<Set<string>>(new Set())
  // Default to demo mode - live data uses CORS proxy which may have rate limits
  const [useLiveData, setUseLiveData] = useState(false)

  // Search and saved stocks state
  const [stockSearchInput, setStockSearchInput] = useState('')
  const [stockSearchResults, setStockSearchResults] = useState<StockSearchResult[]>([])
  const [showStockDropdown, setShowStockDropdown] = useState(false)
  const [isSearching, setIsSearching] = useState(false)
  const [savedStocks, setSavedStocks] = useState<SavedStock[]>(() => {
    const saved = localStorage.getItem('stock-ticker-saved-stocks')
    return saved ? JSON.parse(saved) : []
  })
  const [activeSymbols, setActiveSymbols] = useState<string[]>(symbols)

  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Save stocks to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('stock-ticker-saved-stocks', JSON.stringify(savedStocks))
  }, [savedStocks])

  // Stock data via useCache (persists across navigation)
  const symbolsKey = useMemo(() => [...activeSymbols].sort().join(','), [activeSymbols])
  const demoStockData = useMemo(() => generateMockStockData(activeSymbols), [activeSymbols])

  const { data: stockData, isLoading: isLoadingData } = useCache<StockData[]>({
    key: `stocks:${symbolsKey}:${useLiveData ? 'live' : 'demo'}`,
    category: 'default',
    initialData: [],
    demoData: demoStockData,
    persist: true,
    fetcher: async () => {
      return useLiveData
        ? await fetchRealStockData(activeSymbols)
        : generateMockStockData(activeSymbols)
    },
  })

  useCardLoadingState({ isLoading: isLoadingData, hasAnyData: stockData.length > 0 })

  // Update saved stocks when data changes
  useEffect(() => {
    if (stockData.length > 0) {
      setSavedStocks(prev => prev.map(saved => {
        const stock = stockData.find(s => s.symbol === saved.symbol)
        return stock ? { ...saved, price: stock.price, changePercent: stock.changePercent } : saved
      }))
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
  } = useCardData<StockData, SortByOption>(stockData, {
    filter: {
      searchFields: ['symbol', 'name'] as (keyof StockData)[],
      storageKey: 'stock-ticker',
    },
    sort: {
      defaultField: 'change',
      defaultDirection: 'desc',
      comparators: SORT_COMPARATORS,
    },
    defaultLimit: 10,
  })

  // Search for stocks
  const performStockSearch = useCallback(async (query: string) => {
    if (!query || query.length < 1) {
      setStockSearchResults([])
      setShowStockDropdown(false)
      return
    }

    setIsSearching(true)
    try {
      const results = await searchStocks(query)
      setStockSearchResults(results)
      if (results.length > 0) {
        setShowStockDropdown(true)
      }
    } catch (error) {
      console.error('Stock search error:', error)
      setStockSearchResults([])
      setShowStockDropdown(false)
    } finally {
      setIsSearching(false)
    }
  }, [])

  // Debounced stock search
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current)
    }

    searchTimeoutRef.current = setTimeout(() => {
      performStockSearch(stockSearchInput)
    }, 300)

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current)
      }
    }
  }, [stockSearchInput, performStockSearch])

  // Add stock from search results
  const addStock = useCallback((stock: StockSearchResult) => {
    if (!activeSymbols.includes(stock.symbol)) {
      setActiveSymbols(prev => [...prev, stock.symbol])

      // Add to saved stocks if not already there
      if (!savedStocks.find(s => s.symbol === stock.symbol)) {
        setSavedStocks(prev => [...prev, {
          symbol: stock.symbol,
          name: stock.name,
          price: 0,
          changePercent: 0,
          favorite: true,
        }])
      }
    }
    setStockSearchInput('')
    setShowStockDropdown(false)
    setStockSearchResults([])
  }, [activeSymbols, savedStocks])

  // Remove stock from active list
  const removeStock = useCallback((symbol: string) => {
    setActiveSymbols(prev => prev.filter(s => s !== symbol))
  }, [])

  // Toggle favorite status
  const toggleFavorite = useCallback((symbol: string) => {
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
        favorite: true,
      }])
    }
  }, [savedStocks, stockData])

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
    const avgChange = totalChange / stockData.length
    const gainers = stockData.filter(s => s.change > 0).length
    const losers = stockData.filter(s => s.change < 0).length

    return { avgChange, gainers, losers }
  }, [stockData])

  return (
    <div className="h-full flex flex-col">
      {/* Header with market status and controls */}
      <div className="flex items-center justify-between mb-3">
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
            onSortDirectionChange: sorting.setSortDirection,
          }}
        />
      </div>

      {/* Search and add stock */}
      <div className="mb-3 space-y-2">
        <div className="relative">
          <div className="flex items-center gap-2 p-2 border border-border/50 rounded-lg bg-card">
            <SearchIcon className="w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder={t('stockMarket.searchPlaceholder')}
              value={stockSearchInput}
              onChange={(e) => setStockSearchInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && stockSearchResults.length > 0) {
                  e.preventDefault()
                  addStock(stockSearchResults[0])
                }
              }}
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            {isSearching && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
            {stockSearchInput && (
              <button
                onClick={() => {
                  setStockSearchInput('')
                  setShowStockDropdown(false)
                }}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Search results dropdown */}
          {showStockDropdown && stockSearchResults.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-lg z-[100] max-h-60 overflow-y-auto">
              {stockSearchResults.map((result) => (
                <button
                  key={result.symbol}
                  onClick={() => addStock(result)}
                  className="w-full p-2 text-left hover:bg-accent transition-colors flex items-center justify-between"
                  disabled={activeSymbols.includes(result.symbol)}
                >
                  <div>
                    <div className="font-semibold text-sm">{result.symbol}</div>
                    <div className="text-xs text-muted-foreground truncate">{result.name}</div>
                  </div>
                  <div className="text-xs text-muted-foreground">{result.region}</div>
                  {activeSymbols.includes(result.symbol) && (
                    <span className="text-xs text-green-500 ml-2">{t('stockMarket.added')}</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

      </div>

      {/* Portfolio summary */}
      <div className="grid grid-cols-3 gap-2 mb-3 p-2 bg-accent/30 rounded-lg text-xs">
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
        <div className="flex-1 overflow-y-auto border border-border/30 rounded-lg">
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
      <div className="flex items-center justify-between mt-2 pt-2 border-t border-border/30">
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
