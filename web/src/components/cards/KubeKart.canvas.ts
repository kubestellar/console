import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  COLORS,
  KART_HEIGHT,
  KART_WIDTH,
  TRACK_WIDTH,
  type Kart,
  type PowerUp,
} from './KubeKart.constants'

interface RenderKubeKartFrameArgs {
  canvas: HTMLCanvasElement | null
  trackScroll: number
  powerUps: PowerUp[]
  aiKarts: Kart[]
  player: Kart
  aiDistances: number[]
  activeBoostFrames: number
  activeShieldFrames: number
  getTrackCurve: (y: number) => number
}

export function renderKubeKartFrame({
  canvas,
  trackScroll,
  powerUps,
  aiKarts,
  player,
  aiDistances,
  activeBoostFrames,
  activeShieldFrames,
  getTrackCurve,
}: RenderKubeKartFrameArgs) {
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  ctx.fillStyle = COLORS.grass
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)

  const trackLeft = (CANVAS_WIDTH - TRACK_WIDTH) / 2

  for (let y = 0; y < CANVAS_HEIGHT; y += 2) {
    const worldY = y - trackScroll
    const curve = getTrackCurve(worldY)
    const offset = curve * (CANVAS_HEIGHT - y) * 0.5

    ctx.fillStyle = COLORS.track
    ctx.fillRect(trackLeft + offset, y, TRACK_WIDTH, 2)

    const stripe = Math.floor((worldY + trackScroll) / 20) % 2 === 0
    ctx.fillStyle = stripe ? COLORS.trackEdge : '#fff'
    ctx.fillRect(trackLeft + offset - 8, y, 8, 2)
    ctx.fillRect(trackLeft + offset + TRACK_WIDTH, y, 8, 2)

    if (Math.floor((worldY + trackScroll) / 30) % 2 === 0) {
      ctx.fillStyle = '#fff'
      ctx.fillRect(trackLeft + offset + TRACK_WIDTH / 2 - 2, y, 4, 2)
    }
  }

  powerUps.forEach(powerUp => {
    if (powerUp.collected) return
    const screenY = powerUp.y + trackScroll
    if (screenY > -30 && screenY < CANVAS_HEIGHT + 30) {
      const curve = getTrackCurve(powerUp.y)
      const offset = curve * (CANVAS_HEIGHT - screenY) * 0.5
      const x = powerUp.x + trackLeft + offset

      ctx.fillStyle = powerUp.type === 'boost' ? COLORS.boost :
                      powerUp.type === 'shield' ? COLORS.shield : COLORS.slow
      ctx.beginPath()
      ctx.arc(x, screenY, 12, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 2
      ctx.stroke()

      ctx.fillStyle = '#fff'
      ctx.font = 'bold 12px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(
        powerUp.type === 'boost' ? '>' : powerUp.type === 'shield' ? 'O' : 'X',
        x, screenY + 4,
      )
    }
  })

  aiKarts.forEach((kart, i) => {
    drawKart(ctx, kart, trackScroll, aiDistances, false, i)
  })

  drawKart(ctx, player, trackScroll, aiDistances, activeBoostFrames > 0)

  if (activeBoostFrames > 0) {
    ctx.fillStyle = 'rgba(0, 255, 255, 0.3)'
    ctx.beginPath()
    ctx.arc(player.x, CANVAS_HEIGHT - 80, 25, 0, Math.PI * 2)
    ctx.fill()
  }
  if (activeShieldFrames > 0) {
    ctx.strokeStyle = 'rgba(255, 0, 255, 0.5)'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.arc(player.x, CANVAS_HEIGHT - 80, 28, 0, Math.PI * 2)
    ctx.stroke()
  }

  const lapProgress = (trackScroll % 2500) / 2500
  ctx.fillStyle = 'rgba(0, 0, 0, 0.5)'
  ctx.fillRect(10, CANVAS_HEIGHT - 20, CANVAS_WIDTH - 20, 10)
  ctx.fillStyle = '#3b82f6'
  ctx.fillRect(10, CANVAS_HEIGHT - 20, (CANVAS_WIDTH - 20) * lapProgress, 10)
  ctx.strokeStyle = '#fff'
  ctx.strokeRect(10, CANVAS_HEIGHT - 20, CANVAS_WIDTH - 20, 10)
}

function drawKart(
  ctx: CanvasRenderingContext2D,
  kart: Kart,
  trackScroll: number,
  aiDistances: number[],
  hasBoost = false,
  aiIndex = -1,
) {
  let screenY: number
  if (kart.isPlayer) {
    screenY = CANVAS_HEIGHT - 80
  } else {
    const aiDistance = aiIndex >= 0 ? aiDistances[aiIndex] : 0
    screenY = (CANVAS_HEIGHT - 80) - (aiDistance - trackScroll)
  }

  ctx.save()
  ctx.translate(kart.x, kart.isPlayer ? CANVAS_HEIGHT - 80 : screenY)
  ctx.rotate(kart.angle + Math.PI / 2)

  ctx.fillStyle = kart.color
  ctx.fillRect(-KART_WIDTH / 2, -KART_HEIGHT / 2, KART_WIDTH, KART_HEIGHT)

  ctx.fillStyle = '#222'
  ctx.fillRect(-KART_WIDTH / 4, -KART_HEIGHT / 4, KART_WIDTH / 2, KART_HEIGHT / 3)

  ctx.fillStyle = '#111'
  ctx.fillRect(-KART_WIDTH / 2 - 3, -KART_HEIGHT / 2 + 4, 6, 10)
  ctx.fillRect(KART_WIDTH / 2 - 3, -KART_HEIGHT / 2 + 4, 6, 10)
  ctx.fillRect(-KART_WIDTH / 2 - 3, KART_HEIGHT / 2 - 14, 6, 10)
  ctx.fillRect(KART_WIDTH / 2 - 3, KART_HEIGHT / 2 - 14, 6, 10)

  if (hasBoost && kart.isPlayer) {
    ctx.fillStyle = '#ff6600'
    ctx.beginPath()
    ctx.moveTo(-4, KART_HEIGHT / 2)
    ctx.lineTo(0, KART_HEIGHT / 2 + 15 + Math.random() * 5)
    ctx.lineTo(4, KART_HEIGHT / 2)
    ctx.fill()
  }

  ctx.restore()
}
