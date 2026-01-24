import { useState, useEffect, useCallback, useRef } from 'react'
import { RotateCcw, Trophy, Box } from 'lucide-react'
import { CardComponentProps } from './cardRegistry'
import { useCardExpanded } from './CardWrapper'

// Game constants
const CANVAS_WIDTH = 280
const CANVAS_HEIGHT = 320
const GRAVITY = 0.4
const JUMP_FORCE = -8
const MOVE_SPEED = 2
const BARREL_SPEED = 1.5
const PLAYER_WIDTH = 16
const PLAYER_HEIGHT = 24
const BARREL_SIZE = 14

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
const PLATFORMS: Platform[] = [
  // Ground - flat
  { x1: 0, y1: 300, x2: 280, y2: 300 },
  // Level 1 - slopes down-right
  { x1: 10, y1: 258, x2: 250, y2: 250 },
  // Level 2 - slopes down-left
  { x1: 30, y1: 200, x2: 270, y2: 208 },
  // Level 3 - slopes down-right
  { x1: 10, y1: 158, x2: 250, y2: 150 },
  // Level 4 - slopes down-left
  { x1: 30, y1: 100, x2: 270, y2: 108 },
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
  const { isExpanded } = useCardExpanded()
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
    jumpedBarrels: new Set(),
  })
  const [barrels, setBarrels] = useState<Barrel[]>([])
  const [score, setScore] = useState(0)
  const [lives, setLives] = useState(3)
  const [level, setLevel] = useState(1)
  const [gameOver, setGameOver] = useState(false)
  const [won, setWon] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [bossFrame, setBossFrame] = useState(0)
  const [helpText, setHelpText] = useState(true)

  const gameStateRef = useRef({ player, barrels })
  useEffect(() => {
    gameStateRef.current = { player, barrels }
  }, [player, barrels])

  // Check if player is on a ladder
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

  // Check platform collision for player
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

  // Draw game
  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const scale = isExpanded ? 1.5 : 1
    ctx.save()
    ctx.scale(scale, scale)

    // Background
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)

    // Draw platforms (red girders with slope)
    for (const p of PLATFORMS) {
      ctx.strokeStyle = '#ff4444'
      ctx.lineWidth = 8
      ctx.beginPath()
      ctx.moveTo(p.x1, p.y1)
      ctx.lineTo(p.x2, p.y2)
      ctx.stroke()

      // Girder details
      ctx.strokeStyle = '#cc3333'
      ctx.lineWidth = 2
      const segments = Math.floor((p.x2 - p.x1) / 20)
      for (let i = 0; i <= segments; i++) {
        const t = i / segments
        const x = p.x1 + t * (p.x2 - p.x1)
        const y = p.y1 + t * (p.y2 - p.y1)
        ctx.beginPath()
        ctx.moveTo(x, y - 3)
        ctx.lineTo(x, y + 3)
        ctx.stroke()
      }
    }

    // Draw ladders
    ctx.strokeStyle = '#00bfff'
    ctx.lineWidth = 2
    for (const ladder of LADDERS) {
      // Sides
      ctx.beginPath()
      ctx.moveTo(ladder.x, ladder.yTop)
      ctx.lineTo(ladder.x, ladder.yBottom)
      ctx.moveTo(ladder.x + 20, ladder.yTop)
      ctx.lineTo(ladder.x + 20, ladder.yBottom)
      ctx.stroke()
      // Rungs
      for (let y = ladder.yTop; y < ladder.yBottom; y += 8) {
        ctx.beginPath()
        ctx.moveTo(ladder.x, y)
        ctx.lineTo(ladder.x + 20, y)
        ctx.stroke()
      }
    }

    // Draw Kube Kong (boss) at top-left
    const bossX = 15
    const bossY = 65

    // Body
    ctx.fillStyle = '#8b4513'
    ctx.fillRect(bossX, bossY, 50, 40)

    // Head
    ctx.fillStyle = '#a0522d'
    ctx.beginPath()
    ctx.arc(bossX + 25, bossY - 5, 20, 0, Math.PI * 2)
    ctx.fill()

    // Face
    ctx.fillStyle = '#deb887'
    ctx.fillRect(bossX + 10, bossY - 10, 30, 20)

    // Eyes (angry)
    ctx.fillStyle = '#000'
    ctx.fillRect(bossX + 15, bossY - 5, 6, 6)
    ctx.fillRect(bossX + 29, bossY - 5, 6, 6)

    // Eyebrows (angry)
    ctx.strokeStyle = '#000'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(bossX + 13, bossY - 8)
    ctx.lineTo(bossX + 23, bossY - 5)
    ctx.moveTo(bossX + 37, bossY - 8)
    ctx.lineTo(bossX + 27, bossY - 5)
    ctx.stroke()

    // Mouth
    ctx.fillStyle = '#000'
    ctx.fillRect(bossX + 17, bossY + 5, 16, 4)

    // Arms throwing animation
    ctx.fillStyle = '#8b4513'
    if (bossFrame === 1) {
      // Throwing pose - arm up with barrel
      ctx.fillRect(bossX + 45, bossY - 20, 12, 30)
      // Barrel in hand
      ctx.fillStyle = '#ffa500'
      ctx.beginPath()
      ctx.arc(bossX + 55, bossY - 25, 10, 0, Math.PI * 2)
      ctx.fill()
    } else {
      // Normal arms
      ctx.fillRect(bossX - 10, bossY + 10, 15, 25)
      ctx.fillRect(bossX + 45, bossY + 10, 15, 25)
    }

    // Draw princess at top
    const princessX = 140
    const princessY = 30

    // Dress
    ctx.fillStyle = '#ff69b4'
    ctx.beginPath()
    ctx.moveTo(princessX, princessY + 20)
    ctx.lineTo(princessX - 8, princessY + 35)
    ctx.lineTo(princessX + 22, princessY + 35)
    ctx.lineTo(princessX + 14, princessY + 20)
    ctx.closePath()
    ctx.fill()

    // Body
    ctx.fillRect(princessX, princessY + 8, 14, 14)

    // Head
    ctx.fillStyle = '#ffd7b5'
    ctx.beginPath()
    ctx.arc(princessX + 7, princessY + 2, 8, 0, Math.PI * 2)
    ctx.fill()

    // Hair
    ctx.fillStyle = '#ffd700'
    ctx.beginPath()
    ctx.arc(princessX + 7, princessY - 2, 10, Math.PI, 0)
    ctx.fill()

    // Crown
    ctx.fillStyle = '#ffd700'
    ctx.fillRect(princessX + 1, princessY - 12, 12, 6)
    ctx.fillRect(princessX + 3, princessY - 16, 3, 4)
    ctx.fillRect(princessX + 8, princessY - 16, 3, 4)

    // HELP! text
    if (helpText) {
      ctx.fillStyle = '#fff'
      ctx.font = 'bold 10px sans-serif'
      ctx.fillText('HELP!', princessX - 5, princessY - 20)
    }

    // Draw barrels
    ctx.fillStyle = '#ffa500'
    for (const b of barrels) {
      ctx.beginPath()
      ctx.arc(b.x + BARREL_SIZE / 2, b.y + BARREL_SIZE / 2, BARREL_SIZE / 2, 0, Math.PI * 2)
      ctx.fill()

      // Barrel stripes
      ctx.strokeStyle = '#8b4500'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(b.x + 2, b.y + BARREL_SIZE / 2)
      ctx.lineTo(b.x + BARREL_SIZE - 2, b.y + BARREL_SIZE / 2)
      ctx.stroke()
    }

    // Draw player (Mario-style jumpman)
    const p = player

    // Body
    ctx.fillStyle = '#ff0000'
    ctx.fillRect(p.x + 3, p.y + 8, 10, 10)

    // Head
    ctx.fillStyle = '#ffd7b5'
    ctx.fillRect(p.x + 4, p.y, 8, 8)

    // Cap
    ctx.fillStyle = '#ff0000'
    ctx.fillRect(p.x + 2, p.y - 2, 12, 4)
    ctx.fillRect(p.x + (p.facingRight ? 10 : -2), p.y, 4, 3)

    // Legs
    ctx.fillStyle = '#0000ff'
    if (p.climbing) {
      ctx.fillRect(p.x + 3, p.y + 16, 4, 8)
      ctx.fillRect(p.x + 9, p.y + 18, 4, 6)
    } else {
      ctx.fillRect(p.x + 3, p.y + 16, 4, 8)
      ctx.fillRect(p.x + 9, p.y + 16, 4, 8)
    }

    // Arms
    ctx.fillStyle = '#ff0000'
    if (p.climbing) {
      ctx.fillRect(p.x - 2, p.y + 6, 5, 4)
      ctx.fillRect(p.x + 13, p.y + 10, 5, 4)
    }

    ctx.restore()
  }, [player, barrels, bossFrame, helpText, isExpanded])

  // Game loop
  useEffect(() => {
    if (!isPlaying || gameOver) {
      if (gameLoopRef.current) {
        clearInterval(gameLoopRef.current)
        gameLoopRef.current = null
      }
      return
    }

    let tick = 0
    let barrelSpawnCounter = 0

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

        // Climbing logic
        if (ladder) {
          if (keys.has('ArrowUp') || keys.has('w') || keys.has('W')) {
            climbing = true
            newY -= 2
            if (newY < ladder.yTop - PLAYER_HEIGHT + 5) {
              newY = ladder.yTop - PLAYER_HEIGHT + 5
            }
          } else if (keys.has('ArrowDown') || keys.has('s') || keys.has('S')) {
            climbing = true
            newY += 2
            if (newY + PLAYER_HEIGHT > ladder.yBottom) {
              newY = ladder.yBottom - PLAYER_HEIGHT
            }
          }
        }

        // Horizontal movement (only when not climbing)
        if (!climbing) {
          if (keys.has('ArrowLeft') || keys.has('a') || keys.has('A')) {
            newX -= MOVE_SPEED
            facingRight = false
          } else if (keys.has('ArrowRight') || keys.has('d') || keys.has('D')) {
            newX += MOVE_SPEED
            facingRight = true
          }
        }

        // Jumping (only when on ground and not climbing)
        if ((keys.has(' ')) && onGround && !climbing) {
          newVy = JUMP_FORCE
          onGround = false
        }

        // Stop climbing when leaving ladder
        if (climbing && !ladder) {
          climbing = false
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
          setScore(s => s + 1000 + lives * 500)
        }

        return { ...p, x: newX, y: newY, vy: newVy, onGround, climbing, facingRight }
      })

      // Spawn barrels from Kong
      barrelSpawnCounter++
      const spawnRate = Math.max(60, 150 - level * 20)
      if (barrelSpawnCounter >= spawnRate) {
        barrelSpawnCounter = 0
        setBossFrame(1)
        setTimeout(() => setBossFrame(0), 300)

        barrelIdRef.current++
        setBarrels(bs => [...bs, {
          x: 60,
          y: 80,
          vx: BARREL_SPEED,
          vy: 0,
          rolling: true,
        }])
      }

      // Update barrels
      setBarrels(bs => {
        const newBarrels: Barrel[] = []

        for (const b of bs) {
          let newX = b.x + b.vx
          let newY = b.y + b.vy
          let newVx = b.vx
          let newVy = b.vy

          // Apply gravity
          newVy += GRAVITY * 0.8

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

          // Apply movement
          newY += newVy

          // Check if barrel can fall down ladder
          if (onPlatform && Math.random() < 0.03) {
            for (const ladder of LADDERS) {
              if (Math.abs(newX + BARREL_SIZE / 2 - ladder.x - 10) < 15 &&
                  newY + BARREL_SIZE > ladder.yTop - 5) {
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
                return 0
              }
              return l - 1
            })
            setPlayer(p => ({ ...p, x: 20, y: 276, vx: 0, vy: 0, onGround: true, climbing: false, jumpedBarrels: new Set() }))
            continue
          }

          // Check if player jumped over barrel
          if (state.player.vy < 0 &&  // Player going up (jumping)
              py < newY &&  // Player above barrel
              py > newY - 30 &&  // Not too far above
              Math.abs(px - newX) < 20) {  // Horizontally close
            setScore(s => s + 100)
          }

          newBarrels.push({ ...b, x: newX, y: newY, vx: newVx, vy: newVy })
        }

        return newBarrels
      })

      draw()
    }, 33)

    return () => {
      if (gameLoopRef.current) {
        clearInterval(gameLoopRef.current)
      }
    }
  }, [isPlaying, gameOver, draw, getOnLadder, checkPlatformCollision, level])

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'w', 'a', 's', 'd', 'W', 'A', 'S', 'D'].includes(e.key)) {
        e.preventDefault()
        keysRef.current.add(e.key)
      }
    }
    const handleKeyUp = (e: KeyboardEvent) => {
      keysRef.current.delete(e.key)
    }
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [])

  // Start game
  const startGame = useCallback(() => {
    setPlayer({
      x: 20,
      y: 276,
      vx: 0,
      vy: 0,
      onGround: true,
      climbing: false,
      facingRight: true,
      jumpedBarrels: new Set(),
    })
    setBarrels([])
    setScore(0)
    setLives(3)
    setLevel(1)
    setGameOver(false)
    setWon(false)
    setBossFrame(0)
    setIsPlaying(true)
  }, [])

  const scale = isExpanded ? 1.5 : 1

  useEffect(() => {
    draw()
  }, [draw])

  return (
    <div className="h-full flex flex-col p-2 select-none">
      <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
        <div className="flex items-center gap-1.5">
          <Box className="w-4 h-4 text-orange-400" />
          <span className="text-sm font-semibold">Kube Kong</span>
        </div>

        <div className="flex items-center gap-3 text-xs">
          <div className="text-center">
            <div className="text-muted-foreground">Score</div>
            <div className="font-bold text-foreground">{score}</div>
          </div>
          <div className="text-center">
            <div className="text-muted-foreground">Lives</div>
            <div className="font-bold text-red-400">{'❤️'.repeat(lives)}</div>
          </div>
          <div className="text-center">
            <div className="text-muted-foreground">Level</div>
            <div className="font-bold text-purple-400">{level}</div>
          </div>
        </div>

        <button onClick={startGame} className="p-1.5 rounded hover:bg-secondary" title="New Game">
          <RotateCcw className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 flex items-center justify-center">
        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH * scale}
          height={CANVAS_HEIGHT * scale}
          className="border border-border rounded"
        />
      </div>

      {!isPlaying && !gameOver && (
        <div className="absolute inset-0 bg-background/80 flex items-center justify-center rounded-lg">
          <div className="text-center">
            <div className="text-xl font-bold text-orange-400 mb-2">KUBE KONG</div>
            <div className="text-muted-foreground mb-2 text-sm">Rescue the deployment!</div>
            <div className="text-muted-foreground mb-4 text-xs">
              ← → Move | ↑ ↓ Climb | Space Jump
            </div>
            <button
              onClick={startGame}
              className="px-6 py-3 bg-orange-500/20 text-orange-400 rounded-lg hover:bg-orange-500/30 font-semibold"
            >
              Start Game
            </button>
          </div>
        </div>
      )}

      {gameOver && (
        <div className="absolute inset-0 bg-background/80 flex items-center justify-center rounded-lg">
          <div className="text-center">
            {won ? (
              <>
                <Trophy className="w-12 h-12 text-yellow-400 mx-auto mb-3" />
                <div className="text-xl font-bold text-yellow-400 mb-2">Deployment Rescued!</div>
              </>
            ) : (
              <div className="text-xl font-bold text-red-400 mb-2">Game Over!</div>
            )}
            <div className="text-muted-foreground mb-4">Score: {score}</div>
            <button
              onClick={startGame}
              className="px-6 py-3 bg-orange-500/20 text-orange-400 rounded-lg hover:bg-orange-500/30 font-semibold"
            >
              Play Again
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
