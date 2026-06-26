/**
 * Arcade/Game Card Config Tests
 */
import { describe, it, expect } from 'vitest'
import { containerTetrisConfig } from '../container-tetris'
import { flappyPodConfig } from '../flappy-pod'
import { game2048Config } from '../game-2048'
import { kubeBertConfig } from '../kube-bert'
import { kubeChessConfig } from '../kube-chess'
import { kubeDoomConfig } from '../kube-doom'
import { kubeGalagaConfig } from '../kube-galaga'
import { kubeKartConfig } from '../kube-kart'
import { kubeKongConfig } from '../kube-kong'
import { kubeManConfig } from '../kube-man'
import { kubePongConfig } from '../kube-pong'
import { kubeSnakeConfig } from '../kube-snake'
import { kubedleConfig } from '../kubedle'
import { checkersConfig } from '../checkers'
import { matchGameConfig } from '../match-game'
import { nodeInvadersConfig } from '../node-invaders'
import { missileCommandConfig } from '../missile-command'
import { podBrothersConfig } from '../pod-brothers'
import { podCrosserConfig } from '../pod-crosser'
import { podPitfallConfig } from '../pod-pitfall'
import { podSweeperConfig } from '../pod-sweeper'
import { solitaireConfig } from '../solitaire'
import { sudokuGameConfig } from '../sudoku-game'

const gameCards = [
  { name: 'containerTetris', config: containerTetrisConfig },
  { name: 'flappyPod', config: flappyPodConfig },
  { name: 'game2048', config: game2048Config },
  { name: 'kubeBert', config: kubeBertConfig },
  { name: 'kubeChess', config: kubeChessConfig },
  { name: 'kubeDoom', config: kubeDoomConfig },
  { name: 'kubeGalaga', config: kubeGalagaConfig },
  { name: 'kubeKart', config: kubeKartConfig },
  { name: 'kubeKong', config: kubeKongConfig },
  { name: 'kubeMan', config: kubeManConfig },
  { name: 'kubePong', config: kubePongConfig },
  { name: 'kubeSnake', config: kubeSnakeConfig },
  { name: 'kubedle', config: kubedleConfig },
  { name: 'checkers', config: checkersConfig },
  { name: 'matchGame', config: matchGameConfig },
  { name: 'nodeInvaders', config: nodeInvadersConfig },
  { name: 'missileCommand', config: missileCommandConfig },
  { name: 'podBrothers', config: podBrothersConfig },
  { name: 'podCrosser', config: podCrosserConfig },
  { name: 'podPitfall', config: podPitfallConfig },
  { name: 'podSweeper', config: podSweeperConfig },
  { name: 'solitaire', config: solitaireConfig },
  { name: 'sudokuGame', config: sudokuGameConfig },
]

describe('Game/arcade card configs', () => {
  it.each(gameCards)('$name has valid structure', ({ config }) => {
    expect(config.type).toBeTruthy()
    expect(config.title).toBeTruthy()
    expect(config.category).toBeTruthy()
    expect(config.content).toBeDefined()
    expect(config.dataSource).toBeDefined()
  })

  it.each(gameCards)('$name belongs to a game-related category', ({ config }) => {
    expect(['arcade', 'games', 'game']).toContain(config.category)
  })
})
