/**
 * Game state/logic hook for the KubeMan card: player movement, ghost AI,
 * collisions, and the game loop. Canvas rendering lives in
 * useKubeManRenderer.
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import { emitGameStarted, emitGameEnded } from '../../lib/analytics'
import { useGameKeys } from '../../hooks/useGameKeys'
import {
  MAZE_TEMPLATE, MAZE_WIDTH, MAZE_HEIGHT, POWER_MODE_DURATION_MS, STARTING_GHOSTS,
  cloneMaze, countDots, isValidMove, oppositeDir, moveInDir,
  type Direction, type Position, type Ghost, type DeathAnimation,
} from './kubeMan.constants'
import { useKubeManRenderer } from './useKubeManRenderer'

export function useKubeManGame(isExpanded: boolean) {
  const gameContainerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const gameLoopRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const [maze, setMaze] = useState<number[][]>(() => cloneMaze(MAZE_TEMPLATE))
  const [playerPos, setPlayerPos] = useState<Position>({ x: 9, y: 15 })
  const [playerDir, setPlayerDir] = useState<Direction>('left')
  const [nextDir, setNextDir] = useState<Direction | null>(null)
  const [ghosts, setGhosts] = useState<Ghost[]>(() => STARTING_GHOSTS.map(g => ({ ...g })))
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
    deathAnimation })

  // Tick counter ref for ghost release timing
  const tickCountRef = useRef(0)

  // Keep refs in sync
  useEffect(() => {
    gameStateRef.current = { playerPos, playerDir, nextDir, ghosts, maze, powerMode, deathAnimation }
  }, [playerPos, playerDir, nextDir, ghosts, maze, powerMode, deathAnimation])

  const draw = useKubeManRenderer({
    canvasRef, isExpanded, maze, playerPos, playerDir, ghosts, mouthOpen, deathAnimation,
  })

  // Ghost AI: Get target position based on ghost personality
  const getGhostTarget = useCallback((ghost: Ghost, playerPos: Position, playerDir: Direction): Position => {
    if (ghost.scared) {
      // When scared, run to opposite corner from player
      return {
        x: playerPos.x < MAZE_WIDTH / 2 ? MAZE_WIDTH - 2 : 1,
        y: playerPos.y < MAZE_HEIGHT / 2 ? MAZE_HEIGHT - 2 : 1 }
    }

    switch (ghost.name) {
      case 'Blinky':
        // Blinky (red) - Direct chase, always targets player's position
        return { ...playerPos }

      case 'Pinky': {
        // Pinky (pink) - Ambusher, targets 4 tiles ahead of player
        const ahead: Record<Direction, Position> = {
          up: { x: playerPos.x, y: playerPos.y - 4 },
          down: { x: playerPos.x, y: playerPos.y + 4 },
          left: { x: playerPos.x - 4, y: playerPos.y },
          right: { x: playerPos.x + 4, y: playerPos.y } }
        return ahead[playerDir]
      }

      case 'Inky': {
        // Inky (cyan) - Unpredictable, uses vector from Blinky to 2 ahead of player, doubled
        const twoAhead: Record<Direction, Position> = {
          up: { x: playerPos.x, y: playerPos.y - 2 },
          down: { x: playerPos.x, y: playerPos.y + 2 },
          left: { x: playerPos.x - 2, y: playerPos.y },
          right: { x: playerPos.x + 2, y: playerPos.y } }
        const target = twoAhead[playerDir]
        // Add some chaos by sometimes targeting random spots
        if (Math.random() < 0.2) {
          return { x: Math.floor(Math.random() * MAZE_WIDTH), y: Math.floor(Math.random() * MAZE_HEIGHT) }
        }
        return target
      }

      case 'Clyde': {
        // Clyde (orange) - Shy, chases when far, runs to corner when close
        const distance = Math.abs(ghost.pos.x - playerPos.x) + Math.abs(ghost.pos.y - playerPos.y)
        if (distance < 8) {
          // Run to bottom-left corner when too close
          return { x: 1, y: MAZE_HEIGHT - 2 }
        }
        return { ...playerPos }
      }

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
              setScore(s => { emitGameEnded('kube_man', 'loss', s); return s })
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
            }, POWER_MODE_DURATION_MS)
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
        setScore(s => { emitGameEnded('kube_man', 'win', s); return s })
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

  // Keyboard controls — scoped to visible game container (KeepAlive-safe)
  const handleManKeyDown = (e: KeyboardEvent) => {
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
      D: 'right' }

    if (keyMap[e.key]) {
      e.preventDefault()
      setNextDir(keyMap[e.key])
    }
  }
  useGameKeys(gameContainerRef, { onKeyDown: handleManKeyDown })

  // Start game
  const startGame = () => {
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
    emitGameStarted('kube_man')
  }

  // Initial draw
  useEffect(() => {
    draw()
  }, [draw])

  return {
    gameContainerRef,
    canvasRef,
    score,
    lives,
    level,
    gameOver,
    won,
    isPlaying,
    startGame,
  }
}
