import { useState, useEffect, useCallback, useRef } from 'react'
import { RotateCcw, Trophy } from 'lucide-react'
import { CardComponentProps } from './cardRegistry'
import { useCardExpanded } from './CardWrapper'
import { useReportCardDataState } from './CardDataContext'
import { emitGameStarted, emitGameEnded } from '../../lib/analytics'
import { useGameKeys } from '../../hooks/useGameKeys'
import { safeGet, safeSet } from '../../lib/safeLocalStorage'

/** localStorage key for Flappy Pod high score */
const HIGH_SCORE_KEY = 'flappy-pod-high'
/** Default high score string when none has been persisted yet */
const DEFAULT_HIGH_SCORE = '0'
const DECIMAL_RADIX = 10

// Game constants
const GRAVITY = 0.5
const JUMP_FORCE = -8
const PIPE_SPEED = 3
const PIPE_GAP = 120
const PIPE_WIDTH = 50
const POD_SIZE = 30
const PIPE_SPAWN_INTERVAL = 1800
const INITIAL_POD_Y_PX = 200
const GAME_WIDTH_EXPANDED_PX = 400
const GAME_WIDTH_COLLAPSED_PX = 280
const GAME_HEIGHT_EXPANDED_PX = 500
const GAME_HEIGHT_COLLAPSED_PX = 350
const PIPE_GAP_MARGIN_PX = 100
const POD_X_PX = 50
const PIPE_CAP_OVERHANG_PX = 3
const PIPE_CAP_HEIGHT_PX = 20
const POD_OUTLINE_WIDTH_PX = 2
const POD_DETAIL_X_OFFSET_PX = 5
const POD_DETAIL_WIDTH_INSET_PX = 10
const POD_DETAIL_HEIGHT_PX = 4
const POD_DETAIL_TOP_ROW_OFFSET_PX = 5
const POD_DETAIL_MIDDLE_ROW_OFFSET_PX = 12
const POD_DETAIL_BOTTOM_ROW_OFFSET_PX = 19

const parseHighScore = () => {
  const storedHighScore = safeGet(HIGH_SCORE_KEY)
  const parsedHighScore = Number.parseInt(storedHighScore ?? DEFAULT_HIGH_SCORE, DECIMAL_RADIX)

  return Number.isFinite(parsedHighScore)
    ? parsedHighScore
    : Number.parseInt(DEFAULT_HIGH_SCORE, DECIMAL_RADIX)
}

interface Pipe {
  x: number
  gapY: number
  passed: boolean
}

export function FlappyPod(_props: CardComponentProps) {
  useReportCardDataState({ hasData: true, isFailed: false, consecutiveFailures: 0, isDemoData: false })
  const { isExpanded } = useCardExpanded()

  const gameContainerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const gameLoopRef = useRef<number | null>(null)
  const pipeTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const [isPlaying, setIsPlaying] = useState(false)
  const [gameOver, setGameOver] = useState(false)
  const [score, setScore] = useState(0)
  const [highScore, setHighScore] = useState(parseHighScore)

  // Game state refs (for animation loop)
  const podYRef = useRef(INITIAL_POD_Y_PX)
  const velocityRef = useRef(0)
  const pipesRef = useRef<Pipe[]>([])
  const scoreRef = useRef(0)

  const gameWidth = isExpanded ? GAME_WIDTH_EXPANDED_PX : GAME_WIDTH_COLLAPSED_PX
  const gameHeight = isExpanded ? GAME_HEIGHT_EXPANDED_PX : GAME_HEIGHT_COLLAPSED_PX

  // Jump action
  const jump = () => {
    if (!isPlaying || gameOver) return
    velocityRef.current = JUMP_FORCE
  }

  // Start game
  const startGame = () => {
    podYRef.current = gameHeight / 2
    velocityRef.current = 0
    pipesRef.current = []
    scoreRef.current = 0
    setScore(0)
    setGameOver(false)
    setIsPlaying(true)
    emitGameStarted('flappy_pod')
  }

  // End game
  const endGame = useCallback(() => {
    setGameOver(true)
    setIsPlaying(false)
    emitGameEnded('flappy_pod', 'loss', scoreRef.current)

    if (scoreRef.current > highScore) {
      setHighScore(scoreRef.current)
      safeSet(HIGH_SCORE_KEY, String(scoreRef.current))
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
      const gapY = Math.random() * (gameHeight - PIPE_GAP - PIPE_GAP_MARGIN_PX) + POD_X_PX
      pipesRef.current.push({
        x: gameWidth,
        gapY,
        passed: false })
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
        const podLeft = POD_X_PX
        const podRight = POD_X_PX + POD_SIZE
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
        if (!pipe.passed && pipe.x + PIPE_WIDTH < POD_X_PX) {
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
        ctx.fillRect(
          pipe.x - PIPE_CAP_OVERHANG_PX,
          pipe.gapY - PIPE_CAP_HEIGHT_PX,
          PIPE_WIDTH + PIPE_CAP_OVERHANG_PX * 2,
          PIPE_CAP_HEIGHT_PX
        )
        ctx.fillRect(
          pipe.x - PIPE_CAP_OVERHANG_PX,
          pipe.gapY + PIPE_GAP,
          PIPE_WIDTH + PIPE_CAP_OVERHANG_PX * 2,
          PIPE_CAP_HEIGHT_PX
        )
        ctx.fillStyle = '#22c55e'
      }

      // Draw pod (container)
      ctx.fillStyle = '#3b82f6'
      ctx.fillRect(POD_X_PX, podYRef.current, POD_SIZE, POD_SIZE)
      ctx.strokeStyle = '#60a5fa'
      ctx.lineWidth = POD_OUTLINE_WIDTH_PX
      ctx.strokeRect(POD_X_PX, podYRef.current, POD_SIZE, POD_SIZE)

      // Pod details (container look)
      ctx.fillStyle = '#1d4ed8'
      ctx.fillRect(
        POD_X_PX + POD_DETAIL_X_OFFSET_PX,
        podYRef.current + POD_DETAIL_TOP_ROW_OFFSET_PX,
        POD_SIZE - POD_DETAIL_WIDTH_INSET_PX,
        POD_DETAIL_HEIGHT_PX
      )
      ctx.fillRect(
        POD_X_PX + POD_DETAIL_X_OFFSET_PX,
        podYRef.current + POD_DETAIL_MIDDLE_ROW_OFFSET_PX,
        POD_SIZE - POD_DETAIL_WIDTH_INSET_PX,
        POD_DETAIL_HEIGHT_PX
      )
      ctx.fillRect(
        POD_X_PX + POD_DETAIL_X_OFFSET_PX,
        podYRef.current + POD_DETAIL_BOTTOM_ROW_OFFSET_PX,
        POD_SIZE - POD_DETAIL_WIDTH_INSET_PX,
        POD_DETAIL_HEIGHT_PX
      )

      gameLoopRef.current = requestAnimationFrame(gameLoop)
    }

    gameLoopRef.current = requestAnimationFrame(gameLoop)

    return () => {
      if (gameLoopRef.current) {
        cancelAnimationFrame(gameLoopRef.current)
      }
    }
  }, [isPlaying, gameOver, gameWidth, gameHeight, endGame])

  // Keyboard and click controls — scoped to visible game container (KeepAlive-safe)
  const handleFlappyKeyDown = (e: KeyboardEvent) => {
    if (e.key === ' ' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (!isPlaying && !gameOver) {
        startGame()
      } else {
        jump()
      }
    }
  }
  useGameKeys(gameContainerRef, { onKeyDown: handleFlappyKeyDown })

  const handleClick = () => {
    if (!isPlaying && !gameOver) {
      startGame()
    } else if (isPlaying) {
      jump()
    }
  }

  return (
    <div ref={gameContainerRef} className="h-full flex flex-col p-2 select-none">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
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
          aria-label="New Game"
        >
          <RotateCcw className="w-4 h-4" />
        </button>
      </div>

      {/* Game area - relative container for overlays */}
      <div
        className={`flex-1 flex items-center justify-center relative ${isExpanded ? 'min-h-0' : ''}`}
        onClick={handleClick}
      >
        <canvas
          ref={canvasRef}
          width={gameWidth}
          height={gameHeight}
          className="border border-border rounded cursor-pointer"
          style={isExpanded ? { width: '100%', height: '100%', objectFit: 'contain' } : undefined}
        />

        {/* Start overlay - only covers game area */}
        {!isPlaying && !gameOver && (
          <div
            className="absolute inset-0 bg-background/90 flex items-center justify-center rounded-lg cursor-pointer backdrop-blur-sm"
            onClick={handleClick}
          >
            <div className="text-center px-4">
              <div className="text-2xl font-bold text-foreground mb-4">Ready to Fly?</div>
              <div className="text-lg text-blue-400 mb-2">Click or press Space to flap</div>
              <div className="text-sm text-muted-foreground mb-4">Keep tapping to stay airborne!</div>
              <div className="text-xs text-yellow-400">Avoid the green pipes</div>
            </div>
          </div>
        )}

        {/* Game over overlay - only covers game area */}
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
    </div>
  )
}
