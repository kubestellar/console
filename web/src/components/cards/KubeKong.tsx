import { useState, useEffect, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { CardComponentProps } from './cardRegistry'
import { useCardExpanded } from './CardWrapper'
import { useReportCardDataState, useCardDemoState } from './CardDataContext'
import { emitGameStarted, emitGameEnded } from '../../lib/analytics'
import { useGameKeyTracking } from '../../hooks/useGameKeys'
import { safeGet, safeSet } from '../../lib/safeLocalStorage'
import { GameCanvas } from './kubeKong/GameCanvas'
import { GameControls, GameOverlays } from './kubeKong/GameUI'

// High-score storage key — safe wrapper tolerates private-mode
// localStorage failures (issue #8937).
const KUBE_KONG_HIGHSCORE_KEY = 'highscore-kubeKong'

// Game constants
const CANVAS_WIDTH = 280
const CANVAS_HEIGHT = 320
const GRAVITY = 0.4
const JUMP_FORCE = -8
const MOVE_SPEED = 2
const BARREL_SPEED = 2.5
const PLAYER_WIDTH = 16
const PLAYER_HEIGHT = 24
const BARREL_SIZE = 14
const BOSS_FRAME_RESET_MS = 300

// Sloped platform structure - like classic DK
interface Platform {
  x1: number  // Left x
  y1: number  // Left y
  x2: number  // Right x
  y2: number  // Right y (different for slope)
}

interface Ladder {
  x: number
  yTop: number
  yBottom: number
}

interface Barrel {
  x: number
  y: number
  vx: number
  vy: number
  rolling: boolean
}

interface Player {
  x: number
  y: number
  vx: number
  vy: number
  onGround: boolean
  climbing: boolean
  facingRight: boolean
  jumpedBarrels: Set<number>
}

// Classic DK-style sloped platforms
// Staggered widths ensure barrels transition between levels:
// - Right-rolling levels (4, 2) end at x=260; the level below extends to x=270 to catch
// - Left-rolling levels (3, 1) end at x=20; the level below extends to x=10 to catch
const PLATFORMS: Platform[] = [
  // Ground - full width flat
  { x1: 0, y1: 300, x2: 280, y2: 300 },
  // Level 1 - slopes down-left (slope < 0 → rolls LEFT, exits at x≈20)
  { x1: 20, y1: 258, x2: 270, y2: 250 },
  // Level 2 - slopes down-right (slope > 0 → rolls RIGHT, exits at x≈260)
  { x1: 10, y1: 200, x2: 260, y2: 208 },
  // Level 3 - slopes down-left (slope < 0 → rolls LEFT, exits at x≈20)
  { x1: 20, y1: 158, x2: 270, y2: 150 },
  // Level 4 - slopes down-right (slope > 0 → rolls RIGHT, exits at x≈260)
  { x1: 30, y1: 100, x2: 260, y2: 108 },
  // Top platform for princess
  { x1: 90, y1: 55, x2: 190, y2: 55 },
]

// Ladders connecting platforms
const LADDERS: Ladder[] = [
  // Ground to Level 1
  { x: 230, yTop: 250, yBottom: 300 },
  // Level 1 to Level 2
  { x: 50, yTop: 200, yBottom: 258 },
  // Level 2 to Level 3
  { x: 230, yTop: 150, yBottom: 208 },
  // Level 3 to Level 4
  { x: 50, yTop: 100, yBottom: 158 },
  // Level 4 to Top
  { x: 140, yTop: 55, yBottom: 108 },
]

// Get Y position on a sloped platform at given X
function getPlatformY(platform: Platform, x: number): number {
  const t = (x - platform.x1) / (platform.x2 - platform.x1)
  return platform.y1 + t * (platform.y2 - platform.y1)
}

export function KubeKong(_props: CardComponentProps) {
  const { t } = useTranslation('cards')
  const { showDemoBadge } = useCardDemoState({ requires: 'none' })
  useReportCardDataState({ hasData: true, isFailed: false, consecutiveFailures: 0, isDemoData: showDemoBadge })
  const { isExpanded } = useCardExpanded()
  const gameContainerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const gameLoopRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const keysRef = useRef<Set<string>>(new Set())
  const barrelIdRef = useRef(0)

  const [player, setPlayer] = useState<Player>({
    x: 20,
    y: 276,
    vx: 0,
    vy: 0,
    onGround: true,
    climbing: false,
    facingRight: true,
    jumpedBarrels: new Set() })
  const [barrels, setBarrels] = useState<Barrel[]>([])
  const [score, setScore] = useState(0)
  const [lives, setLives] = useState(3)
  const [level, setLevel] = useState(1)
  const [gameOver, setGameOver] = useState(false)
  const [won, setWon] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [bossFrame, setBossFrame] = useState(0)
  const [helpText, setHelpText] = useState(true)
  const [highScore, setHighScore] = useState<number>(() => {
    const saved = safeGet(KUBE_KONG_HIGHSCORE_KEY)
    return saved ? parseInt(saved, 10) || 0 : 0
  })

  // Persist high score when game ends and current score beats stored best.
  useEffect(() => {
    if (gameOver && score > highScore) {
      setHighScore(score)
      safeSet(KUBE_KONG_HIGHSCORE_KEY, score.toString())
    }
  }, [gameOver, score, highScore])

  const gameStateRef = useRef({ player, barrels })
  useEffect(() => {
    gameStateRef.current = { player, barrels }
  }, [player, barrels])

  // Game loop
  const { draw: gameCanvasDraw } = GameCanvas({
    canvasRef,
    player,
    barrels,
    bossFrame,
    helpText,
    isExpanded
  })

  // Ref for barrel jump scoring dedup
  const scoredBarrelsRef = useRef<Set<number>>(new Set())

  // Check if player is on a ladder.
  // #6304: useCallback with [] so the reference is stable across
  // renders. Previously this was a plain function redefined every
  // render, which caused the game-loop useEffect (whose deps include
  // this callback) to re-run on every render, clearing the
  // setInterval and resetting `barrelSpawnCounter = 0` before it
  // could reach the spawn threshold — so Kong never threw a single
  // barrel. Reads only module-level constants, so [] is safe.
  const getOnLadder = useCallback((x: number, y: number): Ladder | null => {
    const playerCenterX = x + PLAYER_WIDTH / 2
    for (const ladder of LADDERS) {
      if (Math.abs(playerCenterX - ladder.x - 10) < 12 &&
          y + PLAYER_HEIGHT > ladder.yTop &&
          y < ladder.yBottom) {
        return ladder
      }
    }
    return null
  }, [])

  // Check platform collision for player. Same #6304 fix reasoning.
  const checkPlatformCollision = useCallback((x: number, y: number, vy: number): { onGround: boolean; groundY: number } => {
    const playerBottom = y + PLAYER_HEIGHT
    const playerCenterX = x + PLAYER_WIDTH / 2

    for (const p of PLATFORMS) {
      if (playerCenterX >= p.x1 && playerCenterX <= p.x2) {
        const platformY = getPlatformY(p, playerCenterX)
        if (playerBottom >= platformY && playerBottom <= platformY + 12 && vy >= 0) {
          return { onGround: true, groundY: platformY - PLAYER_HEIGHT }
        }
      }
    }
    return { onGround: false, groundY: y }
  }, [])

  // Game loop — also halts on pause (issue #8944) so the setInterval
  // tick stops advancing physics/spawning.
  useEffect(() => {
    if (!isPlaying || gameOver || isPaused) {
      if (gameLoopRef.current) {
        clearInterval(gameLoopRef.current)
        gameLoopRef.current = null
      }
      return
    }

    let tick = 0
    let barrelSpawnCounter = 0
    scoredBarrelsRef.current.clear()

    gameLoopRef.current = setInterval(() => {
      tick++
      const state = gameStateRef.current
      const keys = keysRef.current

      // Blink help text
      if (tick % 30 === 0) {
        setHelpText(h => !h)
      }

      // Update player
      setPlayer(p => {
        let newX = p.x
        let newY = p.y
        let newVy = p.vy
        let climbing = p.climbing
        let onGround = p.onGround
        let facingRight = p.facingRight

        const ladder = getOnLadder(p.x, p.y)

        // Detect directional input
        const pressingUp = keys.has('ArrowUp') || keys.has('w') || keys.has('W')
        const pressingDown = keys.has('ArrowDown') || keys.has('s') || keys.has('S')
        const pressingLeft = keys.has('ArrowLeft') || keys.has('a') || keys.has('A')
        const pressingRight = keys.has('ArrowRight') || keys.has('d') || keys.has('D')

        // Climbing logic
        if (ladder) {
          if (pressingUp) {
            climbing = true
            newY -= 2
            if (newY < ladder.yTop - PLAYER_HEIGHT + 5) {
              newY = ladder.yTop - PLAYER_HEIGHT + 5
            }
          } else if (pressingDown) {
            climbing = true
            newY += 2
            if (newY + PLAYER_HEIGHT > ladder.yBottom) {
              newY = ladder.yBottom - PLAYER_HEIGHT
            }
          }
        }

        // Stop climbing when: left ladder area, OR released up/down keys
        if (climbing && (!ladder || (!pressingUp && !pressingDown))) {
          climbing = false
        }

        // Horizontal movement (only when not climbing)
        if (!climbing) {
          if (pressingLeft) {
            newX -= MOVE_SPEED
            facingRight = false
          } else if (pressingRight) {
            newX += MOVE_SPEED
            facingRight = true
          }
        }

        // Jumping (only when on ground and not climbing)
        if ((keys.has(' ')) && onGround && !climbing) {
          newVy = JUMP_FORCE
          onGround = false
        }

        // Apply gravity if not climbing
        if (!climbing) {
          newVy += GRAVITY
          newY += newVy
        } else {
          newVy = 0
        }

        // Bounds
        if (newX < 0) newX = 0
        if (newX > CANVAS_WIDTH - PLAYER_WIDTH) newX = CANVAS_WIDTH - PLAYER_WIDTH

        // Platform collision
        if (!climbing) {
          const collision = checkPlatformCollision(newX, newY, newVy)
          if (collision.onGround) {
            onGround = true
            newY = collision.groundY
            newVy = 0
          } else {
            onGround = false
          }
        }

        // Fall off bottom - lose life
        if (newY > CANVAS_HEIGHT) {
          setLives(l => {
            if (l <= 1) {
              setGameOver(true)
              setIsPlaying(false)
              setScore(s => { emitGameEnded('kube_kong', 'loss', s); return s })
              return 0
            }
            return l - 1
          })
          return { ...p, x: 20, y: 276, vx: 0, vy: 0, onGround: true, climbing: false, jumpedBarrels: new Set() }
        }

        // Win - reached princess
        if (newY < 60 && newX > 120 && newX < 170) {
          setWon(true)
          setGameOver(true)
          setIsPlaying(false)
          setScore(s => {
            const finalScore = s + 1000 + lives * 500
            emitGameEnded('kube_kong', 'win', finalScore)
            return finalScore
          })
        }

        return { ...p, x: newX, y: newY, vy: newVy, onGround, climbing, facingRight }
      })

      // Spawn barrels from Kong
      barrelSpawnCounter++
      const spawnRate = Math.max(40, 120 - level * 15)
      if (barrelSpawnCounter >= spawnRate) {
        barrelSpawnCounter = 0
        setBossFrame(1)
        setTimeout(() => setBossFrame(0), BOSS_FRAME_RESET_MS)

        barrelIdRef.current++
        setBarrels(bs => [...bs, {
          x: 60,
          y: 80,
          vx: BARREL_SPEED,
          vy: 0,
          rolling: true }])
      }

      // Update barrels
      setBarrels(bs => {
        const newBarrels: Barrel[] = []

        for (let bi = 0; bi < bs.length; bi++) {
          const b = bs[bi]
          let newX = b.x
          let newY = b.y
          let newVx = b.vx
          let newVy = b.vy

          // Apply gravity
          newVy += GRAVITY * 1.5

          // Apply velocity (once — previous code double-applied vy)
          newX += newVx
          newY += newVy

          // Check barrel on platforms
          let onPlatform = false
          for (const plat of PLATFORMS) {
            const barrelCenterX = newX + BARREL_SIZE / 2
            if (barrelCenterX >= plat.x1 && barrelCenterX <= plat.x2) {
              const platformY = getPlatformY(plat, barrelCenterX)
              if (newY + BARREL_SIZE >= platformY && newY + BARREL_SIZE <= platformY + 15 && newVy >= 0) {
                newY = platformY - BARREL_SIZE
                newVy = 0
                onPlatform = true

                // Roll down slope
                const slope = (plat.y2 - plat.y1) / (plat.x2 - plat.x1)
                if (slope > 0) {
                  newVx = BARREL_SPEED + level * 0.3
                } else if (slope < 0) {
                  newVx = -(BARREL_SPEED + level * 0.3)
                }
                break
              }
            }
          }

          // When airborne, decay horizontal velocity so barrel falls to next level
          if (!onPlatform) {
            newVx *= 0.3
          }

          // Random chance to fall through a nearby ladder
          if (onPlatform && Math.random() < 0.03) {
            for (const ladder of LADDERS) {
              if (Math.abs(newX + BARREL_SIZE / 2 - ladder.x - 10) < 15 &&
                  newY + BARREL_SIZE > ladder.yTop - 5) {
                newY += 20
                newVy = 2
                newVx = 0
                break
              }
            }
          }

          // Remove if off screen
          if (newX < -20 || newX > CANVAS_WIDTH + 20 || newY > CANVAS_HEIGHT + 20) {
            continue
          }

          // Check collision with player
          const px = state.player.x
          const py = state.player.y
          if (!state.player.climbing &&
              newX < px + PLAYER_WIDTH - 2 &&
              newX + BARREL_SIZE > px + 2 &&
              newY < py + PLAYER_HEIGHT - 2 &&
              newY + BARREL_SIZE > py + 2) {
            // Hit!
            setLives(l => {
              if (l <= 1) {
                setGameOver(true)
                setIsPlaying(false)
                setScore(s => { emitGameEnded('kube_kong', 'loss', s); return s })
                return 0
              }
              return l - 1
            })
            setPlayer(p => ({ ...p, x: 20, y: 276, vx: 0, vy: 0, onGround: true, climbing: false, jumpedBarrels: new Set() }))
            continue
          }

          // Check if player jumped over barrel (score once per barrel)
          if (state.player.vy < 0 &&  // Player going up (jumping)
              py < newY &&  // Player above barrel
              py > newY - 30 &&  // Not too far above
              Math.abs(px - newX) < 20 &&  // Horizontally close
              !scoredBarrelsRef.current.has(bi)) {  // Haven't scored this barrel yet
            scoredBarrelsRef.current.add(bi)
            setScore(s => s + 100)
          }
          // Clear scored status when player lands (no longer jumping)
          if (state.player.onGround) {
            scoredBarrelsRef.current.delete(bi)
          }

          newBarrels.push({ ...b, x: newX, y: newY, vx: newVx, vy: newVy })
        }

        return newBarrels
      })

      gameCanvasDraw.current()
    }, 33)

    return () => {
      if (gameLoopRef.current) {
        clearInterval(gameLoopRef.current)
      }
    }
  }, [isPlaying, gameOver, isPaused, getOnLadder, checkPlatformCollision, level, lives])

  // Keyboard controls — scoped to visible game container (KeepAlive-safe)
  useGameKeyTracking(gameContainerRef, keysRef, {
    preventDefaultKeys: ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'w', 'a', 's', 'd', 'W', 'A', 'S', 'D'] })

  // Start game
  const startGame = () => {
    setPlayer({
      x: 20,
      y: 276,
      vx: 0,
      vy: 0,
      onGround: true,
      climbing: false,
      facingRight: true,
      jumpedBarrels: new Set() })
    setBarrels([])
    setScore(0)
    setLives(3)
    setLevel(1)
    setGameOver(false)
    setWon(false)
    setIsPaused(false)
    setBossFrame(0)
    setIsPlaying(true)
    emitGameStarted('kube_kong')
  }

  // Toggle pause — issue #8944.
  const togglePause = () => {
    if (!isPlaying || gameOver) return
    setIsPaused(p => !p)
  }

  // Keyboard shortcut for pause (P key).
  useEffect(() => {
    const container = gameContainerRef.current
    if (!container) return
    const onKey = (e: KeyboardEvent) => {
      if (!isPlaying || gameOver) return
      if (e.key === 'p' || e.key === 'P') {
        e.preventDefault()
        setIsPaused(p => !p)
      }
    }
    container.addEventListener('keydown', onKey)
    return () => container.removeEventListener('keydown', onKey)
  }, [isPlaying, gameOver])

  const scale = isExpanded ? 1.5 : 1

  return (
    <div ref={gameContainerRef} className="h-full flex flex-col p-2 select-none">
      <GameControls
        score={score}
        lives={lives}
        level={level}
        highScore={highScore}
        isPlaying={isPlaying}
        gameOver={gameOver}
        isPaused={isPaused}
        onStartGame={startGame}
        onTogglePause={togglePause}
      />

      {/* Game area - relative container for overlays */}
      <div className="flex-1 flex items-center justify-center relative">
        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH * scale}
          height={CANVAS_HEIGHT * scale}
          className="border border-border rounded"
        />

        <GameOverlays
          isPlaying={isPlaying}
          gameOver={gameOver}
          won={won}
          isPaused={isPaused}
          score={score}
          onStartGame={startGame}
          onTogglePause={togglePause}
        />
      </div>
    </div>
  )
}
