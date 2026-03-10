import { useState, useEffect, useCallback, useRef } from 'react'
import { RotateCcw, Trophy, Crosshair } from 'lucide-react'
import { CardComponentProps } from './cardRegistry'
import { useCardExpanded } from './CardWrapper'
import { useReportCardDataState } from './CardDataContext'
import { useTranslation } from 'react-i18next'
import { emitGameStarted, emitGameEnded } from '../../lib/analytics'

// Game constants
const CANVAS_WIDTH = 320
const CANVAS_HEIGHT = 300
const GROUND_Y = CANVAS_HEIGHT - 20
const CITY_COUNT = 6
const CITY_WIDTH = 24
const MISSILE_BATTERY_WIDTH = 18
const INITIAL_AMMO = 10
const TOTAL_WAVES = 5
const ENEMY_BASE_COUNT = 4
const ENEMY_COUNT_INCREMENT = 2
const ENEMY_BASE_SPEED = 0.4
const ENEMY_SPEED_INCREMENT = 0.1
const ENEMY_SPEED_VARIANCE = 0.2
const PLAYER_MISSILE_SPEED = 5
const PLAYER_EXPLOSION_RADIUS = 30
const ENEMY_IMPACT_RADIUS = 20
const EXPLOSION_INITIAL_RADIUS = 2
const EXPLOSION_GROW_RATE = 1.5
const EXPLOSION_SHRINK_RATE = 1
const GAME_LOOP_MS = 33
const CITY_SURVIVAL_BONUS = 50
const MISSILE_DESTROY_POINTS = 10
const BATTERY_AMMO_DRAIN = 3
const BATTERY_HIT_RADIUS = 5
const TRAIL_MAX_LENGTH = 20
const STAR_COUNT = 40
const LAUNCH_Y = GROUND_Y - 14

interface City {
  x: number
  alive: boolean
}

interface MissileBattery {
  x: number
  ammo: number
}

interface EnemyMissile {
  id: number
  x: number
  y: number
  targetX: number
  targetY: number
  speed: number
  trail: Array<{ x: number; y: number }>
}

interface PlayerMissile {
  id: number
  x: number
  y: number
  targetX: number
  targetY: number
  speed: number
}

interface Explosion {
  id: number
  x: number
  y: number
  radius: number
  maxRadius: number
  growing: boolean
}

// Initial city positions (fixed layout, avoid battery positions)
const CITY_POSITIONS = [40, 80, 120, 200, 240, 280]

// Initial battery positions (symmetric)
const BATTERY_POSITIONS = [10, CANVAS_WIDTH / 2 - MISSILE_BATTERY_WIDTH / 2, CANVAS_WIDTH - 10 - MISSILE_BATTERY_WIDTH]

export function MissileCommand(_props: CardComponentProps) {
  const { t: _t } = useTranslation()
  useReportCardDataState({ hasData: true, isFailed: false, consecutiveFailures: 0, isDemoData: false })
  const { isExpanded } = useCardExpanded()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const gameLoopRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const animFrameRef = useRef<number>(0)
  // Instance-local ID counter — safe for HMR and multiple simultaneous instances
  const nextIdRef = useRef(0)

  const [cities, setCities] = useState<City[]>([])
  const [batteries, setBatteries] = useState<MissileBattery[]>([])
  const [enemyMissiles, setEnemyMissiles] = useState<EnemyMissile[]>([])
  const [playerMissiles, setPlayerMissiles] = useState<PlayerMissile[]>([])
  const [explosions, setExplosions] = useState<Explosion[]>([])
  const [score, setScore] = useState(0)
  const [wave, setWave] = useState(1)
  const [gameOver, setGameOver] = useState(false)
  const [won, setWon] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [cursorPos, setCursorPos] = useState({ x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT / 2 })

  const gameStateRef = useRef({
    cities,
    batteries,
    enemyMissiles,
    playerMissiles,
    explosions,
    score,
    wave,
    gameOver,
    cursorPos,
  })

  useEffect(() => {
    gameStateRef.current = {
      cities,
      batteries,
      enemyMissiles,
      playerMissiles,
      explosions,
      score,
      wave,
      gameOver,
      cursorPos,
    }
  }, [cities, batteries, enemyMissiles, playerMissiles, explosions, score, wave, gameOver, cursorPos])

  /** Spawn a new wave of enemy missiles without touching city/battery state. */
  const spawnWave = useCallback((waveNum: number) => {
    const count = ENEMY_BASE_COUNT + waveNum * ENEMY_COUNT_INCREMENT
    const newMissiles: EnemyMissile[] = []
    for (let i = 0; i < count; i++) {
      const tx = 20 + Math.random() * (CANVAS_WIDTH - 40)
      newMissiles.push({
        id: nextIdRef.current++,
        x: Math.random() * CANVAS_WIDTH,
        y: 0,
        targetX: tx,
        targetY: GROUND_Y - 4,
        speed: ENEMY_BASE_SPEED + waveNum * ENEMY_SPEED_INCREMENT + Math.random() * ENEMY_SPEED_VARIANCE,
        trail: [],
      })
    }
    setEnemyMissiles(newMissiles)
    setPlayerMissiles([])
    setExplosions([])
  }, [])

  /** Full reset — new game only. Cities and batteries are always restored here. */
  const initGame = useCallback(() => {
    const newCities: City[] = CITY_POSITIONS.slice(0, CITY_COUNT).map(x => ({ x, alive: true }))
    const newBatteries: MissileBattery[] = BATTERY_POSITIONS.map(x => ({ x, ammo: INITIAL_AMMO }))
    setCities(newCities)
    setBatteries(newBatteries)
    spawnWave(1)
  }, [spawnWave])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const scale = isExpanded ? 1.3 : 1
    ctx.save()
    ctx.scale(scale, scale)

    // Background — dark sky
    ctx.fillStyle = '#050510'
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)

    // Stars
    ctx.fillStyle = 'rgba(255,255,255,0.5)'
    for (let i = 0; i < STAR_COUNT; i++) {
      ctx.fillRect((i * 53 + 7) % CANVAS_WIDTH, (i * 37 + 11) % (CANVAS_HEIGHT - 30), 1, 1)
    }

    const state = gameStateRef.current

    // Enemy missile trails + heads
    for (const m of state.enemyMissiles) {
      ctx.strokeStyle = 'rgba(255,80,80,0.4)'
      ctx.lineWidth = 1
      ctx.beginPath()
      if (m.trail.length > 0) {
        ctx.moveTo(m.trail[0].x, m.trail[0].y)
        for (const pt of m.trail) ctx.lineTo(pt.x, pt.y)
      }
      ctx.stroke()
      ctx.fillStyle = '#ff4040'
      ctx.beginPath()
      ctx.arc(m.x, m.y, 3, 0, Math.PI * 2)
      ctx.fill()
    }

    // Player missiles
    for (const m of state.playerMissiles) {
      ctx.fillStyle = '#40cfff'
      ctx.beginPath()
      ctx.arc(m.x, m.y, 2, 0, Math.PI * 2)
      ctx.fill()
    }

    // Explosions
    for (const ex of state.explosions) {
      const alpha = ex.growing ? 0.8 : (1 - ex.radius / ex.maxRadius) * 0.6
      const gradient = ctx.createRadialGradient(ex.x, ex.y, 0, ex.x, ex.y, ex.radius)
      gradient.addColorStop(0, `rgba(255,220,80,${alpha})`)
      gradient.addColorStop(0.5, `rgba(255,100,20,${alpha * 0.7})`)
      gradient.addColorStop(1, `rgba(255,40,0,0)`)
      ctx.fillStyle = gradient
      ctx.beginPath()
      ctx.arc(ex.x, ex.y, ex.radius, 0, Math.PI * 2)
      ctx.fill()
    }

    // Ground
    ctx.fillStyle = '#3a6640'
    ctx.fillRect(0, GROUND_Y, CANVAS_WIDTH, CANVAS_HEIGHT - GROUND_Y)

    // Cities — represented as little buildings
    for (const city of state.cities) {
      if (!city.alive) continue
      ctx.fillStyle = '#5bc4f5'
      ctx.fillRect(city.x - CITY_WIDTH / 2, GROUND_Y - 14, CITY_WIDTH, 14)
      ctx.fillStyle = '#7ad9ff'
      ctx.fillRect(city.x - CITY_WIDTH / 2 + 2, GROUND_Y - 18, CITY_WIDTH - 4, 5)
      ctx.fillStyle = '#ffeb80'
      for (let w = 0; w < 3; w++) {
        ctx.fillRect(city.x - CITY_WIDTH / 2 + 4 + w * 6, GROUND_Y - 11, 4, 4)
      }
      ctx.fillStyle = '#7ad9ff'
      ctx.font = '7px monospace'
      ctx.textAlign = 'center'
      ctx.fillText('⬡', city.x, GROUND_Y - 2)
    }

    // Missile batteries
    for (const batt of state.batteries) {
      if (batt.ammo <= 0) {
        ctx.fillStyle = '#444'
        ctx.fillRect(batt.x, GROUND_Y - 10, MISSILE_BATTERY_WIDTH, 10)
        continue
      }
      ctx.fillStyle = '#a0a0a0'
      ctx.fillRect(batt.x, GROUND_Y - 8, MISSILE_BATTERY_WIDTH, 8)
      ctx.fillStyle = '#d0d0d0'
      ctx.fillRect(batt.x + 6, GROUND_Y - 14, 6, 8)
      for (let a = 0; a < Math.min(batt.ammo, INITIAL_AMMO); a++) {
        ctx.fillStyle = a < batt.ammo ? '#40cfff' : '#333'
        ctx.fillRect(batt.x + (a % 5) * 3, GROUND_Y - 8 + Math.floor(a / 5) * 4, 2, 3)
      }
    }

    // Crosshair cursor
    if (isPlaying) {
      const cx = state.cursorPos.x
      const cy = state.cursorPos.y
      ctx.strokeStyle = 'rgba(255,255,255,0.7)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(cx - 10, cy)
      ctx.lineTo(cx + 10, cy)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(cx, cy - 10)
      ctx.lineTo(cx, cy + 10)
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(cx, cy, 6, 0, Math.PI * 2)
      ctx.stroke()
    }

    ctx.restore()
  }, [isExpanded, isPlaying])

  // Game loop
  useEffect(() => {
    if (!isPlaying || gameOver) {
      if (gameLoopRef.current) {
        clearInterval(gameLoopRef.current)
        gameLoopRef.current = null
      }
      return
    }

    gameLoopRef.current = setInterval(() => {
      const state = gameStateRef.current

      // ── Step 1: Advance player missiles; collect new explosions from arrivals ──
      const newExplosionsFromMissiles: Explosion[] = []
      const updatedPlayerMissiles = state.playerMissiles
        .map(m => {
          const dx = m.targetX - m.x
          const dy = m.targetY - m.y
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (dist < PLAYER_MISSILE_SPEED) {
            newExplosionsFromMissiles.push({
              id: nextIdRef.current++,
              x: m.targetX,
              y: m.targetY,
              radius: EXPLOSION_INITIAL_RADIUS,
              maxRadius: PLAYER_EXPLOSION_RADIUS,
              growing: true,
            })
            return null
          }
          return { ...m, x: m.x + (dx / dist) * PLAYER_MISSILE_SPEED, y: m.y + (dy / dist) * PLAYER_MISSILE_SPEED }
        })
        .filter(Boolean) as PlayerMissile[]

      // ── Step 2: Advance existing explosions + append newly created ones ──
      const updatedExplosions: Explosion[] = [
        ...state.explosions
          .map(ex => {
            if (ex.growing) {
              const newR = ex.radius + EXPLOSION_GROW_RATE
              if (newR >= ex.maxRadius) return { ...ex, radius: ex.maxRadius, growing: false }
              return { ...ex, radius: newR }
            }
            const newR = ex.radius - EXPLOSION_SHRINK_RATE
            if (newR <= 0) return null
            return { ...ex, radius: newR }
          })
          .filter(Boolean) as Explosion[],
        ...newExplosionsFromMissiles,
      ]

      // ── Step 3: Move enemy missiles; check explosion collisions and ground impact
      //    in a single pass so newly-created explosions can intercept this tick ──
      let scoreDelta = 0
      const groundImpactMissiles: EnemyMissile[] = []

      const updatedEnemyMissiles = state.enemyMissiles
        .map(m => {
          const dx = m.targetX - m.x
          const dy = m.targetY - m.y
          const dist = Math.sqrt(dx * dx + dy * dy)
          // Reached ground target
          if (dist < m.speed + 1) {
            groundImpactMissiles.push(m)
            return null
          }
          const nx = m.x + (dx / dist) * m.speed
          const ny = m.y + (dy / dist) * m.speed
          const newTrail = [...m.trail, { x: m.x, y: m.y }].slice(-TRAIL_MAX_LENGTH)
          // Check explosion collision against this tick's full explosion list
          for (const ex of updatedExplosions) {
            const exDx = nx - ex.x
            const exDy = ny - ex.y
            if (Math.sqrt(exDx * exDx + exDy * exDy) < ex.radius) {
              scoreDelta += MISSILE_DESTROY_POINTS
              return null
            }
          }
          return { ...m, x: nx, y: ny, trail: newTrail }
        })
        .filter(Boolean) as EnemyMissile[]

      // ── Step 4: Apply ground-impact side effects to cities and batteries ──
      let updatedCities = state.cities
      let updatedBatteries = state.batteries

      for (const m of groundImpactMissiles) {
        updatedExplosions.push({
          id: nextIdRef.current++,
          x: m.targetX,
          y: m.targetY,
          radius: EXPLOSION_INITIAL_RADIUS,
          maxRadius: ENEMY_IMPACT_RADIUS,
          growing: true,
        })
        updatedCities = updatedCities.map(c => {
          if (!c.alive) return c
          if (Math.abs(c.x - m.targetX) < CITY_WIDTH) return { ...c, alive: false }
          return c
        })
        updatedBatteries = updatedBatteries.map(b => {
          const bDx = b.x + MISSILE_BATTERY_WIDTH / 2 - m.targetX
          if (Math.abs(bDx) < MISSILE_BATTERY_WIDTH + BATTERY_HIT_RADIUS && b.ammo > 0) {
            return { ...b, ammo: Math.max(0, b.ammo - BATTERY_AMMO_DRAIN) }
          }
          return b
        })
      }

      // ── Step 5: Commit all state in one batch ──
      setPlayerMissiles(updatedPlayerMissiles)
      setExplosions(updatedExplosions)
      setEnemyMissiles(updatedEnemyMissiles)
      // Cities and batteries only change when ground impacts occur
      if (groundImpactMissiles.length > 0) {
        setCities(updatedCities)
        setBatteries(updatedBatteries)
      }
      if (scoreDelta > 0) setScore(s => s + scoreDelta)

      // ── Step 6: Win / loss checks against this tick's computed state ──
      const aliveCitiesCount = updatedCities.filter(c => c.alive).length
      if (aliveCitiesCount === 0) {
        setGameOver(true)
        setIsPlaying(false)
        emitGameEnded('missile_command', 'loss', state.score + scoreDelta)
        return
      }

      if (updatedEnemyMissiles.length === 0) {
        if (state.wave >= TOTAL_WAVES) {
          setWon(true)
          setGameOver(true)
          setIsPlaying(false)
          emitGameEnded('missile_command', 'win', state.score + scoreDelta)
        } else {
          // Cities persist across waves — only spawn fresh missiles and reset batteries
          const nextWave = state.wave + 1
          setScore(s => s + aliveCitiesCount * CITY_SURVIVAL_BONUS)
          setWave(nextWave)
          setBatteries(BATTERY_POSITIONS.map(x => ({ x, ammo: INITIAL_AMMO })))
          spawnWave(nextWave)
        }
      }

      draw()
    }, GAME_LOOP_MS)

    return () => {
      if (gameLoopRef.current) clearInterval(gameLoopRef.current)
    }
  }, [isPlaying, gameOver, draw, spawnWave])

  // Animation frame for smooth drawing when not playing
  useEffect(() => {
    if (!isPlaying) {
      animFrameRef.current = requestAnimationFrame(draw)
      return () => cancelAnimationFrame(animFrameRef.current)
    }
  }, [isPlaying, draw])

  // Mouse / touch interaction for firing
  const handleCanvasClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!isPlaying || gameOver) return
      const canvas = canvasRef.current
      if (!canvas) return
      const rect = canvas.getBoundingClientRect()
      const scale = isExpanded ? 1.3 : 1
      const clickX = (e.clientX - rect.left) / scale
      const clickY = (e.clientY - rect.top) / scale

      // Find nearest battery with ammo
      const state = gameStateRef.current
      let bestBatt: MissileBattery | null = null
      let bestDist = Infinity
      for (const batt of state.batteries) {
        if (batt.ammo <= 0) continue
        const bx = batt.x + MISSILE_BATTERY_WIDTH / 2
        const d = Math.abs(bx - clickX)
        if (d < bestDist) {
          bestDist = d
          bestBatt = batt
        }
      }

      if (!bestBatt) return

      const launchX = bestBatt.x + MISSILE_BATTERY_WIDTH / 2
      const battX = bestBatt.x

      setBatteries(bs => bs.map(b => (b.x === battX ? { ...b, ammo: b.ammo - 1 } : b)))
      setPlayerMissiles(ms => [
        ...ms,
        {
          id: nextIdRef.current++,
          x: launchX,
          y: LAUNCH_Y,
          targetX: clickX,
          targetY: clickY,
          speed: PLAYER_MISSILE_SPEED,
        },
      ])
    },
    [isPlaying, gameOver, isExpanded]
  )

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current
      if (!canvas) return
      const rect = canvas.getBoundingClientRect()
      const scale = isExpanded ? 1.3 : 1
      setCursorPos({
        x: (e.clientX - rect.left) / scale,
        y: (e.clientY - rect.top) / scale,
      })
    },
    [isExpanded]
  )

  const startGame = useCallback(() => {
    setScore(0)
    setWave(1)
    setGameOver(false)
    setWon(false)
    initGame()
    setIsPlaying(true)
    emitGameStarted('missile_command')
  }, [initGame])

  const scale = isExpanded ? 1.3 : 1

  useEffect(() => {
    draw()
  }, [draw])

  const aliveCities = cities.filter(c => c.alive).length
  const totalAmmo = batteries.reduce((s, b) => s + b.ammo, 0)

  return (
    <div className="h-full flex flex-col p-2 select-none">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
        <div className="flex items-center gap-1.5">
          <Crosshair className="w-4 h-4 text-red-400" />
          <span className="text-sm font-semibold">Missile Command</span>
        </div>

        <div className="flex items-center gap-3 text-xs">
          <div className="text-center">
            <div className="text-muted-foreground">Score</div>
            <div className="font-bold text-foreground">{score}</div>
          </div>
          <div className="text-center">
            <div className="text-muted-foreground">Wave</div>
            <div className="font-bold text-orange-400">{wave}/{TOTAL_WAVES}</div>
          </div>
          <div className="text-center">
            <div className="text-muted-foreground">Cities</div>
            <div className="font-bold text-blue-400">{aliveCities}</div>
          </div>
          <div className="text-center">
            <div className="text-muted-foreground">Ammo</div>
            <div className="font-bold text-cyan-400">{totalAmmo}</div>
          </div>
        </div>

        <button
          onClick={startGame}
          className="p-2 rounded hover:bg-secondary min-h-11 min-w-11 flex items-center justify-center"
          title="New Game"
        >
          <RotateCcw className="w-4 h-4" />
        </button>
      </div>

      {/* Game area */}
      <div className="flex-1 flex items-center justify-center relative">
        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH * scale}
          height={CANVAS_HEIGHT * scale}
          className="border border-border rounded cursor-crosshair"
          onClick={handleCanvasClick}
          onMouseMove={handleMouseMove}
        />

        {/* Start overlay */}
        {!isPlaying && !gameOver && (
          <div className="absolute inset-0 bg-background/80 flex items-center justify-center rounded-lg">
            <div className="text-center px-4">
              <div className="text-xl font-bold text-red-400 mb-1">MISSILE COMMAND</div>
              <div className="text-muted-foreground mb-1 text-sm">Defend your Kubernetes clusters!</div>
              <div className="text-muted-foreground mb-4 text-xs">Click to fire interceptors at incoming missiles</div>
              <button
                onClick={startGame}
                className="px-6 py-3 bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 font-semibold"
              >
                Start Game
              </button>
            </div>
          </div>
        )}

        {/* Game over overlay */}
        {gameOver && (
          <div className="absolute inset-0 bg-background/80 flex items-center justify-center rounded-lg">
            <div className="text-center">
              {won ? (
                <>
                  <Trophy className="w-12 h-12 text-yellow-400 mx-auto mb-3" />
                  <div className="text-xl font-bold text-yellow-400 mb-2">Cluster Defended!</div>
                </>
              ) : (
                <div className="text-xl font-bold text-red-400 mb-2">Cluster Destroyed!</div>
              )}
              <div className="text-muted-foreground mb-4">Score: {score}</div>
              <button
                onClick={startGame}
                className="px-6 py-3 bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 font-semibold"
              >
                Play Again
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
