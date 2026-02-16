import { DashboardPage } from '../../lib/dashboards/DashboardPage'
import { getDefaultCards } from '../../config/dashboards'
import { useTranslation } from 'react-i18next'

const BENCHMARKS_CARDS_KEY = 'kubestellar-llmd-benchmarks-cards'
const DEFAULT_BENCHMARKS_CARDS = getDefaultCards('llm-d-benchmarks')

export function LLMdBenchmarks() {
  const { t } = useTranslation('cards')
  return (
    <DashboardPage
      title={t('titles.llmd_benchmarks')}
      subtitle={t('descriptions.llmd_benchmarks')}
      icon="TrendingUp"
      storageKey={BENCHMARKS_CARDS_KEY}
      defaultCards={DEFAULT_BENCHMARKS_CARDS}
      statsType="clusters"
      isLoading={false}
      isRefreshing={false}
    />
  )
}

export default LLMdBenchmarks
