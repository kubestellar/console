/**
 * Canvas renderer for the PodPitfall card. Draws the sky, vines, platforms,
 * obstacles, collectibles, player, and HUD each frame.
 */
import { useCallback, type RefObject } from 'react'
import {
  CANVAS_WIDTH, CANVAS_HEIGHT,
  type Player, type Platform, type Obstacle, type Collectible, type Vine,
} from './podPitfall.constants'

interface UsePodPitfallRendererArgs {
  canvasRef: RefObject<HTMLCanvasElement | null>
  isExpanded: boolean
  player: Player
  cameraX: number
  platforms: Platform[]
  obstacles: Obstacle[]
  collectibles: Collectible[]
  vines: Vine[]
  score: number
  time: number
  distance: number
}

export function usePodPitfallRenderer({
  canvasRef, isExpanded, player, cameraX, platforms, obstacles, collectibles, vines, score, time, distance,
}: UsePodPitfallRendererArgs) {
  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const scale = isExpanded ? 1.5 : 1
    ctx.save()
    ctx.scale(scale, scale)

    // Sky
    ctx.fillStyle = '#1a1a2e'
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)

    // Stars
    ctx.fillStyle = '#fff'
    for (let i = 0; i < 50; i++) {
      const sx = ((i * 47) % CANVAS_WIDTH)
      const sy = ((i * 31) % 80)
      ctx.fillRect(sx, sy, 1, 1)
    }

    const cam = cameraX

    // Draw vines
    ctx.strokeStyle = '#228b22'
    ctx.lineWidth = 3
    for (const v of vines) {
      const vx = v.x - cam
      if (vx > -50 && vx < CANVAS_WIDTH + 50) {
        ctx.beginPath()
        ctx.moveTo(vx, v.topY)
        ctx.lineTo(vx, v.topY + v.length)
        ctx.stroke()
        // Leaves
        ctx.fillStyle = '#32cd32'
        ctx.beginPath()
        ctx.arc(vx, v.topY, 8, 0, Math.PI * 2)
        ctx.fill()
      }
    }

    // Draw platforms
    for (const p of platforms) {
      const px = p.x - cam
      if (px > -p.width && px < CANVAS_WIDTH + 50) {
        if (p.type === 'ground') {
          // Ground
          ctx.fillStyle = '#2d5a2d'
          ctx.fillRect(px, p.y, p.width, CANVAS_HEIGHT - p.y)
          ctx.fillStyle = '#3d7a3d'
          ctx.fillRect(px, p.y, p.width, 5)
        } else if (p.type === 'log') {
          // Log platform
          ctx.fillStyle = '#8b4513'
          ctx.fillRect(px, p.y, p.width, 10)
          ctx.fillStyle = '#654321'
          ctx.fillRect(px + 2, p.y + 2, p.width - 4, 6)
        } else if (p.type === 'pit') {
          // Water/pit
          ctx.fillStyle = '#1e90ff'
          ctx.fillRect(px, p.y, p.width, CANVAS_HEIGHT - p.y)
        }
      }
    }

    // Draw obstacles
    for (const o of obstacles) {
      const ox = o.x - cam
      if (ox > -30 && ox < CANVAS_WIDTH + 30) {
        if (o.type === 'snake') {
          ctx.fillStyle = '#00ff00'
          ctx.fillRect(ox, o.y, 20, 8)
          ctx.fillStyle = '#ff0000'
          ctx.fillRect(ox + (o.direction > 0 ? 18 : 0), o.y + 2, 4, 4)
        } else if (o.type === 'scorpion') {
          ctx.fillStyle = '#8b0000'
          ctx.fillRect(ox, o.y + 5, 15, 8)
          ctx.fillRect(ox - 5, o.y, 5, 8)
        } else if (o.type === 'croc') {
          ctx.fillStyle = '#228b22'
          ctx.fillRect(ox, o.y, 40, 15)
          ctx.fillStyle = '#fff'
          ctx.fillRect(ox + 5, o.y + 3, 30, 3)
        } else if (o.type === 'fire') {
          ctx.fillStyle = '#ff4500'
          ctx.fillRect(ox, o.y - 10, 10, 20)
          ctx.fillStyle = '#ffd700'
          ctx.fillRect(ox + 2, o.y - 5, 6, 10)
        }
      }
    }

    // Draw collectibles
    for (const c of collectibles) {
      if (c.collected) continue
      const cx = c.x - cam
      if (cx > -20 && cx < CANVAS_WIDTH + 20) {
        if (c.type === 'gold') {
          ctx.fillStyle = '#ffd700'
          ctx.fillRect(cx, c.y, 12, 12)
        } else if (c.type === 'diamond') {
          ctx.fillStyle = '#00ffff'
          ctx.beginPath()
          ctx.moveTo(cx + 8, c.y)
          ctx.lineTo(cx + 16, c.y + 8)
          ctx.lineTo(cx + 8, c.y + 16)
          ctx.lineTo(cx, c.y + 8)
          ctx.closePath()
          ctx.fill()
        } else if (c.type === 'ring-3') {
          ctx.strokeStyle = '#c0c0c0'
          ctx.lineWidth = 3
          ctx.beginPath()
          ctx.arc(cx + 8, c.y + 8, 6, 0, Math.PI * 2)
          ctx.stroke()
        }
      }
    }

    // Draw player
    const p = player
    const px = p.x - cam
    ctx.fillStyle = '#ff6347'
    // Body
    ctx.fillRect(px + 4, p.y + 8, 12, 14)
    // Head
    ctx.fillStyle = '#ffd7b5'
    ctx.fillRect(px + 5, p.y, 10, 10)
    // Hat
    ctx.fillStyle = '#8b4513'
    ctx.fillRect(px + 3, p.y - 2, 14, 4)
    // Legs
    ctx.fillStyle = '#4169e1'
    ctx.fillRect(px + 5, p.y + 20, 4, 8)
    ctx.fillRect(px + 11, p.y + 20, 4, 8)

    // HUD
    ctx.fillStyle = '#fff'
    ctx.font = '12px monospace'
    ctx.fillText(`SCORE: ${score}`, 10, 15)
    ctx.fillText(`TIME: ${time}`, CANVAS_WIDTH - 80, 15)
    ctx.fillText(`DIST: ${distance}m`, CANVAS_WIDTH / 2 - 30, 15)

    ctx.restore()
  }, [canvasRef, isExpanded, player, cameraX, platforms, obstacles, collectibles, vines, score, time, distance])

  return draw
}
