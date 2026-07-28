import { MS_PER_HOUR } from '../../../lib/constants/time'

export const CARD_REFRESH_SPINNER_MAX_AGE_MS = 500
export const MIN_SPIN_DURATION = CARD_REFRESH_SPINNER_MAX_AGE_MS
export const COLLAPSED_CARDS_STORAGE_KEY = 'kubestellar-collapsed-cards'
export const CONTAINER_QUERY_STYLE = { containerType: 'inline-size' } as const
export const DEFAULT_SNOOZE_MS = MS_PER_HOUR
export const LAST_UPDATED_TICK_MS = 60_000
export const COLLAPSE_DELAY_MS = 300

export const LARGE_EXPANDED_CARDS = new Set([
  'cluster_comparison',
  'cluster_resource_tree',
  'kvcache_monitor',
  'pd_disaggregation',
  'llmd_ai_insights',
])

export const FULLSCREEN_EXPANDED_CARDS = new Set([
  'cluster_locations',
  'mobile_browser',
  'llmd_flow', 'epp_routing',
  'sudoku_game', 'container_tetris', 'node_invaders', 'kube_snake',
  'flappy_pod', 'kube_pong', 'kube_kong', 'game_2048', 'kube_man',
  'kube_galaga', 'kube_chess', 'checkers', 'pod_crosser', 'pod_brothers',
  'pod_pitfall', 'match_game', 'solitaire', 'kubedle', 'pod_sweeper',
  'kube_doom', 'kube_kart',
])
