import { safeLazy } from '../../lib/safeLazy'
import type { CardRegistryCategory } from './cardRegistry.types'

const Kubectl = safeLazy(() => import('./Kubectl'), 'Kubectl')
const _arcadeBundle = import('./arcade-bundle').catch(() => undefined as never)
const SudokuGame = safeLazy(() => _arcadeBundle, 'SudokuGame')
const MatchGame = safeLazy(() => _arcadeBundle, 'MatchGame')
const Solitaire = safeLazy(() => _arcadeBundle, 'Solitaire')
const Checkers = safeLazy(() => _arcadeBundle, 'Checkers')
const Game2048 = safeLazy(() => _arcadeBundle, 'Game2048')
const Kubedle = safeLazy(() => _arcadeBundle, 'Kubedle')
const PodSweeper = safeLazy(() => _arcadeBundle, 'PodSweeper')
const ContainerTetris = safeLazy(() => _arcadeBundle, 'ContainerTetris')
const FlappyPod = safeLazy(() => _arcadeBundle, 'FlappyPod')
const KubeMan = safeLazy(() => _arcadeBundle, 'KubeMan')
const KubeKong = safeLazy(() => _arcadeBundle, 'KubeKong')
const PodPitfall = safeLazy(() => _arcadeBundle, 'PodPitfall')
const NodeInvaders = safeLazy(() => _arcadeBundle, 'NodeInvaders')
const MissileCommand = safeLazy(() => _arcadeBundle, 'MissileCommand')
const PodCrosser = safeLazy(() => _arcadeBundle, 'PodCrosser')
const PodBrothers = safeLazy(() => _arcadeBundle, 'PodBrothers')
const KubeKart = safeLazy(() => _arcadeBundle, 'KubeKart')
const KubePong = safeLazy(() => _arcadeBundle, 'KubePong')
const KubeSnake = safeLazy(() => _arcadeBundle, 'KubeSnake')
const KubeGalaga = safeLazy(() => _arcadeBundle, 'KubeGalaga')
const KubeBert = safeLazy(() => _arcadeBundle, 'KubeBert')
const KubeDoom = safeLazy(() => _arcadeBundle, 'KubeDoom')
const IframeEmbed = safeLazy(() => import('./IframeEmbed'), 'IframeEmbed')
const NetworkUtils = safeLazy(() => import('./NetworkUtils'), 'NetworkUtils')
const MobileBrowser = safeLazy(() => import('./MobileBrowser'), 'MobileBrowser')
const KubeChess = safeLazy(() => _arcadeBundle, 'KubeChess')

export const miscCardRegistry: CardRegistryCategory = {
  components: {
    kubectl: Kubectl, sudoku_game: SudokuGame, match_game: MatchGame, solitaire: Solitaire, checkers: Checkers,
    game_2048: Game2048, kubedle: Kubedle, pod_sweeper: PodSweeper, container_tetris: ContainerTetris,
    flappy_pod: FlappyPod, kube_man: KubeMan, kube_kong: KubeKong, pod_pitfall: PodPitfall,
    node_invaders: NodeInvaders, missile_command: MissileCommand, pod_crosser: PodCrosser,
    pod_brothers: PodBrothers, kube_kart: KubeKart, kube_pong: KubePong, kube_snake: KubeSnake,
    kube_galaga: KubeGalaga, kube_bert: KubeBert, kube_doom: KubeDoom, iframe_embed: IframeEmbed,
    network_utils: NetworkUtils, mobile_browser: MobileBrowser, kube_chess: KubeChess,
  },
  preloaders: {
    kubectl: () => import('./Kubectl'), sudoku_game: () => import('./arcade-bundle'), match_game: () => import('./arcade-bundle'),
    solitaire: () => import('./arcade-bundle'), checkers: () => import('./arcade-bundle'), game_2048: () => import('./arcade-bundle'),
    kubedle: () => import('./arcade-bundle'), pod_sweeper: () => import('./arcade-bundle'), container_tetris: () => import('./arcade-bundle'),
    flappy_pod: () => import('./arcade-bundle'), kube_man: () => import('./arcade-bundle'), kube_kong: () => import('./arcade-bundle'),
    pod_pitfall: () => import('./arcade-bundle'), node_invaders: () => import('./arcade-bundle'), missile_command: () => import('./arcade-bundle'),
    pod_crosser: () => import('./arcade-bundle'), pod_brothers: () => import('./arcade-bundle'), kube_kart: () => import('./arcade-bundle'),
    kube_pong: () => import('./arcade-bundle'), kube_snake: () => import('./arcade-bundle'), kube_galaga: () => import('./arcade-bundle'),
    kube_bert: () => import('./arcade-bundle'), kube_doom: () => import('./arcade-bundle'), iframe_embed: () => import('./IframeEmbed'),
    network_utils: () => import('./NetworkUtils'), mobile_browser: () => import('./MobileBrowser'), kube_chess: () => import('./arcade-bundle'),
  },
  defaultWidths: {
    kubectl: 8, sudoku_game: 6, match_game: 6, solitaire: 6, checkers: 6, game_2048: 5, kubedle: 6, pod_sweeper: 6,
    container_tetris: 6, flappy_pod: 6, kube_man: 6, kube_kong: 6, pod_pitfall: 6, node_invaders: 6,
    missile_command: 6, pod_crosser: 6, pod_brothers: 6, kube_kart: 5, kube_pong: 5, kube_snake: 5,
    kube_galaga: 5, kube_bert: 5, kube_doom: 6, iframe_embed: 6, network_utils: 5, mobile_browser: 5, kube_chess: 5,
  },
}
