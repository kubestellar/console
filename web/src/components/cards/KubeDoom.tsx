import { useState, useEffect, useRef, useCallback } from 'react'
import { Play, RotateCcw, Pause, Trophy, Target, Heart, Crosshair } from 'lucide-react'
import { useCardExpanded } from './CardWrapper'
import { useReportCardDataState } from './CardDataContext'
import { useTranslation } from 'react-i18next'

// Canvas dimensions
const CANVAS_WIDTH = 480
const CANVAS_HEIGHT = 360

// Map dimensions (grid)
const MAP_WIDTH = 16
const MAP_HEIGHT = 16

// Raycasting constants
const FOV = Math.PI / 3 // 60 degrees
const NUM_RAYS = CANVAS_WIDTH
const MAX_DEPTH = 16
const HALF_FOV = FOV / 2

// Player constants
const MOVE_SPEED = 0.06
const ROTATE_SPEED = 0.04

// Colors
const WALL_COLORS = ['#8b0000', '#006400', '#00008b', '#8b8b00']
const CEILING_COLOR = '#1a1a2e'
const FLOOR_COLOR = '#2d2d2d'

// Map: 1-4 = walls of different colors, 0 = empty
const MAP_DATA = [
  1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
  1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1,
  1, 0, 2, 2, 0, 0, 0, 0, 0, 0, 3, 3, 0, 0, 0, 1,
  1, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0, 1,
  1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 4, 0, 1,
  1, 0, 0, 0, 0, 4, 4, 0, 0, 0, 0, 0, 0, 4, 0, 1,
  1, 0, 0, 0, 0, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1,
  1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1,
  1, 0, 0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0, 0, 0, 1,
  1, 0, 3, 0, 0, 0, 0, 0, 3, 3, 3, 0, 0, 0, 0, 1,
  1, 0, 3, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0, 2, 0, 1,
  1, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 2, 0, 1,
  1, 0, 0, 0, 0, 2, 2, 0, 0, 0, 0, 4, 0, 0, 0, 1,
  1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 4, 0, 0, 0, 1,
  1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1,
  1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
]

function getMap(x: number, y: number): number {
  if (x < 0 || x >= MAP_WIDTH || y < 0 || y >= MAP_HEIGHT) return 1
  return MAP_DATA[Math.floor(y) * MAP_WIDTH + Math.floor(x)]
}

// Enemy types themed as rogue Kubernetes resources
const ENEMY_NAMES = ['CrashPod', 'OOMKiller', 'RunawayJob', 'ZombieDeploy']

interface Enemy {
  x: number
  y: number
  alive: boolean
  health: number
  type: number
  hitTimer: number
}

function spawnEnemies(level: number): Enemy[] {
  const enemies: Enemy[] = []
  const count = Math.min(4 + level * 2, 12)
  // Predefined valid spawn points (open areas on the map)
  const spawnPoints = [
    { x: 3.5, y: 7.5 }, { x: 7.5, y: 3.5 }, { x: 12.5, y: 3.5 },
    { x: 7.5, y: 7.5 }, { x: 12.5, y: 7.5 }, { x: 3.5, y: 12.5 },
    { x: 7.5, y: 12.5 }, { x: 12.5, y: 12.5 }, { x: 5.5, y: 9.5 },
    { x: 10.5, y: 5.5 }, { x: 9.5, y: 11.5 }, { x: 6.5, y: 4.5 },
  ]
  for (let i = 0; i < count && i < spawnPoints.length; i++) {
    enemies.push({
      x: spawnPoints[i].x,
      y: spawnPoints[i].y,
      alive: true,
      health: 1 + Math.floor(level / 3),
      type: i % ENEMY_NAMES.length,
      hitTimer: 0,
    })
  }
  return enemies
}

export function KubeDoom() {
  const { t: _t } = useTranslation()
  useReportCardDataState({ hasData: true, isFailed: false, consecutiveFailures: 0 })
  const { isExpanded } = useCardExpanded()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [gameState, setGameState] = useState<'idle' | 'playing' | 'paused' | 'gameover' | 'levelcomplete'>('idle')
  const [score, setScore] = useState(0)
  const [health, setHealth] = useState(100)
  const [ammo, setAmmo] = useState(50)
  const [level, setLevel] = useState(1)
  const [kills, setKills] = useState(0)
  const [highScore, setHighScore] = useState(() => {
    const saved = localStorage.getItem('kubeDoomHighScore')
    return saved ? parseInt(saved, 10) : 0
  })

  const playerRef = useRef({ x: 1.5, y: 1.5, angle: 0 })
  const enemiesRef = useRef<Enemy[]>([])
  const keysRef = useRef<Set<string>>(new Set())
  const animationRef = useRef<number>(0)
  const shootFlashRef = useRef(0)
  const damageFlashRef = useRef(0)
  const totalEnemiesRef = useRef(0)

  const initGame = useCallback(() => {
    playerRef.current = { x: 1.5, y: 1.5, angle: 0 }
    enemiesRef.current = spawnEnemies(1)
    totalEnemiesRef.current = enemiesRef.current.length
    setScore(0)
    setHealth(100)
    setAmmo(50)
    setLevel(1)
    setKills(0)
    shootFlashRef.current = 0
    damageFlashRef.current = 0
  }, [])

  const initLevel = useCallback((lvl: number) => {
    playerRef.current = { x: 1.5, y: 1.5, angle: 0 }
    enemiesRef.current = spawnEnemies(lvl)
    totalEnemiesRef.current = enemiesRef.current.length
    setAmmo(a => a + 25)
    shootFlashRef.current = 0
    damageFlashRef.current = 0
  }, [])

  // Shoot
  const shoot = useCallback(() => {
    setAmmo(a => {
      if (a <= 0) return 0
      shootFlashRef.current = 8

      const player = playerRef.current
      // Check if crosshair hits an enemy via raycasting towards center
      let closestDist = Infinity
      let closestEnemy: Enemy | null = null

      for (const enemy of enemiesRef.current) {
        if (!enemy.alive) continue
        const dx = enemy.x - player.x
        const dy = enemy.y - player.y
        const dist = Math.sqrt(dx * dx + dy * dy)
        const enemyAngle = Math.atan2(dy, dx)
        let angleDiff = enemyAngle - player.angle
        // Normalize
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2

        // Check if within crosshair (generous hitbox)
        const hitWidth = 0.3 / dist // apparent size
        if (Math.abs(angleDiff) < hitWidth + 0.05 && dist < MAX_DEPTH && dist < closestDist) {
          // Verify no wall between player and enemy
          let blocked = false
          const steps = Math.floor(dist * 4)
          for (let s = 1; s < steps; s++) {
            const t = s / steps
            const cx = player.x + dx * t
            const cy = player.y + dy * t
            if (getMap(cx, cy) > 0) { blocked = true; break }
          }
          if (!blocked) {
            closestDist = dist
            closestEnemy = enemy
          }
        }
      }

      if (closestEnemy) {
        closestEnemy.health--
        closestEnemy.hitTimer = 10
        if (closestEnemy.health <= 0) {
          closestEnemy.alive = false
          const points = (closestEnemy.type + 1) * 100
          setScore(s => s + points)
          setKills(k => k + 1)
        }
      }

      return a - 1
    })
  }, [])

  // Update
  const update = useCallback(() => {
    const keys = keysRef.current
    const player = playerRef.current

    // Timers
    if (shootFlashRef.current > 0) shootFlashRef.current--
    if (damageFlashRef.current > 0) damageFlashRef.current--

    // Rotation
    if (keys.has('arrowleft') || keys.has('a')) {
      player.angle -= ROTATE_SPEED
    }
    if (keys.has('arrowright') || keys.has('d')) {
      player.angle += ROTATE_SPEED
    }

    // Movement with collision detection
    let dx = 0, dy = 0
    if (keys.has('arrowup') || keys.has('w')) {
      dx += Math.cos(player.angle) * MOVE_SPEED
      dy += Math.sin(player.angle) * MOVE_SPEED
    }
    if (keys.has('arrowdown') || keys.has('s')) {
      dx -= Math.cos(player.angle) * MOVE_SPEED
      dy -= Math.sin(player.angle) * MOVE_SPEED
    }
    // Strafe
    if (keys.has('q')) {
      dx += Math.cos(player.angle - Math.PI / 2) * MOVE_SPEED
      dy += Math.sin(player.angle - Math.PI / 2) * MOVE_SPEED
    }
    if (keys.has('e')) {
      dx += Math.cos(player.angle + Math.PI / 2) * MOVE_SPEED
      dy += Math.sin(player.angle + Math.PI / 2) * MOVE_SPEED
    }

    const margin = 0.2
    if (getMap(player.x + dx + (dx > 0 ? margin : -margin), player.y) === 0) {
      player.x += dx
    }
    if (getMap(player.x, player.y + dy + (dy > 0 ? margin : -margin)) === 0) {
      player.y += dy
    }

    // Enemy AI: move towards player slowly
    for (const enemy of enemiesRef.current) {
      if (!enemy.alive) continue
      if (enemy.hitTimer > 0) enemy.hitTimer--

      const edx = player.x - enemy.x
      const edy = player.y - enemy.y
      const edist = Math.sqrt(edx * edx + edy * edy)

      if (edist > 0.8) {
        const espeed = 0.015 + level * 0.003
        const nx = enemy.x + (edx / edist) * espeed
        const ny = enemy.y + (edy / edist) * espeed
        if (getMap(nx, enemy.y) === 0) enemy.x = nx
        if (getMap(enemy.x, ny) === 0) enemy.y = ny
      }

      // Enemy attacks player at close range
      if (edist < 0.6) {
        const dmg = 2 + level
        setHealth(h => {
          const newH = h - dmg
          damageFlashRef.current = 8
          if (newH <= 0) {
            setScore(s => {
              if (s > highScore) {
                setHighScore(s)
                localStorage.setItem('kubeDoomHighScore', s.toString())
              }
              return s
            })
            setGameState('gameover')
            return 0
          }
          return newH
        })
      }
    }

    // Check level complete
    if (enemiesRef.current.every(e => !e.alive)) {
      setLevel(l => l + 1)
      setGameState('levelcomplete')
    }
  }, [level, highScore, shoot])

  // Render
  const render = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const player = playerRef.current

    // Ceiling
    ctx.fillStyle = CEILING_COLOR
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT / 2)
    // Floor
    ctx.fillStyle = FLOOR_COLOR
    ctx.fillRect(0, CANVAS_HEIGHT / 2, CANVAS_WIDTH, CANVAS_HEIGHT / 2)

    // Depth buffer for sprite clipping
    const depthBuffer = new Float32Array(NUM_RAYS)

    // Raycasting walls
    for (let i = 0; i < NUM_RAYS; i++) {
      const rayAngle = player.angle - HALF_FOV + (i / NUM_RAYS) * FOV

      let depth = 0
      const stepSize = 0.02
      let hitWall = 0

      while (depth < MAX_DEPTH) {
        depth += stepSize
        const testX = player.x + Math.cos(rayAngle) * depth
        const testY = player.y + Math.sin(rayAngle) * depth
        const wall = getMap(testX, testY)
        if (wall > 0) {
          hitWall = wall
          break
        }
      }

      depthBuffer[i] = depth

      // Fix fisheye
      const correctedDepth = depth * Math.cos(rayAngle - player.angle)
      const wallHeight = Math.min(CANVAS_HEIGHT, (CANVAS_HEIGHT / 2) / correctedDepth)

      // Shade based on distance
      const shade = Math.max(0, 1 - depth / MAX_DEPTH)
      const baseColor = WALL_COLORS[(hitWall - 1) % WALL_COLORS.length]
      const r = parseInt(baseColor.slice(1, 3), 16)
      const g = parseInt(baseColor.slice(3, 5), 16)
      const b = parseInt(baseColor.slice(5, 7), 16)

      ctx.fillStyle = `rgb(${Math.floor(r * shade)},${Math.floor(g * shade)},${Math.floor(b * shade)})`
      const wallTop = (CANVAS_HEIGHT - wallHeight) / 2
      ctx.fillRect(i, wallTop, 1, wallHeight)
    }

    // Render enemies as sprites
    // Sort by distance (far to near)
    const visibleEnemies = enemiesRef.current
      .filter(e => e.alive)
      .map(e => {
        const dx = e.x - player.x
        const dy = e.y - player.y
        return { ...e, dist: Math.sqrt(dx * dx + dy * dy), dx, dy }
      })
      .sort((a, b) => b.dist - a.dist)

    for (const enemy of visibleEnemies) {
      const angle = Math.atan2(enemy.dy, enemy.dx)
      let angleDiff = angle - player.angle
      while (angleDiff > Math.PI) angleDiff -= Math.PI * 2
      while (angleDiff < -Math.PI) angleDiff += Math.PI * 2

      // Only render if in FOV
      if (Math.abs(angleDiff) > HALF_FOV + 0.2) continue

      const correctedDist = enemy.dist * Math.cos(angleDiff)
      if (correctedDist < 0.3) continue

      const spriteHeight = Math.min(CANVAS_HEIGHT, (CANVAS_HEIGHT / 2) / correctedDist)
      const spriteWidth = spriteHeight * 0.6
      const screenX = (CANVAS_WIDTH / 2) + (angleDiff / HALF_FOV) * (CANVAS_WIDTH / 2)
      const screenY = (CANVAS_HEIGHT - spriteHeight) / 2

      // Check if sprite is behind a wall
      const centerCol = Math.floor(screenX)
      if (centerCol >= 0 && centerCol < NUM_RAYS && depthBuffer[centerCol] < enemy.dist - 0.1) continue

      // Sprite shade
      const shade = Math.max(0.2, 1 - enemy.dist / MAX_DEPTH)
      const isHit = enemy.hitTimer > 0

      // Draw enemy body
      const enemyColors = ['#ff4444', '#ff8800', '#aa44ff', '#44ff88']
      const baseR = isHit ? 255 : parseInt(enemyColors[enemy.type % 4].slice(1, 3), 16)
      const baseG = isHit ? 255 : parseInt(enemyColors[enemy.type % 4].slice(3, 5), 16)
      const baseB = isHit ? 255 : parseInt(enemyColors[enemy.type % 4].slice(5, 7), 16)

      // Body
      ctx.fillStyle = `rgb(${Math.floor(baseR * shade)},${Math.floor(baseG * shade)},${Math.floor(baseB * shade)})`
      ctx.fillRect(screenX - spriteWidth / 2, screenY + spriteHeight * 0.2, spriteWidth, spriteHeight * 0.6)

      // Head
      ctx.beginPath()
      ctx.arc(screenX, screenY + spriteHeight * 0.2, spriteWidth * 0.35, 0, Math.PI * 2)
      ctx.fill()

      // Eyes (red glow)
      const eyeR = Math.max(2, spriteWidth * 0.08)
      ctx.fillStyle = `rgb(${Math.floor(255 * shade)},${Math.floor(50 * shade)},${Math.floor(50 * shade)})`
      ctx.beginPath()
      ctx.arc(screenX - spriteWidth * 0.12, screenY + spriteHeight * 0.15, eyeR, 0, Math.PI * 2)
      ctx.arc(screenX + spriteWidth * 0.12, screenY + spriteHeight * 0.15, eyeR, 0, Math.PI * 2)
      ctx.fill()

      // K8s icon on body (cube shape)
      if (spriteWidth > 20) {
        const iconSize = spriteWidth * 0.2
        ctx.strokeStyle = `rgba(255,255,255,${shade * 0.7})`
        ctx.lineWidth = 1
        const ix = screenX - iconSize / 2
        const iy = screenY + spriteHeight * 0.4
        // Simple cube/container icon
        ctx.strokeRect(ix, iy, iconSize, iconSize)
        ctx.beginPath()
        ctx.moveTo(ix, iy)
        ctx.lineTo(ix + iconSize * 0.3, iy - iconSize * 0.3)
        ctx.lineTo(ix + iconSize * 1.3, iy - iconSize * 0.3)
        ctx.lineTo(ix + iconSize, iy)
        ctx.stroke()
      }
    }

    // Shoot flash
    if (shootFlashRef.current > 0) {
      ctx.fillStyle = `rgba(255, 200, 50, ${shootFlashRef.current / 8 * 0.3})`
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)
    }

    // Damage flash
    if (damageFlashRef.current > 0) {
      ctx.fillStyle = `rgba(255, 0, 0, ${damageFlashRef.current / 8 * 0.4})`
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)
    }

    // Crosshair
    ctx.strokeStyle = '#00ff00'
    ctx.lineWidth = 2
    const cx = CANVAS_WIDTH / 2
    const cy = CANVAS_HEIGHT / 2
    ctx.beginPath()
    ctx.moveTo(cx - 12, cy)
    ctx.lineTo(cx - 4, cy)
    ctx.moveTo(cx + 4, cy)
    ctx.lineTo(cx + 12, cy)
    ctx.moveTo(cx, cy - 12)
    ctx.lineTo(cx, cy - 4)
    ctx.moveTo(cx, cy + 4)
    ctx.lineTo(cx, cy + 12)
    ctx.stroke()

    // Weapon at bottom
    const weaponShake = shootFlashRef.current > 0 ? -5 : 0
    ctx.fillStyle = '#555'
    ctx.fillRect(CANVAS_WIDTH / 2 - 15, CANVAS_HEIGHT - 60 + weaponShake, 30, 60)
    ctx.fillStyle = '#333'
    ctx.fillRect(CANVAS_WIDTH / 2 - 8, CANVAS_HEIGHT - 80 + weaponShake, 16, 25)
    // Muzzle flash
    if (shootFlashRef.current > 4) {
      ctx.fillStyle = '#ffdd44'
      ctx.beginPath()
      ctx.arc(CANVAS_WIDTH / 2, CANVAS_HEIGHT - 85 + weaponShake, 10, 0, Math.PI * 2)
      ctx.fill()
    }

    // Minimap
    const mmScale = 4
    const mmOffX = CANVAS_WIDTH - MAP_WIDTH * mmScale - 8
    const mmOffY = 8
    ctx.fillStyle = 'rgba(0,0,0,0.6)'
    ctx.fillRect(mmOffX - 2, mmOffY - 2, MAP_WIDTH * mmScale + 4, MAP_HEIGHT * mmScale + 4)

    for (let y = 0; y < MAP_HEIGHT; y++) {
      for (let x = 0; x < MAP_WIDTH; x++) {
        const wall = getMap(x, y)
        if (wall > 0) {
          ctx.fillStyle = WALL_COLORS[(wall - 1) % WALL_COLORS.length]
          ctx.fillRect(mmOffX + x * mmScale, mmOffY + y * mmScale, mmScale, mmScale)
        }
      }
    }

    // Player on minimap
    ctx.fillStyle = '#00ff00'
    ctx.beginPath()
    ctx.arc(mmOffX + player.x * mmScale, mmOffY + player.y * mmScale, 2, 0, Math.PI * 2)
    ctx.fill()
    // Direction line
    ctx.strokeStyle = '#00ff00'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(mmOffX + player.x * mmScale, mmOffY + player.y * mmScale)
    ctx.lineTo(
      mmOffX + (player.x + Math.cos(player.angle) * 1.5) * mmScale,
      mmOffY + (player.y + Math.sin(player.angle) * 1.5) * mmScale
    )
    ctx.stroke()

    // Enemies on minimap
    for (const enemy of enemiesRef.current) {
      if (!enemy.alive) continue
      ctx.fillStyle = '#ff4444'
      ctx.beginPath()
      ctx.arc(mmOffX + enemy.x * mmScale, mmOffY + enemy.y * mmScale, 1.5, 0, Math.PI * 2)
      ctx.fill()
    }
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
      const key = e.key.toLowerCase()
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ', 'w', 'a', 's', 'd', 'q', 'e'].includes(key)) {
        e.preventDefault()
      }
      keysRef.current.add(key)
      if (key === ' ' && gameState === 'playing') {
        shoot()
      }
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
  }, [gameState, shoot])

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
    initLevel(level)
    setGameState('playing')
  }

  const togglePause = () => {
    setGameState(s => s === 'playing' ? 'paused' : 'playing')
  }

  return (
    <div className="h-full flex flex-col">
      <div className={`flex flex-col items-center gap-3 ${isExpanded ? 'flex-1 min-h-0' : ''}`}>
        {/* Stats bar */}
        <div className="flex items-center justify-between w-full max-w-[480px] text-sm">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1">
              <Target className="w-4 h-4 text-cyan-400" />
              <span className="font-bold">{score}</span>
            </div>
            <div className="flex items-center gap-1">
              <Crosshair className="w-4 h-4 text-yellow-400" />
              <span>Lv.{level}</span>
            </div>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              {kills}/{totalEnemiesRef.current}
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1">
              <Heart className="w-4 h-4 text-red-400 fill-red-400" />
              <span className={health <= 25 ? 'text-red-400 font-bold' : ''}>{health}%</span>
            </div>
            <div className="flex items-center gap-1 text-xs">
              <span className={ammo <= 5 ? 'text-red-400' : 'text-muted-foreground'}>
                {ammo} ammo
              </span>
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
            style={isExpanded ? { width: '100%', height: '100%', objectFit: 'contain' } : undefined}
            tabIndex={0}
          />

          {/* Overlays */}
          {gameState === 'idle' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 rounded">
              <h3 className="text-3xl font-bold text-red-500 mb-1 tracking-wider" style={{ fontFamily: 'monospace' }}>KUBE DOOM</h3>
              <p className="text-xs text-muted-foreground mb-1">Eliminate rogue Kubernetes resources</p>
              <p className="text-xs text-muted-foreground mb-4">WASD/Arrows to move, Q/E strafe, Space to shoot</p>
              <button
                onClick={startGame}
                className="flex items-center gap-2 px-4 py-2 bg-red-700 hover:bg-red-800 rounded text-white"
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
                className="flex items-center gap-2 px-4 py-2 bg-red-700 hover:bg-red-800 rounded text-white"
              >
                <Play className="w-4 h-4" />
                Resume
              </button>
            </div>
          )}

          {gameState === 'levelcomplete' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 rounded">
              <Crosshair className="w-12 h-12 text-green-400 mb-2" />
              <h3 className="text-2xl font-bold text-green-400 mb-2">Level {level - 1} Clear!</h3>
              <p className="text-sm text-muted-foreground mb-1">All rogue resources eliminated</p>
              <p className="text-lg text-white mb-4">Score: {score}</p>
              <button
                onClick={nextLevel}
                className="flex items-center gap-2 px-4 py-2 bg-red-700 hover:bg-red-800 rounded text-white"
              >
                <Play className="w-4 h-4" />
                Level {level}
              </button>
            </div>
          )}

          {gameState === 'gameover' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 rounded">
              <h3 className="text-2xl font-bold text-red-400 mb-2">TERMINATED</h3>
              <p className="text-sm text-muted-foreground mb-1">The rogue resources got you</p>
              <p className="text-lg text-white mb-1">Score: {score}</p>
              <p className="text-sm text-muted-foreground mb-1">Level {level} | {kills} eliminated</p>
              {score === highScore && score > 0 && (
                <p className="text-sm text-yellow-400 mb-4">New High Score!</p>
              )}
              <button
                onClick={startGame}
                className="flex items-center gap-2 px-4 py-2 bg-red-700 hover:bg-red-800 rounded text-white"
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
