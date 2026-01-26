import { useState, useEffect, useRef, useCallback } from 'react'

import { Play, RotateCcw, Pause, Trophy, Cpu, User } from 'lucide-react'

// Game constants
const CANVAS_WIDTH = 400
const CANVAS_HEIGHT = 300
const PADDLE_WIDTH = 10
const PADDLE_HEIGHT = 60
const PADDLE_SPEED = 6
const BALL_SIZE = 10
const INITIAL_BALL_SPEED = 5
const MAX_BALL_SPEED = 12
const WINNING_SCORE = 7

// Colors (Kubernetes theme)
const COLORS = {
  background: '#0a1628',
  paddle: '#326ce5', // K8s blue
  ball: '#00d4aa',   // Teal accent
  net: '#1e3a5f',
  text: '#fff',
  score: '#326ce5',
}

interface Ball {
  x: number
  y: number
  vx: number
  vy: number
  speed: number
}

interface Paddle {
  y: number
  score: number
}

export function KubePong() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [gameState, setGameState] = useState<'idle' | 'playing' | 'paused' | 'finished'>('idle')
  const [playerScore, setPlayerScore] = useState(0)
  const [aiScore, setAiScore] = useState(0)
  const [winner, setWinner] = useState<'player' | 'ai' | null>(null)
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium')
  const [wins, setWins] = useState(() => {
    const saved = localStorage.getItem('kubePongWins')
    return saved ? parseInt(saved, 10) : 0
  })

  const ballRef = useRef<Ball>({
    x: CANVAS_WIDTH / 2,
    y: CANVAS_HEIGHT / 2,
    vx: INITIAL_BALL_SPEED,
    vy: 0,
    speed: INITIAL_BALL_SPEED,
  })

  const playerPaddleRef = useRef<Paddle>({
    y: CANVAS_HEIGHT / 2 - PADDLE_HEIGHT / 2,
    score: 0,
  })

  const aiPaddleRef = useRef<Paddle>({
    y: CANVAS_HEIGHT / 2 - PADDLE_HEIGHT / 2,
    score: 0,
  })

  const keysRef = useRef<Set<string>>(new Set())
  const animationRef = useRef<number>(0)

  // AI difficulty settings
  const aiSettings = {
    easy: { speed: 3, reactionDelay: 0.4, errorMargin: 30 },
    medium: { speed: 4.5, reactionDelay: 0.2, errorMargin: 15 },
    hard: { speed: 5.5, reactionDelay: 0.1, errorMargin: 5 },
  }

  // Reset ball to center
  const resetBall = useCallback((direction: number = 1) => {
    ballRef.current = {
      x: CANVAS_WIDTH / 2,
      y: CANVAS_HEIGHT / 2,
      vx: INITIAL_BALL_SPEED * direction,
      vy: (Math.random() - 0.5) * 4,
      speed: INITIAL_BALL_SPEED,
    }
  }, [])

  // Initialize game
  const initGame = useCallback(() => {
    playerPaddleRef.current = {
      y: CANVAS_HEIGHT / 2 - PADDLE_HEIGHT / 2,
      score: 0,
    }
    aiPaddleRef.current = {
      y: CANVAS_HEIGHT / 2 - PADDLE_HEIGHT / 2,
      score: 0,
    }
    resetBall(Math.random() > 0.5 ? 1 : -1)
    setPlayerScore(0)
    setAiScore(0)
    setWinner(null)
  }, [resetBall])

  // Update game state
  const update = useCallback(() => {
    const ball = ballRef.current
    const playerPaddle = playerPaddleRef.current
    const aiPaddle = aiPaddleRef.current
    const keys = keysRef.current
    const ai = aiSettings[difficulty]

    // Player paddle movement
    if (keys.has('arrowup') || keys.has('w')) {
      playerPaddle.y = Math.max(0, playerPaddle.y - PADDLE_SPEED)
    }
    if (keys.has('arrowdown') || keys.has('s')) {
      playerPaddle.y = Math.min(CANVAS_HEIGHT - PADDLE_HEIGHT, playerPaddle.y + PADDLE_SPEED)
    }

    // AI paddle movement
    const aiTargetY = ball.y - PADDLE_HEIGHT / 2 + (Math.random() - 0.5) * ai.errorMargin
    const aiDiff = aiTargetY - aiPaddle.y

    // AI only reacts when ball is coming towards it
    if (ball.vx > 0) {
      if (Math.abs(aiDiff) > ai.reactionDelay * PADDLE_HEIGHT) {
        aiPaddle.y += Math.sign(aiDiff) * Math.min(ai.speed, Math.abs(aiDiff))
      }
    }
    aiPaddle.y = Math.max(0, Math.min(CANVAS_HEIGHT - PADDLE_HEIGHT, aiPaddle.y))

    // Ball movement
    ball.x += ball.vx
    ball.y += ball.vy

    // Wall collisions (top/bottom)
    if (ball.y <= 0 || ball.y >= CANVAS_HEIGHT - BALL_SIZE) {
      ball.vy *= -1
      ball.y = ball.y <= 0 ? 0 : CANVAS_HEIGHT - BALL_SIZE
    }

    // Paddle collisions
    // Player paddle (left)
    if (
      ball.x <= PADDLE_WIDTH + 20 &&
      ball.x >= 20 &&
      ball.y + BALL_SIZE >= playerPaddle.y &&
      ball.y <= playerPaddle.y + PADDLE_HEIGHT &&
      ball.vx < 0
    ) {
      // Calculate angle based on where ball hit paddle
      const hitPos = (ball.y + BALL_SIZE / 2 - playerPaddle.y) / PADDLE_HEIGHT
      const angle = (hitPos - 0.5) * Math.PI * 0.6
      ball.speed = Math.min(ball.speed + 0.3, MAX_BALL_SPEED)
      ball.vx = Math.cos(angle) * ball.speed
      ball.vy = Math.sin(angle) * ball.speed
      ball.x = PADDLE_WIDTH + 21
    }

    // AI paddle (right)
    if (
      ball.x >= CANVAS_WIDTH - PADDLE_WIDTH - 20 - BALL_SIZE &&
      ball.x <= CANVAS_WIDTH - 20 &&
      ball.y + BALL_SIZE >= aiPaddle.y &&
      ball.y <= aiPaddle.y + PADDLE_HEIGHT &&
      ball.vx > 0
    ) {
      const hitPos = (ball.y + BALL_SIZE / 2 - aiPaddle.y) / PADDLE_HEIGHT
      const angle = Math.PI - (hitPos - 0.5) * Math.PI * 0.6
      ball.speed = Math.min(ball.speed + 0.3, MAX_BALL_SPEED)
      ball.vx = Math.cos(angle) * ball.speed
      ball.vy = Math.sin(angle) * ball.speed
      ball.x = CANVAS_WIDTH - PADDLE_WIDTH - 20 - BALL_SIZE - 1
    }

    // Score
    if (ball.x < 0) {
      // AI scores
      const newAiScore = aiScore + 1
      setAiScore(newAiScore)
      if (newAiScore >= WINNING_SCORE) {
        setWinner('ai')
        setGameState('finished')
        return
      }
      resetBall(-1)
    } else if (ball.x > CANVAS_WIDTH) {
      // Player scores
      const newPlayerScore = playerScore + 1
      setPlayerScore(newPlayerScore)
      if (newPlayerScore >= WINNING_SCORE) {
        setWinner('player')
        const newWins = wins + 1
        setWins(newWins)
        localStorage.setItem('kubePongWins', newWins.toString())
        setGameState('finished')
        return
      }
      resetBall(1)
    }
  }, [difficulty, aiScore, playerScore, resetBall, wins])

  // Render
  const render = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Clear
    ctx.fillStyle = COLORS.background
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)

    // Draw net
    ctx.strokeStyle = COLORS.net
    ctx.lineWidth = 2
    ctx.setLineDash([10, 10])
    ctx.beginPath()
    ctx.moveTo(CANVAS_WIDTH / 2, 0)
    ctx.lineTo(CANVAS_WIDTH / 2, CANVAS_HEIGHT)
    ctx.stroke()
    ctx.setLineDash([])

    // Draw paddles
    ctx.fillStyle = COLORS.paddle
    // Player paddle (left)
    ctx.fillRect(20, playerPaddleRef.current.y, PADDLE_WIDTH, PADDLE_HEIGHT)
    // AI paddle (right)
    ctx.fillRect(CANVAS_WIDTH - 20 - PADDLE_WIDTH, aiPaddleRef.current.y, PADDLE_WIDTH, PADDLE_HEIGHT)

    // Draw ball
    ctx.fillStyle = COLORS.ball
    ctx.beginPath()
    ctx.arc(
      ballRef.current.x + BALL_SIZE / 2,
      ballRef.current.y + BALL_SIZE / 2,
      BALL_SIZE / 2,
      0,
      Math.PI * 2
    )
    ctx.fill()

    // Draw scores
    ctx.fillStyle = COLORS.score
    ctx.font = 'bold 48px monospace'
    ctx.textAlign = 'center'
    ctx.globalAlpha = 0.3
    ctx.fillText(playerScore.toString(), CANVAS_WIDTH / 4, 60)
    ctx.fillText(aiScore.toString(), (CANVAS_WIDTH / 4) * 3, 60)
    ctx.globalAlpha = 1

  }, [playerScore, aiScore])

  // Game loop
  useEffect(() => {
    if (gameState !== 'playing') return

    const gameLoop = () => {
      update()
      render()
      animationRef.current = requestAnimationFrame(gameLoop)
    }

    animationRef.current = requestAnimationFrame(gameLoop)
    return () => cancelAnimationFrame(animationRef.current)
  }, [gameState, update, render])

  // Keyboard handlers
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['ArrowUp', 'ArrowDown', ' '].includes(e.key)) {
        e.preventDefault()
      }
      keysRef.current.add(e.key.toLowerCase())
    }

    const handleKeyUp = (e: KeyboardEvent) => {
      keysRef.current.delete(e.key.toLowerCase())
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
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
            <User className="w-4 h-4 text-blue-400" />
            <span className="font-bold text-lg">{playerScore}</span>
          </div>
          <div className="flex items-center gap-2">
            <Trophy className="w-4 h-4 text-yellow-500" />
            <span>{wins} wins</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-bold text-lg">{aiScore}</span>
            <Cpu className="w-4 h-4 text-red-400" />
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
              <h3 className="text-2xl font-bold text-blue-400 mb-2">Kube Pong</h3>
              <p className="text-sm text-muted-foreground mb-4">Arrow keys or W/S to move paddle</p>

              {/* Difficulty selector */}
              <div className="flex gap-2 mb-4">
                {(['easy', 'medium', 'hard'] as const).map(d => (
                  <button
                    key={d}
                    onClick={() => setDifficulty(d)}
                    className={`px-3 py-1 text-sm rounded capitalize ${
                      difficulty === d
                        ? 'bg-blue-600 text-white'
                        : 'bg-secondary text-muted-foreground hover:bg-secondary/80'
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>

              <button
                onClick={startGame}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded text-white"
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
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded text-white"
              >
                <Play className="w-4 h-4" />
                Resume
              </button>
            </div>
          )}

          {gameState === 'finished' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 rounded">
              {winner === 'player' ? (
                <>
                  <Trophy className="w-12 h-12 text-yellow-400 mb-2" />
                  <h3 className="text-2xl font-bold text-green-400 mb-2">You Win!</h3>
                </>
              ) : (
                <>
                  <Cpu className="w-12 h-12 text-red-400 mb-2" />
                  <h3 className="text-2xl font-bold text-red-400 mb-2">AI Wins</h3>
                </>
              )}
              <p className="text-lg text-white mb-4">{playerScore} - {aiScore}</p>
              <button
                onClick={startGame}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded text-white"
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

        <p className="text-xs text-muted-foreground">First to {WINNING_SCORE} wins!</p>
      </div>
    </div>
  )
}
