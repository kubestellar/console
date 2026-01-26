import { useState, useEffect, useRef, useCallback } from 'react'

import { Play, RotateCcw, Pause, Trophy, Apple, Zap } from 'lucide-react'

// Game constants
const CANVAS_WIDTH = 400
const CANVAS_HEIGHT = 400
const GRID_SIZE = 20
const CELL_SIZE = CANVAS_WIDTH / GRID_SIZE
const INITIAL_SPEED = 150 // ms per move
const MIN_SPEED = 60

// Colors (Kubernetes theme)
const COLORS = {
  background: '#0a1628',
  grid: '#1e3a5f',
  snake: '#326ce5',
  snakeHead: '#00d4aa',
  food: '#ff6b6b',
  foodGlow: 'rgba(255, 107, 107, 0.3)',
  powerUp: '#ffd700',
}

interface Point {
  x: number
  y: number
}

type Direction = 'up' | 'down' | 'left' | 'right'

export function KubeSnake() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [gameState, setGameState] = useState<'idle' | 'playing' | 'paused' | 'gameover'>('idle')
  const [score, setScore] = useState(0)
  const [highScore, setHighScore] = useState(() => {
    const saved = localStorage.getItem('kubeSnakeHighScore')
    return saved ? parseInt(saved, 10) : 0
  })
  const [speed, setSpeed] = useState(INITIAL_SPEED)

  const snakeRef = useRef<Point[]>([{ x: 10, y: 10 }])
  const directionRef = useRef<Direction>('right')
  const nextDirectionRef = useRef<Direction>('right')
  const foodRef = useRef<Point>({ x: 15, y: 10 })
  const gameLoopRef = useRef<number>(0)
  const lastMoveRef = useRef<number>(0)

  // Generate random food position
  const generateFood = useCallback(() => {
    const snake = snakeRef.current
    let newFood: Point
    do {
      newFood = {
        x: Math.floor(Math.random() * GRID_SIZE),
        y: Math.floor(Math.random() * GRID_SIZE),
      }
    } while (snake.some(segment => segment.x === newFood.x && segment.y === newFood.y))
    foodRef.current = newFood
  }, [])

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
      if (score > highScore) {
        setHighScore(score)
        localStorage.setItem('kubeSnakeHighScore', score.toString())
      }
      return
    }

    // Check self collision
    if (snake.some(segment => segment.x === head.x && segment.y === head.y)) {
      setGameState('gameover')
      if (score > highScore) {
        setHighScore(score)
        localStorage.setItem('kubeSnakeHighScore', score.toString())
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

    // Clear
    ctx.fillStyle = COLORS.background
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)

    // Draw grid
    ctx.strokeStyle = COLORS.grid
    ctx.lineWidth = 0.5
    for (let i = 0; i <= GRID_SIZE; i++) {
      ctx.beginPath()
      ctx.moveTo(i * CELL_SIZE, 0)
      ctx.lineTo(i * CELL_SIZE, CANVAS_HEIGHT)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(0, i * CELL_SIZE)
      ctx.lineTo(CANVAS_WIDTH, i * CELL_SIZE)
      ctx.stroke()
    }

    // Draw food with glow effect
    const food = foodRef.current
    ctx.fillStyle = COLORS.foodGlow
    ctx.beginPath()
    ctx.arc(
      food.x * CELL_SIZE + CELL_SIZE / 2,
      food.y * CELL_SIZE + CELL_SIZE / 2,
      CELL_SIZE * 0.8,
      0,
      Math.PI * 2
    )
    ctx.fill()
    ctx.fillStyle = COLORS.food
    ctx.beginPath()
    ctx.arc(
      food.x * CELL_SIZE + CELL_SIZE / 2,
      food.y * CELL_SIZE + CELL_SIZE / 2,
      CELL_SIZE / 2 - 2,
      0,
      Math.PI * 2
    )
    ctx.fill()

    // Draw snake
    const snake = snakeRef.current
    snake.forEach((segment, index) => {
      const isHead = index === 0
      ctx.fillStyle = isHead ? COLORS.snakeHead : COLORS.snake

      // Rounded rectangle for each segment
      const x = segment.x * CELL_SIZE + 1
      const y = segment.y * CELL_SIZE + 1
      const size = CELL_SIZE - 2
      const radius = isHead ? size / 3 : size / 4

      ctx.beginPath()
      ctx.roundRect(x, y, size, size, radius)
      ctx.fill()

      // Draw eyes on head
      if (isHead) {
        ctx.fillStyle = '#fff'
        const eyeSize = 3
        let eyeX1, eyeX2, eyeY1, eyeY2

        switch (directionRef.current) {
          case 'up':
            eyeX1 = x + size / 3 - eyeSize / 2
            eyeX2 = x + (size * 2) / 3 - eyeSize / 2
            eyeY1 = eyeY2 = y + size / 3
            break
          case 'down':
            eyeX1 = x + size / 3 - eyeSize / 2
            eyeX2 = x + (size * 2) / 3 - eyeSize / 2
            eyeY1 = eyeY2 = y + (size * 2) / 3
            break
          case 'left':
            eyeX1 = eyeX2 = x + size / 3
            eyeY1 = y + size / 3 - eyeSize / 2
            eyeY2 = y + (size * 2) / 3 - eyeSize / 2
            break
          case 'right':
          default:
            eyeX1 = eyeX2 = x + (size * 2) / 3
            eyeY1 = y + size / 3 - eyeSize / 2
            eyeY2 = y + (size * 2) / 3 - eyeSize / 2
            break
        }

        ctx.beginPath()
        ctx.arc(eyeX1, eyeY1, eyeSize, 0, Math.PI * 2)
        ctx.arc(eyeX2, eyeY2, eyeSize, 0, Math.PI * 2)
        ctx.fill()
      }
    })
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

  // Keyboard handlers
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
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

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

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
  }

  const togglePause = () => {
    setGameState(s => s === 'playing' ? 'paused' : 'playing')
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex flex-col items-center gap-3">
        {/* Stats bar */}
        <div className="flex items-center justify-between w-full max-w-[400px] text-sm">
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
        <div className="relative">
          <canvas
            ref={canvasRef}
            width={CANVAS_WIDTH}
            height={CANVAS_HEIGHT}
            className="border border-border rounded"
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
