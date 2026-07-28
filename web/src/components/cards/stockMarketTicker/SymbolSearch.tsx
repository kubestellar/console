import { useState, useEffect, useRef, useCallback } from 'react'
import { Search as SearchIcon, X, Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useToast } from '../../ui/Toast'
import { FETCH_EXTERNAL_TIMEOUT_MS } from '../../../lib/constants'

const SEARCH_DEBOUNCE_MS = 300
const CORS_PROXY = 'https://api.allorigins.win/raw?url='
const COMMON_STOCKS = [
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
  { symbol: 'BABA', name: 'Alibaba Group Holding Limited', type: 'EQUITY', region: 'US', currency: 'USD' },
  { symbol: 'V', name: 'Visa Inc.', type: 'EQUITY', region: 'US', currency: 'USD' },
  { symbol: 'WMT', name: 'Walmart Inc.', type: 'EQUITY', region: 'US', currency: 'USD' },
  { symbol: 'DIS', name: 'The Walt Disney Company', type: 'EQUITY', region: 'US', currency: 'USD' },
  { symbol: 'MA', name: 'Mastercard Incorporated', type: 'EQUITY', region: 'US', currency: 'USD' },
  { symbol: 'HD', name: 'The Home Depot Inc.', type: 'EQUITY', region: 'US', currency: 'USD' },
  { symbol: 'PYPL', name: 'PayPal Holdings Inc.', type: 'EQUITY', region: 'US', currency: 'USD' },
  { symbol: 'ADBE', name: 'Adobe Inc.', type: 'EQUITY', region: 'US', currency: 'USD' },
  { symbol: 'CRM', name: 'Salesforce Inc.', type: 'EQUITY', region: 'US', currency: 'USD' },
  { symbol: 'CSCO', name: 'Cisco Systems Inc.', type: 'EQUITY', region: 'US', currency: 'USD' },
  { symbol: 'PEP', name: 'PepsiCo Inc.', type: 'EQUITY', region: 'US', currency: 'USD' },
  { symbol: 'KO', name: 'The Coca-Cola Company', type: 'EQUITY', region: 'US', currency: 'USD' },
  { symbol: 'NKE', name: 'NIKE Inc.', type: 'EQUITY', region: 'US', currency: 'USD' },
]

export interface StockSearchResult {
  symbol: string
  name: string
  type: string
  region: string
  currency: string
}

interface YahooSearchQuote {
  symbol: string
  longname?: string
  shortname?: string
  quoteType: string
  exchDisp?: string
  exchange?: string
  currency?: string
}

async function searchStocks(query: string): Promise<StockSearchResult[]> {
  if (!query || query.length < 1) {
    return []
  }

  try {
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

interface SymbolSearchProps {
  activeSymbols: string[]
  onAddStock: (stock: StockSearchResult) => void
}

export function SymbolSearch({ activeSymbols, onAddStock }: SymbolSearchProps) {
  const { t } = useTranslation(['cards', 'common'])
  const { showToast } = useToast()
  const [stockSearchInput, setStockSearchInput] = useState('')
  const [stockSearchResults, setStockSearchResults] = useState<StockSearchResult[]>([])
  const [showStockDropdown, setShowStockDropdown] = useState(false)
  const [isSearching, setIsSearching] = useState(false)
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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
    } catch {
      showToast(t('cards:stockMarket.searchFailed', 'Stock search failed. Please try again.'), 'error')
      setStockSearchResults([])
      setShowStockDropdown(false)
    } finally {
      setIsSearching(false)
    }
  }, [showToast, t])

  useEffect(() => {
    let cancelled = false

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current)
    }

    searchTimeoutRef.current = setTimeout(() => {
      if (!cancelled) {
        performStockSearch(stockSearchInput)
      }
    }, SEARCH_DEBOUNCE_MS)

    return () => {
      cancelled = true
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current)
      }
    }
  }, [stockSearchInput, performStockSearch])

  const handleAddStock = (stock: StockSearchResult) => {
    onAddStock(stock)
    setStockSearchInput('')
    setShowStockDropdown(false)
    setStockSearchResults([])
  }

  return (
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
                handleAddStock(stockSearchResults[0])
              }
            }}
            className="flex-1 bg-transparent text-sm outline-hidden placeholder:text-muted-foreground"
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
          <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-lg z-dropdown max-h-60 overflow-y-auto">
            {stockSearchResults.map((result) => (
              <button
                key={result.symbol}
                onClick={() => handleAddStock(result)}
                className="w-full p-2 text-left hover:bg-accent transition-colors flex flex-wrap items-center justify-between gap-y-2"
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
  )
}
