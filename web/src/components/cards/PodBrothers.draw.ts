import {
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  TILE_SIZE,
  PLAYER_SIZE,
  BRICK,
  QUESTION,
  GROUND,
  PIPE,
  FLAG,
  COLORS,
  type Player,
  type Enemy,
  type Coin,
} from './PodBrothers.constants'

/** Draws a single Pod Brothers frame (sky, tiles, coins, enemies, player). */
export function drawPodBrothersFrame(
  ctx: CanvasRenderingContext2D,
  level: number[][],
  coins: Coin[],
  enemies: Enemy[],
  player: Player,
  invincibilityFrames: number,
): void {
  // Clear and draw sky
  ctx.fillStyle = COLORS.sky
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)

  // Draw tiles
  for (let row = 0; row < level.length; row++) {
    for (let col = 0; col < level[row].length; col++) {
      const tile = level[row][col]
      const x = col * TILE_SIZE
      const y = row * TILE_SIZE

      if (tile === BRICK) {
        ctx.fillStyle = COLORS.brick
        ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE)
        ctx.strokeStyle = '#000'
        ctx.strokeRect(x, y, TILE_SIZE, TILE_SIZE)
        // Brick pattern
        ctx.beginPath()
        ctx.moveTo(x + TILE_SIZE / 2, y)
        ctx.lineTo(x + TILE_SIZE / 2, y + TILE_SIZE)
        ctx.moveTo(x, y + TILE_SIZE / 2)
        ctx.lineTo(x + TILE_SIZE, y + TILE_SIZE / 2)
        ctx.stroke()
      } else if (tile === QUESTION) {
        ctx.fillStyle = COLORS.question
        ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE)
        ctx.strokeStyle = '#000'
        ctx.strokeRect(x, y, TILE_SIZE, TILE_SIZE)
        ctx.fillStyle = '#fff'
        ctx.font = 'bold 20px sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText('?', x + TILE_SIZE / 2, y + TILE_SIZE - 8)
      } else if (tile === GROUND) {
        ctx.fillStyle = COLORS.ground
        ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE)
      } else if (tile === PIPE) {
        ctx.fillStyle = COLORS.pipe
        ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE)
        ctx.fillStyle = '#00c000'
        ctx.fillRect(x + 2, y, TILE_SIZE - 4, TILE_SIZE)
      } else if (tile === FLAG) {
        // Flag pole
        ctx.fillStyle = '#888'
        ctx.fillRect(x + TILE_SIZE / 2 - 2, y, 4, TILE_SIZE * 2)
        // Flag
        ctx.fillStyle = COLORS.flag
        ctx.beginPath()
        ctx.moveTo(x + TILE_SIZE / 2 + 2, y + 4)
        ctx.lineTo(x + TILE_SIZE, y + TILE_SIZE / 2)
        ctx.lineTo(x + TILE_SIZE / 2 + 2, y + TILE_SIZE - 4)
        ctx.fill()
      }
    }
  }

  // Draw coins
  coins.forEach(coin => {
    if (coin.collected) return
    ctx.fillStyle = COLORS.coin
    ctx.beginPath()
    ctx.arc(coin.x, coin.y, 10, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = '#c90'
    ctx.lineWidth = 2
    ctx.stroke()
    ctx.lineWidth = 1
  })

  // Draw enemies
  enemies.forEach(enemy => {
    if (!enemy.alive) return
    ctx.fillStyle = COLORS.goomba
    ctx.fillRect(enemy.x + 4, enemy.y + 4, TILE_SIZE - 8, TILE_SIZE - 4)
    // Eyes
    ctx.fillStyle = '#fff'
    ctx.fillRect(enemy.x + 8, enemy.y + 10, 6, 6)
    ctx.fillRect(enemy.x + TILE_SIZE - 14, enemy.y + 10, 6, 6)
    ctx.fillStyle = '#000'
    ctx.fillRect(enemy.x + 10, enemy.y + 12, 3, 3)
    ctx.fillRect(enemy.x + TILE_SIZE - 12, enemy.y + 12, 3, 3)
  })

  // Draw player (Pod) — blink every 4 frames during invincibility for visual feedback
  const BLINK_INTERVAL = 4
  const isInvincible = invincibilityFrames > 0
  const shouldDraw = !isInvincible || Math.floor(invincibilityFrames / BLINK_INTERVAL) % 2 === 0

  if (shouldDraw) {
    ctx.fillStyle = COLORS.player
    ctx.fillRect(player.x, player.y, PLAYER_SIZE, PLAYER_SIZE)
    // Pod logo (circle)
    ctx.fillStyle = '#fff'
    ctx.beginPath()
    ctx.arc(player.x + PLAYER_SIZE / 2, player.y + PLAYER_SIZE / 2, 8, 0, Math.PI * 2)
    ctx.fill()
    // Eyes
    const eyeOffset = player.facingRight ? 4 : -4
    ctx.fillStyle = '#000'
    ctx.fillRect(player.x + PLAYER_SIZE / 2 + eyeOffset - 2, player.y + 6, 4, 4)
  }
}
