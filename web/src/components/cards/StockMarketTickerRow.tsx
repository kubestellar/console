import { memo } from 'react'
import { TrendingUp, TrendingDown, ChevronDown, ChevronRight, Star, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { StockMarketSparkline } from './StockMarketSparkline'
import type { StockData } from './StockMarketTicker.types'

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

function formatVolume(num: number): string {
  if (num >= 1000000) {
    return `${(num / 1000000).toFixed(2)}M`
  } else if (num >= 1000) {
    return `${(num / 1000).toFixed(2)}K`
  }
  return num.toLocaleString()
}

export const StockMarketTickerRow = memo(function StockMarketTickerRow({
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

      <div
        className="flex items-center gap-3 p-3 pl-16 pr-4 hover:bg-accent/50 cursor-pointer transition-colors"
        onClick={onToggle}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-bold text-sm">{stock.symbol}</span>
            {expanded ? <ChevronDown className="w-3 h-3 text-muted-foreground" /> : <ChevronRight className="w-3 h-3 text-muted-foreground" />}
          </div>
          <div className="text-xs text-muted-foreground truncate">{stock.name}</div>
        </div>

        <div className="hidden @sm:block shrink-0">
          <StockMarketSparkline data={stock.sparklineData} isPositive={isPositive} />
        </div>

        <div className="text-right shrink-0">
          <div className="font-semibold text-sm">${stock.price.toFixed(2)}</div>
          <div className={`text-xs flex items-center justify-end gap-1 ${isPositive ? 'text-green-500' : 'text-red-500'}`}>
            {isPositive ? <TrendingUp className="w-3 h-3" aria-hidden="true" /> : <TrendingDown className="w-3 h-3" aria-hidden="true" />}
            <span>{isPositive ? '+' : ''}{stock.changePercent.toFixed(2)}%</span>
          </div>
        </div>
      </div>

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
})
