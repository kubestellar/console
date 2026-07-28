import type { Dispatch, SetStateAction } from 'react'
import type { TFunction } from 'i18next'
import { Search as SearchIcon, Loader2, X } from 'lucide-react'
import type { StockSearchResult } from './StockMarketTicker.types'

interface StockMarketSymbolSearchProps {
  t: TFunction
  stockSearchInput: string
  setStockSearchInput: Dispatch<SetStateAction<string>>
  stockSearchResults: StockSearchResult[]
  showStockDropdown: boolean
  setShowStockDropdown: Dispatch<SetStateAction<boolean>>
  isSearching: boolean
  addStock: (stock: StockSearchResult) => void
  activeSymbols: string[]
}

export function StockMarketSymbolSearch({
  t,
  stockSearchInput,
  setStockSearchInput,
  stockSearchResults,
  showStockDropdown,
  setShowStockDropdown,
  isSearching,
  addStock,
  activeSymbols,
}: StockMarketSymbolSearchProps) {
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
  )
}
