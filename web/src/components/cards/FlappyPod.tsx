import { useState, useEffect, useCallback, useRef } from 'react'
import { RotateCcw, Trophy, Box } from 'lucide-react'
import { CardComponentProps } from './cardRegistry'
import { useCardExpanded } from './CardWrapper'

// Game constants
const GRAVITY = 0.5
const JUMP_FORCE = -8
const PIPE_SPEED = 3
const PIPE_GAP = 120
const PIPE_WIDTH = 50
const POD_SIZE = 30
const PIPE_SPAWN_INTERVAL = 1800

interface Pipe {
  x: number
  gapY: number
  passed: boolean
}

export function FlappyPod(_props: CardComponentProps) {
  const { isExpanded } = useCardExpanded()

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const gameLoopRef = useRef<number | null>(null)
  const pipeTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const [isPlaying, setIsPlaying] = useState(false)
  const [gameOver, setGameOver] = useState(false)
  const [score, setScore] = useState(0)
  const [highScore, setHighScore] = useState(() => {
    try {
      return parseInt(localStorage.getItem('flappy-pod-high') || '0')
    } catch {
      return 0
    }
  })

  // Game state refs (for animation loop)
  const podYRef = useRef(200)
  const velocityRef = useRef(0)
  const pipesRef = useRef<Pipe[]>([])
  const scoreRef = useRef(0)

  const gameWidth = isExpanded ? 400 : 280
  const gameHeight = isExpanded ? 500 : 350

  // Jump action
  const jump = useCallback(() => {
    if (!isPlaying || gameOver) return
    velocityRef.current = JUMP_FORCE
  }, [isPlaying, gameOver])

  // Start game
  const startGame = useCallback(() => {
    podYRef.current = gameHeight / 2
    velocityRef.current = 0
    pipesRef.current = []
    scoreRef.current = 0
    setScore(0)
    setGameOver(false)
    setIsPlaying(true)
  }, [gameHeight])

  // End game
  const endGame = useCallback(() => {
    setGameOver(true)
    setIsPlaying(false)

    if (scoreRef.current > highScore) {
      setHighScore(scoreRef.current)
      localStorage.setItem('flappy-pod-high', String(scoreRef.current))
    }
  }, [highScore])

  // Spawn pipes
  useEffect(() => {
    if (!isPlaying || gameOver) {
      if (pipeTimerRef.current) {
        clearInterval(pipeTimerRef.current)
        pipeTimerRef.current = null
      }
      return
    }

    pipeTimerRef.current = setInterval(() => {
      const gapY = Math.random() * (gameHeight - PIPE_GAP - 100) + 50
      pipesRef.current.push({
        x: gameWidth,
        gapY,
        passed: false,
      })
    }, PIPE_SPAWN_INTERVAL)

    return () => {
      if (pipeTimerRef.current) {
        clearInterval(pipeTimerRef.current)
      }
    }
  }, [isPlaying, gameOver, gameWidth, gameHeight])

  // Game loop
  useEffect(() => {
    if (!isPlaying || gameOver) {
      if (gameLoopRef.current) {
        cancelAnimationFrame(gameLoopRef.current)
        gameLoopRef.current = null
      }
      return
    }

    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const gameLoop = () => {
      // Update pod position
      velocityRef.current += GRAVITY
      podYRef.current += velocityRef.current

      // Check boundaries
      if (podYRef.current < 0 || podYRef.current + POD_SIZE > gameHeight) {
        endGame()
        return
      }

      // Update pipes
      const newPipes: Pipe[] = []
      for (const pipe of pipesRef.current) {
        pipe.x -= PIPE_SPEED

        // Check collision
        const podLeft = 50
        const podRight = 50 + POD_SIZE
        const podTop = podYRef.current
        const podBottom = podYRef.current + POD_SIZE

        if (podRight > pipe.x && podLeft < pipe.x + PIPE_WIDTH) {
          // Pod is in pipe zone
          if (podTop < pipe.gapY || podBottom > pipe.gapY + PIPE_GAP) {
            endGame()
            return
          }
        }

        // Check if passed
        if (!pipe.passed && pipe.x + PIPE_WIDTH < 50) {
          pipe.passed = true
          scoreRef.current++
          setScore(scoreRef.current)
        }

        // Keep pipe if still on screen
        if (pipe.x + PIPE_WIDTH > 0) {
          newPipes.push(pipe)
        }
      }
      pipesRef.current = newPipes

      // Draw
      ctx.fillStyle = '#18181b'
      ctx.fillRect(0, 0, gameWidth, gameHeight)

      // Draw pipes
      ctx.fillStyle = '#22c55e'
      for (const pipe of pipesRef.current) {
        // Top pipe
        ctx.fillRect(pipe.x, 0, PIPE_WIDTH, pipe.gapY)
        // Bottom pipe
        ctx.fillRect(pipe.x, pipe.gapY + PIPE_GAP, PIPE_WIDTH, gameHeight - pipe.gapY - PIPE_GAP)

        // Pipe edges
        ctx.fillStyle = '#16a34a'
        ctx.fillRect(pipe.x - 3, pipe.gapY - 20, PIPE_WIDTH + 6, 20)
        ctx.fillRect(pipe.x - 3, pipe.gapY + PIPE_GAP, PIPE_WIDTH + 6, 20)
        ctx.fillStyle = '#22c55e'
      }

      // Draw pod (container)
      ctx.fillStyle = '#3b82f6'
      ctx.fillRect(50, podYRef.current, POD_SIZE, POD_SIZE)
      ctx.strokeStyle = '#60a5fa'
      ctx.lineWidth = 2
      ctx.strokeRect(50, podYRef.current, POD_SIZE, POD_SIZE)

      // Pod details (container look)
      ctx.fillStyle = '#1d4ed8'
      ctx.fillRect(55, podYRef.current + 5, POD_SIZE - 10, 4)
      ctx.fillRect(55, podYRef.current + 12, POD_SIZE - 10, 4)
      ctx.fillRect(55, podYRef.current + 19, POD_SIZE - 10, 4)

      gameLoopRef.current = requestAnimationFrame(gameLoop)
    }

    gameLoopRef.current = requestAnimationFrame(gameLoop)

    return () => {
      if (gameLoopRef.current) {
        cancelAnimationFrame(gameLoopRef.current)
      }
    }
  }, [isPlaying, gameOver, gameWidth, gameHeight, endGame])

  // Keyboard and click controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'ArrowUp') {
        e.preventDefault()
        if (!isPlaying && !gameOver) {
          startGame()
        } else {
          jump()
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isPlaying, gameOver, startGame, jump])

  const handleClick = useCallback(() => {
    if (!isPlaying && !gameOver) {
      startGame()
    } else if (isPlaying) {
      jump()
    }
  }, [isPlaying, gameOver, startGame, jump])

  return (
    <div className="h-full flex flex-col p-2 select-none">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
        <div className="flex items-center gap-1.5">
          <Box className="w-4 h-4 text-blue-400" />
          <span className="text-sm font-semibold">Flappy Pod</span>
        </div>

        <div className="flex items-center gap-3 text-xs">
          <div className="text-center">
            <div className="text-muted-foreground">Score</div>
            <div className="font-bold text-foreground">{score}</div>
          </div>
          <div className="text-center">
            <div className="text-muted-foreground">Best</div>
            <div className="font-bold text-yellow-400">{highScore}</div>
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
      <div
        className="flex-1 flex items-center justify-center"
        onClick={handleClick}
      >
        <canvas
          ref={canvasRef}
          width={gameWidth}
          height={gameHeight}
          className="border border-border rounded cursor-pointer"
        />
      </div>

      {/* Start overlay */}
      {!isPlaying && !gameOver && (
        <div
          className="absolute inset-0 bg-background/80 flex items-center justify-center rounded-lg cursor-pointer"
          onClick={handleClick}
        >
          <div className="text-center">
            <div className="text-xl font-bold text-foreground mb-2">Flappy Pod</div>
            <div className="text-muted-foreground mb-4">Click or press Space to fly!</div>
            <div className="text-sm text-muted-foreground">Avoid the node walls</div>
          </div>
        </div>
      )}

      {/* Game over overlay */}
      {gameOver && (
        <div className="absolute inset-0 bg-background/80 flex items-center justify-center rounded-lg">
          <div className="text-center">
            <Trophy className="w-12 h-12 text-yellow-400 mx-auto mb-3" />
            <div className="text-xl font-bold text-foreground mb-2">Game Over!</div>
            <div className="text-muted-foreground mb-1">Score: {score}</div>
            {score === highScore && score > 0 && (
              <div className="text-yellow-400 text-sm mb-4">New High Score!</div>
            )}
            <button
              onClick={startGame}
              className="px-6 py-3 bg-blue-500/20 text-blue-400 rounded-lg hover:bg-blue-500/30 font-semibold"
            >
              Play Again
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
