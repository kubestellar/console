import { useEffect } from 'react'
import { DashboardPage } from '../../lib/dashboards/DashboardPage'
import { getDefaultCards } from '../../config/dashboards'
import { emitBenchmarkViewed } from '../../lib/analytics'
import { RotatingTip } from '../ui/RotatingTip'

const BENCHMARKS_CARDS_KEY = 'kubestellar-llmd-benchmarks-cards'
const DEFAULT_BENCHMARKS_CARDS = getDefaultCards('llm-d-benchmarks')

export function LLMdBenchmarks() {
  useEffect(() => {
    emitBenchmarkViewed('llm-d')
  }, [])

  return (
    <DashboardPage
      title="llm-d Benchmarks"
      subtitle="Performance tracking across clouds and accelerators"
      icon="TrendingUp"
      rightExtra={<RotatingTip page="llm-d-benchmarks" />}
      storageKey={BENCHMARKS_CARDS_KEY}
      defaultCards={DEFAULT_BENCHMARKS_CARDS}
      statsType="clusters"
      isLoading={false}
      isRefreshing={false}
    />
  )
}

export default LLMdBenchmarks
