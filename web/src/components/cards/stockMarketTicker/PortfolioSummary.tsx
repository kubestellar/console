import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { StockData } from '../StockMarketTicker'

interface PortfolioSummaryProps {
  stockData: StockData[]
}

export function PortfolioSummary({ stockData }: PortfolioSummaryProps) {
  const { t } = useTranslation(['cards', 'common'])

  const portfolioSummary = useMemo(() => {
    const totalChange = stockData.reduce((sum, stock) => sum + stock.changePercent, 0)
    const avgChange = stockData.length > 0 ? totalChange / stockData.length : 0
    const gainers = stockData.filter(s => s.change > 0).length
    const losers = stockData.filter(s => s.change < 0).length

    return { avgChange, gainers, losers }
  }, [stockData])

  return (
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
  )
}
