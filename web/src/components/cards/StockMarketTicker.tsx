import { useState, useMemo, useEffect } from 'react'
import { 
  TrendingUp, TrendingDown, DollarSign, Clock, BarChart3, 
  ChevronDown, ChevronRight, RefreshCw, ExternalLink, Settings 
} from 'lucide-react'
import { CardControls, SortDirection } from '../ui/CardControls'
import { Pagination, usePagination } from '../ui/Pagination'
import { RefreshButton } from '../ui/RefreshIndicator'

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

// Config interface
interface StockMarketTickerConfig {
  symbols?: string[]
  refreshInterval?: number // in seconds
  dataSource?: string
}

interface StockMarketTickerProps {
  config?: StockMarketTickerConfig
}

type SortByOption = 'symbol' | 'change' | 'volume' | 'marketCap'

const SORT_OPTIONS = [
  { value: 'symbol' as const, label: 'Symbol' },
  { value: 'change' as const, label: 'Change %' },
  { value: 'volume' as const, label: 'Volume' },
  { value: 'marketCap' as const, label: 'Market Cap' },
]

// Default stock symbols to track
const DEFAULT_SYMBOLS = ['AAPL', 'GOOGL', 'MSFT', 'AMZN', 'TSLA', 'META', 'NVDA']

// Market status
function getMarketStatus(): { isOpen: boolean; statusText: string } {
  const now = new Date()
  const hour = now.getHours()
  const day = now.getDay()
  
  // Weekend
  if (day === 0 || day === 6) {
    return { isOpen: false, statusText: 'Market Closed - Weekend' }
  }
  
  // Weekday hours (9:30 AM - 4:00 PM EST)
  // Simple approximation without timezone handling
  if (hour >= 9 && hour < 16) {
    return { isOpen: true, statusText: 'Market Open' }
  } else if (hour >= 4 && hour < 9) {
    return { isOpen: false, statusText: 'Pre-Market' }
  } else {
    return { isOpen: false, statusText: 'After Hours' }
  }
}

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
      currentPrice = Math.max(currentPrice + variation, basePrice * 0.95)
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
      volume: Math.floor(random(3000) * 50000000) + 10000000,
      marketCap: Math.floor(random(4000) * 1000000000000) + 100000000000,
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
  onToggle 
}: { 
  stock: StockData
  expanded: boolean
  onToggle: () => void
}) {
  const isPositive = stock.change >= 0

  return (
    <div className="border-b border-border/30 last:border-0">
      {/* Main row */}
      <div 
        className="flex items-center gap-3 p-3 hover:bg-accent/50 cursor-pointer transition-colors"
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
        <div className="hidden sm:block">
          <Sparkline data={stock.sparklineData} isPositive={isPositive} />
        </div>

        {/* Price and change */}
        <div className="text-right">
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
              <span className="text-muted-foreground">Open:</span>
              <span className="font-medium">${stock.dayOpen.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">High:</span>
              <span className="font-medium">${stock.dayHigh.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Low:</span>
              <span className="font-medium">${stock.dayLow.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Volume:</span>
              <span className="font-medium">{formatVolume(stock.volume)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Mkt Cap:</span>
              <span className="font-medium">{formatLargeNumber(stock.marketCap)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">52W Range:</span>
              <span className="font-medium text-xs">${stock.week52Low.toFixed(0)} - ${stock.week52High.toFixed(0)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export function StockMarketTicker({ config }: StockMarketTickerProps) {
  const symbols = config?.symbols || DEFAULT_SYMBOLS
  const refreshInterval = config?.refreshInterval || 60
  const dataSource = config?.dataSource || 'Yahoo Finance'

  const [sortBy, setSortBy] = useState<SortByOption>('change')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const [limit, setLimit] = useState<number | 'unlimited'>(10)
  const [expandedStocks, setExpandedStocks] = useState<Set<string>>(new Set())
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())
  const [isRefreshing, setIsRefreshing] = useState(false)

  // Generate stock data
  const [stockData, setStockData] = useState<StockData[]>(() => generateMockStockData(symbols))

  // Auto-refresh
  useEffect(() => {
    const interval = setInterval(() => {
      handleRefresh()
    }, refreshInterval * 1000)

    return () => clearInterval(interval)
  }, [refreshInterval, symbols])

  const handleRefresh = () => {
    setIsRefreshing(true)
    setTimeout(() => {
      setStockData(generateMockStockData(symbols))
      setLastRefresh(new Date())
      setIsRefreshing(false)
    }, 500)
  }

  // Sort stock data
  const sortedStocks = useMemo(() => {
    const sorted = [...stockData].sort((a, b) => {
      let result = 0
      if (sortBy === 'symbol') {
        result = a.symbol.localeCompare(b.symbol)
      } else if (sortBy === 'change') {
        result = a.changePercent - b.changePercent
      } else if (sortBy === 'volume') {
        result = a.volume - b.volume
      } else if (sortBy === 'marketCap') {
        result = a.marketCap - b.marketCap
      }
      return sortDirection === 'asc' ? result : -result
    })
    return sorted
  }, [stockData, sortBy, sortDirection])

  // Pagination
  const effectivePerPage = limit === 'unlimited' ? 1000 : limit
  const {
    paginatedItems: stocks,
    currentPage,
    totalPages,
    totalItems,
    itemsPerPage: perPage,
    goToPage,
    needsPagination,
  } = usePagination(sortedStocks, effectivePerPage)

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

  const marketStatus = getMarketStatus()

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
      {/* Header with market status */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-muted-foreground" />
          <div className="text-xs">
            <div className="flex items-center gap-2">
              <span className={`inline-flex items-center gap-1 ${marketStatus.isOpen ? 'text-green-500' : 'text-muted-foreground'}`}>
                <Clock className="w-3 h-3" />
                {marketStatus.statusText}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <CardControls
            sortBy={sortBy}
            sortDirection={sortDirection}
            limit={limit}
            onSortChange={setSortBy}
            onDirectionChange={setSortDirection}
            onLimitChange={setLimit}
            sortOptions={SORT_OPTIONS}
          />
          <RefreshButton 
            onRefresh={handleRefresh} 
            isRefreshing={isRefreshing}
            lastRefresh={lastRefresh}
          />
        </div>
      </div>

      {/* Portfolio summary */}
      <div className="grid grid-cols-3 gap-2 mb-3 p-2 bg-accent/30 rounded-lg text-xs">
        <div className="text-center">
          <div className="text-muted-foreground">Avg Change</div>
          <div className={`font-semibold ${portfolioSummary.avgChange >= 0 ? 'text-green-500' : 'text-red-500'}`}>
            {portfolioSummary.avgChange >= 0 ? '+' : ''}{portfolioSummary.avgChange.toFixed(2)}%
          </div>
        </div>
        <div className="text-center border-l border-r border-border/30">
          <div className="text-muted-foreground">Gainers</div>
          <div className="font-semibold text-green-500">{portfolioSummary.gainers}</div>
        </div>
        <div className="text-center">
          <div className="text-muted-foreground">Losers</div>
          <div className="font-semibold text-red-500">{portfolioSummary.losers}</div>
        </div>
      </div>

      {/* Stock list */}
      <div className="flex-1 overflow-y-auto border border-border/30 rounded-lg">
        {stocks.map(stock => (
          <StockRow
            key={stock.symbol}
            stock={stock}
            expanded={expandedStocks.has(stock.symbol)}
            onToggle={() => toggleExpanded(stock.symbol)}
          />
        ))}
      </div>

      {/* Footer with pagination and data source */}
      <div className="flex items-center justify-between mt-2 pt-2 border-t border-border/30">
        <div className="text-xs text-muted-foreground flex items-center gap-1">
          <span>Data from {dataSource}</span>
          <ExternalLink className="w-3 h-3" />
        </div>

        {needsPagination && (
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={totalItems}
            itemsPerPage={perPage}
            onPageChange={goToPage}
          />
        )}
      </div>
    </div>
  )
}
