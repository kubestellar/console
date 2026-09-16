/**
 * Canvas rendering + game-loop hook for the KubeBert card. Owns the
 * `<canvas>` ref, draws the isometric pyramid/player/enemies each frame,
 * and keeps the canvas sized to its container.
 */
import { useEffect, useRef, useCallback, type RefObject } from 'react'
import {
  PYRAMID_ROWS, TILE_COLORS, PLAYER_COLOR, ENEMY_COILY_COLOR, ENEMY_BALL_COLOR, BG_COLOR,
  KUBEBERT_LEVEL_COMPLETE_FLASH, KUBEBERT_LEVEL_COMPLETE_TEXT, KUBEBERT_GAMEOVER_TEXT,
  type Position, type Enemy, type GameState,
} from './kubeBert.constants'
import { gridToPixel, drawTile, drawCharacter, darkenColor } from './kubeBert.canvas'

interface UseKubeBertRendererArgs {
  isExpanded: boolean
  playerRef: RefObject<Position>
  tilesRef: RefObject<boolean[][]>
  enemiesRef: RefObject<Enemy[]>
  tileLabelMap: RefObject<string[][]>
  gameStateRef: RefObject<GameState>
  levelRef: RefObject<number>
}

export function useKubeBertRenderer({
  isExpanded, playerRef, tilesRef, enemiesRef, tileLabelMap, gameStateRef, levelRef,
}: UseKubeBertRendererArgs) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const gameLoopRef = useRef<number>(0)

  // Render the game
  const render = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const w = canvas.width
    const h = canvas.height

    // Clear
    ctx.fillStyle = BG_COLOR
    ctx.fillRect(0, 0, w, h)

    // Calculate tile dimensions based on canvas size
    const tileW = Math.min(w / (PYRAMID_ROWS + 1), 60)
    const tileH = tileW * 0.8
    const offsetX = w / 2
    const offsetY = tileH * 0.8

    // Draw pyramid tiles
    for (let r = 0; r < PYRAMID_ROWS; r++) {
      for (let c = 0; c <= r; c++) {
        const { x, y } = gridToPixel(r, c, tileW, tileH, offsetX, offsetY)
        const visited = tilesRef.current[r]?.[c] ?? false
        const topColor = visited ? TILE_COLORS.visited : TILE_COLORS.unvisited
        const label = tileLabelMap.current[r]?.[c]
        drawTile(ctx, x, y, tileW, tileH, topColor, darkenColor(topColor, 40), darkenColor(topColor, 60), label)
      }
    }

    // Draw enemies
    for (const enemy of enemiesRef.current) {
      const { x, y } = gridToPixel(enemy.pos.row, enemy.pos.col, tileW, tileH, offsetX, offsetY)
      const color = enemy.type === 'coily' ? ENEMY_COILY_COLOR : ENEMY_BALL_COLOR
      drawCharacter(ctx, x, y, tileW, color, false)
    }

    // Draw player
    const { x: px, y: py } = gridToPixel(playerRef.current.row, playerRef.current.col, tileW, tileH, offsetX, offsetY)
    drawCharacter(ctx, px, py, tileW, PLAYER_COLOR, true)

    // Draw "@#!?" speech bubble when hit (game over state)
    if (gameStateRef.current === 'gameover') {
      ctx.fillStyle = KUBEBERT_GAMEOVER_TEXT
      ctx.font = `bold ${Math.max(12, tileW / 3)}px monospace`
      ctx.textAlign = 'center'
      ctx.fillText('@#!?', px, py - tileW * 0.8)
    }

    // Level complete flash
    if (gameStateRef.current === 'levelComplete') {
      ctx.fillStyle = KUBEBERT_LEVEL_COMPLETE_FLASH
      ctx.fillRect(0, 0, w, h)
      ctx.fillStyle = KUBEBERT_LEVEL_COMPLETE_TEXT
      ctx.font = `bold ${Math.max(16, w / 15)}px monospace`
      ctx.textAlign = 'center'
      ctx.fillText(`Level ${levelRef.current} Complete!`, w / 2, h / 2)
    }
  }, [playerRef, tilesRef, enemiesRef, tileLabelMap, gameStateRef, levelRef])

  // Game loop
  const startGameLoop = useCallback(() => {
    const loop = () => {
      render()
      gameLoopRef.current = requestAnimationFrame(loop)
    }
    gameLoopRef.current = requestAnimationFrame(loop)
  }, [render])

  const stopGameLoop = useCallback(() => {
    if (gameLoopRef.current) {
      cancelAnimationFrame(gameLoopRef.current)
      gameLoopRef.current = 0
    }
  }, [])

  // Resize canvas to container
  useEffect(() => {
    const resizeCanvas = () => {
      const canvas = canvasRef.current
      const container = containerRef.current
      if (!canvas || !container) return
      const rect = container.getBoundingClientRect()
      const controlsHeight = 80
      canvas.width = Math.floor(rect.width)
      canvas.height = Math.floor(rect.height - controlsHeight)
      render()
    }
    resizeCanvas()
    window.addEventListener('resize', resizeCanvas)
    return () => window.removeEventListener('resize', resizeCanvas)
  }, [isExpanded, render])

  return { canvasRef, containerRef, render, startGameLoop, stopGameLoop }
}
