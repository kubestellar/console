/**
 * ACMM Dashboard Configuration
 *
 * AI Codebase Maturity Model dashboard — assesses any GitHub repo against
 * the ACMM framework plus 3 complementary sources (fullsend, agentic
 * engineering framework, claude-reflect).
 */
import type { UnifiedDashboardConfig } from '../../lib/unified/types'

const AUTO_REFRESH_INTERVAL_MS = 15 * 60 * 1000

export const acmmDashboardConfig: UnifiedDashboardConfig = {
  id: 'acmm',
  name: 'AI Codebase Maturity',
  subtitle: 'Assess any GitHub repo against the AI Codebase Maturity Model',
  route: '/acmm',
  statsType: 'acmm',
  cards: [
    { id: 'acmm-level-1', cardType: 'acmm_level', title: 'Current Level', position: { w: 4, h: 4 } },
    { id: 'acmm-balance-1', cardType: 'acmm_balance', title: 'Human vs AI Balance', position: { w: 8, h: 4 } },
    { id: 'acmm-feedback-loops-1', cardType: 'acmm_feedback_loops', title: 'Feedback Loop Inventory', position: { w: 6, h: 5 } },
    { id: 'acmm-recommendations-1', cardType: 'acmm_recommendations', title: 'Your Role + Next Steps', position: { w: 6, h: 5 } },
  ],
  features: {
    dragDrop: true,
    addCard: true,
    autoRefresh: true,
    autoRefreshInterval: AUTO_REFRESH_INTERVAL_MS,
  },
  storageKey: 'kubestellar-acmm-cards',
}

export default acmmDashboardConfig
