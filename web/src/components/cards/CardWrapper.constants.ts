import { MS_PER_HOUR } from '../../lib/constants/time'

// Minimum duration to show spin animation (ensures at least one full rotation)
const CARD_REFRESH_SPINNER_MAX_AGE_MS = 500
export const MIN_SPIN_DURATION = CARD_REFRESH_SPINNER_MAX_AGE_MS

export const COLLAPSED_CARDS_STORAGE_KEY = 'kubestellar-collapsed-cards'

/** CSS container query style for card content responsive breakpoints */
export const CONTAINER_QUERY_STYLE = { containerType: 'inline-size' } as const

/** Default snooze duration for card swaps */
export const DEFAULT_SNOOZE_MS = MS_PER_HOUR

/**
 * Re-render interval for the "last updated" label in ms. When SSE refresh
 * fails, the card's lastUpdated prop is frozen at the last successful fetch,
 * so without this ticker the label would render "5d ago" forever (#9104).
 * One minute is enough resolution for an "Xm/Xh/Xd" label and is cheap.
 */
export const LAST_UPDATED_TICK_MS = 60_000

export const COLLAPSE_DELAY_MS = 300

// Cards that need extra-large expanded modal (for maps, complex visualizations, etc.)
// These use 95vh height and 7xl width instead of the default 80vh/4xl
export const LARGE_EXPANDED_CARDS = new Set([
  'cluster_comparison',
  'cluster_resource_tree',
  // AI-ML cards that need more space when expanded
  'kvcache_monitor',
  'pd_disaggregation',
  'llmd_ai_insights',
])

// Cards that should be nearly fullscreen when expanded (maps, large visualizations, games)
export const FULLSCREEN_EXPANDED_CARDS = new Set([
  'cluster_locations',
  'mobile_browser', // Shows iPad view when expanded
  // AI-ML visualization cards benefit from full viewport
  'llmd_flow', 'epp_routing',
  // All arcade games need fullscreen to fill the entire screen
  'sudoku_game', 'container_tetris', 'node_invaders', 'kube_snake',
  'flappy_pod', 'kube_pong', 'kube_kong', 'game_2048', 'kube_man',
  'kube_galaga', 'kube_chess', 'checkers', 'pod_crosser', 'pod_brothers',
  'pod_pitfall', 'match_game', 'solitaire', 'kubedle', 'pod_sweeper',
  'kube_doom', 'kube_kart',
])
