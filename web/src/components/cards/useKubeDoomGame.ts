/**
 * Game state/logic hook for the KubeDoom card: player movement/collision,
 * enemy AI, shooting, scoring, and level progression. Canvas raycasting
 * rendering + the requestAnimationFrame loop live in useKubeDoomRenderer.
 */
import { useState, useRef, useCallback, useEffect } from 'react'
import { emitGameStarted, emitGameEnded } from '../../lib/analytics'
import { useGameKeys } from '../../hooks/useGameKeys'
import { safeGet, safeSet } from '../../lib/safeLocalStorage'
import {
  MAX_DEPTH, MOVE_SPEED, ROTATE_SPEED, getMap, spawnEnemies,
  KUBE_DOOM_HIGHSCORE_KEY, type Enemy, type Player, type KubeDoomGameState,
} from './kubeDoom.constants'
import { useKubeDoomRenderer } from './useKubeDoomRenderer'

export function useKubeDoomGame() {
  const gameContainerRef = useRef<HTMLDivElement>(null)
  const [gameState, setGameState] = useState<KubeDoomGameState>('idle')
  const [score, setScore] = useState(0)
  const [health, setHealth] = useState(100)
  const [ammo, setAmmo] = useState(50)
  const [level, setLevel] = useState(1)
  const [kills, setKills] = useState(0)
  const [highScore, setHighScore] = useState(() => {
    const saved = safeGet(KUBE_DOOM_HIGHSCORE_KEY)
    return saved ? parseInt(saved, 10) : 0
  })

  const playerRef = useRef<Player>({ x: 1.5, y: 1.5, angle: 0 })
  const enemiesRef = useRef<Enemy[]>([])
  const keysRef = useRef<Set<string>>(new Set())
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

  const initLevel = (lvl: number) => {
    playerRef.current = { x: 1.5, y: 1.5, angle: 0 }
    enemiesRef.current = spawnEnemies(lvl)
    totalEnemiesRef.current = enemiesRef.current.length
    setAmmo(a => a + 25)
    shootFlashRef.current = 0
    damageFlashRef.current = 0
  }

  // Shoot
  const shoot = () => {
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
  }

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
                safeSet(KUBE_DOOM_HIGHSCORE_KEY, s.toString())
              }
              emitGameEnded('kube_doom', 'loss', s)
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
  }, [level, highScore])

  const { canvasRef, render } = useKubeDoomRenderer({
    gameState, playerRef, enemiesRef, shootFlashRef, damageFlashRef, update,
  })

  // Keyboard handlers — scoped to visible game container (KeepAlive-safe)
  const handleDoomKeyDown = (e: KeyboardEvent) => {
    const key = e.key.toLowerCase()
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ', 'w', 'a', 's', 'd', 'q', 'e'].includes(key)) {
      e.preventDefault()
    }
    keysRef.current.add(key)
    if (key === ' ' && gameState === 'playing') {
      shoot()
    }
  }
  const handleDoomKeyUp = (e: KeyboardEvent) => {
    keysRef.current.delete(e.key.toLowerCase())
  }
  useGameKeys(gameContainerRef, { onKeyDown: handleDoomKeyDown, onKeyUp: handleDoomKeyUp })

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
    emitGameStarted('kube_doom')
  }

  const nextLevel = () => {
    initLevel(level)
    setGameState('playing')
  }

  const togglePause = () => {
    setGameState(s => s === 'playing' ? 'paused' : 'playing')
  }

  return {
    gameContainerRef,
    canvasRef,
    gameState,
    score,
    health,
    ammo,
    level,
    kills,
    highScore,
    totalEnemiesRef,
    startGame,
    nextLevel,
    togglePause,
  }
}
