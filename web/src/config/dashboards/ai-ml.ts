/**
 * AI/ML Dashboard Configuration
 */
import type { UnifiedDashboardConfig } from '../../lib/unified/types'

export const aiMlDashboardConfig: UnifiedDashboardConfig = {
  id: 'ai-ml',
  name: 'AI/ML Workloads',
  subtitle: 'LLM inference, ML jobs, and notebooks',
  route: '/ai-ml',
  statsType: 'ai-ml',
  cards: [
    { id: 'llm-models-1', cardType: 'llm_models', position: { w: 6, h: 4 } },
    { id: 'llm-inference-1', cardType: 'llm_inference', position: { w: 6, h: 4 } },
    { id: 'llmd-stack-monitor-1', cardType: 'llmd_stack_monitor', position: { w: 6, h: 3 } },
    { id: 'ml-jobs-1', cardType: 'ml_jobs', position: { w: 6, h: 3 } },
    { id: 'ml-notebooks-1', cardType: 'ml_notebooks', position: { w: 6, h: 3 } },
    { id: 'gpu-overview-1', cardType: 'gpu_overview', position: { w: 6, h: 3 } },
  ],
  features: {
    dragDrop: true,
    addCard: true,
    autoRefresh: true,
    autoRefreshInterval: 30000,
  },
  storageKey: 'ai-ml-dashboard-cards',
}

export default aiMlDashboardConfig
