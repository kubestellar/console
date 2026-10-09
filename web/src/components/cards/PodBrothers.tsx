import { useState, useEffect, useRef, useCallback } from 'react'

import { Pause } from 'lucide-react'

import { useTranslation } from 'react-i18next'
import { useCardExpanded } from './CardWrapper'
import { useReportCardDataState } from './CardDataContext'
import { emitGameStarted, emitGameEnded } from '../../lib/analytics'
import { useGameKeyTracking } from '../../hooks/useGameKeys'
import { safeGet, safeSet } from '../../lib/safeLocalStorage'
import { isDemoMode } from '@/lib/demoMode'

import {
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  TILE_SIZE,
  GRAVITY,
  JUMP_FORCE,
  MOVE_SPEED,
  PLAYER_SIZE,
  INVINCIBILITY_FRAMES,
  EMPTY,
  BRICK,
  QUESTION,
  GROUND,
  PIPE,
  FLAG,
  POD_BROTHERS_HIGHSCORE_KEY,
  type Player,
  type Enemy,
  type Coin,
} from './PodBrothers.constants'
import { drawPodBrothersFrame } from './PodBrothers.draw'
import { buildPodBrothersLevel, createInitialPlayer } from './podbrothers/PodBrothers.level'
import {
  PodBrothersOverlay,
  PodBrothersStatsBar,
  type PodBrothersGameState,
} from './podbrothers/PodBrothers.overlays'

export function PodBrothers() {
  const { t } = useTranslation('cards')
  useReportCardDataState({ hasData: true, isFailed: false, consecutiveFailures: 0, isDemoData: isDemoMode() })
  const { isExpanded } = useCardExpanded()
  const gameContainerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [gameState, setGameState] = useState<PodBrothersGameState>('idle')
  const [score, setScore] = useState(0)
  const [lives, setLives] = useState(3)
  const [highScore, setHighScore] = useState(() => {
    const saved = safeGet(POD_BROTHERS_HIGHSCORE_KEY)
    return saved ? parseInt(saved, 10) : 0
  })

  const playerRef = useRef<Player>(createInitialPlayer())

  const enemiesRef = useRef<Enemy[]>([])
  const coinsRef = useRef<Coin[]>([])
  const keysRef = useRef<Set<string>>(new Set())
  const animationRef = useRef<number>(0)
  const levelRef = useRef<number[][]>([])
  /** Frames remaining of spawn invincibility (prevents instant death on overlapping enemies) */
  const invincibilityRef = useRef<number>(0)
  const livesRef = useRef<number>(3)

  // Initialize level
  const initLevel = useCallback(() => {
    const level = buildPodBrothersLevel()
    levelRef.current = level.tiles
    enemiesRef.current = level.enemies
    coinsRef.current = level.coins
    playerRef.current = createInitialPlayer()

    // Grant spawn invincibility to prevent instant death from overlapping enemies
    invincibilityRef.current = INVINCIBILITY_FRAMES
  }, [])

  // Collision detection — wrapped in useCallback for stable update() deps
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

    // Tick down spawn invincibility
    if (invincibilityRef.current > 0) {
      invincibilityRef.current--
    }

    // Handle input
    if (keys.has('ArrowLeft') || keys.has('a') || keys.has('A')) {
      player.vx = -MOVE_SPEED
      player.facingRight = false
    } else if (keys.has('ArrowRight') || keys.has('d') || keys.has('D')) {
      player.vx = MOVE_SPEED
      player.facingRight = true
    } else {
      player.vx = 0
    }

    if ((keys.has('ArrowUp') || keys.has('w') || keys.has('W') || keys.has(' ')) && player.onGround) {
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
      const currentLives = livesRef.current
      if (currentLives <= 1) {
        livesRef.current = 0
        setLives(0)
        setGameState('lost')
        setScore(s => { emitGameEnded('pod_brothers', 'loss', s); return s })
      } else {
        livesRef.current = currentLives - 1
        setLives(currentLives - 1)
        initLevel()
      }
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
        // Check if stomping (always allowed, even during invincibility)
        if (player.vy > 0 && player.y + PLAYER_SIZE < ey + TILE_SIZE / 2) {
          enemy.alive = false
          player.vy = JUMP_FORCE / 2
          setScore(s => s + 200)
        } else if (invincibilityRef.current <= 0) {
          // Only take damage when not invincible
          const currentLives = livesRef.current
          if (currentLives <= 1) {
            livesRef.current = 0
            setLives(0)
            setGameState('lost')
            setScore(s => { emitGameEnded('pod_brothers', 'loss', s); return s })
          } else {
            livesRef.current = currentLives - 1
            setLives(currentLives - 1)
            initLevel()
          }
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
            safeSet(POD_BROTHERS_HIGHSCORE_KEY, finalScore.toString())
          }
          emitGameEnded('pod_brothers', 'win', finalScore)
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

    drawPodBrothersFrame(
      ctx,
      levelRef.current,
      coinsRef.current,
      enemiesRef.current,
      playerRef.current,
      invincibilityRef.current,
    )
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
  useGameKeyTracking(gameContainerRef, keysRef)

  // Render initial frame
  useEffect(() => {
    if (gameState === 'idle') {
      initLevel()
      render()
    }
  }, [gameState, initLevel, render])

  const startGame = () => {
    // Cancel any in-flight animation frame to prevent stale updates
    cancelAnimationFrame(animationRef.current)
    // Clear held keys so stale presses don't carry into the new game
    keysRef.current.clear()
    initLevel()
    setScore(0)
    livesRef.current = 3
    setLives(3)
    setGameState('playing')
    emitGameStarted('pod_brothers')
  }

  const togglePause = () => {
    setGameState(s => s === 'playing' ? 'paused' : 'playing')
  }

  return (
    <div ref={gameContainerRef} className="h-full flex flex-col">
      <div className={`flex flex-col items-center gap-3 ${isExpanded ? 'flex-1 min-h-0' : ''}`}>
        {/* Stats bar */}
        <PodBrothersStatsBar score={score} lives={lives} highScore={highScore} />

        {/* Game canvas */}
        <div className={`relative ${isExpanded ? 'flex-1 min-h-0' : ''}`}>
          <canvas
            ref={canvasRef}
            width={CANVAS_WIDTH}
            height={CANVAS_HEIGHT}
            className="border border-border rounded bg-[#5c94fc]"
            style={isExpanded ? { width: '100%', height: '100%', objectFit: 'contain' } : undefined}
            tabIndex={0}
          />

          {/* Overlays */}
          <PodBrothersOverlay
            gameState={gameState}
            score={score}
            onStart={startGame}
            onResume={togglePause}
          />
        </div>

        {/* Controls */}
        {gameState === 'playing' && (
          <div className="flex gap-2">
            <button
              onClick={togglePause}
              className="flex items-center gap-1 px-3 py-1 bg-secondary hover:bg-secondary/80 rounded text-sm"
            >
              <Pause className="w-4 h-4" />
              {t('podBrothers.pause')}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
