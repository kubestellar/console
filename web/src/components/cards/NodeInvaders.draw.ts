import {
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  PLAYER_WIDTH,
  INVADER_WIDTH,
  INVADER_HEIGHT,
  NODE_INVADERS_BG,
  NODE_INVADERS_STARS,
  NODE_INVADERS_SHIELD_TEAL,
  NODE_INVADERS_SHIELD_PATTERN,
  NODE_INVADERS_INVADER_RED,
  NODE_INVADERS_INVADER_YELLOW,
  NODE_INVADERS_INVADER_GREEN,
  NODE_INVADERS_INVADER_EYES,
  NODE_INVADERS_PLAYER_SHIP,
  NODE_INVADERS_PLAYER_COCKPIT,
  NODE_INVADERS_BULLET_PLAYER,
  NODE_INVADERS_BULLET_ENEMY,
  type Player,
  type Bullet,
  type Invader,
  type Shield } from './NodeInvaders.constants'

export interface NodeInvadersScene {
  player: Player
  bullets: Bullet[]
  invaders: Invader[]
  shields: Shield[]
}

/** Renders one frame of the Node Invaders game onto the canvas context. */
export function drawNodeInvadersScene(
  ctx: CanvasRenderingContext2D,
  { player, bullets, invaders, shields }: NodeInvadersScene,
  scale: number,
) {
  ctx.save()
  ctx.scale(scale, scale)

  // Background
  ctx.fillStyle = NODE_INVADERS_BG
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)

  // Stars
  ctx.fillStyle = NODE_INVADERS_STARS
  for (let i = 0; i < 30; i++) {
    ctx.fillRect((i * 47) % CANVAS_WIDTH, (i * 31) % CANVAS_HEIGHT, 1, 1)
  }

  // Draw shields
  for (const s of shields) {
    if (s.health <= 0) continue
    const alpha = s.health / 4
    ctx.fillStyle = NODE_INVADERS_SHIELD_TEAL(alpha)
    ctx.fillRect(s.x, s.y, 30, 20)
    // Shield pattern
    ctx.fillStyle = NODE_INVADERS_SHIELD_PATTERN(alpha)
    ctx.fillRect(s.x + 10, s.y + 15, 10, 5)
  }

  // Draw invaders (nodes/pods)
  for (const inv of invaders) {
    if (!inv.alive) continue

    // Different colors for different types
    const colors = [NODE_INVADERS_INVADER_RED, NODE_INVADERS_INVADER_YELLOW, NODE_INVADERS_INVADER_GREEN]
    ctx.fillStyle = colors[inv.type]

    // Invader body (node shape)
    ctx.fillRect(inv.x + 2, inv.y + 4, INVADER_WIDTH - 4, INVADER_HEIGHT - 8)
    ctx.fillRect(inv.x, inv.y + 6, INVADER_WIDTH, INVADER_HEIGHT - 12)

    // Eyes
    ctx.fillStyle = NODE_INVADERS_INVADER_EYES
    ctx.fillRect(inv.x + 5, inv.y + 6, 4, 4)
    ctx.fillRect(inv.x + INVADER_WIDTH - 9, inv.y + 6, 4, 4)

    // Legs
    ctx.fillStyle = colors[inv.type]
    ctx.fillRect(inv.x + 2, inv.y + INVADER_HEIGHT - 4, 4, 4)
    ctx.fillRect(inv.x + INVADER_WIDTH - 6, inv.y + INVADER_HEIGHT - 4, 4, 4)
  }

  // Draw player (kubectl ship)
  ctx.fillStyle = NODE_INVADERS_PLAYER_SHIP
  // Ship body
  ctx.beginPath()
  ctx.moveTo(player.x + PLAYER_WIDTH / 2, CANVAS_HEIGHT - 40)
  ctx.lineTo(player.x, CANVAS_HEIGHT - 20)
  ctx.lineTo(player.x + PLAYER_WIDTH, CANVAS_HEIGHT - 20)
  ctx.closePath()
  ctx.fill()
  // Ship base
  ctx.fillRect(player.x + 5, CANVAS_HEIGHT - 20, PLAYER_WIDTH - 10, 8)
  // Cockpit
  ctx.fillStyle = NODE_INVADERS_PLAYER_COCKPIT
  ctx.fillRect(player.x + PLAYER_WIDTH / 2 - 3, CANVAS_HEIGHT - 35, 6, 6)

  // Draw bullets
  for (const b of bullets) {
    ctx.fillStyle = b.isPlayer ? NODE_INVADERS_BULLET_PLAYER : NODE_INVADERS_BULLET_ENEMY
    ctx.fillRect(b.x - 2, b.y, 4, b.isPlayer ? 10 : 8)
  }

  ctx.restore()
}
