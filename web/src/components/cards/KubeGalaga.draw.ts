// Canvas rendering for the KubeGalaga arcade card.
// Extracted verbatim from KubeGalaga.tsx (issue #24058) — drawing unchanged.
import {
  BULLET_HEIGHT,
  BULLET_WIDTH,
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  COLORS,
  ENEMY_HEIGHT,
  ENEMY_WIDTH,
  PLAYER_HEIGHT,
  PLAYER_WIDTH,
  type Bullet,
  type Enemy,
  type PlayerPosition,
  type Star,
} from './KubeGalaga.constants'

export interface KubeGalagaScene {
  stars: Star[]
  player: PlayerPosition
  invincible: number
  bullets: Bullet[]
  enemies: Enemy[]
}

export function drawKubeGalagaScene(ctx: CanvasRenderingContext2D, scene: KubeGalagaScene): void {
  const { stars, player, invincible, bullets, enemies } = scene

  // Clear
  ctx.fillStyle = COLORS.background
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)

  // Draw stars
  ctx.fillStyle = COLORS.star
  stars.forEach(star => {
    ctx.globalAlpha = 0.3 + star.size * 0.3
    ctx.fillRect(star.x, star.y, star.size, star.size)
  })
  ctx.globalAlpha = 1

  // Draw player with glow
  if (invincible <= 0 || Math.floor(invincible / 5) % 2 === 0) {
    ctx.fillStyle = COLORS.playerGlow
    ctx.beginPath()
    ctx.arc(player.x + PLAYER_WIDTH / 2, player.y + PLAYER_HEIGHT / 2, PLAYER_WIDTH, 0, Math.PI * 2)
    ctx.fill()

    ctx.fillStyle = COLORS.player
    // Ship body
    ctx.beginPath()
    ctx.moveTo(player.x + PLAYER_WIDTH / 2, player.y)
    ctx.lineTo(player.x, player.y + PLAYER_HEIGHT)
    ctx.lineTo(player.x + PLAYER_WIDTH / 4, player.y + PLAYER_HEIGHT - 5)
    ctx.lineTo(player.x + PLAYER_WIDTH / 2, player.y + PLAYER_HEIGHT)
    ctx.lineTo(player.x + (PLAYER_WIDTH * 3) / 4, player.y + PLAYER_HEIGHT - 5)
    ctx.lineTo(player.x + PLAYER_WIDTH, player.y + PLAYER_HEIGHT)
    ctx.closePath()
    ctx.fill()
  }

  // Draw bullets
  bullets.forEach(bullet => {
    ctx.fillStyle = bullet.isEnemy ? COLORS.enemyBullet : COLORS.bullet
    if (bullet.isEnemy) {
      ctx.fillRect(bullet.x, bullet.y, 4, 8)
    } else {
      ctx.fillRect(bullet.x, bullet.y, BULLET_WIDTH, BULLET_HEIGHT)
    }
  })

  // Draw enemies
  enemies.forEach(enemy => {
    if (!enemy.alive) return

    const colors = [COLORS.enemy1, COLORS.enemy2, COLORS.enemy3, COLORS.enemy2]
    ctx.fillStyle = colors[enemy.row % 4]

    // Bug-like enemy shape
    ctx.beginPath()
    ctx.arc(enemy.x + ENEMY_WIDTH / 2, enemy.y + ENEMY_HEIGHT / 2, ENEMY_WIDTH / 2, 0, Math.PI * 2)
    ctx.fill()

    // Wings
    ctx.beginPath()
    ctx.ellipse(enemy.x + 2, enemy.y + ENEMY_HEIGHT / 2, 6, 10, -0.3, 0, Math.PI * 2)
    ctx.ellipse(enemy.x + ENEMY_WIDTH - 2, enemy.y + ENEMY_HEIGHT / 2, 6, 10, 0.3, 0, Math.PI * 2)
    ctx.fill()

    // Eyes
    ctx.fillStyle = '#fff'
    ctx.beginPath()
    ctx.arc(enemy.x + ENEMY_WIDTH / 3, enemy.y + ENEMY_HEIGHT / 3, 3, 0, Math.PI * 2)
    ctx.arc(enemy.x + (ENEMY_WIDTH * 2) / 3, enemy.y + ENEMY_HEIGHT / 3, 3, 0, Math.PI * 2)
    ctx.fill()
  })
}
