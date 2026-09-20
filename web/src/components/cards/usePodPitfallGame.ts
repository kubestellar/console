/**
 * Game state/logic hook for the PodPitfall card: world generation, player
 * physics, vine-swinging, collectible/obstacle collision, and the game
 * loop. Canvas rendering lives in usePodPitfallRenderer.
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import { emitGameStarted, emitGameEnded } from '../../lib/analytics'
import { useGameKeyTracking } from '../../hooks/useGameKeys'
import {
  CANVAS_WIDTH, CANVAS_HEIGHT, GRAVITY, JUMP_FORCE, MOVE_SPEED,
  PIT_OFFSET_X, PIT_Y, PIT_WIDTH, NARROW_PLATFORM_WIDTH, SCREEN_COUNT,
  WIN_DISTANCE, STARTING_TIME, STARTING_LIVES, GAME_TICK_MS, STARTING_PLAYER,
  type Player, type Platform, type Obstacle, type Collectible, type Vine,
} from './podPitfall.constants'
import { usePodPitfallRenderer } from './usePodPitfallRenderer'

export function usePodPitfallGame(isExpanded: boolean) {
  const gameContainerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const gameLoopRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const keysRef = useRef<Set<string>>(new Set())

  const [player, setPlayer] = useState<Player>({ ...STARTING_PLAYER })
  const [platforms, setPlatforms] = useState<Platform[]>([])
  const [obstacles, setObstacles] = useState<Obstacle[]>([])
  const [collectibles, setCollectibles] = useState<Collectible[]>([])
  const [vines, setVines] = useState<Vine[]>([])
  const [cameraX, setCameraX] = useState(0)
  const [score, setScore] = useState(0)
  const [lives, setLives] = useState(STARTING_LIVES)
  const [time, setTime] = useState(STARTING_TIME)
  const [gameOver, setGameOver] = useState(false)
  const [won, setWon] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [distance, setDistance] = useState(0)

  const gameStateRef = useRef({ player, cameraX, platforms, obstacles, collectibles, vines })
  useEffect(() => {
    gameStateRef.current = { player, cameraX, platforms, obstacles, collectibles, vines }
  }, [player, cameraX, platforms, obstacles, collectibles, vines])

  // Generate world
  const generateWorld = () => {
    const newPlatforms: Platform[] = []
    const newObstacles: Obstacle[] = []
    const newCollectibles: Collectible[] = []
    const newVines: Vine[] = []

    // Generate platforms and content
    for (let screen = 0; screen < SCREEN_COUNT; screen++) {
      const baseX = screen * CANVAS_WIDTH

      // Ground with occasional pits
      if (Math.random() > 0.3 || screen === 0) {
        newPlatforms.push({ x: baseX, y: 160, width: CANVAS_WIDTH, type: 'ground' })
      } else {
        // Pit with crocodiles
        newPlatforms.push({ x: baseX, y: 160, width: PIT_OFFSET_X, type: 'ground' })
        newPlatforms.push({ x: baseX + PIT_OFFSET_X, y: PIT_Y, width: PIT_WIDTH, type: 'pit' })
        newPlatforms.push({ x: baseX + PIT_OFFSET_X + PIT_WIDTH, y: 160, width: PIT_OFFSET_X, type: 'ground' })
        newObstacles.push({ x: baseX + 140, y: 165, type: 'croc', direction: 1 })
      }

      // Logs to jump on
      if (Math.random() > 0.6) {
        newPlatforms.push({
          x: baseX + 80 + Math.random() * 100,
          y: 120,
          width: NARROW_PLATFORM_WIDTH,
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
        const type = ['gold', 'diamond', 'ring-3'][Math.floor(Math.random() * 3)] as Collectible['type']
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
  }

  const draw = usePodPitfallRenderer({
    canvasRef, isExpanded, player, cameraX, platforms, obstacles, collectibles, vines, score, time, distance,
  })

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
            setScore(s => { emitGameEnded('pod_pitfall', 'loss', s); return s })
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
            // eslint-disable-next-line no-useless-assignment
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
              setScore(s => { emitGameEnded('pod_pitfall', 'loss', s); return s })
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
              setScore(s => { emitGameEnded('pod_pitfall', 'loss', s); return s })
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
      if (distance >= WIN_DISTANCE) {
        setWon(true)
        setGameOver(true)
        setIsPlaying(false)
        setScore(s => {
          const finalScore = s + time * 10
          emitGameEnded('pod_pitfall', 'win', finalScore)
          return finalScore
        })
      }

      draw()
    }, GAME_TICK_MS)

    return () => {
      if (gameLoopRef.current) {
        clearInterval(gameLoopRef.current)
      }
    }
    // 'time' intentionally omitted: it is only read inside a setScore updater
    // callback and re-running this effect on every tick-down would restart
    // the interval. Behavior moved verbatim from PodPitfall.tsx.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, gameOver, draw, player.x, distance])

  // Keyboard — scoped to visible game container (KeepAlive-safe)
  useGameKeyTracking(gameContainerRef, keysRef, {
    preventDefaultKeys: ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'w', 'a', 's', 'd'] })

  // Start game
  const startGame = useCallback(() => {
    generateWorld()
    setPlayer({ ...STARTING_PLAYER })
    setCameraX(0)
    setScore(0)
    setLives(STARTING_LIVES)
    setTime(STARTING_TIME)
    setDistance(0)
    setGameOver(false)
    setWon(false)
    setIsPlaying(true)
    emitGameStarted('pod_pitfall')
  }, [])

  useEffect(() => {
    draw()
  }, [draw])

  return {
    gameContainerRef,
    canvasRef,
    score,
    lives,
    gameOver,
    won,
    isPlaying,
    distance,
    startGame,
  }
}
