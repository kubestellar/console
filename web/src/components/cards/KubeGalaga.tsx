import { useState, useEffect, useRef, useCallback } from 'react'

import { Play, RotateCcw, Pause, Trophy, Target, Heart, Zap } from 'lucide-react'

import { useCardExpanded } from './CardWrapper'
import { useReportCardDataState } from './CardDataContext'
import { useTranslation } from 'react-i18next'

// Game constants
const CANVAS_WIDTH = 400
const CANVAS_HEIGHT = 500
const PLAYER_WIDTH = 32
const PLAYER_HEIGHT = 24
const BULLET_WIDTH = 4
const BULLET_HEIGHT = 12
const ENEMY_WIDTH = 28
const ENEMY_HEIGHT = 20
const ENEMY_COLS = 8
const ENEMY_ROWS = 4
const PLAYER_SPEED = 6
const BULLET_SPEED = 10
const ENEMY_BULLET_SPEED = 5

// Colors
const COLORS = {
  background: '#0a0a1a',
  player: '#00d4aa',
  playerGlow: 'rgba(0, 212, 170, 0.3)',
  bullet: '#00ffff',
  enemy1: '#ff6b6b',
  enemy2: '#ffd93d',
  enemy3: '#6bcb77',
  enemyBullet: '#ff4444',
  star: '#ffffff',
}

interface Bullet {
  x: number
  y: number
  isEnemy: boolean
}

interface Enemy {
  x: number
  y: number
  row: number
  alive: boolean
  diving: boolean
  diveX: number
  diveY: number
  diveAngle: number
}

interface Star {
  x: number
  y: number
  speed: number
  size: number
}

export function KubeGalaga() {
  const { t: _t } = useTranslation()
  useReportCardDataState({ hasData: true, isFailed: false, consecutiveFailures: 0 })
  const { isExpanded } = useCardExpanded()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [gameState, setGameState] = useState<'idle' | 'playing' | 'paused' | 'gameover' | 'levelcomplete'>('idle')
  const [score, setScore] = useState(0)
  const [lives, setLives] = useState(3)
  const [level, setLevel] = useState(1)
  const [highScore, setHighScore] = useState(() => {
    const saved = localStorage.getItem('kubeGalagaHighScore')
    return saved ? parseInt(saved, 10) : 0
  })

  const playerRef = useRef({ x: CANVAS_WIDTH / 2 - PLAYER_WIDTH / 2, y: CANVAS_HEIGHT - 50 })
  const bulletsRef = useRef<Bullet[]>([])
  const enemiesRef = useRef<Enemy[]>([])
  const starsRef = useRef<Star[]>([])
  const keysRef = useRef<Set<string>>(new Set())
  const animationRef = useRef<number>(0)
  const enemyDirRef = useRef(1)
  const enemyMoveTimerRef = useRef(0)
  const shootCooldownRef = useRef(0)
  const invincibleRef = useRef(0)

  // Initialize stars
  const initStars = useCallback(() => {
    starsRef.current = Array.from({ length: 50 }, () => ({
      x: Math.random() * CANVAS_WIDTH,
      y: Math.random() * CANVAS_HEIGHT,
      speed: 0.5 + Math.random() * 1.5,
      size: Math.random() > 0.7 ? 2 : 1,
    }))
  }, [])

  // Initialize enemies
  const initEnemies = useCallback((lvl: number) => {
    const enemies: Enemy[] = []
    const rows = Math.min(ENEMY_ROWS + Math.floor(lvl / 3), 6)
    const cols = Math.min(ENEMY_COLS + Math.floor(lvl / 2), 10)

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        enemies.push({
          x: 50 + col * (ENEMY_WIDTH + 10),
          y: 50 + row * (ENEMY_HEIGHT + 15),
          row,
          alive: true,
          diving: false,
          diveX: 0,
          diveY: 0,
          diveAngle: 0,
        })
      }
    }
    enemiesRef.current = enemies
    enemyDirRef.current = 1
  }, [])

  // Initialize game
  const initGame = useCallback(() => {
    playerRef.current = { x: CANVAS_WIDTH / 2 - PLAYER_WIDTH / 2, y: CANVAS_HEIGHT - 50 }
    bulletsRef.current = []
    setScore(0)
    setLives(3)
    setLevel(1)
    initStars()
    initEnemies(1)
    invincibleRef.current = 0
  }, [initStars, initEnemies])

  // Shoot bullet
  const shoot = useCallback(() => {
    if (shootCooldownRef.current > 0) return
    bulletsRef.current.push({
      x: playerRef.current.x + PLAYER_WIDTH / 2 - BULLET_WIDTH / 2,
      y: playerRef.current.y - BULLET_HEIGHT,
      isEnemy: false,
    })
    shootCooldownRef.current = 15
  }, [])

  // Enemy shoots
  const enemyShoot = useCallback(() => {
    const aliveEnemies = enemiesRef.current.filter(e => e.alive)
    if (aliveEnemies.length === 0) return

    // Random enemy shoots
    if (Math.random() < 0.02 + level * 0.005) {
      const shooter = aliveEnemies[Math.floor(Math.random() * aliveEnemies.length)]
      bulletsRef.current.push({
        x: shooter.x + ENEMY_WIDTH / 2 - 2,
        y: shooter.y + ENEMY_HEIGHT,
        isEnemy: true,
      })
    }
  }, [level])

  // Start enemy dive
  const startDive = useCallback(() => {
    const aliveEnemies = enemiesRef.current.filter(e => e.alive && !e.diving)
    if (aliveEnemies.length === 0) return

    if (Math.random() < 0.01 + level * 0.003) {
      const diver = aliveEnemies[Math.floor(Math.random() * aliveEnemies.length)]
      diver.diving = true
      diver.diveX = diver.x
      diver.diveY = diver.y
      diver.diveAngle = 0
    }
  }, [level])

  // Update game state
  const update = useCallback(() => {
    const keys = keysRef.current
    const player = playerRef.current

    // Cooldowns
    if (shootCooldownRef.current > 0) shootCooldownRef.current--
    if (invincibleRef.current > 0) invincibleRef.current--

    // Player movement
    if (keys.has('arrowleft') || keys.has('a')) {
      player.x = Math.max(10, player.x - PLAYER_SPEED)
    }
    if (keys.has('arrowright') || keys.has('d')) {
      player.x = Math.min(CANVAS_WIDTH - PLAYER_WIDTH - 10, player.x + PLAYER_SPEED)
    }
    if (keys.has(' ')) {
      shoot()
    }

    // Update stars
    starsRef.current.forEach(star => {
      star.y += star.speed
      if (star.y > CANVAS_HEIGHT) {
        star.y = 0
        star.x = Math.random() * CANVAS_WIDTH
      }
    })

    // Update bullets
    bulletsRef.current = bulletsRef.current.filter(bullet => {
      if (bullet.isEnemy) {
        bullet.y += ENEMY_BULLET_SPEED
        return bullet.y < CANVAS_HEIGHT
      } else {
        bullet.y -= BULLET_SPEED
        return bullet.y > -BULLET_HEIGHT
      }
    })

    // Enemy movement
    enemyMoveTimerRef.current++
    const moveSpeed = Math.max(10, 30 - level * 2)

    if (enemyMoveTimerRef.current >= moveSpeed) {
      enemyMoveTimerRef.current = 0

      let hitEdge = false
      enemiesRef.current.forEach(enemy => {
        if (!enemy.alive || enemy.diving) return
        enemy.x += enemyDirRef.current * 10
        if (enemy.x <= 10 || enemy.x >= CANVAS_WIDTH - ENEMY_WIDTH - 10) {
          hitEdge = true
        }
      })

      if (hitEdge) {
        enemyDirRef.current *= -1
        enemiesRef.current.forEach(enemy => {
          if (enemy.alive && !enemy.diving) {
            enemy.y += 15
          }
        })
      }
    }

    // Update diving enemies
    enemiesRef.current.forEach(enemy => {
      if (!enemy.alive || !enemy.diving) return

      enemy.diveAngle += 0.05
      enemy.diveX += Math.sin(enemy.diveAngle) * 3
      enemy.diveY += 4

      enemy.x = enemy.diveX
      enemy.y = enemy.diveY

      // Return to formation or go off screen
      if (enemy.y > CANVAS_HEIGHT + 50) {
        enemy.diving = false
        enemy.x = 50 + (Math.floor(Math.random() * ENEMY_COLS)) * (ENEMY_WIDTH + 10)
        enemy.y = 50 + enemy.row * (ENEMY_HEIGHT + 15)
        enemy.diveX = enemy.x
        enemy.diveY = enemy.y
      }
    })

    // Enemy shooting and diving
    enemyShoot()
    startDive()

    // Check collisions
    // Player bullets vs enemies
    bulletsRef.current = bulletsRef.current.filter(bullet => {
      if (bullet.isEnemy) return true

      for (const enemy of enemiesRef.current) {
        if (!enemy.alive) continue
        if (
          bullet.x < enemy.x + ENEMY_WIDTH &&
          bullet.x + BULLET_WIDTH > enemy.x &&
          bullet.y < enemy.y + ENEMY_HEIGHT &&
          bullet.y + BULLET_HEIGHT > enemy.y
        ) {
          enemy.alive = false
          const points = (4 - enemy.row) * 10 + (enemy.diving ? 50 : 0)
          setScore(s => s + points)
          return false
        }
      }
      return true
    })

    // Enemy bullets vs player
    if (invincibleRef.current <= 0) {
      bulletsRef.current = bulletsRef.current.filter(bullet => {
        if (!bullet.isEnemy) return true

        if (
          bullet.x < player.x + PLAYER_WIDTH &&
          bullet.x + 4 > player.x &&
          bullet.y < player.y + PLAYER_HEIGHT &&
          bullet.y + 8 > player.y
        ) {
          setLives(l => {
            if (l <= 1) {
              if (score > highScore) {
                setHighScore(score)
                localStorage.setItem('kubeGalagaHighScore', score.toString())
              }
              setGameState('gameover')
              return 0
            }
            invincibleRef.current = 120
            return l - 1
          })
          return false
        }
        return true
      })
    }

    // Diving enemy collision with player
    if (invincibleRef.current <= 0) {
      enemiesRef.current.forEach(enemy => {
        if (!enemy.alive) return
        if (
          enemy.x < player.x + PLAYER_WIDTH &&
          enemy.x + ENEMY_WIDTH > player.x &&
          enemy.y < player.y + PLAYER_HEIGHT &&
          enemy.y + ENEMY_HEIGHT > player.y
        ) {
          enemy.alive = false
          setLives(l => {
            if (l <= 1) {
              if (score > highScore) {
                setHighScore(score)
                localStorage.setItem('kubeGalagaHighScore', score.toString())
              }
              setGameState('gameover')
              return 0
            }
            invincibleRef.current = 120
            return l - 1
          })
        }
      })
    }

    // Check level complete
    if (enemiesRef.current.every(e => !e.alive)) {
      setLevel(l => l + 1)
      setGameState('levelcomplete')
    }

    // Check if enemies reached bottom
    const lowestEnemy = Math.max(...enemiesRef.current.filter(e => e.alive && !e.diving).map(e => e.y))
    if (lowestEnemy > CANVAS_HEIGHT - 100) {
      if (score > highScore) {
        setHighScore(score)
        localStorage.setItem('kubeGalagaHighScore', score.toString())
      }
      setGameState('gameover')
    }
  }, [shoot, enemyShoot, startDive, score, highScore])

  // Render
  const render = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Clear
    ctx.fillStyle = COLORS.background
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)

    // Draw stars
    ctx.fillStyle = COLORS.star
    starsRef.current.forEach(star => {
      ctx.globalAlpha = 0.3 + star.size * 0.3
      ctx.fillRect(star.x, star.y, star.size, star.size)
    })
    ctx.globalAlpha = 1

    // Draw player with glow
    const player = playerRef.current
    if (invincibleRef.current <= 0 || Math.floor(invincibleRef.current / 5) % 2 === 0) {
      ctx.fillStyle = COLORS.playerGlow
      ctx.beginPath()
      ctx.arc(player.x + PLAYER_WIDTH / 2, player.y + PLAYER_HEIGHT / 2, PLAYER_WIDTH, 0, Math.PI * 2)
      ctx.fill()

      ctx.fillStyle = COLORS.player
      // Ship body
      ctx.beginPath()
      ctx.moveTo(player.x + PLAYER_WIDTH / 2, player.y)
      ctx.lineTo(player.x, player.y + PLAYER_HEIGHT)
      ctx.lineTo(player.x + PLAYER_WIDTH / 4, player.y + PLAYER_HEIGHT - 5)
      ctx.lineTo(player.x + PLAYER_WIDTH / 2, player.y + PLAYER_HEIGHT)
      ctx.lineTo(player.x + (PLAYER_WIDTH * 3) / 4, player.y + PLAYER_HEIGHT - 5)
      ctx.lineTo(player.x + PLAYER_WIDTH, player.y + PLAYER_HEIGHT)
      ctx.closePath()
      ctx.fill()
    }

    // Draw bullets
    bulletsRef.current.forEach(bullet => {
      ctx.fillStyle = bullet.isEnemy ? COLORS.enemyBullet : COLORS.bullet
      if (bullet.isEnemy) {
        ctx.fillRect(bullet.x, bullet.y, 4, 8)
      } else {
        ctx.fillRect(bullet.x, bullet.y, BULLET_WIDTH, BULLET_HEIGHT)
      }
    })

    // Draw enemies
    enemiesRef.current.forEach(enemy => {
      if (!enemy.alive) return

      const colors = [COLORS.enemy1, COLORS.enemy2, COLORS.enemy3, COLORS.enemy2]
      ctx.fillStyle = colors[enemy.row % 4]

      // Bug-like enemy shape
      ctx.beginPath()
      ctx.arc(enemy.x + ENEMY_WIDTH / 2, enemy.y + ENEMY_HEIGHT / 2, ENEMY_WIDTH / 2, 0, Math.PI * 2)
      ctx.fill()

      // Wings
      ctx.beginPath()
      ctx.ellipse(enemy.x + 2, enemy.y + ENEMY_HEIGHT / 2, 6, 10, -0.3, 0, Math.PI * 2)
      ctx.ellipse(enemy.x + ENEMY_WIDTH - 2, enemy.y + ENEMY_HEIGHT / 2, 6, 10, 0.3, 0, Math.PI * 2)
      ctx.fill()

      // Eyes
      ctx.fillStyle = '#fff'
      ctx.beginPath()
      ctx.arc(enemy.x + ENEMY_WIDTH / 3, enemy.y + ENEMY_HEIGHT / 3, 3, 0, Math.PI * 2)
      ctx.arc(enemy.x + (ENEMY_WIDTH * 2) / 3, enemy.y + ENEMY_HEIGHT / 3, 3, 0, Math.PI * 2)
      ctx.fill()
    })
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
      initGame()
      render()
    }
  }, [gameState, initGame, render])

  const startGame = () => {
    initGame()
    setGameState('playing')
  }

  const nextLevel = () => {
    initEnemies(level)
    bulletsRef.current = []
    playerRef.current.x = CANVAS_WIDTH / 2 - PLAYER_WIDTH / 2
    invincibleRef.current = 60
    setGameState('playing')
  }

  const togglePause = () => {
    setGameState(s => s === 'playing' ? 'paused' : 'playing')
  }

  return (
    <div className="h-full flex flex-col">
      <div className={`flex flex-col items-center gap-3 ${isExpanded ? 'flex-1 min-h-0' : ''}`}>
        {/* Stats bar */}
        <div className="flex items-center justify-between w-full max-w-[400px] text-sm">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1">
              <Target className="w-4 h-4 text-cyan-400" />
              <span className="font-bold">{score}</span>
            </div>
            <div className="flex items-center gap-1">
              <Zap className="w-4 h-4 text-yellow-400" />
              <span>Lv.{level}</span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1">
              {Array.from({ length: lives }).map((_, i) => (
                <Heart key={i} className="w-4 h-4 text-red-400 fill-red-400" />
              ))}
            </div>
            <div className="flex items-center gap-1">
              <Trophy className="w-4 h-4 text-yellow-500" />
              <span>{highScore}</span>
            </div>
          </div>
        </div>

        {/* Game canvas */}
        <div className={`relative ${isExpanded ? 'flex-1 min-h-0' : ''}`}>
          <canvas
            ref={canvasRef}
            width={CANVAS_WIDTH}
            height={CANVAS_HEIGHT}
            className="border border-border rounded"
            tabIndex={0}
            style={isExpanded ? { width: '100%', height: '100%', objectFit: 'contain' } : undefined}
          />

          {/* Overlays */}
          {gameState === 'idle' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 rounded">
              <h3 className="text-2xl font-bold text-cyan-400 mb-2">Kube Galaga</h3>
              <p className="text-sm text-muted-foreground mb-4">Arrow keys to move, Space to shoot</p>
              <button
                onClick={startGame}
                className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 rounded text-white"
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
                className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 rounded text-white"
              >
                <Play className="w-4 h-4" />
                Resume
              </button>
            </div>
          )}

          {gameState === 'levelcomplete' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 rounded">
              <Zap className="w-12 h-12 text-yellow-400 mb-2" />
              <h3 className="text-2xl font-bold text-green-400 mb-2">Level {level - 1} Complete!</h3>
              <p className="text-lg text-white mb-4">Score: {score}</p>
              <button
                onClick={nextLevel}
                className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 rounded text-white"
              >
                <Play className="w-4 h-4" />
                Level {level}
              </button>
            </div>
          )}

          {gameState === 'gameover' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 rounded">
              <h3 className="text-2xl font-bold text-red-400 mb-2">Game Over</h3>
              <p className="text-lg text-white mb-1">Score: {score}</p>
              <p className="text-sm text-muted-foreground mb-1">Reached Level {level}</p>
              {score === highScore && score > 0 && (
                <p className="text-sm text-yellow-400 mb-4">New High Score!</p>
              )}
              <button
                onClick={startGame}
                className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 rounded text-white"
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
      </div>
    </div>
  )
}
