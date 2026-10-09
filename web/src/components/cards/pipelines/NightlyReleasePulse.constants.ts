import {
  formatCron as formatCronUtil,
  dotColor as dotColorUtil,
  dotTextColor as dotTextColorUtil,
  computeTrend as computeTrendUtil,
} from './pulse-utils'

/** Max dots per row */
export const MAX_DOTS = 14
/** ms before hiding hover popup */
export const POPUP_HIDE_DELAY_MS = 200
/** Matrix days for dot rows */
export const MATRIX_DAYS = 14

export const WORKFLOW_URL_BASE = 'https://github.com'
export const TITLE_DIAGNOSE = 'Diagnose with AI'
export const TITLE_AUDIT = 'Audit workflow'

/** Extracted strings for ui-ux ratchet */
export const PLACEHOLDER_REPO = 'owner/repo'
export const LABEL_SET_REPO = 'Set repo to monitor'

// Re-export utility functions under their original names for local use
export const formatCron = formatCronUtil
export const dotColor = dotColorUtil
export const dotTextColor = dotTextColorUtil
export const computeTrend = computeTrendUtil
