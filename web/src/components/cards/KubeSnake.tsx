import { useState, useEffect, useRef, useCallback } from 'react'

import { Play, RotateCcw, Pause, Trophy, Apple, Zap } from 'lucide-react'
import { useCardExpanded } from './CardWrapper'
import { useReportCardDataState } from './CardDataContext'
import { emitGameStarted, emitGameEnded } from '../../lib/analytics'
import { useGameKeys } from '../../hooks/useGameKeys'
import { safeGetItem, safeSetItem } from '@/lib/utils/localStorage'
import {
  DEFAULT_CANVAS_SIZE,
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  GRID_SIZE,
  INITIAL_SPEED,
  MIN_SPEED,
  SNAKE_CHROME_HEIGHT,
} from './KubeSnake.constants'
import type { Point, Direction } from './KubeSnake.constants'
import { drawSnakeFrame } from './KubeSnake.draw'

export function KubeSnake() {
  useReportCardDataState({ hasData: true, isFailed: false, consecutiveFailures: 0, isDemoData: false })
  const { isExpanded, containerSize } = useCardExpanded()

  // Compute CSS scale factor so the canvas fills the expanded modal
  const canvasScale = (() => {
    if (!isExpanded || containerSize.width === 0 || containerSize.height === 0) return 1
    const availW = containerSize.width
    const availH = containerSize.height - SNAKE_CHROME_HEIGHT
    return Math.min(availW / DEFAULT_CANVAS_SIZE, availH / DEFAULT_CANVAS_SIZE)
  })()
  const gameContainerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [gameState, setGameState] = useState<'idle' | 'playing' | 'paused' | 'gameover'>('idle')
  const [score, setScore] = useState(0)
  const [highScore, setHighScore] = useState(() => {
    try {
      const saved = safeGetItem('kubeSnakeHighScore')
      return saved ? parseInt(saved, 10) : 0
    } catch {
      return 0
    }
  })
  const [speed, setSpeed] = useState(INITIAL_SPEED)

  const snakeRef = useRef<Point[]>([{ x: 10, y: 10 }])
  const directionRef = useRef<Direction>('right')
  const nextDirectionRef = useRef<Direction>('right')
  const foodRef = useRef<Point>({ x: 15, y: 10 })
  const gameLoopRef = useRef<number>(0)
  const lastMoveRef = useRef<number>(0)

  // Generate random food position
  const generateFood = () => {
    const snake = snakeRef.current
    let newFood: Point
    do {
      newFood = {
        x: Math.floor(Math.random() * GRID_SIZE),
        y: Math.floor(Math.random() * GRID_SIZE) }
    } while (snake.some(segment => segment.x === newFood.x && segment.y === newFood.y))
    foodRef.current = newFood
  }

  // Initialize game
  const initGame = useCallback(() => {
    snakeRef.current = [
      { x: 10, y: 10 },
      { x: 9, y: 10 },
      { x: 8, y: 10 },
    ]
    directionRef.current = 'right'
    nextDirectionRef.current = 'right'
    setScore(0)
    setSpeed(INITIAL_SPEED)
    generateFood()
  }, [generateFood])

  // Move snake
  const moveSnake = useCallback(() => {
    const snake = snakeRef.current
    const direction = nextDirectionRef.current
    directionRef.current = direction
    const head = { ...snake[0] }

    // Move head in direction
    switch (direction) {
      case 'up':
        head.y -= 1
        break
      case 'down':
        head.y += 1
        break
      case 'left':
        head.x -= 1
        break
      case 'right':
        head.x += 1
        break
    }

    // Check wall collision
    if (head.x < 0 || head.x >= GRID_SIZE || head.y < 0 || head.y >= GRID_SIZE) {
      setGameState('gameover')
      emitGameEnded('snake', 'loss', score)
      if (score > highScore) {
        setHighScore(score)
        safeSetItem('kubeSnakeHighScore', score.toString())
      }
      return
    }

    // Check self collision
    if (snake.some(segment => segment.x === head.x && segment.y === head.y)) {
      setGameState('gameover')
      emitGameEnded('snake', 'loss', score)
      if (score > highScore) {
        setHighScore(score)
        safeSetItem('kubeSnakeHighScore', score.toString())
      }
      return
    }

    // Add new head
    const newSnake = [head, ...snake]

    // Check food collision
    if (head.x === foodRef.current.x && head.y === foodRef.current.y) {
      const newScore = score + 10
      setScore(newScore)
      // Speed up
      setSpeed(s => Math.max(MIN_SPEED, s - 3))
      generateFood()
    } else {
      // Remove tail if no food eaten
      newSnake.pop()
    }

    snakeRef.current = newSnake
  }, [score, highScore, generateFood])

  // Render
  const render = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    drawSnakeFrame(ctx, foodRef.current, snakeRef.current, directionRef.current)
  }, [])

  // Game loop
  useEffect(() => {
    if (gameState !== 'playing') return

    const gameLoop = (timestamp: number) => {
      if (timestamp - lastMoveRef.current >= speed) {
        moveSnake()
        lastMoveRef.current = timestamp
      }
      render()
      gameLoopRef.current = requestAnimationFrame(gameLoop)
    }

    lastMoveRef.current = performance.now()
    gameLoopRef.current = requestAnimationFrame(gameLoop)
    return () => cancelAnimationFrame(gameLoopRef.current)
  }, [gameState, speed, moveSnake, render])

  // Keyboard handlers — scoped to visible game container (KeepAlive-safe)
  const handleSnakeKeyDown = (e: KeyboardEvent) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 'a', 's', 'd'].includes(e.key.toLowerCase())) {
      e.preventDefault()
    }

    const key = e.key.toLowerCase()
    const current = directionRef.current

    // Prevent 180-degree turns
    if ((key === 'arrowup' || key === 'w') && current !== 'down') {
      nextDirectionRef.current = 'up'
    } else if ((key === 'arrowdown' || key === 's') && current !== 'up') {
      nextDirectionRef.current = 'down'
    } else if ((key === 'arrowleft' || key === 'a') && current !== 'right') {
      nextDirectionRef.current = 'left'
    } else if ((key === 'arrowright' || key === 'd') && current !== 'left') {
      nextDirectionRef.current = 'right'
    }
  }
  useGameKeys(gameContainerRef, { onKeyDown: handleSnakeKeyDown })

  // Render initial frame
  useEffect(() => {
    if (gameState === 'idle') {
      initGame()
      render()
    }
  }, [gameState, initGame, render])

  const startGame = () => {
    initGame()
    setGameState('playing')
    emitGameStarted('snake')
  }

  const togglePause = () => {
    setGameState(s => s === 'playing' ? 'paused' : 'playing')
  }

  return (
    <div ref={gameContainerRef} className="h-full flex flex-col">
      <div className={`flex flex-col items-center gap-3 ${isExpanded ? 'flex-1 min-h-0' : ''}`}>
        {/* Stats bar */}
        <div className="flex flex-wrap items-center justify-between gap-y-2 w-full text-sm" style={{ maxWidth: isExpanded ? CANVAS_WIDTH * canvasScale : DEFAULT_CANVAS_SIZE }}>
          <div className="flex items-center gap-2">
            <Apple className="w-4 h-4 text-red-400" />
            <span className="font-bold text-lg">{score}</span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Zap className="w-4 h-4 text-yellow-400" />
            <span>Speed: {Math.round((INITIAL_SPEED - speed) / 3) + 1}</span>
          </div>
          <div className="flex items-center gap-2">
            <Trophy className="w-4 h-4 text-yellow-500" />
            <span>{highScore}</span>
          </div>
        </div>

        {/* Game canvas */}
        <div
          className={`relative ${isExpanded ? 'flex-1 min-h-0' : ''}`}
          style={isExpanded && canvasScale > 1
            ? { width: CANVAS_WIDTH * canvasScale, height: CANVAS_HEIGHT * canvasScale }
            : undefined}
        >
          <canvas
            ref={canvasRef}
            width={CANVAS_WIDTH}
            height={CANVAS_HEIGHT}
            className="border border-border rounded"
            style={isExpanded && canvasScale > 1
              ? { transform: `scale(${canvasScale})`, transformOrigin: 'top left' }
              : undefined}
            tabIndex={0}
          />

          {/* Overlays */}
          {gameState === 'idle' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 rounded">
              <h3 className="text-2xl font-bold text-green-400 mb-2">Kube Snake</h3>
              <p className="text-sm text-muted-foreground mb-4">Arrow keys or WASD to move</p>
              <button
                onClick={startGame}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 rounded text-white"
              >
                <Play className="w-4 h-4" />
                Start Game
              </button>
            </div>
          )}

          {gameState === 'paused' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 rounded">
              <h3 className="text-xl font-bold text-white mb-4">Paused</h3>
              <button
                onClick={togglePause}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 rounded text-white"
              >
                <Play className="w-4 h-4" />
                Resume
              </button>
            </div>
          )}

          {gameState === 'gameover' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 rounded">
              <h3 className="text-2xl font-bold text-red-400 mb-2">Game Over</h3>
              <p className="text-lg text-white mb-1">Score: {score}</p>
              <p className="text-sm text-muted-foreground mb-1">Length: {snakeRef.current.length}</p>
              {score === highScore && score > 0 && (
                <p className="text-sm text-yellow-400 mb-4">New High Score!</p>
              )}
              <button
                onClick={startGame}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 rounded text-white"
              >
                <RotateCcw className="w-4 h-4" />
                Play Again
              </button>
            </div>
          )}
        </div>

        {/* Controls */}
        {gameState === 'playing' && (
          <div className="flex gap-2">
            <button
              onClick={togglePause}
              className="flex items-center gap-1 px-3 py-1 bg-secondary hover:bg-secondary/80 rounded text-sm"
            >
              <Pause className="w-4 h-4" />
              Pause
            </button>
          </div>
        )}

        <p className="text-xs text-muted-foreground">Eat pods to grow longer!</p>
      </div>
    </div>
  )
}
