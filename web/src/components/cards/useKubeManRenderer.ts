/**
 * Canvas renderer for the KubeMan card. Draws the maze, player (with death
 * animation), and ghosts each frame.
 */
import { useCallback, type RefObject } from 'react'
import {
  MAZE_WIDTH, MAZE_HEIGHT, CELL_SIZE,
  type Direction, type Position, type Ghost, type DeathAnimation,
} from './kubeMan.constants'

interface UseKubeManRendererArgs {
  canvasRef: RefObject<HTMLCanvasElement | null>
  isExpanded: boolean
  maze: number[][]
  playerPos: Position
  playerDir: Direction
  ghosts: Ghost[]
  mouthOpen: boolean
  deathAnimation: DeathAnimation
}

export function useKubeManRenderer({
  canvasRef, isExpanded, maze, playerPos, playerDir, ghosts, mouthOpen, deathAnimation,
}: UseKubeManRendererArgs) {
  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const scale = isExpanded ? 1.5 : 1
    const cellSize = CELL_SIZE * scale

    // Clear canvas
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    // Draw maze
    for (let y = 0; y < MAZE_HEIGHT; y++) {
      for (let x = 0; x < MAZE_WIDTH; x++) {
        const cell = maze[y][x]
        const cx = x * cellSize
        const cy = y * cellSize

        if (cell === 0) {
          // Wall
          ctx.fillStyle = '#2563eb'
          ctx.fillRect(cx + 1, cy + 1, cellSize - 2, cellSize - 2)
        } else if (cell === 1) {
          // Dot
          ctx.fillStyle = '#fbbf24'
          ctx.beginPath()
          ctx.arc(cx + cellSize / 2, cy + cellSize / 2, cellSize / 8, 0, Math.PI * 2)
          ctx.fill()
        } else if (cell === 2) {
          // Power pellet
          ctx.fillStyle = '#fbbf24'
          ctx.beginPath()
          ctx.arc(cx + cellSize / 2, cy + cellSize / 2, cellSize / 3, 0, Math.PI * 2)
          ctx.fill()
        }
      }
    }

    // Draw player (Pac-Man/Pod)
    const px = playerPos.x * cellSize + cellSize / 2
    const py = playerPos.y * cellSize + cellSize / 2
    const radius = cellSize / 2 - 2

    if (deathAnimation.active) {
      // Death animation - Pac-Man shrinks and spins
      const progress = deathAnimation.frame / deathAnimation.maxFrames
      const shrinkRadius = radius * (1 - progress)
      const rotation = progress * Math.PI * 4 // Spin twice

      ctx.save()
      ctx.translate(px, py)
      ctx.rotate(rotation)

      // Draw shrinking pac-man with expanding mouth (like deflating)
      ctx.fillStyle = '#facc15'
      ctx.beginPath()
      const mouthAngle = 0.3 + progress * (Math.PI - 0.3) // Mouth opens wider as it dies
      ctx.arc(0, 0, shrinkRadius, mouthAngle, Math.PI * 2 - mouthAngle)
      ctx.lineTo(0, 0)
      ctx.fill()

      // Flash effect
      if (Math.floor(deathAnimation.frame / 2) % 2 === 0) {
        ctx.fillStyle = 'rgba(255, 0, 0, 0.3)'
        ctx.beginPath()
        ctx.arc(0, 0, shrinkRadius + 4, 0, Math.PI * 2)
        ctx.fill()
      }

      ctx.restore()
    } else {
      ctx.fillStyle = '#facc15'
      ctx.beginPath()
      if (mouthOpen) {
        // Draw with mouth
        const angles: Record<Direction, number> = {
          right: 0,
          down: Math.PI / 2,
          left: Math.PI,
          up: -Math.PI / 2 }
        const angle = angles[playerDir]
        ctx.arc(px, py, radius, angle + 0.3, angle + Math.PI * 2 - 0.3)
        ctx.lineTo(px, py)
      } else {
        ctx.arc(px, py, radius, 0, Math.PI * 2)
      }
      ctx.fill()
    }

    // Draw ghosts
    for (const ghost of ghosts) {
      const gx = ghost.pos.x * cellSize + cellSize / 2
      const gy = ghost.pos.y * cellSize + cellSize / 2
      const gr = cellSize / 2 - 2

      // Ghost body
      ctx.fillStyle = ghost.scared ? '#0000ff' : ghost.color
      ctx.beginPath()
      ctx.arc(gx, gy - gr / 3, gr, Math.PI, 0)
      ctx.lineTo(gx + gr, gy + gr / 2)
      // Wavy bottom
      for (let i = 0; i < 3; i++) {
        const wx = gx + gr - (i + 1) * (gr * 2 / 3)
        ctx.quadraticCurveTo(wx + gr / 6, gy + gr, wx, gy + gr / 2)
      }
      ctx.closePath()
      ctx.fill()

      // Ghost eyes
      if (!ghost.scared) {
        ctx.fillStyle = '#fff'
        ctx.beginPath()
        ctx.arc(gx - gr / 3, gy - gr / 3, gr / 4, 0, Math.PI * 2)
        ctx.arc(gx + gr / 3, gy - gr / 3, gr / 4, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = '#00f'
        ctx.beginPath()
        ctx.arc(gx - gr / 3, gy - gr / 3, gr / 8, 0, Math.PI * 2)
        ctx.arc(gx + gr / 3, gy - gr / 3, gr / 8, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  }, [maze, playerPos, playerDir, ghosts, mouthOpen, isExpanded, deathAnimation])

  return draw
}
