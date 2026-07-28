import { useState, useMemo, useEffect, useCallback } from 'react'
import { useCardData, commonComparators } from '../../../lib/cards/cardHooks'
import { useCardLoadingState } from '../CardDataContext'
import { useCache } from '../../../lib/cache'
import { safeGetJSON, safeSetJSON } from '../../../lib/utils/localStorage'
import { fetchRealStockData, generateMockStockData } from './dataHelpers'
import { SAVED_STOCKS_STORAGE_KEY } from './types'
import type { SavedStock, StockData, StockSearchResult, SortByOption } from './types'

export const SORT_OPTIONS = [
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

/**
 * All data fetching/state logic for StockMarketTicker: active symbol list,
 * saved/favorite stocks (persisted to localStorage), live-vs-demo stock
 * data via useCache, sorting/pagination via useCardData, and the portfolio
 * summary. Extracted from StockMarketTicker.tsx to keep that file under the
 * line/hook budget (#21650).
 */
export function useStockTickerData(symbols: string[]) {
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

  // Calculate portfolio summary
  const portfolioSummary = useMemo(() => {
    const totalChange = stockData.reduce((sum, stock) => sum + stock.changePercent, 0)
    const avgChange = stockData.length > 0 ? totalChange / stockData.length : 0
    const gainers = stockData.filter(s => s.change > 0).length
    const losers = stockData.filter(s => s.change < 0).length

    return { avgChange, gainers, losers }
  }, [stockData])

  return {
    useLiveData,
    setUseLiveData,
    savedStocks,
    activeSymbols,
    stockData,
    isLoadingData,
    stocks,
    totalItems,
    currentPage,
    totalPages,
    goToPage,
    needsPagination,
    itemsPerPage,
    setItemsPerPage,
    sorting,
    containerRef,
    containerStyle,
    addStock,
    removeStock,
    toggleFavorite,
    portfolioSummary,
  }
}
