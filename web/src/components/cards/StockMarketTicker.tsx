import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { Clock, BarChart3, Search as SearchIcon, X, Loader2 } from 'lucide-react'
import { CardControlsRow, CardPaginationFooter } from '../../lib/cards/CardComponents'
import { useCardData, commonComparators } from '../../lib/cards/cardHooks'
import { useCardLoadingState } from './CardDataContext'
import { useCache } from '../../lib/cache'
import { useTranslation } from 'react-i18next'
import { useToast } from '../ui/Toast'
import { safeGetJSON, safeSetJSON } from '../../lib/utils/localStorage'
import { StockRow, type StockSearchResult, type SavedStock, type StockData } from './StockMarketTicker.helpers'
import { fetchRealStockData, searchStocks, getMarketStatus, generateMockStockData } from './StockMarketTicker.data'

const SEARCH_DEBOUNCE_MS = 300
const SAVED_STOCKS_STORAGE_KEY = 'stock-ticker-saved-stocks'

// Stock search result interface
export function StockMarketTicker({ config }: StockMarketTickerProps) {
  const { t } = useTranslation(['cards', 'common'])
  const { showToast } = useToast()
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
  const [savedStocks, setSavedStocks] = useState<SavedStock[]>(
    () => safeGetJSON<SavedStock[]>(SAVED_STOCKS_STORAGE_KEY) || []
  )
  const [activeSymbols, setActiveSymbols] = useState<string[]>(symbols)

  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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
    } catch {
      // User-visible toast already surfaces the failure (#8816)
      showToast(t('cards:stockMarket.searchFailed', 'Stock search failed. Please try again.'), 'error')
      setStockSearchResults([])
      setShowStockDropdown(false)
    } finally {
      setIsSearching(false)
    }
  }, [showToast, t])

  // Debounced stock search — uses a cancelled flag to prevent stale
  // setState calls after the component unmounts or the input changes.
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
          favorite: true }])
      }
    }
    setStockSearchInput('')
    setShowStockDropdown(false)
    setStockSearchResults([])
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
                  onClick={() => addStock(result)}
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
