import { useState, useEffect, useRef, useCallback } from 'react'
import { CardWrapper } from './CardWrapper'
import { Play, RotateCcw, Pause, Trophy, Flag, Timer, Gauge } from 'lucide-react'

// Game constants
const CANVAS_WIDTH = 400
const CANVAS_HEIGHT = 500
const KART_WIDTH = 24
const KART_HEIGHT = 36
const TRACK_WIDTH = 280
const MAX_SPEED = 8
const ACCELERATION = 0.15
const DECELERATION = 0.08
const TURN_SPEED = 0.06
const FRICTION = 0.98
const AI_COUNT = 3

// Track segments (y position, curve direction: -1 left, 0 straight, 1 right)
// TrackSegment interface reserved for future level variety

// Kart interface
interface Kart {
  x: number
  y: number
  angle: number
  speed: number
  lap: number
  checkpoint: number
  isPlayer: boolean
  color: string
  name: string
}

// Power-up interface
interface PowerUp {
  x: number
  y: number
  type: 'boost' | 'shield' | 'slow'
  collected: boolean
}

// Colors
const COLORS = {
  track: '#333',
  trackEdge: '#ff0000',
  grass: '#228b22',
  player: '#3b82f6',
  ai1: '#ef4444',
  ai2: '#22c55e',
  ai3: '#f59e0b',
  boost: '#00ffff',
  shield: '#ff00ff',
  slow: '#ff6600',
}

// Kubernetes-themed kart names
const KART_NAMES = ['Pod Racer', 'Node Runner', 'Cluster Cruiser', 'Service Sprinter']

export function KubeKart() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [gameState, setGameState] = useState<'idle' | 'countdown' | 'playing' | 'paused' | 'finished'>('idle')
  const [countdown, setCountdown] = useState(3)
  const [playerLap, setPlayerLap] = useState(1)
  const [totalLaps] = useState(3)
  const [raceTime, setRaceTime] = useState(0)
  const [position, setPosition] = useState(1)
  const [bestTime, setBestTime] = useState(() => {
    const saved = localStorage.getItem('kubeKartBestTime')
    return saved ? parseFloat(saved) : Infinity
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
    name: KART_NAMES[0],
  })

  const aiKartsRef = useRef<Kart[]>([])
  const powerUpsRef = useRef<PowerUp[]>([])
  const keysRef = useRef<Set<string>>(new Set())
  const animationRef = useRef<number>(0)
  const trackScrollRef = useRef(0)
  const checkpointsRef = useRef<number[]>([])
  const activeBoostRef = useRef(0)
  const activeShieldRef = useRef(0)

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
      name: KART_NAMES[0],
    }

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
      name: KART_NAMES[i + 1],
    }))

    // Create power-ups along track
    powerUpsRef.current = []
    for (let i = 0; i < 8; i++) {
      const types: Array<'boost' | 'shield' | 'slow'> = ['boost', 'shield', 'slow']
      powerUpsRef.current.push({
        x: 80 + Math.random() * (TRACK_WIDTH - 40),
        y: -(i * 300 + 200),
        type: types[Math.floor(Math.random() * types.length)],
        collected: false,
      })
    }

    trackScrollRef.current = 0
    activeBoostRef.current = 0
    activeShieldRef.current = 0
  }, [])

  // Get track curve at position
  const getTrackCurve = useCallback((y: number): number => {
    const period = 400
    const phase = (y + trackScrollRef.current) / period
    return Math.sin(phase) * 0.3
  }, [])

  // Check if position is on track
  const isOnTrack = useCallback((x: number): boolean => {
    const trackLeft = (CANVAS_WIDTH - TRACK_WIDTH) / 2
    const trackRight = trackLeft + TRACK_WIDTH
    return x >= trackLeft + 20 && x <= trackRight - 20
  }, [])

  // Update AI karts
  const updateAI = useCallback((kart: Kart, index: number) => {
    // Simple AI: follow track center with some variation
    const trackCenter = CANVAS_WIDTH / 2 + getTrackCurve(kart.y) * 100
    const targetX = trackCenter + (index - 1) * 30

    // Steer towards target
    const diff = targetX - kart.x
    if (Math.abs(diff) > 5) {
      kart.angle += diff > 0 ? TURN_SPEED * 0.7 : -TURN_SPEED * 0.7
    }

    // Accelerate (AI is slightly slower)
    const maxAiSpeed = MAX_SPEED * (0.85 + index * 0.03)
    if (kart.speed < maxAiSpeed) {
      kart.speed += ACCELERATION * 0.8
    }

    // Apply movement
    kart.x += Math.cos(kart.angle) * kart.speed * 0.3
    kart.y += Math.sin(kart.angle) * kart.speed

    // Keep on track
    const trackLeft = (CANVAS_WIDTH - TRACK_WIDTH) / 2 + 30
    const trackRight = trackLeft + TRACK_WIDTH - 60
    kart.x = Math.max(trackLeft, Math.min(trackRight, kart.x))

    // Slow down if off ideal line
    if (!isOnTrack(kart.x)) {
      kart.speed *= 0.95
    }
  }, [getTrackCurve, isOnTrack])

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
    }
    if (keys.has('arrowright') || keys.has('d')) {
      player.angle += TURN_SPEED * (player.speed > 0 ? 1 : -1)
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
        const finalTime = raceTime
        if (finalTime < bestTime) {
          setBestTime(finalTime)
          localStorage.setItem('kubeKartBestTime', finalTime.toString())
        }
        setGameState('finished')
        return
      }
    }

    // Update AI karts
    aiKartsRef.current.forEach((kart, i) => {
      updateAI(kart, i)
      // AI lap progress (simplified)
      const aiProgress = trackScrollRef.current * (0.9 + i * 0.05)
      kart.lap = Math.floor(aiProgress / lapLength) + 1
    })

    // Calculate position
    const allKarts = [player, ...aiKartsRef.current]
    allKarts.sort((a, b) => {
      if (a.lap !== b.lap) return b.lap - a.lap
      return b.isPlayer ? 1 : -1 // Simplified position calc
    })
    const playerPos = allKarts.findIndex(k => k.isPlayer) + 1
    setPosition(playerPos)

  }, [isOnTrack, updateAI, raceTime, bestTime, totalLaps])

  // Render
  const render = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Clear
    ctx.fillStyle = COLORS.grass
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)

    // Draw track (perspective effect)
    const trackLeft = (CANVAS_WIDTH - TRACK_WIDTH) / 2

    for (let y = 0; y < CANVAS_HEIGHT; y += 2) {
      const worldY = y - trackScrollRef.current
      const curve = getTrackCurve(worldY)
      const offset = curve * (CANVAS_HEIGHT - y) * 0.5

      // Track
      ctx.fillStyle = COLORS.track
      ctx.fillRect(trackLeft + offset, y, TRACK_WIDTH, 2)

      // Track edges (red/white stripes)
      const stripe = Math.floor((worldY + trackScrollRef.current) / 20) % 2 === 0
      ctx.fillStyle = stripe ? COLORS.trackEdge : '#fff'
      ctx.fillRect(trackLeft + offset - 8, y, 8, 2)
      ctx.fillRect(trackLeft + offset + TRACK_WIDTH, y, 8, 2)

      // Center line (dashed)
      if (Math.floor((worldY + trackScrollRef.current) / 30) % 2 === 0) {
        ctx.fillStyle = '#fff'
        ctx.fillRect(trackLeft + offset + TRACK_WIDTH / 2 - 2, y, 4, 2)
      }
    }

    // Draw power-ups
    powerUpsRef.current.forEach(powerUp => {
      if (powerUp.collected) return
      const screenY = powerUp.y + trackScrollRef.current
      if (screenY > -30 && screenY < CANVAS_HEIGHT + 30) {
        const curve = getTrackCurve(powerUp.y)
        const offset = curve * (CANVAS_HEIGHT - screenY) * 0.5
        const x = powerUp.x + trackLeft + offset

        ctx.fillStyle = powerUp.type === 'boost' ? COLORS.boost :
                        powerUp.type === 'shield' ? COLORS.shield : COLORS.slow
        ctx.beginPath()
        ctx.arc(x, screenY, 12, 0, Math.PI * 2)
        ctx.fill()
        ctx.strokeStyle = '#fff'
        ctx.lineWidth = 2
        ctx.stroke()

        // Icon
        ctx.fillStyle = '#fff'
        ctx.font = 'bold 12px sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText(
          powerUp.type === 'boost' ? '>' : powerUp.type === 'shield' ? 'O' : 'X',
          x, screenY + 4
        )
      }
    })

    // Draw AI karts
    aiKartsRef.current.forEach(kart => {
      drawKart(ctx, kart)
    })

    // Draw player kart
    const player = playerRef.current
    drawKart(ctx, player, activeBoostRef.current > 0, activeShieldRef.current > 0)

    // Draw boost/shield effects
    if (activeBoostRef.current > 0) {
      ctx.fillStyle = 'rgba(0, 255, 255, 0.3)'
      ctx.beginPath()
      ctx.arc(player.x, CANVAS_HEIGHT - 80, 25, 0, Math.PI * 2)
      ctx.fill()
    }
    if (activeShieldRef.current > 0) {
      ctx.strokeStyle = 'rgba(255, 0, 255, 0.5)'
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.arc(player.x, CANVAS_HEIGHT - 80, 28, 0, Math.PI * 2)
      ctx.stroke()
    }

    // Draw lap progress bar
    const lapProgress = (trackScrollRef.current % 2500) / 2500
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)'
    ctx.fillRect(10, CANVAS_HEIGHT - 20, CANVAS_WIDTH - 20, 10)
    ctx.fillStyle = '#3b82f6'
    ctx.fillRect(10, CANVAS_HEIGHT - 20, (CANVAS_WIDTH - 20) * lapProgress, 10)
    ctx.strokeStyle = '#fff'
    ctx.strokeRect(10, CANVAS_HEIGHT - 20, CANVAS_WIDTH - 20, 10)

  }, [getTrackCurve])

  // Draw kart helper
  const drawKart = (ctx: CanvasRenderingContext2D, kart: Kart, hasBoost = false, _hasShield = false) => {
    const screenY = kart.isPlayer ? CANVAS_HEIGHT - 80 :
      CANVAS_HEIGHT - 80 - (kart.y - playerRef.current.y) + (trackScrollRef.current - kart.checkpoint)

    ctx.save()
    ctx.translate(kart.x, kart.isPlayer ? CANVAS_HEIGHT - 80 : screenY)
    ctx.rotate(kart.angle + Math.PI / 2)

    // Kart body
    ctx.fillStyle = kart.color
    ctx.fillRect(-KART_WIDTH / 2, -KART_HEIGHT / 2, KART_WIDTH, KART_HEIGHT)

    // Cockpit
    ctx.fillStyle = '#222'
    ctx.fillRect(-KART_WIDTH / 4, -KART_HEIGHT / 4, KART_WIDTH / 2, KART_HEIGHT / 3)

    // Wheels
    ctx.fillStyle = '#111'
    ctx.fillRect(-KART_WIDTH / 2 - 3, -KART_HEIGHT / 2 + 4, 6, 10)
    ctx.fillRect(KART_WIDTH / 2 - 3, -KART_HEIGHT / 2 + 4, 6, 10)
    ctx.fillRect(-KART_WIDTH / 2 - 3, KART_HEIGHT / 2 - 14, 6, 10)
    ctx.fillRect(KART_WIDTH / 2 - 3, KART_HEIGHT / 2 - 14, 6, 10)

    // Boost flames
    if (hasBoost && kart.isPlayer) {
      ctx.fillStyle = '#ff6600'
      ctx.beginPath()
      ctx.moveTo(-4, KART_HEIGHT / 2)
      ctx.lineTo(0, KART_HEIGHT / 2 + 15 + Math.random() * 5)
      ctx.lineTo(4, KART_HEIGHT / 2)
      ctx.fill()
    }

    ctx.restore()
  }

  // Game loop
  useEffect(() => {
    if (gameState !== 'playing') return

    let lastTime = performance.now()

    const gameLoop = () => {
      const now = performance.now()
      const delta = (now - lastTime) / 1000
      lastTime = now

      setRaceTime(t => t + delta)
      update()
      render()
      animationRef.current = requestAnimationFrame(gameLoop)
    }

    animationRef.current = requestAnimationFrame(gameLoop)
    return () => cancelAnimationFrame(animationRef.current)
  }, [gameState, update, render])

  // Countdown
  useEffect(() => {
    if (gameState !== 'countdown') return

    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(c => c - 1), 1000)
      return () => clearTimeout(timer)
    } else {
      setGameState('playing')
    }
  }, [gameState, countdown])

  // Keyboard handlers
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) {
        e.preventDefault()
      }
      keysRef.current.add(e.key.toLowerCase())
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
  }, [])

  // Render initial frame
  useEffect(() => {
    if (gameState === 'idle') {
      initTrack()
      render()
    }
  }, [gameState, initTrack, render])

  const startGame = () => {
    initTrack()
    setRaceTime(0)
    setPlayerLap(1)
    setPosition(4)
    setCountdown(3)
    setGameState('countdown')
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
    <CardWrapper cardType="kube_kart" title="Kube Kart">
      <div className="flex flex-col items-center gap-3">
        {/* Stats bar */}
        <div className="flex items-center justify-between w-full max-w-[400px] text-sm">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1">
              <Flag className="w-4 h-4 text-green-400" />
              <span>Lap {playerLap}/{totalLaps}</span>
            </div>
            <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-secondary">
              <span className="font-bold text-lg">{position}</span>
              <span className="text-xs text-muted-foreground">/{AI_COUNT + 1}</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1">
              <Timer className="w-4 h-4 text-blue-400" />
              <span className="font-mono">{formatTime(raceTime)}</span>
            </div>
            {bestTime < Infinity && (
              <div className="flex items-center gap-1 text-yellow-500">
                <Trophy className="w-4 h-4" />
                <span className="font-mono text-xs">{formatTime(bestTime)}</span>
              </div>
            )}
          </div>
        </div>

        {/* Game canvas */}
        <div className="relative">
          <canvas
            ref={canvasRef}
            width={CANVAS_WIDTH}
            height={CANVAS_HEIGHT}
            className="border border-border rounded"
            tabIndex={0}
          />

          {/* Overlays */}
          {gameState === 'idle' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 rounded">
              <h3 className="text-2xl font-bold text-blue-400 mb-2">Kube Kart</h3>
              <p className="text-sm text-muted-foreground mb-4">Arrow keys or WASD to drive</p>
              <div className="flex gap-2 mb-4 text-xs">
                <span className="px-2 py-1 rounded bg-cyan-500/30 text-cyan-400">Boost</span>
                <span className="px-2 py-1 rounded bg-purple-500/30 text-purple-400">Shield</span>
                <span className="px-2 py-1 rounded bg-orange-500/30 text-orange-400">Slow Others</span>
              </div>
              <button
                onClick={startGame}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded text-white"
              >
                <Play className="w-4 h-4" />
                Start Race
              </button>
            </div>
          )}

          {gameState === 'countdown' && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded">
              <span className="text-6xl font-bold text-white animate-pulse">
                {countdown || 'GO!'}
              </span>
            </div>
          )}

          {gameState === 'paused' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 rounded">
              <h3 className="text-xl font-bold text-white mb-4">Paused</h3>
              <button
                onClick={togglePause}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded text-white"
              >
                <Play className="w-4 h-4" />
                Resume
              </button>
            </div>
          )}

          {gameState === 'finished' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 rounded">
              <Trophy className="w-12 h-12 text-yellow-400 mb-2" />
              <h3 className="text-2xl font-bold text-white mb-2">
                {position === 1 ? 'You Win!' : `Finished ${position}${position === 2 ? 'nd' : position === 3 ? 'rd' : 'th'}`}
              </h3>
              <p className="text-lg text-white mb-1">Time: {formatTime(raceTime)}</p>
              {raceTime === bestTime && (
                <p className="text-sm text-yellow-400 mb-4">New Best Time!</p>
              )}
              <button
                onClick={startGame}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded text-white"
              >
                <RotateCcw className="w-4 h-4" />
                Race Again
              </button>
            </div>
          )}
        </div>

        {/* Controls */}
        {gameState === 'playing' && (
          <div className="flex gap-2 items-center">
            <button
              onClick={togglePause}
              className="flex items-center gap-1 px-3 py-1 bg-secondary hover:bg-secondary/80 rounded text-sm"
            >
              <Pause className="w-4 h-4" />
              Pause
            </button>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Gauge className="w-3 h-3" />
              <span>{Math.round(playerRef.current.speed / MAX_SPEED * 100)}%</span>
            </div>
          </div>
        )}
      </div>
    </CardWrapper>
  )
}
