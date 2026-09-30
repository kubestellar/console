import { useState, useEffect, useRef, useCallback } from 'react'

import { useCardExpanded } from './CardWrapper'
import { useReportCardDataState } from './CardDataContext'
import { emitGameStarted, emitGameEnded } from '../../lib/analytics'
import { useGameKeyTracking } from '../../hooks/useGameKeys'

import {
  ACCELERATION,
  AI_COUNT,
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  COLORS,
  COUNTDOWN_INTERVAL_MS,
  DECELERATION,
  FORWARD_ANGLE,
  FRICTION,
  KART_NAMES,
  MAX_SPEED,
  TRACK_WIDTH,
  TURN_SPEED,
  type GameState,
  type Kart,
  type PowerUp,
} from './KubeKart.constants'
import { renderKubeKartFrame } from './KubeKart.canvas'
import { KubeKartView } from './KubeKart.ViewPanel'

export function KubeKart() {
  useReportCardDataState({ hasData: true, isFailed: false, consecutiveFailures: 0, isDemoData: false })
  const { isExpanded } = useCardExpanded()
  const gameContainerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [gameState, setGameState] = useState<GameState>('idle')
  const [countdown, setCountdown] = useState(3)
  const [playerLap, setPlayerLap] = useState(1)
  const [totalLaps] = useState(3)
  const [raceTime, setRaceTime] = useState(0)
  const [position, setPosition] = useState(1)
  const [bestTime, setBestTime] = useState(() => {
    try {
      const saved = localStorage.getItem('kubeKartBestTime')
      return saved ? parseFloat(saved) : Infinity
    } catch {
      return Infinity
    }
  })

  const playerRef = useRef<Kart>({
    x: CANVAS_WIDTH / 2,
    y: CANVAS_HEIGHT - 80,
    angle: -Math.PI / 2,
    speed: 0,
    lap: 1,
    checkpoint: 0,
    isPlayer: true,
    color: COLORS.player,
    name: KART_NAMES[0] })

  const aiKartsRef = useRef<Kart[]>([])
  const aiDistancesRef = useRef<number[]>([])
  const powerUpsRef = useRef<PowerUp[]>([])
  const keysRef = useRef<Set<string>>(new Set())
  const animationRef = useRef<number>(0)
  const trackScrollRef = useRef(0)
  const checkpointsRef = useRef<number[]>([])
  const activeBoostRef = useRef(0)
  const activeShieldRef = useRef(0)
  const raceTimeRef = useRef(0)
  const bestTimeRef = useRef(bestTime)

  // Generate track checkpoints
  const initTrack = useCallback(() => {
    checkpointsRef.current = [0, 500, 1000, 1500, 2000]

    // Reset player
    playerRef.current = {
      x: CANVAS_WIDTH / 2,
      y: CANVAS_HEIGHT - 80,
      angle: -Math.PI / 2,
      speed: 0,
      lap: 1,
      checkpoint: 0,
      isPlayer: true,
      color: COLORS.player,
      name: KART_NAMES[0] }

    // Create AI karts
    const aiColors = [COLORS.ai1, COLORS.ai2, COLORS.ai3]
    aiKartsRef.current = Array.from({ length: AI_COUNT }, (_, i) => ({
      x: CANVAS_WIDTH / 2 + (i - 1) * 40,
      y: CANVAS_HEIGHT - 80 + (i + 1) * 30,
      angle: -Math.PI / 2,
      speed: 0,
      lap: 1,
      checkpoint: 0,
      isPlayer: false,
      color: aiColors[i],
      name: KART_NAMES[i + 1] }))
    // AI karts start behind the player (negative distance = behind on grid)
    aiDistancesRef.current = Array.from({ length: AI_COUNT }, (_, i) => -(i + 1) * 30)

    // Create power-ups along track
    powerUpsRef.current = []
    for (let i = 0; i < 8; i++) {
      const types: Array<'boost' | 'shield' | 'slow'> = ['boost', 'shield', 'slow']
      powerUpsRef.current.push({
        x: 80 + Math.random() * (TRACK_WIDTH - 40),
        y: -(i * 300 + 200),
        type: types[Math.floor(Math.random() * types.length)],
        collected: false })
    }

    trackScrollRef.current = 0
    activeBoostRef.current = 0
    activeShieldRef.current = 0
  }, [])

  // Get track curve at position — stable ref for render/update deps
  const getTrackCurve = useCallback((y: number): number => {
    const period = 400
    const phase = (y + trackScrollRef.current) / period
    return Math.sin(phase) * 0.3
  }, [])

  // Check if position is on track — stable ref for update deps
  const isOnTrack = useCallback((x: number): boolean => {
    const trackLeft = (CANVAS_WIDTH - TRACK_WIDTH) / 2
    const trackRight = trackLeft + TRACK_WIDTH
    return x >= trackLeft + 20 && x <= trackRight - 20
  }, [])

  // Update AI karts - drive straight at moderate speed in fixed lanes
  const updateAI = useCallback((kart: Kart, index: number) => {
    const maxAiSpeed = MAX_SPEED * (0.65 + index * 0.05)
    if (kart.speed < maxAiSpeed) {
      kart.speed += ACCELERATION * 0.6
    }

    // Always move forward (distance-based)
    aiDistancesRef.current[index] += kart.speed

    // Stay in fixed lane — drive straight, no swerving
    const laneX = CANVAS_WIDTH / 2 + (index - 1) * 35
    const diff = laneX - kart.x
    kart.x += diff * 0.05

    // Keep on track bounds
    const trackLeft = (CANVAS_WIDTH - TRACK_WIDTH) / 2 + 20
    const trackRight = trackLeft + TRACK_WIDTH - 40
    kart.x = Math.max(trackLeft, Math.min(trackRight, kart.x))

    // Face forward
    kart.angle = FORWARD_ANGLE
  }, [])

  // Game update
  const update = useCallback(() => {
    const player = playerRef.current
    const keys = keysRef.current

    // Handle input
    if (keys.has('arrowup') || keys.has('w')) {
      const maxSpd = activeBoostRef.current > 0 ? MAX_SPEED * 1.5 : MAX_SPEED
      if (player.speed < maxSpd) {
        player.speed += ACCELERATION
      }
    } else if (keys.has('arrowdown') || keys.has('s')) {
      player.speed -= DECELERATION * 2
      if (player.speed < -MAX_SPEED / 2) player.speed = -MAX_SPEED / 2
    } else {
      player.speed *= FRICTION
    }

    if (keys.has('arrowleft') || keys.has('a')) {
      player.angle -= TURN_SPEED * (player.speed > 0 ? 1 : -1)
    } else if (keys.has('arrowright') || keys.has('d')) {
      player.angle += TURN_SPEED * (player.speed > 0 ? 1 : -1)
    } else {
      // Auto-straighten when no turn keys pressed
      const angleDiff = FORWARD_ANGLE - player.angle
      if (Math.abs(angleDiff) > 0.01) {
        player.angle += angleDiff * 0.15
      } else {
        player.angle = FORWARD_ANGLE
      }
    }

    // Apply movement (mostly forward)
    player.x += Math.cos(player.angle) * player.speed * 0.3

    // Track scrolls instead of player moving up
    const forwardMovement = -Math.sin(player.angle) * player.speed
    trackScrollRef.current += forwardMovement

    // Keep player in bounds horizontally
    player.x = Math.max(20, Math.min(CANVAS_WIDTH - 20, player.x))

    // Slow down off track
    if (!isOnTrack(player.x)) {
      player.speed *= 0.92
    }

    // Update timers
    if (activeBoostRef.current > 0) activeBoostRef.current--
    if (activeShieldRef.current > 0) activeShieldRef.current--

    // Check power-up collection
    powerUpsRef.current.forEach(powerUp => {
      if (powerUp.collected) return
      const screenY = powerUp.y + trackScrollRef.current
      if (screenY > -50 && screenY < CANVAS_HEIGHT + 50) {
        const dx = player.x - (powerUp.x + (CANVAS_WIDTH - TRACK_WIDTH) / 2)
        const dy = (CANVAS_HEIGHT - 80) - screenY
        if (Math.sqrt(dx * dx + dy * dy) < 30) {
          powerUp.collected = true
          if (powerUp.type === 'boost') {
            activeBoostRef.current = 120 // 2 seconds at 60fps
          } else if (powerUp.type === 'shield') {
            activeShieldRef.current = 180 // 3 seconds
          }
          // 'slow' affects AI (simplified - just give player boost)
          if (powerUp.type === 'slow') {
            activeBoostRef.current = 60
          }
        }
      }
    })

    // Update checkpoints and laps
    const totalDistance = trackScrollRef.current
    const lapLength = 2500
    const currentLap = Math.floor(totalDistance / lapLength) + 1

    if (currentLap > player.lap) {
      player.lap = currentLap
      setPlayerLap(currentLap)

      if (currentLap > totalLaps) {
        // Race finished
        const finalTime = raceTimeRef.current
        if (finalTime < bestTimeRef.current) {
          setBestTime(finalTime)
          bestTimeRef.current = finalTime
          try {
            localStorage.setItem('kubeKartBestTime', finalTime.toString())
          } catch {
            // Ignore storage errors (e.g. private browsing, quota exceeded)
          }
        }
        setGameState('finished')
        setPosition(pos => {
          emitGameEnded('kube_kart', pos === 1 ? 'win' : 'loss', Math.round(finalTime * 100))
          return pos
        })
        return
      }
    }

    // Update AI karts
    aiKartsRef.current.forEach((kart, i) => {
      updateAI(kart, i)
      // AI lap progress based on actual distance traveled
      const aiDistance = aiDistancesRef.current[i]
      kart.lap = Math.floor(aiDistance / lapLength) + 1
    })

    // Calculate position based on distance
    const playerDistance = trackScrollRef.current
    const positions = [
      { isPlayer: true, lap: player.lap, distance: playerDistance },
      ...aiKartsRef.current.map((kart, i) => ({
        isPlayer: false,
        lap: kart.lap,
        distance: aiDistancesRef.current[i] })),
    ]
    positions.sort((a, b) => {
      if (a.lap !== b.lap) return b.lap - a.lap
      return b.distance - a.distance
    })
    const playerPos = positions.findIndex(k => k.isPlayer) + 1
    setPosition(playerPos)

  }, [isOnTrack, updateAI, totalLaps])

  // Render
  const render = useCallback(() => {
    renderKubeKartFrame({
      canvas: canvasRef.current,
      trackScroll: trackScrollRef.current,
      powerUps: powerUpsRef.current,
      aiKarts: aiKartsRef.current,
      player: playerRef.current,
      aiDistances: aiDistancesRef.current,
      activeBoostFrames: activeBoostRef.current,
      activeShieldFrames: activeShieldRef.current,
      getTrackCurve,
    })
  }, [getTrackCurve])

  // Stable refs for game loop callbacks to avoid effect restarts
  const updateRef = useRef(update)
  const renderRef = useRef(render)
  useEffect(() => { updateRef.current = update }, [update])
  useEffect(() => { renderRef.current = render }, [render])

  // Game loop
  useEffect(() => {
    if (gameState !== 'playing') return

    let lastTime = performance.now()

    const gameLoop = () => {
      const now = performance.now()
      const delta = (now - lastTime) / 1000
      lastTime = now

      raceTimeRef.current += delta
      setRaceTime(raceTimeRef.current)
      updateRef.current()
      renderRef.current()
      animationRef.current = requestAnimationFrame(gameLoop)
    }

    animationRef.current = requestAnimationFrame(gameLoop)
    return () => cancelAnimationFrame(animationRef.current)
  }, [gameState])

  // Countdown
  useEffect(() => {
    if (gameState !== 'countdown') return

    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(c => c - 1), COUNTDOWN_INTERVAL_MS)
      return () => clearTimeout(timer)
    } else {
      setGameState('playing')
    }
  }, [gameState, countdown])

  // Keyboard handlers — scoped to visible game container (KeepAlive-safe)
  useGameKeyTracking(gameContainerRef, keysRef, { lowercase: true })

  // Render initial frame
  useEffect(() => {
    if (gameState === 'idle') {
      initTrack()
      render()
    }
  }, [gameState, initTrack, render])

  const startGame = () => {
    cancelAnimationFrame(animationRef.current)
    keysRef.current.clear()
    initTrack()
    raceTimeRef.current = 0
    setRaceTime(0)
    setPlayerLap(1)
    setPosition(4)
    setCountdown(3)
    setGameState('countdown')
    emitGameStarted('kube_kart')
  }

  const togglePause = () => {
    setGameState(s => s === 'playing' ? 'paused' : 'playing')
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    const ms = Math.floor((seconds % 1) * 100)
    return `${mins}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`
  }

  return (
    <KubeKartView
      gameContainerRef={gameContainerRef}
      canvasRef={canvasRef}
      isExpanded={isExpanded}
      gameState={gameState}
      countdown={countdown}
      playerLap={playerLap}
      totalLaps={totalLaps}
      raceTime={raceTime}
      position={position}
      bestTime={bestTime}
      playerSpeed={playerRef.current.speed}
      startGame={startGame}
      togglePause={togglePause}
      formatTime={formatTime}
    />
  )

}
