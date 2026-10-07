import { useState, useEffect, useRef, useCallback } from 'react'

import { Pause } from 'lucide-react'

import { useCardExpanded } from './CardWrapper'
import { useReportCardDataState } from './CardDataContext'
import { emitGameStarted, emitGameEnded } from '../../lib/analytics'
import { useGameKeyTracking } from '../../hooks/useGameKeys'
import { safeGet, safeSet } from '../../lib/safeLocalStorage'
import { Button } from '../ui/Button'
import { isDemoMode } from '@/lib/demoMode'
import { drawKubeGalagaScene } from './KubeGalaga.draw'
import { KubeGalagaHud, KubeGalagaOverlays } from './KubeGalagaOverlays'
import {
  HIGH_SCORE_KEY,
  PARSE_INT_RADIX,
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  PLAYER_WIDTH,
  PLAYER_HEIGHT,
  BULLET_WIDTH,
  BULLET_HEIGHT,
  ENEMY_WIDTH,
  ENEMY_HEIGHT,
  ENEMY_COLS,
  ENEMY_ROWS,
  PLAYER_SPEED,
  BULLET_SPEED,
  ENEMY_BULLET_SPEED,
  type Bullet,
  type Enemy,
  type KubeGalagaGameState,
  type Star,
} from './KubeGalaga.constants'

export function KubeGalaga() {
  useReportCardDataState({ hasData: true, isFailed: false, consecutiveFailures: 0, isDemoData: isDemoMode() })
  const { isExpanded } = useCardExpanded()
  const gameContainerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [gameState, setGameState] = useState<KubeGalagaGameState>('idle')
  const [score, setScore] = useState(0)
  const [lives, setLives] = useState(3)
  const [level, setLevel] = useState(1)
  const [highScore, setHighScore] = useState(() => {
    const saved = safeGet(HIGH_SCORE_KEY)
    return saved ? parseInt(saved, PARSE_INT_RADIX) : 0
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
  const initStars = () => {
    starsRef.current = Array.from({ length: 50 }, () => ({
      x: Math.random() * CANVAS_WIDTH,
      y: Math.random() * CANVAS_HEIGHT,
      speed: 0.5 + Math.random() * 1.5,
      size: Math.random() > 0.7 ? 2 : 1 }))
  }

  // Initialize enemies
  const initEnemies = (lvl: number) => {
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
          diveAngle: 0 })
      }
    }
    enemiesRef.current = enemies
    enemyDirRef.current = 1
  }

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
  const shoot = () => {
    if (shootCooldownRef.current > 0) return
    bulletsRef.current.push({
      x: playerRef.current.x + PLAYER_WIDTH / 2 - BULLET_WIDTH / 2,
      y: playerRef.current.y - BULLET_HEIGHT,
      isEnemy: false })
    shootCooldownRef.current = 15
  }

  // Enemy shoots
  const enemyShoot = () => {
    const aliveEnemies = enemiesRef.current.filter(e => e.alive)
    if (aliveEnemies.length === 0) return

    // Random enemy shoots
    if (Math.random() < 0.02 + level * 0.005) {
      const shooter = aliveEnemies[Math.floor(Math.random() * aliveEnemies.length)]
      bulletsRef.current.push({
        x: shooter.x + ENEMY_WIDTH / 2 - 2,
        y: shooter.y + ENEMY_HEIGHT,
        isEnemy: true })
    }
  }

  // Start enemy dive
  const startDive = () => {
    const aliveEnemies = enemiesRef.current.filter(e => e.alive && !e.diving)
    if (aliveEnemies.length === 0) return

    if (Math.random() < 0.01 + level * 0.003) {
      const diver = aliveEnemies[Math.floor(Math.random() * aliveEnemies.length)]
      diver.diving = true
      diver.diveX = diver.x
      diver.diveY = diver.y
      diver.diveAngle = 0
    }
  }

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
                safeSet(HIGH_SCORE_KEY, score.toString())
              }
              setGameState('gameover')
              emitGameEnded('kube_galaga', 'loss', score)
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
                safeSet(HIGH_SCORE_KEY, score.toString())
              }
              setGameState('gameover')
              emitGameEnded('kube_galaga', 'loss', score)
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
        safeSet(HIGH_SCORE_KEY, score.toString())
      }
      setGameState('gameover')
      emitGameEnded('kube_galaga', 'loss', score)
    }
  }, [shoot, enemyShoot, startDive, score, highScore])

  // Render
  const render = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    drawKubeGalagaScene(ctx, {
      stars: starsRef.current,
      player: playerRef.current,
      invincible: invincibleRef.current,
      bullets: bulletsRef.current,
      enemies: enemiesRef.current })
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

  // Keyboard handlers — scoped to visible game container (KeepAlive-safe)
  useGameKeyTracking(gameContainerRef, keysRef, { lowercase: true })

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
    emitGameStarted('kube_galaga')
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
    <div ref={gameContainerRef} className="h-full flex flex-col">
      <div className={`flex flex-col items-center gap-3 ${isExpanded ? 'flex-1 min-h-0' : ''}`}>
        {/* Stats bar */}
        <KubeGalagaHud score={score} level={level} lives={lives} highScore={highScore} />

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
          <KubeGalagaOverlays
            gameState={gameState}
            score={score}
            level={level}
            highScore={highScore}
            onStartGame={startGame}
            onTogglePause={togglePause}
            onNextLevel={nextLevel}
          />
        </div>

        {/* Controls */}
        {gameState === 'playing' && (
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              icon={<Pause className="w-4 h-4" />}
              onClick={togglePause}
            >
              Pause
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
