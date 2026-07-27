import { useState, useCallback, useEffect, useRef } from 'react'
import { Search as SearchIcon, X, Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useToast } from '../../ui/Toast'
import type { StockSearchResult } from '../StockMarketTicker'

const SEARCH_DEBOUNCE_MS = 300

async function searchStocks(query: string): Promise<StockSearchResult[]> {
  if (!query) return []
  
  const yahooSearchUrl = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=10&newsCount=0`
  const response = await fetch(yahooSearchUrl)
  if (!response.ok) throw new Error('Search failed')
  
  const data = await response.json()
  return data.quotes.map((quote: any) => ({
    symbol: quote.symbol,
    name: quote.longname || quote.shortname || '',
    type: quote.quoteType,
    region: quote.region || '',
    currency: quote.currency || ''
  }))
}

interface StockSearchProps {
  onSearchInputChange: (value: string) => void
  onAddStock: (stock: StockSearchResult) => void
  searchInput: string
  searchResults: StockSearchResult[]
  isSearching: boolean
  activeSymbols: string[]
  showDropdown: boolean
  onShowDropdown: (show: boolean) => void
}

export function StockSearch({
  onSearchInputChange,
  onAddStock,
  searchInput,
  searchResults,
  isSearching,
  activeSymbols,
  showDropdown,
  onShowDropdown
}: StockSearchProps) {
  const { t } = useTranslation(['cards', 'common'])

  return (
    <div className="mb-3 space-y-2">
      <div className="relative">
        <div className="flex items-center gap-2 p-2 border border-border/50 rounded-lg bg-card">
          <SearchIcon className="w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder={t('stockMarket.searchPlaceholder')}
            value={searchInput}
            onChange={(e) => onSearchInputChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && searchResults.length > 0) {
                e.preventDefault()
                onAddStock(searchResults[0])
              }
            }}
            className="flex-1 bg-transparent text-sm outline-hidden placeholder:text-muted-foreground"
          />
          {isSearching && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
          {searchInput && (
            <button
              onClick={() => {
                onSearchInputChange('')
                onShowDropdown(false)
              }}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {showDropdown && searchResults.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-lg z-dropdown max-h-60 overflow-y-auto">
            {searchResults.map((result) => (
              <button
                key={result.symbol}
                onClick={() => onAddStock(result)}
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
