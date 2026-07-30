/**
 * AI Codebase Maturity Model — source definition.
 *
 * Data has been split into focused sub-files (tracked by #15790):
 *   - acmm.levels.ts   — maturity level definitions (L0–L6)
 *   - acmm.criteria.ts — criterion definitions
 *
 * This file assembles those parts and exports the Source object.
 */
import type { Source } from './types'
import LEVELS from './acmm.levels'
import CRITERIA from './acmm.criteria'

export const acmmSource: Source = {
  id: 'acmm',
  name: 'AI Codebase Maturity Model',
  url: 'https://arxiv.org/abs/2604.09388',
  citation: 'Anderson, A. (2026). The AI Codebase Maturity Model: From Assisted Coding to Fully Autonomous Systems. arXiv:2604.09388v2',
  definesLevels: true,
  levels: LEVELS,
  criteria: CRITERIA,
}
