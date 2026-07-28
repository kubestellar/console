import { useState } from 'react'
import { Clock, BarChart3, Loader2 } from 'lucide-react'
import { CardControlsRow, CardPaginationFooter } from '../../lib/cards/CardComponents'
import { useTranslation } from 'react-i18next'
import { StockRow } from './stockMarketTicker/StockRow'
import { SymbolSearch } from './stockMarketTicker/SymbolSearch'
import { getMarketStatus } from './stockMarketTicker/dataHelpers'
import { useStockTickerData, SORT_OPTIONS } from './stockMarketTicker/useStockTickerData'
import { DEFAULT_SYMBOLS, type SortByOption, type StockMarketTickerProps } from './stockMarketTicker/types'

export function StockMarketTicker({ config }: StockMarketTickerProps) {
  const { t } = useTranslation(['cards', 'common'])
  const symbols = config?.symbols || DEFAULT_SYMBOLS
  const dataSource = config?.dataSource || 'Yahoo Finance'

  const [expandedStocks, setExpandedStocks] = useState<Set<string>>(new Set())

  const {
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
  } = useStockTickerData(symbols)

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
