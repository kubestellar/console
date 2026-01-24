import { useState, useEffect, useCallback, useRef } from 'react'
import { RotateCcw, Trophy, Zap } from 'lucide-react'
import { CardComponentProps } from './cardRegistry'
import { useCardExpanded } from './CardWrapper'

// Game constants
const CANVAS_WIDTH = 320
const CANVAS_HEIGHT = 200
const GRAVITY = 0.4
const JUMP_FORCE = -8
const MOVE_SPEED = 4

interface Player {
  x: number
  y: number
  vx: number
  vy: number
  onGround: boolean
  swinging: boolean
  swingAngle: number
  swingVine: Vine | null
}

interface Platform {
  x: number
  y: number
  width: number
  type: 'ground' | 'log' | 'pit'
}

interface Obstacle {
  x: number
  y: number
  type: 'snake' | 'scorpion' | 'croc' | 'fire'
  direction: number
}

interface Collectible {
  x: number
  y: number
  type: 'gold' | 'diamond' | 'ring'
  collected: boolean
}

interface Vine {
  x: number
  topY: number
  length: number
}

export function PodPitfall(_props: CardComponentProps) {
  const { isExpanded } = useCardExpanded()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const gameLoopRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const keysRef = useRef<Set<string>>(new Set())

  const [player, setPlayer] = useState<Player>({
    x: 50,
    y: 140,
    vx: 0,
    vy: 0,
    onGround: true,
    swinging: false,
    swingAngle: 0,
    swingVine: null,
  })
  const [platforms, setPlatforms] = useState<Platform[]>([])
  const [obstacles, setObstacles] = useState<Obstacle[]>([])
  const [collectibles, setCollectibles] = useState<Collectible[]>([])
  const [vines, setVines] = useState<Vine[]>([])
  const [cameraX, setCameraX] = useState(0)
  const [score, setScore] = useState(0)
  const [lives, setLives] = useState(3)
  const [time, setTime] = useState(2000)
  const [gameOver, setGameOver] = useState(false)
  const [won, setWon] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [distance, setDistance] = useState(0)

  const gameStateRef = useRef({ player, cameraX, platforms, obstacles, collectibles, vines })
  useEffect(() => {
    gameStateRef.current = { player, cameraX, platforms, obstacles, collectibles, vines }
  }, [player, cameraX, platforms, obstacles, collectibles, vines])

  // Generate world
  const generateWorld = useCallback(() => {
    const newPlatforms: Platform[] = []
    const newObstacles: Obstacle[] = []
    const newCollectibles: Collectible[] = []
    const newVines: Vine[] = []

    // Generate platforms and content
    for (let screen = 0; screen < 20; screen++) {
      const baseX = screen * CANVAS_WIDTH

      // Ground with occasional pits
      if (Math.random() > 0.3 || screen === 0) {
        newPlatforms.push({ x: baseX, y: 160, width: CANVAS_WIDTH, type: 'ground' })
      } else {
        // Pit with crocodiles
        newPlatforms.push({ x: baseX, y: 160, width: 100, type: 'ground' })
        newPlatforms.push({ x: baseX + 100, y: 180, width: 120, type: 'pit' })
        newPlatforms.push({ x: baseX + 220, y: 160, width: 100, type: 'ground' })
        newObstacles.push({ x: baseX + 140, y: 165, type: 'croc', direction: 1 })
      }

      // Logs to jump on
      if (Math.random() > 0.6) {
        newPlatforms.push({
          x: baseX + 80 + Math.random() * 100,
          y: 120,
          width: 60,
          type: 'log'
        })
      }

      // Vines
      if (Math.random() > 0.5 && screen > 0) {
        newVines.push({
          x: baseX + 50 + Math.random() * 200,
          topY: 20,
          length: 80 + Math.random() * 40
        })
      }

      // Obstacles
      if (Math.random() > 0.5 && screen > 0) {
        const obstacleType = ['snake', 'scorpion', 'fire'][Math.floor(Math.random() * 3)] as Obstacle['type']
        newObstacles.push({
          x: baseX + 100 + Math.random() * 150,
          y: 145,
          type: obstacleType,
          direction: Math.random() > 0.5 ? 1 : -1
        })
      }

      // Collectibles
      if (Math.random() > 0.4) {
        const type = ['gold', 'diamond', 'ring'][Math.floor(Math.random() * 3)] as Collectible['type']
        newCollectibles.push({
          x: baseX + 50 + Math.random() * 200,
          y: 80 + Math.random() * 60,
          type,
          collected: false
        })
      }
    }

    setPlatforms(newPlatforms)
    setObstacles(newObstacles)
    setCollectibles(newCollectibles)
    setVines(newVines)
  }, [])

  // Draw
  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const scale = isExpanded ? 1.5 : 1
    ctx.save()
    ctx.scale(scale, scale)

    // Sky
    ctx.fillStyle = '#1a1a2e'
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)

    // Stars
    ctx.fillStyle = '#fff'
    for (let i = 0; i < 50; i++) {
      const sx = ((i * 47) % CANVAS_WIDTH)
      const sy = ((i * 31) % 80)
      ctx.fillRect(sx, sy, 1, 1)
    }

    const cam = cameraX

    // Draw vines
    ctx.strokeStyle = '#228b22'
    ctx.lineWidth = 3
    for (const v of vines) {
      const vx = v.x - cam
      if (vx > -50 && vx < CANVAS_WIDTH + 50) {
        ctx.beginPath()
        ctx.moveTo(vx, v.topY)
        ctx.lineTo(vx, v.topY + v.length)
        ctx.stroke()
        // Leaves
        ctx.fillStyle = '#32cd32'
        ctx.beginPath()
        ctx.arc(vx, v.topY, 8, 0, Math.PI * 2)
        ctx.fill()
      }
    }

    // Draw platforms
    for (const p of platforms) {
      const px = p.x - cam
      if (px > -p.width && px < CANVAS_WIDTH + 50) {
        if (p.type === 'ground') {
          // Ground
          ctx.fillStyle = '#2d5a2d'
          ctx.fillRect(px, p.y, p.width, CANVAS_HEIGHT - p.y)
          ctx.fillStyle = '#3d7a3d'
          ctx.fillRect(px, p.y, p.width, 5)
        } else if (p.type === 'log') {
          // Log platform
          ctx.fillStyle = '#8b4513'
          ctx.fillRect(px, p.y, p.width, 10)
          ctx.fillStyle = '#654321'
          ctx.fillRect(px + 2, p.y + 2, p.width - 4, 6)
        } else if (p.type === 'pit') {
          // Water/pit
          ctx.fillStyle = '#1e90ff'
          ctx.fillRect(px, p.y, p.width, CANVAS_HEIGHT - p.y)
        }
      }
    }

    // Draw obstacles
    for (const o of obstacles) {
      const ox = o.x - cam
      if (ox > -30 && ox < CANVAS_WIDTH + 30) {
        if (o.type === 'snake') {
          ctx.fillStyle = '#00ff00'
          ctx.fillRect(ox, o.y, 20, 8)
          ctx.fillStyle = '#ff0000'
          ctx.fillRect(ox + (o.direction > 0 ? 18 : 0), o.y + 2, 4, 4)
        } else if (o.type === 'scorpion') {
          ctx.fillStyle = '#8b0000'
          ctx.fillRect(ox, o.y + 5, 15, 8)
          ctx.fillRect(ox - 5, o.y, 5, 8)
        } else if (o.type === 'croc') {
          ctx.fillStyle = '#228b22'
          ctx.fillRect(ox, o.y, 40, 15)
          ctx.fillStyle = '#fff'
          ctx.fillRect(ox + 5, o.y + 3, 30, 3)
        } else if (o.type === 'fire') {
          ctx.fillStyle = '#ff4500'
          ctx.fillRect(ox, o.y - 10, 10, 20)
          ctx.fillStyle = '#ffd700'
          ctx.fillRect(ox + 2, o.y - 5, 6, 10)
        }
      }
    }

    // Draw collectibles
    for (const c of collectibles) {
      if (c.collected) continue
      const cx = c.x - cam
      if (cx > -20 && cx < CANVAS_WIDTH + 20) {
        if (c.type === 'gold') {
          ctx.fillStyle = '#ffd700'
          ctx.fillRect(cx, c.y, 12, 12)
        } else if (c.type === 'diamond') {
          ctx.fillStyle = '#00ffff'
          ctx.beginPath()
          ctx.moveTo(cx + 8, c.y)
          ctx.lineTo(cx + 16, c.y + 8)
          ctx.lineTo(cx + 8, c.y + 16)
          ctx.lineTo(cx, c.y + 8)
          ctx.closePath()
          ctx.fill()
        } else if (c.type === 'ring') {
          ctx.strokeStyle = '#c0c0c0'
          ctx.lineWidth = 3
          ctx.beginPath()
          ctx.arc(cx + 8, c.y + 8, 6, 0, Math.PI * 2)
          ctx.stroke()
        }
      }
    }

    // Draw player
    const p = player
    const px = p.x - cam
    ctx.fillStyle = '#ff6347'
    // Body
    ctx.fillRect(px + 4, p.y + 8, 12, 14)
    // Head
    ctx.fillStyle = '#ffd7b5'
    ctx.fillRect(px + 5, p.y, 10, 10)
    // Hat
    ctx.fillStyle = '#8b4513'
    ctx.fillRect(px + 3, p.y - 2, 14, 4)
    // Legs
    ctx.fillStyle = '#4169e1'
    ctx.fillRect(px + 5, p.y + 20, 4, 8)
    ctx.fillRect(px + 11, p.y + 20, 4, 8)

    // HUD
    ctx.fillStyle = '#fff'
    ctx.font = '12px monospace'
    ctx.fillText(`SCORE: ${score}`, 10, 15)
    ctx.fillText(`TIME: ${time}`, CANVAS_WIDTH - 80, 15)
    ctx.fillText(`DIST: ${distance}m`, CANVAS_WIDTH / 2 - 30, 15)

    ctx.restore()
  }, [player, cameraX, platforms, obstacles, collectibles, vines, score, time, distance, isExpanded])

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

    gameLoopRef.current = setInterval(() => {
      tick++
      const state = gameStateRef.current
      const keys = keysRef.current

      // Timer
      if (tick % 30 === 0) {
        setTime(t => {
          if (t <= 0) {
            setGameOver(true)
            setIsPlaying(false)
            return 0
          }
          return t - 1
        })
      }

      // Update player
      setPlayer(p => {
        let newX = p.x
        let newY = p.y
        let newVx = p.vx
        let newVy = p.vy
        let onGround = p.onGround
        let swinging = p.swinging
        let swingAngle = p.swingAngle
        let swingVine = p.swingVine

        // Check for vine grab
        if (!swinging && (keys.has('ArrowUp') || keys.has('w') || keys.has('W'))) {
          for (const v of state.vines) {
            const vx = v.x
            const vineBottom = v.topY + v.length
            if (Math.abs(newX + 10 - vx) < 20 && newY < vineBottom && newY > v.topY) {
              swinging = true
              swingVine = v
              swingAngle = 0
              newVy = 0
              break
            }
          }
        }

        // Swinging mechanics
        if (swinging && swingVine) {
          swingAngle += 0.05
          const swingRadius = 60
          newX = swingVine.x + Math.sin(swingAngle) * swingRadius - 10
          newY = swingVine.topY + swingRadius + Math.cos(swingAngle) * swingRadius / 2

          // Release vine
          if (keys.has(' ')) {
            swinging = false
            swingVine = null
            newVx = Math.cos(swingAngle) * 8
            newVy = -6
            onGround = false
          }
        } else {
          // Normal movement
          if (keys.has('ArrowLeft') || keys.has('a') || keys.has('A')) {
            newVx = -MOVE_SPEED
          } else if (keys.has('ArrowRight') || keys.has('d') || keys.has('D')) {
            newVx = MOVE_SPEED
          } else {
            newVx = 0
          }

          // Jump
          if ((keys.has(' ') || keys.has('ArrowUp') || keys.has('w') || keys.has('W')) && onGround) {
            newVy = JUMP_FORCE
            onGround = false
          }

          // Gravity
          newVy += GRAVITY

          // Apply velocity
          newX += newVx
          newY += newVy

          // Platform collision
          onGround = false
          for (const plat of state.platforms) {
            if (plat.type === 'pit') continue
            if (newY + 28 >= plat.y && newY + 28 <= plat.y + 10 && newVy >= 0) {
              if (newX + 15 > plat.x && newX + 5 < plat.x + plat.width) {
                onGround = true
                newY = plat.y - 28
                newVy = 0
              }
            }
          }
        }

        // Bounds
        if (newX < 0) newX = 0

        // Fall in pit
        if (newY > CANVAS_HEIGHT) {
          setLives(l => {
            if (l <= 1) {
              setGameOver(true)
              setIsPlaying(false)
              return 0
            }
            return l - 1
          })
          newX = 50
          newY = 140
          onGround = true
          newVy = 0
          swinging = false
          swingVine = null
        }

        // Update distance
        if (newX > distance * 10) {
          setDistance(Math.floor(newX / 10))
        }

        return { x: newX, y: newY, vx: newVx, vy: newVy, onGround, swinging, swingAngle, swingVine }
      })

      // Camera follow
      setCameraX(() => {
        const targetCam = player.x - CANVAS_WIDTH / 3
        return Math.max(0, targetCam)
      })

      // Check collectible collision
      setCollectibles(cs => cs.map(c => {
        if (c.collected) return c
        const px = state.player.x
        const py = state.player.y
        if (px < c.x + 16 && px + 20 > c.x && py < c.y + 16 && py + 28 > c.y) {
          const points = c.type === 'gold' ? 100 : c.type === 'diamond' ? 500 : 200
          setScore(s => s + points)
          return { ...c, collected: true }
        }
        return c
      }))

      // Check obstacle collision
      for (const o of state.obstacles) {
        const px = state.player.x
        const py = state.player.y
        const ow = o.type === 'croc' ? 40 : 20
        const oh = o.type === 'fire' ? 20 : 15
        if (px < o.x + ow && px + 20 > o.x && py + 28 > o.y && py < o.y + oh) {
          setLives(l => {
            if (l <= 1) {
              setGameOver(true)
              setIsPlaying(false)
              return 0
            }
            return l - 1
          })
          setPlayer(p => ({ ...p, x: 50, y: 140, vx: 0, vy: 0, onGround: true, swinging: false, swingVine: null }))
          setCameraX(0)
          break
        }
      }

      // Win condition
      if (distance >= 500) {
        setWon(true)
        setGameOver(true)
        setIsPlaying(false)
        setScore(s => s + time * 10)
      }

      draw()
    }, 33)

    return () => {
      if (gameLoopRef.current) {
        clearInterval(gameLoopRef.current)
      }
    }
  }, [isPlaying, gameOver, draw, player.x, distance])

  // Keyboard
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'w', 'a', 's', 'd'].includes(e.key)) {
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
    generateWorld()
    setPlayer({
      x: 50,
      y: 140,
      vx: 0,
      vy: 0,
      onGround: true,
      swinging: false,
      swingAngle: 0,
      swingVine: null,
    })
    setCameraX(0)
    setScore(0)
    setLives(3)
    setTime(2000)
    setDistance(0)
    setGameOver(false)
    setWon(false)
    setIsPlaying(true)
  }, [generateWorld])

  const scale = isExpanded ? 1.5 : 1

  useEffect(() => {
    draw()
  }, [draw])

  return (
    <div className="h-full flex flex-col p-2 select-none">
      <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
        <div className="flex items-center gap-1.5">
          <Zap className="w-4 h-4 text-green-400" />
          <span className="text-sm font-semibold">Pod Pitfall</span>
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
            <div className="text-xl font-bold text-green-400 mb-2">POD PITFALL</div>
            <div className="text-muted-foreground mb-2 text-sm">Explore the jungle infrastructure!</div>
            <div className="text-muted-foreground mb-4 text-xs">Arrow keys + Space to jump, Up to grab vines</div>
            <button
              onClick={startGame}
              className="px-6 py-3 bg-green-500/20 text-green-400 rounded-lg hover:bg-green-500/30 font-semibold"
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
                <div className="text-xl font-bold text-yellow-400 mb-2">Jungle Cleared!</div>
              </>
            ) : (
              <div className="text-xl font-bold text-red-400 mb-2">Game Over!</div>
            )}
            <div className="text-muted-foreground mb-2">Score: {score}</div>
            <div className="text-muted-foreground mb-4">Distance: {distance}m</div>
            <button
              onClick={startGame}
              className="px-6 py-3 bg-green-500/20 text-green-400 rounded-lg hover:bg-green-500/30 font-semibold"
            >
              Play Again
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
