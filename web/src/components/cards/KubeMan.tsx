import { useState, useEffect, useCallback, useRef } from 'react'
import { RotateCcw, Trophy, Box } from 'lucide-react'
import { CardComponentProps } from './cardRegistry'
import { useCardExpanded } from './CardWrapper'

// Game constants
const CELL_SIZE = 16
const MAZE_WIDTH = 19
const MAZE_HEIGHT = 21

// Ghost names and behaviors
const GHOST_NAMES = ['Blinky', 'Pinky', 'Inky', 'Clyde'] as const
type GhostName = typeof GHOST_NAMES[number]

// Maze layout: 0=wall, 1=dot, 2=power pellet, 3=empty, 4=ghost house
const MAZE_TEMPLATE = [
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  [0,1,1,1,1,1,1,1,1,0,1,1,1,1,1,1,1,1,0],
  [0,2,0,0,1,0,0,0,1,0,1,0,0,0,1,0,0,2,0],
  [0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0],
  [0,1,0,0,1,0,1,0,0,0,0,0,1,0,1,0,0,1,0],
  [0,1,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,1,0],
  [0,0,0,0,1,0,0,0,1,0,1,0,0,0,1,0,0,0,0],
  [3,3,3,0,1,0,1,1,1,1,1,1,1,0,1,0,3,3,3],
  [0,0,0,0,1,0,1,0,0,4,0,0,1,0,1,0,0,0,0],
  [3,3,3,3,1,1,1,0,4,4,4,0,1,1,1,3,3,3,3],
  [0,0,0,0,1,0,1,0,0,0,0,0,1,0,1,0,0,0,0],
  [3,3,3,0,1,0,1,1,1,1,1,1,1,0,1,0,3,3,3],
  [0,0,0,0,1,0,1,0,0,0,0,0,1,0,1,0,0,0,0],
  [0,1,1,1,1,1,1,1,1,0,1,1,1,1,1,1,1,1,0],
  [0,1,0,0,1,0,0,0,1,0,1,0,0,0,1,0,0,1,0],
  [0,2,1,0,1,1,1,1,1,1,1,1,1,1,1,0,1,2,0],
  [0,0,1,0,1,0,1,0,0,0,0,0,1,0,1,0,1,0,0],
  [0,1,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,1,0],
  [0,1,0,0,0,0,0,0,1,0,1,0,0,0,0,0,0,1,0],
  [0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0],
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
]

type Direction = 'up' | 'down' | 'left' | 'right'

interface Position {
  x: number
  y: number
}

interface Ghost {
  pos: Position
  dir: Direction
  color: string
  scared: boolean
  home: boolean
  name: GhostName
  releaseDelay: number // Ticks before release from home
}

// Death animation state
interface DeathAnimation {
  active: boolean
  frame: number
  maxFrames: number
}

// Clone maze
function cloneMaze(maze: number[][]): number[][] {
  return maze.map(row => [...row])
}

// Count dots in maze
function countDots(maze: number[][]): number {
  let count = 0
  for (const row of maze) {
    for (const cell of row) {
      if (cell === 1 || cell === 2) count++
    }
  }
  return count
}

// Check if position is valid (not a wall)
function isValidMove(maze: number[][], x: number, y: number): boolean {
  if (x < 0 || x >= MAZE_WIDTH || y < 0 || y >= MAZE_HEIGHT) {
    // Tunnel wrapping
    return true
  }
  return maze[y][x] !== 0
}

// Get opposite direction
function oppositeDir(dir: Direction): Direction {
  const opposites: Record<Direction, Direction> = {
    up: 'down',
    down: 'up',
    left: 'right',
    right: 'left',
  }
  return opposites[dir]
}

// Move in direction
function moveInDir(pos: Position, dir: Direction): Position {
  const moves: Record<Direction, Position> = {
    up: { x: pos.x, y: pos.y - 1 },
    down: { x: pos.x, y: pos.y + 1 },
    left: { x: pos.x - 1, y: pos.y },
    right: { x: pos.x + 1, y: pos.y },
  }
  const newPos = moves[dir]

  // Handle tunnel wrapping
  if (newPos.x < 0) newPos.x = MAZE_WIDTH - 1
  if (newPos.x >= MAZE_WIDTH) newPos.x = 0

  return newPos
}

export function KubeMan(_props: CardComponentProps) {
  const { isExpanded } = useCardExpanded()

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const gameLoopRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const [maze, setMaze] = useState<number[][]>(() => cloneMaze(MAZE_TEMPLATE))
  const [playerPos, setPlayerPos] = useState<Position>({ x: 9, y: 15 })
  const [playerDir, setPlayerDir] = useState<Direction>('left')
  const [nextDir, setNextDir] = useState<Direction | null>(null)
  const [ghosts, setGhosts] = useState<Ghost[]>([
    { pos: { x: 9, y: 9 }, dir: 'up', color: '#ff0000', scared: false, home: true, name: 'Blinky', releaseDelay: 0 },
    { pos: { x: 8, y: 9 }, dir: 'up', color: '#ffb8ff', scared: false, home: true, name: 'Pinky', releaseDelay: 30 },
    { pos: { x: 10, y: 9 }, dir: 'up', color: '#00ffff', scared: false, home: true, name: 'Inky', releaseDelay: 60 },
    { pos: { x: 9, y: 10 }, dir: 'up', color: '#ffb852', scared: false, home: true, name: 'Clyde', releaseDelay: 90 },
  ])
  const [deathAnimation, setDeathAnimation] = useState<DeathAnimation>({ active: false, frame: 0, maxFrames: 60 })
  const [score, setScore] = useState(0)
  const [lives, setLives] = useState(3)
  const [level, setLevel] = useState(1)
  const [gameOver, setGameOver] = useState(false)
  const [won, setWon] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [powerMode, setPowerMode] = useState(false)
  const [mouthOpen, setMouthOpen] = useState(true)

  const powerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Initialize game state refs for game loop
  const gameStateRef = useRef({
    playerPos,
    playerDir,
    nextDir,
    ghosts,
    maze,
    powerMode,
    deathAnimation,
  })

  // Tick counter ref for ghost release timing
  const tickCountRef = useRef(0)

  // Keep refs in sync
  useEffect(() => {
    gameStateRef.current = { playerPos, playerDir, nextDir, ghosts, maze, powerMode, deathAnimation }
  }, [playerPos, playerDir, nextDir, ghosts, maze, powerMode, deathAnimation])

  // Draw game
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
          up: -Math.PI / 2,
        }
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

  // Ghost AI: Get target position based on ghost personality
  const getGhostTarget = useCallback((ghost: Ghost, playerPos: Position, playerDir: Direction): Position => {
    if (ghost.scared) {
      // When scared, run to opposite corner from player
      return {
        x: playerPos.x < MAZE_WIDTH / 2 ? MAZE_WIDTH - 2 : 1,
        y: playerPos.y < MAZE_HEIGHT / 2 ? MAZE_HEIGHT - 2 : 1,
      }
    }

    switch (ghost.name) {
      case 'Blinky':
        // Blinky (red) - Direct chase, always targets player's position
        return { ...playerPos }

      case 'Pinky':
        // Pinky (pink) - Ambusher, targets 4 tiles ahead of player
        const ahead: Record<Direction, Position> = {
          up: { x: playerPos.x, y: playerPos.y - 4 },
          down: { x: playerPos.x, y: playerPos.y + 4 },
          left: { x: playerPos.x - 4, y: playerPos.y },
          right: { x: playerPos.x + 4, y: playerPos.y },
        }
        return ahead[playerDir]

      case 'Inky':
        // Inky (cyan) - Unpredictable, uses vector from Blinky to 2 ahead of player, doubled
        const twoAhead: Record<Direction, Position> = {
          up: { x: playerPos.x, y: playerPos.y - 2 },
          down: { x: playerPos.x, y: playerPos.y + 2 },
          left: { x: playerPos.x - 2, y: playerPos.y },
          right: { x: playerPos.x + 2, y: playerPos.y },
        }
        const target = twoAhead[playerDir]
        // Add some chaos by sometimes targeting random spots
        if (Math.random() < 0.2) {
          return { x: Math.floor(Math.random() * MAZE_WIDTH), y: Math.floor(Math.random() * MAZE_HEIGHT) }
        }
        return target

      case 'Clyde':
        // Clyde (orange) - Shy, chases when far, runs to corner when close
        const distance = Math.abs(ghost.pos.x - playerPos.x) + Math.abs(ghost.pos.y - playerPos.y)
        if (distance < 8) {
          // Run to bottom-left corner when too close
          return { x: 1, y: MAZE_HEIGHT - 2 }
        }
        return { ...playerPos }

      default:
        return { ...playerPos }
    }
  }, [])

  // Game loop
  useEffect(() => {
    if (!isPlaying || gameOver) {
      if (gameLoopRef.current) {
        clearInterval(gameLoopRef.current)
        gameLoopRef.current = null
      }
      return
    }

    gameLoopRef.current = setInterval(() => {
      tickCountRef.current++
      const tick = tickCountRef.current
      const state = gameStateRef.current

      // Handle death animation
      if (state.deathAnimation.active) {
        if (state.deathAnimation.frame >= state.deathAnimation.maxFrames) {
          // Animation complete, reset positions or end game
          setDeathAnimation({ active: false, frame: 0, maxFrames: 60 })
          setLives(l => {
            if (l <= 1) {
              setGameOver(true)
              setIsPlaying(false)
              return 0
            }
            // Reset positions after animation
            setPlayerPos({ x: 9, y: 15 })
            setPlayerDir('left')
            tickCountRef.current = 0 // Reset tick for ghost release timing
            setGhosts(gs => gs.map((g, i) => ({
              ...g,
              pos: { x: 8 + (i % 3), y: 9 + Math.floor(i / 3) },
              home: true,
              scared: false,
              releaseDelay: i * 100, // ~1.6 seconds apart at 60fps
            })))
            return l - 1
          })
        } else {
          setDeathAnimation(d => ({ ...d, frame: d.frame + 1 }))
        }
        draw()
        return
      }

      // Animate mouth (every ~300ms at 60fps)
      if (tick % 18 === 0) {
        setMouthOpen(m => !m)
      }

      // Move player (every ~250ms at 60fps - responsive but not too fast)
      if (tick % 15 === 0) {
        let newDir = state.playerDir
        let newPos = state.playerPos

        // Try to change direction if requested
        if (state.nextDir) {
          const tryPos = moveInDir(state.playerPos, state.nextDir)
          if (isValidMove(state.maze, tryPos.x, tryPos.y)) {
            newDir = state.nextDir
            newPos = tryPos
            setNextDir(null)
          }
        }

        // Continue in current direction
        if (newPos === state.playerPos) {
          const tryPos = moveInDir(state.playerPos, state.playerDir)
          if (isValidMove(state.maze, tryPos.x, tryPos.y)) {
            newPos = tryPos
          }
        }

        if (newPos !== state.playerPos) {
          setPlayerPos(newPos)
          setPlayerDir(newDir)

          // Check for dot/pellet
          const cell = state.maze[newPos.y][newPos.x]
          if (cell === 1) {
            setScore(s => s + 10)
            setMaze(m => {
              const newMaze = cloneMaze(m)
              newMaze[newPos.y][newPos.x] = 3
              return newMaze
            })
          } else if (cell === 2) {
            setScore(s => s + 50)
            setMaze(m => {
              const newMaze = cloneMaze(m)
              newMaze[newPos.y][newPos.x] = 3
              return newMaze
            })
            // Power mode
            setPowerMode(true)
            setGhosts(gs => gs.map(g => ({ ...g, scared: true })))
            if (powerTimerRef.current) clearTimeout(powerTimerRef.current)
            powerTimerRef.current = setTimeout(() => {
              setPowerMode(false)
              setGhosts(gs => gs.map(g => ({ ...g, scared: false })))
            }, 5000)
          }
        }
      }

      // Move ghosts (every ~330ms at 60fps - slightly slower than player)
      if (tick % 20 === 0) {
        setGhosts(gs => gs.map(ghost => {
          // Check if ghost should be released from home
          if (ghost.home) {
            if (tick >= ghost.releaseDelay) {
              return { ...ghost, home: false, pos: { x: 9, y: 7 } }
            }
            return ghost
          }

          // Get target based on ghost personality
          const target = getGhostTarget(ghost, state.playerPos, state.playerDir)

          // Find valid directions (can't reverse unless stuck)
          const dirs: Direction[] = ['up', 'down', 'left', 'right']
          const validDirs = dirs.filter(d => {
            if (d === oppositeDir(ghost.dir)) return false
            const newPos = moveInDir(ghost.pos, d)
            return isValidMove(state.maze, newPos.x, newPos.y)
          })

          if (validDirs.length === 0) {
            // Turn around if stuck
            const backPos = moveInDir(ghost.pos, oppositeDir(ghost.dir))
            if (isValidMove(state.maze, backPos.x, backPos.y)) {
              return { ...ghost, pos: backPos, dir: oppositeDir(ghost.dir) }
            }
            return ghost
          }

          // Choose direction based on target
          let bestDir = validDirs[0]
          let bestDist = Infinity

          for (const d of validDirs) {
            const newPos = moveInDir(ghost.pos, d)
            const dist = Math.abs(newPos.x - target.x) + Math.abs(newPos.y - target.y)
            if (dist < bestDist) {
              bestDist = dist
              bestDir = d
            }
          }

          // Inky has more randomness (unpredictable)
          if (ghost.name === 'Inky' && Math.random() < 0.3 && validDirs.length > 1) {
            bestDir = validDirs[Math.floor(Math.random() * validDirs.length)]
          }

          return { ...ghost, pos: moveInDir(ghost.pos, bestDir), dir: bestDir }
        }))
      }

      // Check collision with ghosts
      for (const ghost of state.ghosts) {
        if (!ghost.home && ghost.pos.x === state.playerPos.x && ghost.pos.y === state.playerPos.y) {
          if (ghost.scared) {
            // Eat ghost
            setScore(s => s + 200)
            setGhosts(gs => gs.map(g =>
              g.name === ghost.name ? { ...g, pos: { x: 9, y: 9 }, home: true, scared: false, releaseDelay: tick + 60 } : g
            ))
          } else {
            // Start death animation instead of immediate reset
            setDeathAnimation({ active: true, frame: 0, maxFrames: 60 })
          }
          break
        }
      }

      // Check win condition
      if (countDots(state.maze) === 0) {
        setWon(true)
        setGameOver(true)
        setIsPlaying(false)
      }

      // Draw
      draw()
    }, 16) // 60 FPS for smooth animation

    return () => {
      if (gameLoopRef.current) {
        clearInterval(gameLoopRef.current)
      }
    }
  }, [isPlaying, gameOver, draw, getGhostTarget])

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isPlaying) return

      const keyMap: Record<string, Direction> = {
        ArrowUp: 'up',
        ArrowDown: 'down',
        ArrowLeft: 'left',
        ArrowRight: 'right',
        w: 'up',
        W: 'up',
        s: 'down',
        S: 'down',
        a: 'left',
        A: 'left',
        d: 'right',
        D: 'right',
      }

      if (keyMap[e.key]) {
        e.preventDefault()
        setNextDir(keyMap[e.key])
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isPlaying])

  // Start game
  const startGame = useCallback(() => {
    setMaze(cloneMaze(MAZE_TEMPLATE))
    setPlayerPos({ x: 9, y: 15 })
    setPlayerDir('left')
    setNextDir(null)
    tickCountRef.current = 0
    setGhosts([
      { pos: { x: 9, y: 9 }, dir: 'up', color: '#ff0000', scared: false, home: true, name: 'Blinky', releaseDelay: 0 },
      { pos: { x: 8, y: 9 }, dir: 'up', color: '#ffb8ff', scared: false, home: true, name: 'Pinky', releaseDelay: 100 },
      { pos: { x: 10, y: 9 }, dir: 'up', color: '#00ffff', scared: false, home: true, name: 'Inky', releaseDelay: 200 },
      { pos: { x: 9, y: 10 }, dir: 'up', color: '#ffb852', scared: false, home: true, name: 'Clyde', releaseDelay: 300 },
    ])
    setScore(0)
    setLives(3)
    setLevel(1)
    setGameOver(false)
    setWon(false)
    setPowerMode(false)
    setDeathAnimation({ active: false, frame: 0, maxFrames: 60 })
    setIsPlaying(true)
  }, [])

  const scale = isExpanded ? 1.5 : 1
  const canvasWidth = MAZE_WIDTH * CELL_SIZE * scale
  const canvasHeight = MAZE_HEIGHT * CELL_SIZE * scale

  // Initial draw
  useEffect(() => {
    draw()
  }, [draw])

  return (
    <div className="h-full flex flex-col p-2 select-none">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
        <div className="flex items-center gap-1.5">
          <Box className="w-4 h-4 text-yellow-400" />
          <span className="text-sm font-semibold">Kube-Man</span>
        </div>

        <div className="flex items-center gap-3 text-xs">
          <div className="text-center">
            <div className="text-muted-foreground">Score</div>
            <div className="font-bold text-foreground">{score}</div>
          </div>
          <div className="text-center">
            <div className="text-muted-foreground">Lives</div>
            <div className="font-bold text-red-400">{'❤️'.repeat(lives)}</div>
          </div>
          <div className="text-center">
            <div className="text-muted-foreground">Level</div>
            <div className="font-bold text-purple-400">{level}</div>
          </div>
        </div>

        <button
          onClick={startGame}
          className="p-1.5 rounded hover:bg-secondary"
          title="New Game"
        >
          <RotateCcw className="w-4 h-4" />
        </button>
      </div>

      {/* Game area */}
      <div className="flex-1 flex items-center justify-center">
        <canvas
          ref={canvasRef}
          width={canvasWidth}
          height={canvasHeight}
          className="border border-border rounded"
        />
      </div>

      {/* Start overlay */}
      {!isPlaying && !gameOver && (
        <div className="absolute inset-0 bg-background/80 flex items-center justify-center rounded-lg">
          <div className="text-center">
            <div className="text-xl font-bold text-yellow-400 mb-2">KUBE-MAN</div>
            <div className="text-muted-foreground mb-4">Eat all dots and avoid ghosts!</div>
            <button
              onClick={startGame}
              className="px-6 py-3 bg-yellow-500/20 text-yellow-400 rounded-lg hover:bg-yellow-500/30 font-semibold"
            >
              Start Game
            </button>
          </div>
        </div>
      )}

      {/* Game over overlay */}
      {gameOver && (
        <div className="absolute inset-0 bg-background/80 flex items-center justify-center rounded-lg">
          <div className="text-center">
            {won ? (
              <>
                <Trophy className="w-12 h-12 text-yellow-400 mx-auto mb-3" />
                <div className="text-xl font-bold text-yellow-400 mb-2">Level Complete!</div>
              </>
            ) : (
              <div className="text-xl font-bold text-red-400 mb-2">Game Over!</div>
            )}
            <div className="text-muted-foreground mb-4">Score: {score}</div>
            <button
              onClick={startGame}
              className="px-6 py-3 bg-yellow-500/20 text-yellow-400 rounded-lg hover:bg-yellow-500/30 font-semibold"
            >
              Play Again
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
