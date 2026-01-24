import { useState, useEffect, useCallback, useRef } from 'react'
import { RotateCcw, Trophy, ArrowUp } from 'lucide-react'
import { CardComponentProps } from './cardRegistry'
import { useCardExpanded } from './CardWrapper'

// Game constants
const CANVAS_WIDTH = 280
const CANVAS_HEIGHT = 320
const CELL_SIZE = 32
// Grid columns: Math.floor(CANVAS_WIDTH / CELL_SIZE) = 8
const ROWS = 10
const PLAYER_SIZE = 24

interface Player {
  x: number
  y: number
  targetX: number
  targetY: number
  onLog: number | null  // Index of log player is riding
  dead: boolean
  deathFrame: number
}

interface Vehicle {
  x: number
  y: number
  width: number
  speed: number
  type: 'car' | 'truck' | 'bus'
  color: string
}

interface Log {
  x: number
  y: number
  width: number
  speed: number
  type: 'log' | 'turtle'
  turtleDiving?: boolean
}

interface HomeSlot {
  x: number
  filled: boolean
}

// Lane configuration
const LANES = [
  { type: 'safe', y: 9 },      // Start
  { type: 'road', y: 8, speed: 1.5, vehicles: ['car', 'car'] },
  { type: 'road', y: 7, speed: -2, vehicles: ['truck'] },
  { type: 'road', y: 6, speed: 1.8, vehicles: ['car', 'bus'] },
  { type: 'road', y: 5, speed: -2.5, vehicles: ['car', 'car', 'car'] },
  { type: 'safe', y: 4 },      // Middle safe zone
  { type: 'water', y: 3, speed: 1.2, logs: ['log', 'log', 'turtle'] },
  { type: 'water', y: 2, speed: -1.5, logs: ['log', 'turtle', 'log'] },
  { type: 'water', y: 1, speed: 2, logs: ['turtle', 'log', 'turtle'] },
  { type: 'home', y: 0 },      // Goal
]

export function PodCrosser(_props: CardComponentProps) {
  const { isExpanded } = useCardExpanded()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const gameLoopRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const [player, setPlayer] = useState<Player>({
    x: CANVAS_WIDTH / 2 - PLAYER_SIZE / 2,
    y: 9 * CELL_SIZE + 4,
    targetX: CANVAS_WIDTH / 2 - PLAYER_SIZE / 2,
    targetY: 9 * CELL_SIZE + 4,
    onLog: null,
    dead: false,
    deathFrame: 0,
  })
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [logs, setLogs] = useState<Log[]>([])
  const [homeSlots, setHomeSlots] = useState<HomeSlot[]>([])
  const [score, setScore] = useState(0)
  const [lives, setLives] = useState(3)
  const [level, setLevel] = useState(1)
  const [highestRow, setHighestRow] = useState(9)
  const [gameOver, setGameOver] = useState(false)
  const [won, setWon] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [time, setTime] = useState(60)

  const gameStateRef = useRef({ player, vehicles, logs, homeSlots })
  useEffect(() => {
    gameStateRef.current = { player, vehicles, logs, homeSlots }
  }, [player, vehicles, logs, homeSlots])

  // Initialize game objects
  const initGame = useCallback(() => {
    // Create vehicles
    const newVehicles: Vehicle[] = []
    LANES.forEach(lane => {
      if (lane.type === 'road' && lane.vehicles) {
        lane.vehicles.forEach((type, i) => {
          const width = type === 'truck' ? 64 : type === 'bus' ? 80 : 40
          newVehicles.push({
            x: (i * 120) % CANVAS_WIDTH,
            y: lane.y * CELL_SIZE,
            width,
            speed: lane.speed || 1,
            type: type as Vehicle['type'],
            color: type === 'truck' ? '#8b4513' : type === 'bus' ? '#ffd700' : ['#ff4444', '#4444ff', '#44ff44'][i % 3],
          })
        })
      }
    })
    setVehicles(newVehicles)

    // Create logs/turtles
    const newLogs: Log[] = []
    LANES.forEach(lane => {
      if (lane.type === 'water' && lane.logs) {
        lane.logs.forEach((type, i) => {
          const width = type === 'turtle' ? 48 : 80
          newLogs.push({
            x: (i * 100) % CANVAS_WIDTH,
            y: lane.y * CELL_SIZE,
            width,
            speed: lane.speed || 1,
            type: type as Log['type'],
            turtleDiving: false,
          })
        })
      }
    })
    setLogs(newLogs)

    // Create home slots
    const slots: HomeSlot[] = []
    for (let i = 0; i < 5; i++) {
      slots.push({
        x: 10 + i * 56,
        filled: false,
      })
    }
    setHomeSlots(slots)
  }, [])

  // Draw game
  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const scale = isExpanded ? 1.4 : 1
    ctx.save()
    ctx.scale(scale, scale)

    // Background
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)

    // Draw lanes
    LANES.forEach(lane => {
      const y = lane.y * CELL_SIZE
      if (lane.type === 'safe') {
        ctx.fillStyle = '#4a2c82'  // Purple safe zone
        ctx.fillRect(0, y, CANVAS_WIDTH, CELL_SIZE)
      } else if (lane.type === 'road') {
        ctx.fillStyle = '#333'
        ctx.fillRect(0, y, CANVAS_WIDTH, CELL_SIZE)
        // Road markings
        ctx.strokeStyle = '#fff'
        ctx.setLineDash([10, 10])
        ctx.beginPath()
        ctx.moveTo(0, y + CELL_SIZE / 2)
        ctx.lineTo(CANVAS_WIDTH, y + CELL_SIZE / 2)
        ctx.stroke()
        ctx.setLineDash([])
      } else if (lane.type === 'water') {
        ctx.fillStyle = '#1e90ff'
        ctx.fillRect(0, y, CANVAS_WIDTH, CELL_SIZE)
      } else if (lane.type === 'home') {
        ctx.fillStyle = '#228b22'
        ctx.fillRect(0, y, CANVAS_WIDTH, CELL_SIZE)
        // Draw home slots
        homeSlots.forEach(slot => {
          ctx.fillStyle = slot.filled ? '#ffd700' : '#000080'
          ctx.fillRect(slot.x, y + 4, 40, CELL_SIZE - 8)
          if (slot.filled) {
            // Draw pod in slot
            ctx.fillStyle = '#326ce5'
            ctx.beginPath()
            ctx.arc(slot.x + 20, y + CELL_SIZE / 2, 10, 0, Math.PI * 2)
            ctx.fill()
          }
        })
      }
    })

    // Draw logs and turtles
    for (const log of logs) {
      if (log.type === 'turtle') {
        if (!log.turtleDiving) {
          ctx.fillStyle = '#228b22'
          // Draw 3 turtles in a row
          for (let i = 0; i < 3; i++) {
            ctx.beginPath()
            ctx.arc(log.x + 8 + i * 16, log.y + CELL_SIZE / 2, 7, 0, Math.PI * 2)
            ctx.fill()
          }
        }
      } else {
        ctx.fillStyle = '#8b4513'
        ctx.fillRect(log.x, log.y + 4, log.width, CELL_SIZE - 8)
        // Log texture
        ctx.strokeStyle = '#654321'
        ctx.lineWidth = 2
        for (let i = 10; i < log.width; i += 20) {
          ctx.beginPath()
          ctx.arc(log.x + i, log.y + CELL_SIZE / 2, 5, 0, Math.PI * 2)
          ctx.stroke()
        }
      }
    }

    // Draw vehicles
    for (const v of vehicles) {
      ctx.fillStyle = v.color
      ctx.fillRect(v.x, v.y + 4, v.width, CELL_SIZE - 8)
      // Wheels
      ctx.fillStyle = '#000'
      ctx.fillRect(v.x + 4, v.y + 2, 8, 4)
      ctx.fillRect(v.x + 4, v.y + CELL_SIZE - 6, 8, 4)
      ctx.fillRect(v.x + v.width - 12, v.y + 2, 8, 4)
      ctx.fillRect(v.x + v.width - 12, v.y + CELL_SIZE - 6, 8, 4)
      // Windows
      ctx.fillStyle = '#87ceeb'
      if (v.type === 'car') {
        ctx.fillRect(v.x + 10, v.y + 8, 12, 16)
      } else if (v.type === 'truck') {
        ctx.fillRect(v.x + 6, v.y + 8, 10, 16)
      } else {
        ctx.fillRect(v.x + 10, v.y + 8, 8, 16)
        ctx.fillRect(v.x + 25, v.y + 8, 8, 16)
        ctx.fillRect(v.x + 40, v.y + 8, 8, 16)
      }
    }

    // Draw player (pod)
    const p = player
    if (p.dead) {
      // Death animation - splash
      ctx.fillStyle = '#ff0000'
      const size = 10 + p.deathFrame * 2
      ctx.globalAlpha = 1 - p.deathFrame / 20
      ctx.beginPath()
      ctx.arc(p.x + PLAYER_SIZE / 2, p.y + PLAYER_SIZE / 2, size, 0, Math.PI * 2)
      ctx.fill()
      ctx.globalAlpha = 1
    } else {
      // Pod body
      ctx.fillStyle = '#326ce5'
      ctx.beginPath()
      ctx.arc(p.x + PLAYER_SIZE / 2, p.y + PLAYER_SIZE / 2, PLAYER_SIZE / 2 - 2, 0, Math.PI * 2)
      ctx.fill()
      // Pod highlight
      ctx.fillStyle = '#4a90d9'
      ctx.beginPath()
      ctx.arc(p.x + PLAYER_SIZE / 2 - 3, p.y + PLAYER_SIZE / 2 - 3, 5, 0, Math.PI * 2)
      ctx.fill()
      // Eyes
      ctx.fillStyle = '#fff'
      ctx.fillRect(p.x + 6, p.y + 8, 4, 4)
      ctx.fillRect(p.x + 14, p.y + 8, 4, 4)
    }

    // Timer bar
    ctx.fillStyle = '#333'
    ctx.fillRect(10, CANVAS_HEIGHT - 15, CANVAS_WIDTH - 20, 8)
    ctx.fillStyle = time > 20 ? '#00ff00' : time > 10 ? '#ffff00' : '#ff0000'
    ctx.fillRect(10, CANVAS_HEIGHT - 15, (CANVAS_WIDTH - 20) * (time / 60), 8)

    ctx.restore()
  }, [player, vehicles, logs, homeSlots, time, isExpanded])

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

      // Timer countdown
      if (tick % 30 === 0) {
        setTime(t => {
          if (t <= 1) {
            // Time out - lose life
            setPlayer(p => ({ ...p, dead: true, deathFrame: 0 }))
            return 60
          }
          return t - 1
        })
      }

      // Handle death animation
      if (state.player.dead) {
        setPlayer(p => {
          if (p.deathFrame >= 20) {
            // Respawn
            setLives(l => {
              if (l <= 1) {
                setGameOver(true)
                setIsPlaying(false)
                return 0
              }
              return l - 1
            })
            return {
              x: CANVAS_WIDTH / 2 - PLAYER_SIZE / 2,
              y: 9 * CELL_SIZE + 4,
              targetX: CANVAS_WIDTH / 2 - PLAYER_SIZE / 2,
              targetY: 9 * CELL_SIZE + 4,
              onLog: null,
              dead: false,
              deathFrame: 0,
            }
          }
          return { ...p, deathFrame: p.deathFrame + 1 }
        })
        draw()
        return
      }

      // Move player toward target (smooth movement)
      setPlayer(p => {
        let newX = p.x
        let newY = p.y
        const speed = 4

        if (Math.abs(p.x - p.targetX) > 1) {
          newX += Math.sign(p.targetX - p.x) * speed
        } else {
          newX = p.targetX
        }
        if (Math.abs(p.y - p.targetY) > 1) {
          newY += Math.sign(p.targetY - p.y) * speed
        } else {
          newY = p.targetY
        }

        // If on a log, move with it
        if (p.onLog !== null && state.logs[p.onLog]) {
          newX += state.logs[p.onLog].speed
          // Check if turtle is diving
          if (state.logs[p.onLog].turtleDiving) {
            return { ...p, dead: true, deathFrame: 0 }
          }
        }

        return { ...p, x: newX, y: newY }
      })

      // Move vehicles
      setVehicles(vs => vs.map(v => {
        let newX = v.x + v.speed * (1 + level * 0.1)
        // Wrap around
        if (newX > CANVAS_WIDTH) newX = -v.width
        if (newX < -v.width) newX = CANVAS_WIDTH
        return { ...v, x: newX }
      }))

      // Move logs and turtles
      setLogs(ls => ls.map(l => {
        let newX = l.x + l.speed * (1 + level * 0.05)
        // Wrap around
        if (newX > CANVAS_WIDTH) newX = -l.width
        if (newX < -l.width) newX = CANVAS_WIDTH
        // Turtle diving (random)
        let diving = l.turtleDiving
        if (l.type === 'turtle' && tick % 120 === 0 && Math.random() < 0.2) {
          diving = !diving
        }
        return { ...l, x: newX, turtleDiving: diving }
      }))

      // Check collisions
      const px = state.player.x
      const py = state.player.y
      const row = Math.floor((py + PLAYER_SIZE / 2) / CELL_SIZE)
      const lane = LANES.find(l => l.y === row)

      if (lane) {
        if (lane.type === 'road') {
          // Check vehicle collision
          for (const v of state.vehicles) {
            if (v.y === row * CELL_SIZE &&
                px + PLAYER_SIZE > v.x + 5 &&
                px < v.x + v.width - 5) {
              setPlayer(p => ({ ...p, dead: true, deathFrame: 0 }))
              break
            }
          }
        } else if (lane.type === 'water') {
          // Must be on a log
          let onLog = false
          let logIndex = -1
          for (let i = 0; i < state.logs.length; i++) {
            const l = state.logs[i]
            if (l.y === row * CELL_SIZE &&
                px + PLAYER_SIZE / 2 > l.x &&
                px + PLAYER_SIZE / 2 < l.x + l.width) {
              onLog = true
              logIndex = i
              break
            }
          }
          if (!onLog) {
            setPlayer(p => ({ ...p, dead: true, deathFrame: 0 }))
          } else {
            setPlayer(p => ({ ...p, onLog: logIndex }))
          }
        } else if (lane.type === 'home') {
          // Check if reached a home slot
          for (let i = 0; i < state.homeSlots.length; i++) {
            const slot = state.homeSlots[i]
            if (!slot.filled &&
                px + PLAYER_SIZE / 2 > slot.x &&
                px + PLAYER_SIZE / 2 < slot.x + 40) {
              // Filled a slot!
              setHomeSlots(slots => slots.map((s, idx) =>
                idx === i ? { ...s, filled: true } : s
              ))
              setScore(s => s + 200 + time * 10)
              setTime(60)
              setHighestRow(9)

              // Check if all slots filled
              const filledCount = state.homeSlots.filter(s => s.filled).length + 1
              if (filledCount >= 5) {
                setLevel(l => l + 1)
                setHomeSlots(slots => slots.map(s => ({ ...s, filled: false })))
                setScore(s => s + 1000)
              }

              // Reset player
              setPlayer({
                x: CANVAS_WIDTH / 2 - PLAYER_SIZE / 2,
                y: 9 * CELL_SIZE + 4,
                targetX: CANVAS_WIDTH / 2 - PLAYER_SIZE / 2,
                targetY: 9 * CELL_SIZE + 4,
                onLog: null,
                dead: false,
                deathFrame: 0,
              })
              break
            }
          }
          // Hit edge of home area
          if (px < 5 || px > CANVAS_WIDTH - PLAYER_SIZE - 5) {
            setPlayer(p => ({ ...p, dead: true, deathFrame: 0 }))
          }
        } else {
          setPlayer(p => ({ ...p, onLog: null }))
        }
      }

      // Bounds check
      if (state.player.x < -PLAYER_SIZE || state.player.x > CANVAS_WIDTH) {
        setPlayer(p => ({ ...p, dead: true, deathFrame: 0 }))
      }

      draw()
    }, 33)

    return () => {
      if (gameLoopRef.current) {
        clearInterval(gameLoopRef.current)
      }
    }
  }, [isPlaying, gameOver, draw, level])

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isPlaying || player.dead) return

      const { targetX, targetY } = player
      let newTargetX = targetX
      let newTargetY = targetY

      switch (e.key) {
        case 'ArrowUp':
        case 'w':
        case 'W':
          newTargetY = Math.max(0, targetY - CELL_SIZE)
          // Score for forward progress
          const newRow = Math.floor(newTargetY / CELL_SIZE)
          if (newRow < highestRow) {
            setScore(s => s + 10)
            setHighestRow(newRow)
          }
          break
        case 'ArrowDown':
        case 's':
        case 'S':
          newTargetY = Math.min((ROWS - 1) * CELL_SIZE, targetY + CELL_SIZE)
          break
        case 'ArrowLeft':
        case 'a':
        case 'A':
          newTargetX = Math.max(0, targetX - CELL_SIZE)
          break
        case 'ArrowRight':
        case 'd':
        case 'D':
          newTargetX = Math.min(CANVAS_WIDTH - PLAYER_SIZE, targetX + CELL_SIZE)
          break
        default:
          return
      }

      e.preventDefault()
      setPlayer(p => ({ ...p, targetX: newTargetX, targetY: newTargetY + 4, onLog: null }))
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isPlaying, player, highestRow])

  // Start game
  const startGame = useCallback(() => {
    initGame()
    setPlayer({
      x: CANVAS_WIDTH / 2 - PLAYER_SIZE / 2,
      y: 9 * CELL_SIZE + 4,
      targetX: CANVAS_WIDTH / 2 - PLAYER_SIZE / 2,
      targetY: 9 * CELL_SIZE + 4,
      onLog: null,
      dead: false,
      deathFrame: 0,
    })
    setScore(0)
    setLives(3)
    setLevel(1)
    setHighestRow(9)
    setTime(60)
    setGameOver(false)
    setWon(false)
    setIsPlaying(true)
  }, [initGame])

  const scale = isExpanded ? 1.4 : 1

  useEffect(() => {
    draw()
  }, [draw])

  return (
    <div className="h-full flex flex-col p-2 select-none">
      <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
        <div className="flex items-center gap-1.5">
          <ArrowUp className="w-4 h-4 text-green-400" />
          <span className="text-sm font-semibold">Pod Crosser</span>
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
            <div className="text-xl font-bold text-green-400 mb-2">POD CROSSER</div>
            <div className="text-muted-foreground mb-2 text-sm">Get pods safely home!</div>
            <div className="text-muted-foreground mb-4 text-xs">Arrow keys to move</div>
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
                <div className="text-xl font-bold text-yellow-400 mb-2">All Pods Home!</div>
              </>
            ) : (
              <div className="text-xl font-bold text-red-400 mb-2">Game Over!</div>
            )}
            <div className="text-muted-foreground mb-4">Score: {score}</div>
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
