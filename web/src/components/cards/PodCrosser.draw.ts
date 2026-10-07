import {
  CANVAS_WIDTH, CANVAS_HEIGHT, CELL_SIZE, PLAYER_SIZE, LANES,
  type Player, type Vehicle, type Log, type HomeSlot,
} from './PodCrosser.constants'

export interface PodCrosserScene {
  player: Player
  vehicles: Vehicle[]
  logs: Log[]
  homeSlots: HomeSlot[]
  time: number
}

/** Paints one frame of the Pod Crosser board (caller handles scale/save/restore). */
export function drawPodCrosserScene(
  ctx: CanvasRenderingContext2D,
  { player, vehicles, logs, homeSlots, time }: PodCrosserScene,
) {
  // Background
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)

  // Draw lanes
  LANES.forEach(lane => {
    const y = lane.y * CELL_SIZE
    if (lane.type === 'safe') {
      ctx.fillStyle = '#4a2c82'  // Purple safe zone
      ctx.fillRect(0, y, CANVAS_WIDTH, CELL_SIZE)
    } else if (lane.type === 'road') {
      ctx.fillStyle = '#333'
      ctx.fillRect(0, y, CANVAS_WIDTH, CELL_SIZE)
      // Road markings
      ctx.strokeStyle = '#fff'
      ctx.setLineDash([10, 10])
      ctx.beginPath()
      ctx.moveTo(0, y + CELL_SIZE / 2)
      ctx.lineTo(CANVAS_WIDTH, y + CELL_SIZE / 2)
      ctx.stroke()
      ctx.setLineDash([])
    } else if (lane.type === 'water') {
      ctx.fillStyle = '#1e90ff'
      ctx.fillRect(0, y, CANVAS_WIDTH, CELL_SIZE)
    } else if (lane.type === 'home') {
      ctx.fillStyle = '#228b22'
      ctx.fillRect(0, y, CANVAS_WIDTH, CELL_SIZE)
      // Draw home slots
      homeSlots.forEach(slot => {
        ctx.fillStyle = slot.filled ? '#ffd700' : '#000080'
        ctx.fillRect(slot.x, y + 4, 40, CELL_SIZE - 8)
        if (slot.filled) {
          // Draw pod in slot
          ctx.fillStyle = '#326ce5'
          ctx.beginPath()
          ctx.arc(slot.x + 20, y + CELL_SIZE / 2, 10, 0, Math.PI * 2)
          ctx.fill()
        }
      })
    }
  })

  // Draw logs and turtles
  for (const log of logs) {
    if (log.type === 'turtle') {
      if (!log.turtleDiving) {
        ctx.fillStyle = '#228b22'
        // Draw 3 turtles in a row
        for (let i = 0; i < 3; i++) {
          ctx.beginPath()
          ctx.arc(log.x + 8 + i * 16, log.y + CELL_SIZE / 2, 7, 0, Math.PI * 2)
          ctx.fill()
        }
      }
    } else {
      ctx.fillStyle = '#8b4513'
      ctx.fillRect(log.x, log.y + 4, log.width, CELL_SIZE - 8)
      // Log texture
      ctx.strokeStyle = '#654321'
      ctx.lineWidth = 2
      for (let i = 10; i < log.width; i += 20) {
        ctx.beginPath()
        ctx.arc(log.x + i, log.y + CELL_SIZE / 2, 5, 0, Math.PI * 2)
        ctx.stroke()
      }
    }
  }

  // Draw vehicles
  for (const v of vehicles) {
    ctx.fillStyle = v.color
    ctx.fillRect(v.x, v.y + 4, v.width, CELL_SIZE - 8)
    // Wheels
    ctx.fillStyle = '#000'
    ctx.fillRect(v.x + 4, v.y + 2, 8, 4)
    ctx.fillRect(v.x + 4, v.y + CELL_SIZE - 6, 8, 4)
    ctx.fillRect(v.x + v.width - 12, v.y + 2, 8, 4)
    ctx.fillRect(v.x + v.width - 12, v.y + CELL_SIZE - 6, 8, 4)
    // Windows
    ctx.fillStyle = '#87ceeb'
    if (v.type === 'car') {
      ctx.fillRect(v.x + 10, v.y + 8, 12, 16)
    } else if (v.type === 'truck') {
      ctx.fillRect(v.x + 6, v.y + 8, 10, 16)
    } else {
      ctx.fillRect(v.x + 10, v.y + 8, 8, 16)
      ctx.fillRect(v.x + 25, v.y + 8, 8, 16)
      ctx.fillRect(v.x + 40, v.y + 8, 8, 16)
    }
  }

  // Draw player (pod)
  const p = player
  if (p.dead) {
    // Death animation - splash
    ctx.fillStyle = '#ff0000'
    const size = 10 + p.deathFrame * 2
    ctx.globalAlpha = 1 - p.deathFrame / 20
    ctx.beginPath()
    ctx.arc(p.x + PLAYER_SIZE / 2, p.y + PLAYER_SIZE / 2, size, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalAlpha = 1
  } else {
    // Pod body
    ctx.fillStyle = '#326ce5'
    ctx.beginPath()
    ctx.arc(p.x + PLAYER_SIZE / 2, p.y + PLAYER_SIZE / 2, PLAYER_SIZE / 2 - 2, 0, Math.PI * 2)
    ctx.fill()
    // Pod highlight
    ctx.fillStyle = '#4a90d9'
    ctx.beginPath()
    ctx.arc(p.x + PLAYER_SIZE / 2 - 3, p.y + PLAYER_SIZE / 2 - 3, 5, 0, Math.PI * 2)
    ctx.fill()
    // Eyes
    ctx.fillStyle = '#fff'
    ctx.fillRect(p.x + 6, p.y + 8, 4, 4)
    ctx.fillRect(p.x + 14, p.y + 8, 4, 4)
  }

  // Timer bar
  ctx.fillStyle = '#333'
  ctx.fillRect(10, CANVAS_HEIGHT - 15, CANVAS_WIDTH - 20, 8)
  ctx.fillStyle = time > 20 ? '#00ff00' : time > 10 ? '#ffff00' : '#ff0000'
  ctx.fillRect(10, CANVAS_HEIGHT - 15, (CANVAS_WIDTH - 20) * (time / 60), 8)
}
