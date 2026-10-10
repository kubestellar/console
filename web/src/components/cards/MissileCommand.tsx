import { useState, useEffect, useCallback, useRef } from 'react'
import { CardComponentProps } from './cardRegistry.types'
import { useCardExpanded } from './CardWrapper'
import { useReportCardDataState } from './CardDataContext'
import { emitGameStarted, emitGameEnded } from '../../lib/analytics'
import { drawMissileCommandScene } from './MissileCommand.draw'
import { MissileCommandHud, MissileCommandOverlays } from './MissileCommandOverlays'
import {
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  GROUND_Y,
  CITY_COUNT,
  CITY_WIDTH,
  MISSILE_BATTERY_WIDTH,
  INITIAL_AMMO,
  TOTAL_WAVES,
  ENEMY_BASE_COUNT,
  ENEMY_COUNT_INCREMENT,
  ENEMY_BASE_SPEED,
  ENEMY_SPEED_INCREMENT,
  ENEMY_SPEED_VARIANCE,
  PLAYER_MISSILE_SPEED,
  PLAYER_EXPLOSION_RADIUS,
  ENEMY_IMPACT_RADIUS,
  EXPLOSION_INITIAL_RADIUS,
  EXPLOSION_GROW_RATE,
  EXPLOSION_SHRINK_RATE,
  GAME_LOOP_MS,
  CITY_SURVIVAL_BONUS,
  MISSILE_DESTROY_POINTS,
  BATTERY_AMMO_DRAIN,
  BATTERY_HIT_RADIUS,
  TRAIL_MAX_LENGTH,
  LAUNCH_Y,
  type City,
  type MissileBattery,
  type EnemyMissile,
  type PlayerMissile,
  type Explosion,
  CITY_POSITIONS,
  BATTERY_POSITIONS,
} from './MissileCommand.constants'

export function MissileCommand(_props: CardComponentProps) {
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
    cursorPos })

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
      cursorPos }
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
        trail: [] })
    }
    setEnemyMissiles(newMissiles)
    setPlayerMissiles([])
    setExplosions([])
  }, [])

  /** Full reset — new game only. Cities and batteries are always restored here. */
  const initGame = () => {
    const newCities: City[] = CITY_POSITIONS.slice(0, CITY_COUNT).map(x => ({ x, alive: true }))
    const newBatteries: MissileBattery[] = BATTERY_POSITIONS.map(x => ({ x, ammo: INITIAL_AMMO }))
    setCities(newCities)
    setBatteries(newBatteries)
    spawnWave(1)
  }

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const scale = isExpanded ? 1.3 : 1
    drawMissileCommandScene(ctx, gameStateRef.current, scale, isPlaying)
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
              growing: true })
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
          growing: true })
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
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
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
          speed: PLAYER_MISSILE_SPEED },
      ])
    }

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current
      if (!canvas) return
      const rect = canvas.getBoundingClientRect()
      const scale = isExpanded ? 1.3 : 1
      setCursorPos({
        x: (e.clientX - rect.left) / scale,
        y: (e.clientY - rect.top) / scale })
    }

  const startGame = () => {
    setScore(0)
    setWave(1)
    setGameOver(false)
    setWon(false)
    initGame()
    setIsPlaying(true)
    emitGameStarted('missile_command')
  }

  const scale = isExpanded ? 1.3 : 1

  useEffect(() => {
    draw()
  }, [draw])

  const aliveCities = cities.filter(c => c.alive).length
  const totalAmmo = batteries.reduce((s, b) => s + b.ammo, 0)

  return (
    <div className="h-full flex flex-col p-2 select-none">
      {/* Header */}
      <MissileCommandHud
        score={score}
        wave={wave}
        aliveCities={aliveCities}
        totalAmmo={totalAmmo}
        onStartGame={startGame}
      />

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

        <MissileCommandOverlays
          isPlaying={isPlaying}
          gameOver={gameOver}
          won={won}
          score={score}
          onStartGame={startGame}
        />
      </div>
    </div>
  )
}
