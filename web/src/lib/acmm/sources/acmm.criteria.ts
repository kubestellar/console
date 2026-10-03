/**
 * ACMM maturity criteria definitions.
 *
 * Extracted from acmm.ts as part of the per-source split (tracked by #15790).
 * Imported by acmm.ts to build the Source export.
 */
import type { Criterion } from './types'
import { EARLY_CRITERIA } from './acmm.criteria.early'
import { ADVANCED_CRITERIA } from './acmm.criteria.advanced'

const CRITERIA: Criterion[] = [...EARLY_CRITERIA, ...ADVANCED_CRITERIA]

export default CRITERIA
