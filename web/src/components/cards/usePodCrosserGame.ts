import { useState, useEffect, useCallback, useRef } from 'react'
import { emitGameStarted, emitGameEnded } from '../../lib/analytics'
import { useGameKeys } from '../../hooks/useGameKeys'
import {
  CANVAS_WIDTH, CELL_SIZE, ROWS, PLAYER_SIZE, LANES,
  createVehicles, createLogs, createHomeSlots,
  type Player, type Vehicle, type Log, type HomeSlot,
} from './PodCrosser.constants'
import { drawPodCrosserScene } from './PodCrosser.draw'

/** Game state, loop, and keyboard controls for the PodCrosser card. */
export function usePodCrosserGame(isExpanded: boolean) {
  const gameContainerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const gameLoopRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const [player, setPlayer] = useState<Player>({
    x: CANVAS_WIDTH / 2 - PLAYER_SIZE / 2,
    y: 9 * CELL_SIZE + 4,
    targetX: CANVAS_WIDTH / 2 - PLAYER_SIZE / 2,
    targetY: 9 * CELL_SIZE + 4,
    onLog: null,
    dead: false,
    deathFrame: 0 })
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
  const timeRef = useRef(time)
  useEffect(() => {
    gameStateRef.current = { player, vehicles, logs, homeSlots }
  }, [player, vehicles, logs, homeSlots])
  useEffect(() => {
    timeRef.current = time
  }, [time])

  // Initialize game objects
  const initGame = () => {
    setVehicles(createVehicles())
    setLogs(createLogs())
    setHomeSlots(createHomeSlots())
  }

  // Draw game
  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const scale = isExpanded ? 1.4 : 1
    ctx.save()
    ctx.scale(scale, scale)

    drawPodCrosserScene(ctx, { player, vehicles, logs, homeSlots, time })

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
                setScore(s => { emitGameEnded('pod_crosser', 'loss', s); return s })
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
              deathFrame: 0 }
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
              setScore(s => s + 200 + timeRef.current * 10)
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
                deathFrame: 0 })
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

  // Keyboard controls — scoped to visible game container (KeepAlive-safe)
  const handleCrosserKeyDown = (e: KeyboardEvent) => {
    if (!isPlaying || player.dead) return

    const { targetX, targetY } = player
    let newTargetX = targetX
    let newTargetY = targetY

    switch (e.key) {
      case 'ArrowUp':
      case 'w':
      case 'W': {
        newTargetY = Math.max(0, targetY - CELL_SIZE)
        // Score for forward progress
        const newRow = Math.floor(newTargetY / CELL_SIZE)
        if (newRow < highestRow) {
          setScore(s => s + 10)
          setHighestRow(newRow)
        }
        break
      }
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
    // Only add the 4px lane offset when vertical position changed
    const yOffset = newTargetY !== targetY ? 4 : 0
    setPlayer(p => ({ ...p, targetX: newTargetX, targetY: newTargetY + yOffset, onLog: null }))
  }
  useGameKeys(gameContainerRef, { onKeyDown: handleCrosserKeyDown })

  // Start game
  const startGame = () => {
    initGame()
    setPlayer({
      x: CANVAS_WIDTH / 2 - PLAYER_SIZE / 2,
      y: 9 * CELL_SIZE + 4,
      targetX: CANVAS_WIDTH / 2 - PLAYER_SIZE / 2,
      targetY: 9 * CELL_SIZE + 4,
      onLog: null,
      dead: false,
      deathFrame: 0 })
    setScore(0)
    setLives(3)
    setLevel(1)
    setHighestRow(9)
    setTime(60)
    setGameOver(false)
    setWon(false)
    setIsPlaying(true)
    emitGameStarted('pod_crosser')
  }

  useEffect(() => {
    draw()
  }, [draw])

  return {
    gameContainerRef,
    canvasRef,
    score,
    lives,
    level,
    gameOver,
    won,
    isPlaying,
    startGame,
  }
}
