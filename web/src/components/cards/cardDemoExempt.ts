// Cards exempt from demo/offline skeletons — pure data, no runtime deps.

/**
 * Cards that never show demo/offline skeletons — arcade games and admin-only cards.
 * Moved here from cardRegistry.ts to avoid pulling the heavy card config
 * barrel (~195 KB) into the main chunk via CardWrapper.
 */
export const DEMO_EXEMPT_CARDS = new Set([
  // All arcade games - never show skeleton, always show game content
  'sudoku_game',
  'checkers',
  'container_tetris',
  'kube_kong',
  'pod_crosser',
  'kube_kart',
  'kube_snake',
  'kube_chess',
  'kube_man',
  'node_invaders',
  'flappy_pod',
  'pod_pitfall',
  'pod_brothers',
  'match_game',
  'solitaire',
  'game_2048',
  'kubedle',
  'pod_sweeper',
  'kube_pong',
  'kube_galaga',
  'kube_doom',
  'dynamic_card',
  // Cluster admin cards - no demo/live concept
  'maintenance_windows',
  'node_debug',
])
