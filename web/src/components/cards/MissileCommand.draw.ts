// Canvas rendering for the MissileCommand arcade card.
// Extracted verbatim from MissileCommand.tsx (issue #24058) — drawing unchanged.
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  CITY_WIDTH,
  GROUND_Y,
  INITIAL_AMMO,
  MISSILE_BATTERY_WIDTH,
  STAR_COUNT,
  type MissileCommandGameState,
} from './MissileCommand.constants'

export function drawMissileCommandScene(
  ctx: CanvasRenderingContext2D,
  state: MissileCommandGameState,
  scale: number,
  showCursor: boolean,
): void {
  ctx.save()
  ctx.scale(scale, scale)

  // Background — dark sky
  ctx.fillStyle = '#050510'
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)

  // Stars
  ctx.fillStyle = 'rgba(255,255,255,0.5)'
  for (let i = 0; i < STAR_COUNT; i++) {
    ctx.fillRect((i * 53 + 7) % CANVAS_WIDTH, (i * 37 + 11) % (CANVAS_HEIGHT - 30), 1, 1)
  }

  // Enemy missile trails + heads
  for (const m of state.enemyMissiles) {
    ctx.strokeStyle = 'rgba(255,80,80,0.4)'
    ctx.lineWidth = 1
    ctx.beginPath()
    if (m.trail.length > 0) {
      ctx.moveTo(m.trail[0].x, m.trail[0].y)
      for (const pt of m.trail) ctx.lineTo(pt.x, pt.y)
    }
    ctx.stroke()
    ctx.fillStyle = '#ff4040'
    ctx.beginPath()
    ctx.arc(m.x, m.y, 3, 0, Math.PI * 2)
    ctx.fill()
  }

  // Player missiles
  for (const m of state.playerMissiles) {
    ctx.fillStyle = '#40cfff'
    ctx.beginPath()
    ctx.arc(m.x, m.y, 2, 0, Math.PI * 2)
    ctx.fill()
  }

  // Explosions
  for (const ex of state.explosions) {
    const alpha = ex.growing ? 0.8 : (1 - ex.radius / ex.maxRadius) * 0.6
    const gradient = ctx.createRadialGradient(ex.x, ex.y, 0, ex.x, ex.y, ex.radius)
    gradient.addColorStop(0, `rgba(255,220,80,${alpha})`)
    gradient.addColorStop(0.5, `rgba(255,100,20,${alpha * 0.7})`)
    gradient.addColorStop(1, `rgba(255,40,0,0)`)
    ctx.fillStyle = gradient
    ctx.beginPath()
    ctx.arc(ex.x, ex.y, ex.radius, 0, Math.PI * 2)
    ctx.fill()
  }

  // Ground
  ctx.fillStyle = '#3a6640'
  ctx.fillRect(0, GROUND_Y, CANVAS_WIDTH, CANVAS_HEIGHT - GROUND_Y)

  // Cities — represented as little buildings
  for (const city of state.cities) {
    if (!city.alive) continue
    ctx.fillStyle = '#5bc4f5'
    ctx.fillRect(city.x - CITY_WIDTH / 2, GROUND_Y - 14, CITY_WIDTH, 14)
    ctx.fillStyle = '#7ad9ff'
    ctx.fillRect(city.x - CITY_WIDTH / 2 + 2, GROUND_Y - 18, CITY_WIDTH - 4, 5)
    ctx.fillStyle = '#ffeb80'
    for (let w = 0; w < 3; w++) {
      ctx.fillRect(city.x - CITY_WIDTH / 2 + 4 + w * 6, GROUND_Y - 11, 4, 4)
    }
    ctx.fillStyle = '#7ad9ff'
    ctx.font = '7px monospace'
    ctx.textAlign = 'center'
    ctx.fillText('⬡', city.x, GROUND_Y - 2)
  }

  // Missile batteries
  for (const batt of state.batteries) {
    if (batt.ammo <= 0) {
      ctx.fillStyle = '#444'
      ctx.fillRect(batt.x, GROUND_Y - 10, MISSILE_BATTERY_WIDTH, 10)
      continue
    }
    ctx.fillStyle = '#a0a0a0'
    ctx.fillRect(batt.x, GROUND_Y - 8, MISSILE_BATTERY_WIDTH, 8)
    ctx.fillStyle = '#d0d0d0'
    ctx.fillRect(batt.x + 6, GROUND_Y - 14, 6, 8)
    for (let a = 0; a < Math.min(batt.ammo, INITIAL_AMMO); a++) {
      ctx.fillStyle = a < batt.ammo ? '#40cfff' : '#333'
      ctx.fillRect(batt.x + (a % 5) * 3, GROUND_Y - 8 + Math.floor(a / 5) * 4, 2, 3)
    }
  }

  // Crosshair cursor
  if (showCursor) {
    const cx = state.cursorPos.x
    const cy = state.cursorPos.y
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(cx - 10, cy)
    ctx.lineTo(cx + 10, cy)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(cx, cy - 10)
    ctx.lineTo(cx, cy + 10)
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(cx, cy, 6, 0, Math.PI * 2)
    ctx.stroke()
  }

  ctx.restore()
}
