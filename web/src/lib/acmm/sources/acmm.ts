/**
 * ACMM source definition — assembles levels and criteria from sub-modules.
 *
 * Split from the original acmm.ts — see issue #15790 / #21610:
 *   acmm.levels.ts          — L0–L6 maturity level definitions
 *   acmm.criteria.l0l3.ts   — criteria for levels 0–3
 *   acmm.criteria.l4l6.ts   — criteria for levels 4–6
 *
 * All existing imports from this path continue to work.
 */
import type { Source } from './types'
import { LEVELS } from './acmm.levels'
import { CRITERIA_L0_L3 } from './acmm.criteria.l0l3'
import { CRITERIA_L4_L6 } from './acmm.criteria.l4l6'

const CRITERIA = [...CRITERIA_L0_L3, ...CRITERIA_L4_L6]

export const acmmSource: Source = {
  id: 'acmm',
  name: 'AI Codebase Maturity Model',
  url: 'https://arxiv.org/abs/2604.09388',
  citation: 'Anderson, A. (2026). The AI Codebase Maturity Model: From Assisted Coding to Fully Autonomous Systems. arXiv:2604.09388v2',
  definesLevels: true,
  levels: LEVELS,
  criteria: CRITERIA,
}

export { LEVELS, CRITERIA_L0_L3, CRITERIA_L4_L6, CRITERIA }
