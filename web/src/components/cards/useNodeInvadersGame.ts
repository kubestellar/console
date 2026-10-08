import { useState, useEffect, useCallback, useRef } from 'react'
import { emitGameStarted, emitGameEnded } from '../../lib/analytics'
import { useGameKeyTracking } from '../../hooks/useGameKeys'
import { safeGet, safeSet } from '../../lib/safeLocalStorage'

import {
  NODE_INVADERS_HIGHSCORE_KEY,
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  PLAYER_WIDTH,
  INVADER_WIDTH,
  INVADER_HEIGHT,
  SHOOT_COOLDOWN_MS,
  GAME_LOOP_INTERVAL_MS,
  INVADER_MOVE_STEP,
  INVADER_DROP_DISTANCE,
  INVADER_SHOOT_TICK_INTERVAL,
  INVADER_MIN_MOVE_TICKS,
  INVADER_BASE_MOVE_TICKS,
  INVADER_ALIVE_TICK_DIVISOR,
  type Player,
  type Bullet,
  type Invader,
  type Shield,
  createInvaders,
  createShields } from './NodeInvaders.constants'
import { drawNodeInvadersScene } from './NodeInvaders.draw'

/** Game state, loop, and keyboard controls for the NodeInvaders card. */
export function useNodeInvadersGame(isExpanded: boolean) {
  const gameContainerRef = useRef<HTMLDivElement>(null)
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
  const [isPaused, setIsPaused] = useState(false)
  const [canShoot, setCanShoot] = useState(true)
  const [highScore, setHighScore] = useState<number>(() => {
    const saved = safeGet(NODE_INVADERS_HIGHSCORE_KEY)
    return saved ? parseInt(saved, 10) || 0 : 0
  })

  // Persist high score when game ends and score beats the stored best.
  useEffect(() => {
    if (gameOver && score > highScore) {
      setHighScore(score)
      safeSet(NODE_INVADERS_HIGHSCORE_KEY, score.toString())
    }
  }, [gameOver, score, highScore])

  const gameStateRef = useRef({ player, bullets, invaders, shields, invaderDir, invaderSpeed, canShoot, score })
  useEffect(() => {
    gameStateRef.current = { player, bullets, invaders, shields, invaderDir, invaderSpeed, canShoot, score }
  }, [player, bullets, invaders, shields, invaderDir, invaderSpeed, canShoot, score])

  // Initialize invaders
  const initInvaders = useCallback((lvl: number) => {
    setInvaders(createInvaders())
    setInvaderDir(1)
    setInvaderSpeed(1 + (lvl - 1) * 0.3)
  }, [])

  // Initialize shields
  const initShields = useCallback(() => {
    setShields(createShields())
  }, [])

  // Draw
  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const scale = isExpanded ? 1.4 : 1
    drawNodeInvadersScene(ctx, { player, bullets, invaders, shields }, scale)
  }, [player, bullets, invaders, shields, isExpanded])

  const drawRef = useRef(draw)
  useEffect(() => {
    drawRef.current = draw
  }, [draw])

  // Game loop — also stops on pause so requestAnimationFrame/interval
  // halts and stats freeze (issue #8943).
  useEffect(() => {
    if (!isPlaying || gameOver || isPaused) {
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
      if ((keys.has(' ') || keys.has('ArrowUp')) && state.canShoot) {
        setBullets(bs => [...bs, {
          x: state.player.x + PLAYER_WIDTH / 2,
          y: CANVAS_HEIGHT - 45,
          isPlayer: true }])
        setCanShoot(false)
        setTimeout(() => setCanShoot(true), SHOOT_COOLDOWN_MS)
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
      if (invaderMoveCounter >= Math.max(INVADER_MIN_MOVE_TICKS, INVADER_BASE_MOVE_TICKS - state.invaders.filter(i => i.alive).length / INVADER_ALIVE_TICK_DIVISOR)) {
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
            x: shouldDrop ? inv.x : inv.x + newDir * state.invaderSpeed * INVADER_MOVE_STEP,
            y: shouldDrop ? inv.y + INVADER_DROP_DISTANCE : inv.y }
        }))

        if (shouldDrop) {
          setInvaderDir(newDir)
        }
      }

      // Invader shooting
      if (tick % INVADER_SHOOT_TICK_INTERVAL === 0) {
        const aliveInvaders = state.invaders.filter(i => i.alive)
        if (aliveInvaders.length > 0) {
          const shooter = aliveInvaders[Math.floor(Math.random() * aliveInvaders.length)]
          setBullets(bs => [...bs, {
            x: shooter.x + INVADER_WIDTH / 2,
            y: shooter.y + INVADER_HEIGHT,
            isPlayer: false }])
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
              emitGameEnded('node_invaders', 'loss', state.score)
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
            emitGameEnded('node_invaders', 'win', state.score)
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
          emitGameEnded('node_invaders', 'loss', state.score)
          break
        }
      }

      drawRef.current()
    }, GAME_LOOP_INTERVAL_MS)

    return () => {
      if (gameLoopRef.current) {
        clearInterval(gameLoopRef.current)
      }
    }
  }, [isPlaying, gameOver, isPaused, initInvaders, initShields])

  // Keyboard — scoped to visible game container (KeepAlive-safe)
  useGameKeyTracking(gameContainerRef, keysRef, {
    preventDefaultKeys: ['ArrowLeft', 'ArrowRight', 'ArrowUp', ' ', 'a', 'd', 'A', 'D'] })

  // Start game
  const startGame = () => {
    setPlayer({ x: CANVAS_WIDTH / 2 - PLAYER_WIDTH / 2, lives: 3 })
    setBullets([])
    setScore(0)
    setLevel(1)
    setInvaderSpeed(1)
    initInvaders(1)
    initShields()
    setGameOver(false)
    setWon(false)
    setIsPaused(false)
    setIsPlaying(true)
    setCanShoot(true)
    emitGameStarted('node_invaders')
  }

  // Toggle pause — issue #8943.
  const togglePause = () => {
    if (!isPlaying || gameOver) return
    setIsPaused(p => !p)
  }

  // Keyboard shortcut for pause (P key) — scoped to the game container
  // via the existing keysRef machinery by watching the DOM directly.
  useEffect(() => {
    const container = gameContainerRef.current
    if (!container) return
    const onKey = (e: KeyboardEvent) => {
      if (!isPlaying || gameOver) return
      if (e.key === 'p' || e.key === 'P') {
        e.preventDefault()
        setIsPaused(p => !p)
      }
    }
    container.addEventListener('keydown', onKey)
    return () => container.removeEventListener('keydown', onKey)
  }, [isPlaying, gameOver])

  const scale = isExpanded ? 1.4 : 1

  useEffect(() => {
    draw()
  }, [draw])

  return {
    gameContainerRef, canvasRef, player, score, level, highScore, isPlaying,
    gameOver, isPaused, won, scale, startGame, togglePause,
  }
}
