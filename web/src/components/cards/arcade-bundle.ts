/**
 * Arcade / Game Cards — barrel export
 *
 * Groups all 24 game cards used on the Arcade dashboard into a single chunk.
 * When `import('./arcade-bundle')` is eagerly started at module parse time
 * and shared across all lazy() references, the browser downloads one chunk
 * instead of 24, eliminating HTTP connection contention and dramatically
 * reducing chunk_load errors after a deploy (stale cache would hit at most
 * one 404 instead of 24+).
 */

export { SudokuGame } from './SudokuGame'
export { MatchGame } from './MatchGame'
export { Solitaire } from './Solitaire'
export { Checkers } from './Checkers'
export { Game2048 } from './Game2048'
export { Kubedle } from './Kubedle'
export { PodSweeper } from './PodSweeper'
export { ContainerTetris } from './ContainerTetris'
export { FlappyPod } from './FlappyPod'
export { KubeMan } from './KubeMan'
export { KubeKong } from './KubeKong'
export { PodPitfall } from './PodPitfall'
export { NodeInvaders } from './NodeInvaders'
export { MissileCommand } from './MissileCommand'
export { PodCrosser } from './PodCrosser'
export { PodBrothers } from './PodBrothers'
export { KubeKart } from './KubeKart'
export { KubePong } from './KubePong'
export { KubeSnake } from './KubeSnake'
export { KubeGalaga } from './KubeGalaga'
export { KubeBert } from './KubeBert'
export { KubeDoom } from './KubeDoom'
export { KubeChess } from './KubeChess'
