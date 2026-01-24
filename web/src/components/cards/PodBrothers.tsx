import { useState, useEffect, useRef, useCallback } from 'react'
import { CardWrapper } from './CardWrapper'
import { Play, RotateCcw, Pause, Trophy, Heart, Star } from 'lucide-react'

// Game constants
const CANVAS_WIDTH = 480
const CANVAS_HEIGHT = 320
const TILE_SIZE = 32
const GRAVITY = 0.5
const JUMP_FORCE = -12
const MOVE_SPEED = 4
const PLAYER_SIZE = 28

// Tile types
const EMPTY = 0
const BRICK = 1
const QUESTION = 2
const GROUND = 3
const PIPE = 4
const COIN = 5
const GOOMBA = 6
const FLAG = 7

// Colors
const COLORS = {
  sky: '#5c94fc',
  brick: '#b85820',
  question: '#ffa000',
  ground: '#8b4513',
  pipe: '#00a000',
  coin: '#ffd700',
  player: '#ff6b35',
  goomba: '#8b4513',
  flag: '#00ff00',
}

// Level data (15 columns x 10 rows)
const LEVEL_DATA = [
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 7],
  [0, 0, 0, 0, 2, 1, 2, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 5, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0],
  [0, 6, 0, 0, 0, 6, 0, 0, 0, 0, 0, 0, 0, 4, 4],
  [3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3],
  [3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3],
]

interface Player {
  x: number
  y: number
  vx: number
  vy: number
  onGround: boolean
  facingRight: boolean
}

interface Enemy {
  x: number
  y: number
  vx: number
  type: number
  alive: boolean
}

interface Coin {
  x: number
  y: number
  collected: boolean
}

export function PodBrothers() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [gameState, setGameState] = useState<'idle' | 'playing' | 'paused' | 'won' | 'lost'>('idle')
  const [score, setScore] = useState(0)
  const [lives, setLives] = useState(3)
  const [highScore, setHighScore] = useState(() => {
    const saved = localStorage.getItem('podBrothersHighScore')
    return saved ? parseInt(saved, 10) : 0
  })

  const playerRef = useRef<Player>({
    x: TILE_SIZE,
    y: CANVAS_HEIGHT - TILE_SIZE * 3,
    vx: 0,
    vy: 0,
    onGround: false,
    facingRight: true,
  })

  const enemiesRef = useRef<Enemy[]>([])
  const coinsRef = useRef<Coin[]>([])
  const keysRef = useRef<Set<string>>(new Set())
  const animationRef = useRef<number>(0)
  const levelRef = useRef<number[][]>([])

  // Initialize level
  const initLevel = useCallback(() => {
    levelRef.current = LEVEL_DATA.map(row => [...row])
    enemiesRef.current = []
    coinsRef.current = []

    // Find enemies and coins in level
    for (let row = 0; row < levelRef.current.length; row++) {
      for (let col = 0; col < levelRef.current[row].length; col++) {
        if (levelRef.current[row][col] === GOOMBA) {
          enemiesRef.current.push({
            x: col * TILE_SIZE,
            y: row * TILE_SIZE,
            vx: -1,
            type: GOOMBA,
            alive: true,
          })
          levelRef.current[row][col] = EMPTY
        } else if (levelRef.current[row][col] === COIN) {
          coinsRef.current.push({
            x: col * TILE_SIZE + TILE_SIZE / 2,
            y: row * TILE_SIZE + TILE_SIZE / 2,
            collected: false,
          })
          levelRef.current[row][col] = EMPTY
        }
      }
    }

    playerRef.current = {
      x: TILE_SIZE,
      y: CANVAS_HEIGHT - TILE_SIZE * 3,
      vx: 0,
      vy: 0,
      onGround: false,
      facingRight: true,
    }
  }, [])

  // Collision detection
  const getTileAt = useCallback((x: number, y: number): number => {
    const col = Math.floor(x / TILE_SIZE)
    const row = Math.floor(y / TILE_SIZE)
    if (row < 0 || row >= levelRef.current.length || col < 0 || col >= levelRef.current[0].length) {
      return EMPTY
    }
    return levelRef.current[row][col]
  }, [])

  const isSolid = useCallback((tile: number): boolean => {
    return tile === BRICK || tile === GROUND || tile === PIPE || tile === QUESTION
  }, [])

  // Game loop
  const update = useCallback(() => {
    const player = playerRef.current
    const keys = keysRef.current

    // Handle input
    if (keys.has('ArrowLeft') || keys.has('a')) {
      player.vx = -MOVE_SPEED
      player.facingRight = false
    } else if (keys.has('ArrowRight') || keys.has('d')) {
      player.vx = MOVE_SPEED
      player.facingRight = true
    } else {
      player.vx = 0
    }

    if ((keys.has('ArrowUp') || keys.has('w') || keys.has(' ')) && player.onGround) {
      player.vy = JUMP_FORCE
      player.onGround = false
    }

    // Apply gravity
    player.vy += GRAVITY

    // Move player horizontally
    player.x += player.vx
    if (player.x < 0) player.x = 0
    if (player.x > CANVAS_WIDTH - PLAYER_SIZE) player.x = CANVAS_WIDTH - PLAYER_SIZE

    // Check horizontal collisions
    const playerLeft = player.x
    const playerRight = player.x + PLAYER_SIZE
    const playerTop = player.y
    const playerBottom = player.y + PLAYER_SIZE

    // Check collision with tiles
    for (let testY = playerTop; testY <= playerBottom; testY += TILE_SIZE / 2) {
      if (isSolid(getTileAt(playerLeft, testY))) {
        player.x = Math.ceil(playerLeft / TILE_SIZE) * TILE_SIZE
        player.vx = 0
      }
      if (isSolid(getTileAt(playerRight, testY))) {
        player.x = Math.floor(playerRight / TILE_SIZE) * TILE_SIZE - PLAYER_SIZE
        player.vx = 0
      }
    }

    // Move player vertically
    player.y += player.vy
    player.onGround = false

    // Check vertical collisions
    const newPlayerLeft = player.x
    const newPlayerRight = player.x + PLAYER_SIZE
    const newPlayerTop = player.y
    const newPlayerBottom = player.y + PLAYER_SIZE

    for (let testX = newPlayerLeft; testX <= newPlayerRight; testX += TILE_SIZE / 2) {
      // Ceiling
      if (player.vy < 0 && isSolid(getTileAt(testX, newPlayerTop))) {
        player.y = Math.ceil(newPlayerTop / TILE_SIZE) * TILE_SIZE
        player.vy = 0

        // Check for question block
        const blockCol = Math.floor(testX / TILE_SIZE)
        const blockRow = Math.floor(newPlayerTop / TILE_SIZE)
        if (levelRef.current[blockRow]?.[blockCol] === QUESTION) {
          levelRef.current[blockRow][blockCol] = BRICK
          setScore(s => s + 100)
        }
      }
      // Floor
      if (player.vy > 0 && isSolid(getTileAt(testX, newPlayerBottom))) {
        player.y = Math.floor(newPlayerBottom / TILE_SIZE) * TILE_SIZE - PLAYER_SIZE
        player.vy = 0
        player.onGround = true
      }
    }

    // Fall off screen
    if (player.y > CANVAS_HEIGHT) {
      setLives(l => {
        if (l <= 1) {
          setGameState('lost')
          return 0
        }
        initLevel()
        return l - 1
      })
      return
    }

    // Update enemies
    enemiesRef.current.forEach(enemy => {
      if (!enemy.alive) return
      
      enemy.x += enemy.vx
      
      // Reverse at edges or walls
      const nextTileX = enemy.vx > 0 ? enemy.x + TILE_SIZE : enemy.x
      const groundBelow = getTileAt(enemy.x + TILE_SIZE / 2, enemy.y + TILE_SIZE + 1)
      const wallAhead = getTileAt(nextTileX, enemy.y + TILE_SIZE / 2)
      
      if (!isSolid(groundBelow) || isSolid(wallAhead)) {
        enemy.vx *= -1
      }

      // Collision with player
      const ex = enemy.x
      const ey = enemy.y
      if (
        player.x < ex + TILE_SIZE - 4 &&
        player.x + PLAYER_SIZE > ex + 4 &&
        player.y < ey + TILE_SIZE - 4 &&
        player.y + PLAYER_SIZE > ey + 4
      ) {
        // Check if stomping
        if (player.vy > 0 && player.y + PLAYER_SIZE < ey + TILE_SIZE / 2) {
          enemy.alive = false
          player.vy = JUMP_FORCE / 2
          setScore(s => s + 200)
        } else {
          setLives(l => {
            if (l <= 1) {
              setGameState('lost')
              return 0
            }
            initLevel()
            return l - 1
          })
          return
        }
      }
    })

    // Collect coins
    coinsRef.current.forEach(coin => {
      if (coin.collected) return
      const dx = player.x + PLAYER_SIZE / 2 - coin.x
      const dy = player.y + PLAYER_SIZE / 2 - coin.y
      if (Math.sqrt(dx * dx + dy * dy) < TILE_SIZE) {
        coin.collected = true
        setScore(s => s + 50)
      }
    })

    // Check for flag (win condition)
    const flagCol = levelRef.current[0].length - 1
    const flagRow = levelRef.current.findIndex(row => row[flagCol] === FLAG)
    if (flagRow >= 0) {
      const flagX = flagCol * TILE_SIZE
      const flagY = flagRow * TILE_SIZE
      if (
        player.x + PLAYER_SIZE > flagX &&
        player.x < flagX + TILE_SIZE &&
        player.y + PLAYER_SIZE > flagY &&
        player.y < flagY + TILE_SIZE * 2
      ) {
        setScore(s => {
          const finalScore = s + 1000
          if (finalScore > highScore) {
            setHighScore(finalScore)
            localStorage.setItem('podBrothersHighScore', finalScore.toString())
          }
          return finalScore
        })
        setGameState('won')
        return
      }
    }
  }, [getTileAt, isSolid, initLevel, highScore])

  // Render
  const render = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Clear and draw sky
    ctx.fillStyle = COLORS.sky
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)

    // Draw tiles
    for (let row = 0; row < levelRef.current.length; row++) {
      for (let col = 0; col < levelRef.current[row].length; col++) {
        const tile = levelRef.current[row][col]
        const x = col * TILE_SIZE
        const y = row * TILE_SIZE

        if (tile === BRICK) {
          ctx.fillStyle = COLORS.brick
          ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE)
          ctx.strokeStyle = '#000'
          ctx.strokeRect(x, y, TILE_SIZE, TILE_SIZE)
          // Brick pattern
          ctx.beginPath()
          ctx.moveTo(x + TILE_SIZE / 2, y)
          ctx.lineTo(x + TILE_SIZE / 2, y + TILE_SIZE)
          ctx.moveTo(x, y + TILE_SIZE / 2)
          ctx.lineTo(x + TILE_SIZE, y + TILE_SIZE / 2)
          ctx.stroke()
        } else if (tile === QUESTION) {
          ctx.fillStyle = COLORS.question
          ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE)
          ctx.strokeStyle = '#000'
          ctx.strokeRect(x, y, TILE_SIZE, TILE_SIZE)
          ctx.fillStyle = '#fff'
          ctx.font = 'bold 20px sans-serif'
          ctx.textAlign = 'center'
          ctx.fillText('?', x + TILE_SIZE / 2, y + TILE_SIZE - 8)
        } else if (tile === GROUND) {
          ctx.fillStyle = COLORS.ground
          ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE)
        } else if (tile === PIPE) {
          ctx.fillStyle = COLORS.pipe
          ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE)
          ctx.fillStyle = '#00c000'
          ctx.fillRect(x + 2, y, TILE_SIZE - 4, TILE_SIZE)
        } else if (tile === FLAG) {
          // Flag pole
          ctx.fillStyle = '#888'
          ctx.fillRect(x + TILE_SIZE / 2 - 2, y, 4, TILE_SIZE * 2)
          // Flag
          ctx.fillStyle = COLORS.flag
          ctx.beginPath()
          ctx.moveTo(x + TILE_SIZE / 2 + 2, y + 4)
          ctx.lineTo(x + TILE_SIZE, y + TILE_SIZE / 2)
          ctx.lineTo(x + TILE_SIZE / 2 + 2, y + TILE_SIZE - 4)
          ctx.fill()
        }
      }
    }

    // Draw coins
    coinsRef.current.forEach(coin => {
      if (coin.collected) return
      ctx.fillStyle = COLORS.coin
      ctx.beginPath()
      ctx.arc(coin.x, coin.y, 10, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = '#c90'
      ctx.lineWidth = 2
      ctx.stroke()
      ctx.lineWidth = 1
    })

    // Draw enemies
    enemiesRef.current.forEach(enemy => {
      if (!enemy.alive) return
      ctx.fillStyle = COLORS.goomba
      ctx.fillRect(enemy.x + 4, enemy.y + 4, TILE_SIZE - 8, TILE_SIZE - 4)
      // Eyes
      ctx.fillStyle = '#fff'
      ctx.fillRect(enemy.x + 8, enemy.y + 10, 6, 6)
      ctx.fillRect(enemy.x + TILE_SIZE - 14, enemy.y + 10, 6, 6)
      ctx.fillStyle = '#000'
      ctx.fillRect(enemy.x + 10, enemy.y + 12, 3, 3)
      ctx.fillRect(enemy.x + TILE_SIZE - 12, enemy.y + 12, 3, 3)
    })

    // Draw player (Pod)
    const player = playerRef.current
    ctx.fillStyle = COLORS.player
    ctx.fillRect(player.x, player.y, PLAYER_SIZE, PLAYER_SIZE)
    // Pod logo (circle)
    ctx.fillStyle = '#fff'
    ctx.beginPath()
    ctx.arc(player.x + PLAYER_SIZE / 2, player.y + PLAYER_SIZE / 2, 8, 0, Math.PI * 2)
    ctx.fill()
    // Eyes
    const eyeOffset = player.facingRight ? 4 : -4
    ctx.fillStyle = '#000'
    ctx.fillRect(player.x + PLAYER_SIZE / 2 + eyeOffset - 2, player.y + 6, 4, 4)
  }, [])

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
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) {
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
      initLevel()
      render()
    }
  }, [gameState, initLevel, render])

  const startGame = () => {
    initLevel()
    setScore(0)
    setLives(3)
    setGameState('playing')
  }

  const togglePause = () => {
    setGameState(s => s === 'playing' ? 'paused' : 'playing')
  }

  return (
    <CardWrapper cardType="pod_brothers" title="Pod Brothers">
      <div className="flex flex-col items-center gap-3">
        {/* Stats bar */}
        <div className="flex items-center justify-between w-full max-w-[480px] text-sm">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1">
              <Star className="w-4 h-4 text-yellow-400" />
              <span>{score}</span>
            </div>
            <div className="flex items-center gap-1">
              <Heart className="w-4 h-4 text-red-400" />
              <span>{lives}</span>
            </div>
          </div>
          <div className="flex items-center gap-1">
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
            className="border border-border rounded bg-[#5c94fc]"
            tabIndex={0}
          />

          {/* Overlays */}
          {gameState === 'idle' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 rounded">
              <h3 className="text-2xl font-bold text-orange-400 mb-2">Pod Brothers</h3>
              <p className="text-sm text-muted-foreground mb-4">Arrow keys or WASD to move, Space to jump</p>
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
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded text-white"
              >
                <Play className="w-4 h-4" />
                Resume
              </button>
            </div>
          )}

          {gameState === 'won' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 rounded">
              <Trophy className="w-12 h-12 text-yellow-400 mb-2" />
              <h3 className="text-2xl font-bold text-green-400 mb-2">Level Complete!</h3>
              <p className="text-lg text-white mb-4">Score: {score}</p>
              <button
                onClick={startGame}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 rounded text-white"
              >
                <RotateCcw className="w-4 h-4" />
                Play Again
              </button>
            </div>
          )}

          {gameState === 'lost' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 rounded">
              <h3 className="text-2xl font-bold text-red-400 mb-2">Game Over</h3>
              <p className="text-lg text-white mb-4">Score: {score}</p>
              <button
                onClick={startGame}
                className="flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-700 rounded text-white"
              >
                <RotateCcw className="w-4 h-4" />
                Try Again
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
      </div>
    </CardWrapper>
  )
}
