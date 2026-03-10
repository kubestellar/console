import { useState, useEffect, useRef, useCallback } from 'react'
import { Play, RotateCcw, Trophy, Heart, ArrowUp, ArrowDown } from 'lucide-react'
import { useCardExpanded } from './CardWrapper'
import { useReportCardDataState } from './CardDataContext'
import { useTranslation } from 'react-i18next'
import { emitGameStarted, emitGameEnded } from '../../lib/analytics'

// ─── Game Constants ───────────────────────────────────────────────────────────
const PYRAMID_ROWS = 7
const INITIAL_LIVES = 3
const POINTS_PER_TILE = 25
const BONUS_PER_LEVEL = 500
const ENEMY_SPAWN_INTERVAL_MS = 3000
const ENEMY_MOVE_INTERVAL_MS = 800
const PLAYER_MOVE_COOLDOWN_MS = 200


// Tile colors by state
const TILE_COLORS = {
  unvisited: '#1e3a5f',     // dark blue
  visited: '#326ce5',       // Kubernetes blue
  target: '#00d4aa',        // bright green (level target color)
}

const PLAYER_COLOR = '#ffd700'    // gold — the Kube Bert character
const ENEMY_COILY_COLOR = '#ff4444'  // red snake enemy
const ENEMY_BALL_COLOR = '#ff8800'   // orange bouncing ball
const BG_COLOR = '#0a1628'

// Kubernetes-themed labels for tiles
const KUBE_LABELS = ['Pod', 'Svc', 'Node', 'NS', 'Dep', 'RS', 'DS', 'Job', 'CRD', 'PV', 'CM', 'Sec', 'Ing', 'HPA', 'SA']

// ─── Types ────────────────────────────────────────────────────────────────────
interface Position {
  row: number
  col: number
}

interface Enemy {
  pos: Position
  type: 'coily' | 'ball'
  id: number
}

type GameState = 'idle' | 'playing' | 'gameover' | 'levelComplete'

// ─── Isometric Helpers ────────────────────────────────────────────────────────

/** Convert grid position to canvas pixel coordinates (isometric projection) */
function gridToPixel(row: number, col: number, tileW: number, tileH: number, offsetX: number, offsetY: number) {
  const x = offsetX + (col - row / 2) * tileW
  const y = offsetY + row * tileH * 0.75
  return { x, y }
}

/** Draw an isometric cube/tile */
function drawTile(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  tileW: number, tileH: number,
  topColor: string, leftColor: string, rightColor: string,
  label?: string,
) {
  const halfW = tileW / 2
  const quarterH = tileH / 4

  // Top face
  ctx.beginPath()
  ctx.moveTo(x, y - quarterH)
  ctx.lineTo(x + halfW, y)
  ctx.lineTo(x, y + quarterH)
  ctx.lineTo(x - halfW, y)
  ctx.closePath()
  ctx.fillStyle = topColor
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,0.15)'
  ctx.lineWidth = 1
  ctx.stroke()

  // Left face
  ctx.beginPath()
  ctx.moveTo(x - halfW, y)
  ctx.lineTo(x, y + quarterH)
  ctx.lineTo(x, y + quarterH + tileH / 3)
  ctx.lineTo(x - halfW, y + tileH / 3)
  ctx.closePath()
  ctx.fillStyle = leftColor
  ctx.fill()
  ctx.strokeStyle = 'rgba(0,0,0,0.2)'
  ctx.stroke()

  // Right face
  ctx.beginPath()
  ctx.moveTo(x + halfW, y)
  ctx.lineTo(x, y + quarterH)
  ctx.lineTo(x, y + quarterH + tileH / 3)
  ctx.lineTo(x + halfW, y + tileH / 3)
  ctx.closePath()
  ctx.fillStyle = rightColor
  ctx.fill()
  ctx.strokeStyle = 'rgba(0,0,0,0.2)'
  ctx.stroke()

  // Label on top face
  if (label) {
    ctx.fillStyle = 'rgba(255,255,255,0.6)'
    ctx.font = `${Math.max(8, tileW / 5)}px monospace`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(label, x, y)
  }
}

/** Draw a character (player or enemy) as a small sprite on a tile */
function drawCharacter(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  tileW: number,
  color: string,
  isPlayer: boolean,
) {
  const size = tileW / 3
  const charY = y - size * 1.2

  if (isPlayer) {
    // Player: Kube Bert — a cute round character with legs
    // Body
    ctx.beginPath()
    ctx.arc(x, charY, size * 0.7, 0, Math.PI * 2)
    ctx.fillStyle = color
    ctx.fill()
    ctx.strokeStyle = 'rgba(0,0,0,0.3)'
    ctx.lineWidth = 1
    ctx.stroke()

    // Eyes
    const eyeSize = size * 0.15
    ctx.fillStyle = '#000'
    ctx.beginPath()
    ctx.arc(x - size * 0.25, charY - size * 0.15, eyeSize, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.arc(x + size * 0.25, charY - size * 0.15, eyeSize, 0, Math.PI * 2)
    ctx.fill()

    // Nose (Q*bert's signature snout)
    ctx.beginPath()
    ctx.moveTo(x, charY + size * 0.05)
    ctx.lineTo(x + size * 0.4, charY + size * 0.2)
    ctx.lineTo(x, charY + size * 0.35)
    ctx.fillStyle = '#ff8800'
    ctx.fill()

    // Kubernetes wheel on top (little crown)
    ctx.beginPath()
    ctx.arc(x, charY - size * 0.7, size * 0.2, 0, Math.PI * 2)
    ctx.fillStyle = '#326ce5'
    ctx.fill()
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = 1
    ctx.stroke()
  } else {
    // Enemy: triangle/snake shape
    ctx.beginPath()
    ctx.moveTo(x, charY - size * 0.6)
    ctx.lineTo(x + size * 0.5, charY + size * 0.4)
    ctx.lineTo(x - size * 0.5, charY + size * 0.4)
    ctx.closePath()
    ctx.fillStyle = color
    ctx.fill()
    ctx.strokeStyle = 'rgba(0,0,0,0.3)'
    ctx.lineWidth = 1
    ctx.stroke()

    // Enemy eyes
    const eyeSize = size * 0.1
    ctx.fillStyle = '#fff'
    ctx.beginPath()
    ctx.arc(x - size * 0.15, charY, eyeSize, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.arc(x + size * 0.15, charY, eyeSize, 0, Math.PI * 2)
    ctx.fill()
  }
}

// Darken a hex color for side faces
function darkenColor(hex: string, amount: number): string {
  const r = Math.max(0, parseInt(hex.slice(1, 3), 16) - amount)
  const g = Math.max(0, parseInt(hex.slice(3, 5), 16) - amount)
  const b = Math.max(0, parseInt(hex.slice(5, 7), 16) - amount)
  return `rgb(${r},${g},${b})`
}

// ─── Component ────────────────────────────────────────────────────────────────
export function KubeBert() {
  const { t: _t } = useTranslation()
  useReportCardDataState({ hasData: true, isFailed: false, consecutiveFailures: 0, isDemoData: false })
  const { isExpanded } = useCardExpanded()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const [gameState, setGameState] = useState<GameState>('idle')
  const [score, setScore] = useState(0)
  const [level, setLevel] = useState(1)
  const [, setLives] = useState(INITIAL_LIVES)
  const [highScore, setHighScore] = useState(() => {
    const saved = localStorage.getItem('kubeBertHighScore')
    return saved ? parseInt(saved, 10) : 0
  })

  // Game refs (mutable state that shouldn't trigger re-renders)
  const playerRef = useRef<Position>({ row: 0, col: 0 })
  const tilesRef = useRef<boolean[][]>([])    // true = visited
  const enemiesRef = useRef<Enemy[]>([])
  const enemyIdRef = useRef(0)
  const levelRef = useRef(1)
  const scoreRef = useRef(0)
  const livesRef = useRef(INITIAL_LIVES)
  const gameLoopRef = useRef<number>(0)
  const enemySpawnRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const enemyMoveRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const moveLockedRef = useRef(false)
  const gameStateRef = useRef<GameState>('idle')

  // Keep gameStateRef in sync
  useEffect(() => { gameStateRef.current = gameState }, [gameState])

  // Build tile label map (stable per pyramid)
  const tileLabelMap = useRef<string[][]>([])

  const buildTileLabels = useCallback(() => {
    const labels: string[][] = []
    let idx = 0
    for (let r = 0; r < PYRAMID_ROWS; r++) {
      labels[r] = []
      for (let c = 0; c <= r; c++) {
        labels[r][c] = KUBE_LABELS[idx % KUBE_LABELS.length]
        idx++
      }
    }
    tileLabelMap.current = labels
  }, [])

  // Initialize tile grid
  const initTiles = useCallback(() => {
    const tiles: boolean[][] = []
    for (let r = 0; r < PYRAMID_ROWS; r++) {
      tiles[r] = []
      for (let c = 0; c <= r; c++) {
        tiles[r][c] = false
      }
    }
    tilesRef.current = tiles
  }, [])

  // Check if all tiles are visited
  const allTilesVisited = useCallback(() => {
    for (let r = 0; r < PYRAMID_ROWS; r++) {
      for (let c = 0; c <= r; c++) {
        if (!tilesRef.current[r]?.[c]) return false
      }
    }
    return true
  }, [])

  // Check if position is valid on pyramid
  const isValidPosition = useCallback((row: number, col: number) => {
    return row >= 0 && row < PYRAMID_ROWS && col >= 0 && col <= row
  }, [])

  // Stop all intervals
  const stopIntervals = useCallback(() => {
    if (enemySpawnRef.current) {
      clearInterval(enemySpawnRef.current)
      enemySpawnRef.current = null
    }
    if (enemyMoveRef.current) {
      clearInterval(enemyMoveRef.current)
      enemyMoveRef.current = null
    }
    if (gameLoopRef.current) {
      cancelAnimationFrame(gameLoopRef.current)
      gameLoopRef.current = 0
    }
  }, [])

  // Spawn an enemy at the top of the pyramid
  const spawnEnemy = useCallback(() => {
    if (gameStateRef.current !== 'playing') return
    const type = Math.random() < 0.4 ? 'coily' : 'ball'
    const startCol = Math.random() < 0.5 ? 0 : 1
    const enemy: Enemy = {
      pos: { row: 0, col: startCol },
      type,
      id: enemyIdRef.current++,
    }
    enemiesRef.current.push(enemy)
  }, [])

  // Move enemies down the pyramid
  const moveEnemies = useCallback(() => {
    if (gameStateRef.current !== 'playing') return

    const player = playerRef.current
    const surviving: Enemy[] = []

    for (const enemy of enemiesRef.current) {
      // Move down: either down-left or down-right
      const newRow = enemy.pos.row + 1
      if (newRow >= PYRAMID_ROWS) {
        // Enemy fell off — remove it
        continue
      }
      const direction = Math.random() < 0.5 ? 0 : 1
      const newCol = enemy.pos.col + direction
      if (!isValidPosition(newRow, newCol)) {
        continue
      }
      enemy.pos = { row: newRow, col: newCol }

      // Check collision with player
      if (enemy.pos.row === player.row && enemy.pos.col === player.col) {
        // Player hit!
        livesRef.current--
        setLives(livesRef.current)
        if (livesRef.current <= 0) {
          setGameState('gameover')
          emitGameEnded('kube_bert', 'loss', scoreRef.current)
          if (scoreRef.current > highScore) {
            setHighScore(scoreRef.current)
            localStorage.setItem('kubeBertHighScore', String(scoreRef.current))
          }
          stopIntervals()
          return
        }
        // Reset player to top
        playerRef.current = { row: 0, col: 0 }
        continue
      }
      surviving.push(enemy)
    }
    enemiesRef.current = surviving
  }, [isValidPosition, highScore, stopIntervals])

  // Move player
  const movePlayer = useCallback((direction: 'up-left' | 'up-right' | 'down-left' | 'down-right') => {
    if (gameStateRef.current !== 'playing' || moveLockedRef.current) return
    moveLockedRef.current = true
    setTimeout(() => { moveLockedRef.current = false }, PLAYER_MOVE_COOLDOWN_MS)

    const { row, col } = playerRef.current
    let newRow = row
    let newCol = col

    switch (direction) {
      case 'up-left':
        newRow = row - 1
        newCol = col - 1
        break
      case 'up-right':
        newRow = row - 1
        newCol = col
        break
      case 'down-left':
        newRow = row + 1
        newCol = col
        break
      case 'down-right':
        newRow = row + 1
        newCol = col + 1
        break
    }

    // Jumped off the pyramid? Lose a life
    if (!isValidPosition(newRow, newCol)) {
      livesRef.current--
      setLives(livesRef.current)
      if (livesRef.current <= 0) {
        setGameState('gameover')
        emitGameEnded('kube_bert', 'loss', scoreRef.current)
        if (scoreRef.current > highScore) {
          setHighScore(scoreRef.current)
          localStorage.setItem('kubeBertHighScore', String(scoreRef.current))
        }
        stopIntervals()
        return
      }
      // Reset to top
      playerRef.current = { row: 0, col: 0 }
      return
    }

    playerRef.current = { row: newRow, col: newCol }

    // Visit tile
    if (!tilesRef.current[newRow]?.[newCol]) {
      if (tilesRef.current[newRow]) {
        tilesRef.current[newRow][newCol] = true
      }
      scoreRef.current += POINTS_PER_TILE
      setScore(scoreRef.current)
    }

    // Check collision with enemies
    for (const enemy of enemiesRef.current) {
      if (enemy.pos.row === newRow && enemy.pos.col === newCol) {
        livesRef.current--
        setLives(livesRef.current)
        if (livesRef.current <= 0) {
          setGameState('gameover')
          emitGameEnded('kube_bert', 'loss', scoreRef.current)
          if (scoreRef.current > highScore) {
            setHighScore(scoreRef.current)
            localStorage.setItem('kubeBertHighScore', String(scoreRef.current))
          }
          stopIntervals()
          return
        }
        playerRef.current = { row: 0, col: 0 }
        return
      }
    }

    // Check level complete
    if (allTilesVisited()) {
      scoreRef.current += BONUS_PER_LEVEL
      setScore(scoreRef.current)
      levelRef.current++
      setLevel(levelRef.current)
      // Reset for next level
      initTiles()
      playerRef.current = { row: 0, col: 0 }
      enemiesRef.current = []
      // Brief pause then continue
      setGameState('levelComplete')
      stopIntervals()
      setTimeout(() => {
        if (gameStateRef.current === 'levelComplete') {
          setGameState('playing')
          startEnemies()
          startGameLoop()
        }
      }, 1000)
    }
  }, [isValidPosition, allTilesVisited, initTiles, highScore, stopIntervals])

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
      ctx.fillStyle = '#fff'
      ctx.font = `bold ${Math.max(12, tileW / 3)}px monospace`
      ctx.textAlign = 'center'
      ctx.fillText('@#!?', px, py - tileW * 0.8)
    }

    // Level complete flash
    if (gameStateRef.current === 'levelComplete') {
      ctx.fillStyle = 'rgba(0, 212, 170, 0.15)'
      ctx.fillRect(0, 0, w, h)
      ctx.fillStyle = '#00d4aa'
      ctx.font = `bold ${Math.max(16, w / 15)}px monospace`
      ctx.textAlign = 'center'
      ctx.fillText(`Level ${levelRef.current} Complete!`, w / 2, h / 2)
    }
  }, [])

  // Game loop
  const startGameLoop = useCallback(() => {
    const loop = () => {
      render()
      gameLoopRef.current = requestAnimationFrame(loop)
    }
    gameLoopRef.current = requestAnimationFrame(loop)
  }, [render])

  // Enemy intervals
  const startEnemies = useCallback(() => {
    // Spawn faster at higher levels
    const spawnRate = Math.max(1000, ENEMY_SPAWN_INTERVAL_MS - (levelRef.current - 1) * 300)
    const moveRate = Math.max(400, ENEMY_MOVE_INTERVAL_MS - (levelRef.current - 1) * 50)

    enemySpawnRef.current = setInterval(spawnEnemy, spawnRate)
    enemyMoveRef.current = setInterval(moveEnemies, moveRate)
  }, [spawnEnemy, moveEnemies])

  // Start game
  const startGame = useCallback(() => {
    stopIntervals()
    buildTileLabels()
    initTiles()
    playerRef.current = { row: 0, col: 0 }
    enemiesRef.current = []
    enemyIdRef.current = 0
    levelRef.current = 1
    scoreRef.current = 0
    livesRef.current = INITIAL_LIVES
    setScore(0)
    setLevel(1)
    setLives(INITIAL_LIVES)
    setGameState('playing')
    emitGameStarted('kube_bert')

    // Mark starting tile as visited
    if (tilesRef.current[0]) {
      tilesRef.current[0][0] = true
    }
    scoreRef.current += POINTS_PER_TILE
    setScore(scoreRef.current)

    startEnemies()
    startGameLoop()
  }, [stopIntervals, buildTileLabels, initTiles, startEnemies, startGameLoop])

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (gameStateRef.current !== 'playing') return

      // Q*bert uses diagonal movement mapped to arrow keys:
      // Up = up-left, Right = up-right, Down = down-right, Left = down-left
      switch (e.key) {
        case 'ArrowUp':
        case 'w':
        case 'W':
          e.preventDefault()
          movePlayer('up-left')
          break
        case 'ArrowRight':
        case 'd':
        case 'D':
          e.preventDefault()
          movePlayer('up-right')
          break
        case 'ArrowDown':
        case 's':
        case 'S':
          e.preventDefault()
          movePlayer('down-right')
          break
        case 'ArrowLeft':
        case 'a':
        case 'A':
          e.preventDefault()
          movePlayer('down-left')
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [movePlayer])

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

  // Cleanup on unmount
  useEffect(() => {
    return () => stopIntervals()
  }, [stopIntervals])

  // Initial render
  useEffect(() => {
    buildTileLabels()
    initTiles()
    render()
  }, [buildTileLabels, initTiles, render])

  const canvasHeight = isExpanded ? 'calc(100% - 80px)' : '320px'

  return (
    <div ref={containerRef} className="h-full flex flex-col">
      {/* Stats bar */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-black/30 rounded-t-lg text-xs">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1 text-yellow-400">
            <Trophy className="w-3.5 h-3.5" />
            {score}
          </span>
          <span className="text-blue-400">Lvl {level}</span>
          <span className="flex items-center gap-1 text-red-400">
            {Array.from({ length: livesRef.current }).map((_, i) => (
              <Heart key={i} className="w-3 h-3 fill-red-400" />
            ))}
          </span>
        </div>
        <span className="text-muted-foreground">
          Best: {highScore}
        </span>
      </div>

      {/* Canvas */}
      <div className="flex-1 relative">
        <canvas
          ref={canvasRef}
          style={{ width: '100%', height: canvasHeight, display: 'block' }}
        />

        {/* Idle overlay */}
        {gameState === 'idle' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 rounded-b-lg">
            <div className="text-2xl font-bold text-yellow-400 mb-1">Kube Bert</div>
            <p className="text-xs text-muted-foreground mb-3 text-center px-4">
              Hop on every tile to change its color!<br />
              Avoid enemies and don&apos;t fall off!
            </p>
            <button
              onClick={startGame}
              className="flex items-center gap-2 px-4 py-2 bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30 rounded-lg text-sm font-medium transition-colors"
            >
              <Play className="w-4 h-4" /> Start Game
            </button>
          </div>
        )}

        {/* Game over overlay */}
        {gameState === 'gameover' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 rounded-b-lg">
            <div className="text-xl font-bold text-red-400 mb-1">@#!? Game Over!</div>
            <p className="text-sm text-yellow-400 mb-1">Score: {score}</p>
            {score >= highScore && score > 0 && (
              <p className="text-xs text-green-400 mb-2">New High Score!</p>
            )}
            <button
              onClick={startGame}
              className="flex items-center gap-2 px-4 py-2 bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30 rounded-lg text-sm font-medium transition-colors"
            >
              <RotateCcw className="w-4 h-4" /> Try Again
            </button>
          </div>
        )}
      </div>

      {/* Controls — mobile touch buttons */}
      <div className="flex items-center justify-center gap-1 py-1.5 bg-black/20">
        <div className="grid grid-cols-2 gap-1">
          <button
            onClick={() => movePlayer('up-left')}
            className="p-1.5 rounded bg-white/10 hover:bg-white/20 active:bg-white/30 transition-colors"
            title="Up-Left (↑)"
          >
            <ArrowUp className="w-4 h-4 text-blue-400 -rotate-45" />
          </button>
          <button
            onClick={() => movePlayer('up-right')}
            className="p-1.5 rounded bg-white/10 hover:bg-white/20 active:bg-white/30 transition-colors"
            title="Up-Right (→)"
          >
            <ArrowUp className="w-4 h-4 text-blue-400 rotate-45" />
          </button>
          <button
            onClick={() => movePlayer('down-left')}
            className="p-1.5 rounded bg-white/10 hover:bg-white/20 active:bg-white/30 transition-colors"
            title="Down-Left (←)"
          >
            <ArrowDown className="w-4 h-4 text-orange-400 -rotate-45" />
          </button>
          <button
            onClick={() => movePlayer('down-right')}
            className="p-1.5 rounded bg-white/10 hover:bg-white/20 active:bg-white/30 transition-colors"
            title="Down-Right (↓)"
          >
            <ArrowDown className="w-4 h-4 text-orange-400 rotate-45" />
          </button>
        </div>
        <div className="ml-3 text-[10px] text-muted-foreground leading-tight">
          <div>↑ up-left &nbsp; → up-right</div>
          <div>← down-left &nbsp; ↓ down-right</div>
        </div>
      </div>
    </div>
  )
}
