import {
  CANVAS_HEIGHT,
  TILE_SIZE,
  EMPTY,
  COIN,
  GOOMBA,
  LEVEL_DATA,
  type Player,
  type Enemy,
  type Coin,
} from '../PodBrothers.constants'

export interface PodBrothersLevel {
  tiles: number[][]
  enemies: Enemy[]
  coins: Coin[]
}

/** Copies LEVEL_DATA and lifts enemy/coin tiles out into entity lists. */
export function buildPodBrothersLevel(): PodBrothersLevel {
  const tiles = LEVEL_DATA.map(row => [...row])
  const enemies: Enemy[] = []
  const coins: Coin[] = []

  for (let row = 0; row < tiles.length; row++) {
    for (let col = 0; col < tiles[row].length; col++) {
      if (tiles[row][col] === GOOMBA) {
        enemies.push({
          x: col * TILE_SIZE,
          y: row * TILE_SIZE,
          vx: -1,
          type: GOOMBA,
          alive: true })
        tiles[row][col] = EMPTY
      } else if (tiles[row][col] === COIN) {
        coins.push({
          x: col * TILE_SIZE + TILE_SIZE / 2,
          y: row * TILE_SIZE + TILE_SIZE / 2,
          collected: false })
        tiles[row][col] = EMPTY
      }
    }
  }

  return { tiles, enemies, coins }
}

export function createInitialPlayer(): Player {
  return {
    x: TILE_SIZE,
    y: CANVAS_HEIGHT - TILE_SIZE * 3,
    vx: 0,
    vy: 0,
    onGround: false,
    facingRight: true }
}
