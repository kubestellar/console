import { useRef, useCallback, useEffect } from 'react'

// Game constants
const CANVAS_WIDTH = 280
const CANVAS_HEIGHT = 320

// Sloped platform structure - like classic DK
interface Platform {
  x1: number  // Left x
  y1: number  // Left y
  x2: number  // Right x
  y2: number  // Right y (different for slope)
}

interface Ladder {
  x: number
  yTop: number
  yBottom: number
}

interface Barrel {
  x: number
  y: number
  vx: number
  vy: number
  rolling: boolean
}

interface Player {
  x: number
  y: number
  vx: number
  vy: number
  onGround: boolean
  climbing: boolean
  facingRight: boolean
  jumpedBarrels: Set<number>
}

const PLAYER_WIDTH = 16
const PLAYER_HEIGHT = 24
const BARREL_SIZE = 14

// Classic DK-style sloped platforms
const PLATFORMS: Platform[] = [
  // Ground - full width flat
  { x1: 0, y1: 300, x2: 280, y2: 300 },
  // Level 1 - slopes down-left (slope < 0 → rolls LEFT, exits at x≈20)
  { x1: 20, y1: 258, x2: 270, y2: 250 },
  // Level 2 - slopes down-right (slope > 0 → rolls RIGHT, exits at x≈260)
  { x1: 10, y1: 200, x2: 260, y2: 208 },
  // Level 3 - slopes down-left (slope < 0 → rolls LEFT, exits at x≈20)
  { x1: 20, y1: 158, x2: 270, y2: 150 },
  // Level 4 - slopes down-right (slope > 0 → rolls RIGHT, exits at x≈260)
  { x1: 30, y1: 100, x2: 260, y2: 108 },
  // Top platform for princess
  { x1: 90, y1: 55, x2: 190, y2: 55 },
]

// Ladders connecting platforms
const LADDERS: Ladder[] = [
  // Ground to Level 1
  { x: 230, yTop: 250, yBottom: 300 },
  // Level 1 to Level 2
  { x: 50, yTop: 200, yBottom: 258 },
  // Level 2 to Level 3
  { x: 230, yTop: 150, yBottom: 208 },
  // Level 3 to Level 4
  { x: 50, yTop: 100, yBottom: 158 },
  // Level 4 to Top
  { x: 140, yTop: 55, yBottom: 108 },
]

// Get Y position on a sloped platform at given X
function getPlatformY(platform: Platform, x: number): number {
  const t = (x - platform.x1) / (platform.x2 - platform.x1)
  return platform.y1 + t * (platform.y2 - platform.y1)
}

interface GameCanvasProps {
  canvasRef: React.RefObject<HTMLCanvasElement>
  player: Player
  barrels: Barrel[]
  bossFrame: number
  helpText: boolean
  isExpanded: boolean
}

export function GameCanvas({
  canvasRef,
  player,
  barrels,
  bossFrame,
  helpText,
  isExpanded
}: GameCanvasProps) {
  // Draw game
  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const scale = isExpanded ? 1.5 : 1
    ctx.save()
    ctx.scale(scale, scale)

    // Background
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)

    // Draw platforms (red girders with slope)
    for (const p of PLATFORMS) {
      ctx.strokeStyle = '#ff4444'
      ctx.lineWidth = 8
      ctx.beginPath()
      ctx.moveTo(p.x1, p.y1)
      ctx.lineTo(p.x2, p.y2)
      ctx.stroke()

      // Girder details
      ctx.strokeStyle = '#cc3333'
      ctx.lineWidth = 2
      const segments = Math.floor((p.x2 - p.x1) / 20)
      for (let i = 0; i <= segments; i++) {
        const t = i / segments
        const x = p.x1 + t * (p.x2 - p.x1)
        const y = p.y1 + t * (p.y2 - p.y1)
        ctx.beginPath()
        ctx.moveTo(x, y - 3)
        ctx.lineTo(x, y + 3)
        ctx.stroke()
      }
    }

    // Draw ladders
    ctx.strokeStyle = '#00bfff'
    ctx.lineWidth = 2
    for (const ladder of LADDERS) {
      // Sides
      ctx.beginPath()
      ctx.moveTo(ladder.x, ladder.yTop)
      ctx.lineTo(ladder.x, ladder.yBottom)
      ctx.moveTo(ladder.x + 20, ladder.yTop)
      ctx.lineTo(ladder.x + 20, ladder.yBottom)
      ctx.stroke()
      // Rungs
      for (let y = ladder.yTop; y < ladder.yBottom; y += 8) {
        ctx.beginPath()
        ctx.moveTo(ladder.x, y)
        ctx.lineTo(ladder.x + 20, y)
        ctx.stroke()
      }
    }

    // Draw Kube Kong (boss) at top-left
    const bossX = 15
    const bossY = 65

    // Body
    ctx.fillStyle = '#8b4513'
    ctx.fillRect(bossX, bossY, 50, 40)

    // Head
    ctx.fillStyle = '#a0522d'
    ctx.beginPath()
    ctx.arc(bossX + 25, bossY - 5, 20, 0, Math.PI * 2)
    ctx.fill()

    // Face
    ctx.fillStyle = '#deb887'
    ctx.fillRect(bossX + 10, bossY - 10, 30, 20)

    // Eyes (angry)
    ctx.fillStyle = '#000'
    ctx.fillRect(bossX + 15, bossY - 5, 6, 6)
    ctx.fillRect(bossX + 29, bossY - 5, 6, 6)

    // Eyebrows (angry)
    ctx.strokeStyle = '#000'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(bossX + 13, bossY - 8)
    ctx.lineTo(bossX + 23, bossY - 5)
    ctx.moveTo(bossX + 37, bossY - 8)
    ctx.lineTo(bossX + 27, bossY - 5)
    ctx.stroke()

    // Mouth
    ctx.fillStyle = '#000'
    ctx.fillRect(bossX + 17, bossY + 5, 16, 4)

    // Arms throwing animation
    ctx.fillStyle = '#8b4513'
    if (bossFrame === 1) {
      // Throwing pose - arm up with barrel
      ctx.fillRect(bossX + 45, bossY - 20, 12, 30)
      // Barrel in hand
      ctx.fillStyle = '#ffa500'
      ctx.beginPath()
      ctx.arc(bossX + 55, bossY - 25, 10, 0, Math.PI * 2)
      ctx.fill()
    } else {
      // Normal arms
      ctx.fillRect(bossX - 10, bossY + 10, 15, 25)
      ctx.fillRect(bossX + 45, bossY + 10, 15, 25)
    }

    // Draw princess at top
    const princessX = 140
    const princessY = 30

    // Dress
    ctx.fillStyle = '#ff69b4'
    ctx.beginPath()
    ctx.moveTo(princessX, princessY + 20)
    ctx.lineTo(princessX - 8, princessY + 35)
    ctx.lineTo(princessX + 22, princessY + 35)
    ctx.lineTo(princessX + 14, princessY + 20)
    ctx.closePath()
    ctx.fill()

    // Body
    ctx.fillRect(princessX, princessY + 8, 14, 14)

    // Head
    ctx.fillStyle = '#ffd7b5'
    ctx.beginPath()
    ctx.arc(princessX + 7, princessY + 2, 8, 0, Math.PI * 2)
    ctx.fill()

    // Hair
    ctx.fillStyle = '#ffd700'
    ctx.beginPath()
    ctx.arc(princessX + 7, princessY - 2, 10, Math.PI, 0)
    ctx.fill()

    // Crown
    ctx.fillStyle = '#ffd700'
    ctx.fillRect(princessX + 1, princessY - 12, 12, 6)
    ctx.fillRect(princessX + 3, princessY - 16, 3, 4)
    ctx.fillRect(princessX + 8, princessY - 16, 3, 4)

    // HELP! text
    if (helpText) {
      ctx.fillStyle = '#fff'
      ctx.font = 'bold 10px sans-serif'
      ctx.fillText('HELP!', princessX - 5, princessY - 20)
    }

    // Draw barrels
    ctx.fillStyle = '#ffa500'
    for (const b of barrels) {
      ctx.beginPath()
      ctx.arc(b.x + BARREL_SIZE / 2, b.y + BARREL_SIZE / 2, BARREL_SIZE / 2, 0, Math.PI * 2)
      ctx.fill()

      // Barrel stripes
      ctx.strokeStyle = '#8b4500'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(b.x + 2, b.y + BARREL_SIZE / 2)
      ctx.lineTo(b.x + BARREL_SIZE - 2, b.y + BARREL_SIZE / 2)
      ctx.stroke()
    }

    // Draw player (Mario-style jumpman)
    const p = player

    // Body
    ctx.fillStyle = '#ff0000'
    ctx.fillRect(p.x + 3, p.y + 8, 10, 10)

    // Head
    ctx.fillStyle = '#ffd7b5'
    ctx.fillRect(p.x + 4, p.y, 8, 8)

    // Cap
    ctx.fillStyle = '#ff0000'
    ctx.fillRect(p.x + 2, p.y - 2, 12, 4)
    ctx.fillRect(p.x + (p.facingRight ? 10 : -2), p.y, 4, 3)

    // Legs
    ctx.fillStyle = '#0000ff'
    if (p.climbing) {
      ctx.fillRect(p.x + 3, p.y + 16, 4, 8)
      ctx.fillRect(p.x + 9, p.y + 18, 4, 6)
    } else {
      ctx.fillRect(p.x + 3, p.y + 16, 4, 8)
      ctx.fillRect(p.x + 9, p.y + 16, 4, 8)
    }

    // Arms
    ctx.fillStyle = '#ff0000'
    if (p.climbing) {
      ctx.fillRect(p.x - 2, p.y + 6, 5, 4)
      ctx.fillRect(p.x + 13, p.y + 10, 5, 4)
    }

    ctx.restore()
  }, [player, barrels, bossFrame, helpText, isExpanded, canvasRef])

  // Stable ref for draw to avoid restarting the game loop when draw changes
  const drawRef = useRef(draw)
  useEffect(() => { drawRef.current = draw }, [draw])

  useEffect(() => {
    draw()
  }, [draw])

  return { draw: drawRef }
}
