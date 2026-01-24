import { useState, useEffect, useCallback, useRef } from 'react'
import { RotateCcw, Trophy, Rocket } from 'lucide-react'
import { CardComponentProps } from './cardRegistry'
import { useCardExpanded } from './CardWrapper'

// Game constants
const CANVAS_WIDTH = 300
const CANVAS_HEIGHT = 280
const PLAYER_WIDTH = 30
const INVADER_ROWS = 4
const INVADER_COLS = 8
const INVADER_WIDTH = 24
const INVADER_HEIGHT = 16

interface Player {
  x: number
  lives: number
}

interface Bullet {
  x: number
  y: number
  isPlayer: boolean
}

interface Invader {
  x: number
  y: number
  alive: boolean
  type: number
}

interface Shield {
  x: number
  y: number
  health: number
}

export function NodeInvaders(_props: CardComponentProps) {
  const { isExpanded } = useCardExpanded()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const gameLoopRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const keysRef = useRef<Set<string>>(new Set())

  const [player, setPlayer] = useState<Player>({ x: CANVAS_WIDTH / 2 - PLAYER_WIDTH / 2, lives: 3 })
  const [bullets, setBullets] = useState<Bullet[]>([])
  const [invaders, setInvaders] = useState<Invader[]>([])
  const [shields, setShields] = useState<Shield[]>([])
  const [invaderDir, setInvaderDir] = useState(1)
  const [invaderSpeed, setInvaderSpeed] = useState(1)
  const [score, setScore] = useState(0)
  const [level, setLevel] = useState(1)
  const [gameOver, setGameOver] = useState(false)
  const [won, setWon] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [canShoot, setCanShoot] = useState(true)

  const gameStateRef = useRef({ player, bullets, invaders, shields, invaderDir })
  useEffect(() => {
    gameStateRef.current = { player, bullets, invaders, shields, invaderDir }
  }, [player, bullets, invaders, shields, invaderDir])

  // Initialize invaders
  const initInvaders = useCallback((lvl: number) => {
    const newInvaders: Invader[] = []
    for (let row = 0; row < INVADER_ROWS; row++) {
      for (let col = 0; col < INVADER_COLS; col++) {
        newInvaders.push({
          x: 30 + col * (INVADER_WIDTH + 8),
          y: 40 + row * (INVADER_HEIGHT + 10),
          alive: true,
          type: row < 1 ? 2 : row < 2 ? 1 : 0,
        })
      }
    }
    setInvaders(newInvaders)
    setInvaderDir(1)
    setInvaderSpeed(1 + (lvl - 1) * 0.3)
  }, [])

  // Initialize shields
  const initShields = useCallback(() => {
    const newShields: Shield[] = []
    for (let i = 0; i < 4; i++) {
      newShields.push({
        x: 35 + i * 70,
        y: 210,
        health: 4,
      })
    }
    setShields(newShields)
  }, [])

  // Draw
  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const scale = isExpanded ? 1.4 : 1
    ctx.save()
    ctx.scale(scale, scale)

    // Background
    ctx.fillStyle = '#0a0a1a'
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)

    // Stars
    ctx.fillStyle = '#ffffff'
    for (let i = 0; i < 30; i++) {
      ctx.fillRect((i * 47) % CANVAS_WIDTH, (i * 31) % CANVAS_HEIGHT, 1, 1)
    }

    // Draw shields
    for (const s of shields) {
      if (s.health <= 0) continue
      const alpha = s.health / 4
      ctx.fillStyle = `rgba(0, 255, 0, ${alpha})`
      ctx.fillRect(s.x, s.y, 30, 20)
      // Shield pattern
      ctx.fillStyle = `rgba(0, 200, 0, ${alpha})`
      ctx.fillRect(s.x + 10, s.y + 15, 10, 5)
    }

    // Draw invaders (nodes/pods)
    for (const inv of invaders) {
      if (!inv.alive) continue

      // Different colors for different types
      const colors = ['#ff6b6b', '#ffd93d', '#6bcb77']
      ctx.fillStyle = colors[inv.type]

      // Invader body (node shape)
      ctx.fillRect(inv.x + 2, inv.y + 4, INVADER_WIDTH - 4, INVADER_HEIGHT - 8)
      ctx.fillRect(inv.x, inv.y + 6, INVADER_WIDTH, INVADER_HEIGHT - 12)

      // Eyes
      ctx.fillStyle = '#000'
      ctx.fillRect(inv.x + 5, inv.y + 6, 4, 4)
      ctx.fillRect(inv.x + INVADER_WIDTH - 9, inv.y + 6, 4, 4)

      // Legs
      ctx.fillStyle = colors[inv.type]
      ctx.fillRect(inv.x + 2, inv.y + INVADER_HEIGHT - 4, 4, 4)
      ctx.fillRect(inv.x + INVADER_WIDTH - 6, inv.y + INVADER_HEIGHT - 4, 4, 4)
    }

    // Draw player (kubectl ship)
    ctx.fillStyle = '#00bfff'
    // Ship body
    ctx.beginPath()
    ctx.moveTo(player.x + PLAYER_WIDTH / 2, CANVAS_HEIGHT - 40)
    ctx.lineTo(player.x, CANVAS_HEIGHT - 20)
    ctx.lineTo(player.x + PLAYER_WIDTH, CANVAS_HEIGHT - 20)
    ctx.closePath()
    ctx.fill()
    // Ship base
    ctx.fillRect(player.x + 5, CANVAS_HEIGHT - 20, PLAYER_WIDTH - 10, 8)
    // Cockpit
    ctx.fillStyle = '#87ceeb'
    ctx.fillRect(player.x + PLAYER_WIDTH / 2 - 3, CANVAS_HEIGHT - 35, 6, 6)

    // Draw bullets
    for (const b of bullets) {
      ctx.fillStyle = b.isPlayer ? '#00ff00' : '#ff0000'
      ctx.fillRect(b.x - 2, b.y, 4, b.isPlayer ? 10 : 8)
    }

    ctx.restore()
  }, [player, bullets, invaders, shields, isExpanded])

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
    let invaderMoveCounter = 0

    gameLoopRef.current = setInterval(() => {
      tick++
      const state = gameStateRef.current
      const keys = keysRef.current

      // Player movement
      setPlayer(p => {
        let newX = p.x
        if (keys.has('ArrowLeft') || keys.has('a') || keys.has('A')) {
          newX -= 5
        }
        if (keys.has('ArrowRight') || keys.has('d') || keys.has('D')) {
          newX += 5
        }
        newX = Math.max(0, Math.min(CANVAS_WIDTH - PLAYER_WIDTH, newX))
        return { ...p, x: newX }
      })

      // Shooting
      if ((keys.has(' ') || keys.has('ArrowUp')) && canShoot) {
        setBullets(bs => [...bs, {
          x: state.player.x + PLAYER_WIDTH / 2,
          y: CANVAS_HEIGHT - 45,
          isPlayer: true,
        }])
        setCanShoot(false)
        setTimeout(() => setCanShoot(true), 300)
      }

      // Move bullets
      setBullets(bs => {
        const newBullets: Bullet[] = []
        for (const b of bs) {
          const newY = b.y + (b.isPlayer ? -8 : 4)
          if (newY < 0 || newY > CANVAS_HEIGHT) continue
          newBullets.push({ ...b, y: newY })
        }
        return newBullets
      })

      // Move invaders
      invaderMoveCounter++
      if (invaderMoveCounter >= Math.max(5, 20 - state.invaders.filter(i => i.alive).length / 2)) {
        invaderMoveCounter = 0

        let shouldDrop = false
        let newDir = state.invaderDir

        // Check boundaries
        for (const inv of state.invaders) {
          if (!inv.alive) continue
          if ((inv.x + INVADER_WIDTH >= CANVAS_WIDTH - 10 && state.invaderDir > 0) ||
              (inv.x <= 10 && state.invaderDir < 0)) {
            shouldDrop = true
            newDir = -state.invaderDir
            break
          }
        }

        setInvaders(invs => invs.map(inv => {
          if (!inv.alive) return inv
          return {
            ...inv,
            x: shouldDrop ? inv.x : inv.x + newDir * invaderSpeed * 3,
            y: shouldDrop ? inv.y + 10 : inv.y,
          }
        }))

        if (shouldDrop) {
          setInvaderDir(newDir)
        }
      }

      // Invader shooting
      if (tick % 60 === 0) {
        const aliveInvaders = state.invaders.filter(i => i.alive)
        if (aliveInvaders.length > 0) {
          const shooter = aliveInvaders[Math.floor(Math.random() * aliveInvaders.length)]
          setBullets(bs => [...bs, {
            x: shooter.x + INVADER_WIDTH / 2,
            y: shooter.y + INVADER_HEIGHT,
            isPlayer: false,
          }])
        }
      }

      // Collision: player bullets vs invaders
      setBullets(bs => {
        const remaining: Bullet[] = []
        for (const b of bs) {
          if (!b.isPlayer) {
            remaining.push(b)
            continue
          }
          let hit = false
          for (const inv of state.invaders) {
            if (!inv.alive) continue
            if (b.x > inv.x && b.x < inv.x + INVADER_WIDTH &&
                b.y > inv.y && b.y < inv.y + INVADER_HEIGHT) {
              hit = true
              setInvaders(invs => invs.map(i =>
                i === inv ? { ...i, alive: false } : i
              ))
              const points = (inv.type + 1) * 10
              setScore(s => s + points)
              break
            }
          }
          if (!hit) remaining.push(b)
        }
        return remaining
      })

      // Collision: invader bullets vs player
      for (const b of state.bullets) {
        if (b.isPlayer) continue
        if (b.x > state.player.x && b.x < state.player.x + PLAYER_WIDTH &&
            b.y > CANVAS_HEIGHT - 40 && b.y < CANVAS_HEIGHT - 12) {
          setBullets(bs => bs.filter(bullet => bullet !== b))
          setPlayer(p => {
            if (p.lives <= 1) {
              setGameOver(true)
              setIsPlaying(false)
              return { ...p, lives: 0 }
            }
            return { ...p, lives: p.lives - 1 }
          })
          break
        }
      }

      // Collision: bullets vs shields
      setShields(ss => ss.map(s => {
        if (s.health <= 0) return s
        for (const b of state.bullets) {
          if (b.x > s.x && b.x < s.x + 30 && b.y > s.y && b.y < s.y + 20) {
            setBullets(bs => bs.filter(bullet => bullet !== b))
            return { ...s, health: s.health - 1 }
          }
        }
        return s
      }))

      // Check win condition
      const aliveCount = state.invaders.filter(i => i.alive).length
      if (aliveCount === 0) {
        setLevel(l => {
          const newLevel = l + 1
          if (newLevel > 5) {
            setWon(true)
            setGameOver(true)
            setIsPlaying(false)
          } else {
            initInvaders(newLevel)
            initShields()
          }
          return newLevel
        })
      }

      // Check lose condition: invaders reach bottom
      for (const inv of state.invaders) {
        if (inv.alive && inv.y + INVADER_HEIGHT > CANVAS_HEIGHT - 50) {
          setGameOver(true)
          setIsPlaying(false)
          break
        }
      }

      draw()
    }, 33)

    return () => {
      if (gameLoopRef.current) {
        clearInterval(gameLoopRef.current)
      }
    }
  }, [isPlaying, gameOver, draw, initInvaders, initShields, canShoot, invaderSpeed])

  // Keyboard
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', ' ', 'a', 'd', 'A', 'D'].includes(e.key)) {
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
    setPlayer({ x: CANVAS_WIDTH / 2 - PLAYER_WIDTH / 2, lives: 3 })
    setBullets([])
    setScore(0)
    setLevel(1)
    setInvaderSpeed(1)
    initInvaders(1)
    initShields()
    setGameOver(false)
    setWon(false)
    setIsPlaying(true)
    setCanShoot(true)
  }, [initInvaders, initShields])

  const scale = isExpanded ? 1.4 : 1

  useEffect(() => {
    draw()
  }, [draw])

  return (
    <div className="h-full flex flex-col p-2 select-none">
      <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
        <div className="flex items-center gap-1.5">
          <Rocket className="w-4 h-4 text-cyan-400" />
          <span className="text-sm font-semibold">Node Invaders</span>
        </div>

        <div className="flex items-center gap-3 text-xs">
          <div className="text-center">
            <div className="text-muted-foreground">Score</div>
            <div className="font-bold text-foreground">{score}</div>
          </div>
          <div className="text-center">
            <div className="text-muted-foreground">Lives</div>
            <div className="font-bold text-red-400">{'❤️'.repeat(player.lives)}</div>
          </div>
          <div className="text-center">
            <div className="text-muted-foreground">Wave</div>
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
            <div className="text-xl font-bold text-cyan-400 mb-2">NODE INVADERS</div>
            <div className="text-muted-foreground mb-2 text-sm">Defend your cluster!</div>
            <div className="text-muted-foreground mb-4 text-xs">Arrow keys to move, Space to shoot</div>
            <button
              onClick={startGame}
              className="px-6 py-3 bg-cyan-500/20 text-cyan-400 rounded-lg hover:bg-cyan-500/30 font-semibold"
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
                <div className="text-xl font-bold text-yellow-400 mb-2">Cluster Defended!</div>
              </>
            ) : (
              <div className="text-xl font-bold text-red-400 mb-2">Cluster Overrun!</div>
            )}
            <div className="text-muted-foreground mb-4">Score: {score}</div>
            <button
              onClick={startGame}
              className="px-6 py-3 bg-cyan-500/20 text-cyan-400 rounded-lg hover:bg-cyan-500/30 font-semibold"
            >
              Play Again
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
