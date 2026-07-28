import { useState, useCallback, useEffect, useRef } from 'react'
import { Search as SearchIcon, Loader2, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useToast } from '../../ui/Toast'
import { searchStocks } from './dataHelpers'
import { SEARCH_DEBOUNCE_MS } from './types'
import type { StockSearchResult } from './types'

export interface SymbolSearchProps {
  activeSymbols: string[]
  onAddStock: (stock: StockSearchResult) => void
}

/**
 * Self-contained stock symbol search box: debounced input, Yahoo Finance
 * search (with local fallback), and a results dropdown. Extracted from
 * StockMarketTicker.tsx to keep that file under the line/hook budget (#21650).
 */
export function SymbolSearch({ activeSymbols, onAddStock }: SymbolSearchProps) {
  const { t } = useTranslation(['cards', 'common'])
  const { showToast } = useToast()

  const [stockSearchInput, setStockSearchInput] = useState('')
  const [stockSearchResults, setStockSearchResults] = useState<StockSearchResult[]>([])
  const [showStockDropdown, setShowStockDropdown] = useState(false)
  const [isSearching, setIsSearching] = useState(false)
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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
