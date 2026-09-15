/**
 * Game state/logic hook for the KubeBert card: pyramid tiles, player and
 * enemy movement, scoring, and lives. Canvas drawing/loop live in
 * useKubeBertRenderer.
 */
import { useState, useEffect, useRef, useCallback } from 'react'
import { emitGameStarted, emitGameEnded } from '../../lib/analytics'
import { useGameKeys } from '../../hooks/useGameKeys'
import {
  PYRAMID_ROWS, INITIAL_LIVES, POINTS_PER_TILE, BONUS_PER_LEVEL,
  ENEMY_SPAWN_INTERVAL_MS, ENEMY_MOVE_INTERVAL_MS, PLAYER_MOVE_COOLDOWN_MS,
  LEVEL_TRANSITION_DELAY_MS, MIN_ENEMY_SPAWN_INTERVAL_MS, KUBE_LABELS,
  type Position, type Enemy, type GameState,
} from './kubeBert.constants'
import { useKubeBertRenderer } from './useKubeBertRenderer'

export function useKubeBertGame(isExpanded: boolean) {
  const [gameState, setGameState] = useState<GameState>('idle')
  const [score, setScore] = useState(0)
  const [level, setLevel] = useState(1)
  const [, setLives] = useState(INITIAL_LIVES)
  const [highScore, setHighScore] = useState(() => {
    try {
      const saved = localStorage.getItem('kubeBertHighScore')
      return saved ? parseInt(saved, 10) : 0
    } catch {
      return 0
    }
  })

  // Game refs (mutable state that shouldn't trigger re-renders)
  const playerRef = useRef<Position>({ row: 0, col: 0 })
  const tilesRef = useRef<boolean[][]>([])    // true = visited
  const enemiesRef = useRef<Enemy[]>([])
  const enemyIdRef = useRef(0)
  const levelRef = useRef(1)
  const scoreRef = useRef(0)
  const livesRef = useRef(INITIAL_LIVES)
  const enemySpawnRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const enemyMoveRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const moveLockedRef = useRef(false)
  const gameStateRef = useRef<GameState>('idle')
  // Refs to break forward-declaration cycles (movePlayer calls these, but they're declared later)
  const startEnemiesRef = useRef<() => void>(() => {})
  const startGameLoopRef = useRef<() => void>(() => {})
  // Build tile label map (stable per pyramid)
  const tileLabelMap = useRef<string[][]>([])

  const { canvasRef, containerRef, render, startGameLoop, stopGameLoop } = useKubeBertRenderer({
    isExpanded, playerRef, tilesRef, enemiesRef, tileLabelMap, gameStateRef, levelRef,
  })

  // Keep gameStateRef in sync
  useEffect(() => { gameStateRef.current = gameState }, [gameState])

  const buildTileLabels = useCallback(() => {
    const labels: string[][] = []
    let idx = 0
    for (let r = 0; r < PYRAMID_ROWS; r++) {
      labels[r] = []
      for (let c = 0; c <= r; c++) {
        labels[r][c] = KUBE_LABELS[idx % KUBE_LABELS.length]
        idx++
      }
    }
    tileLabelMap.current = labels
  }, [])

  // Initialize tile grid
  const initTiles = useCallback(() => {
    const tiles: boolean[][] = []
    for (let r = 0; r < PYRAMID_ROWS; r++) {
      tiles[r] = []
      for (let c = 0; c <= r; c++) {
        tiles[r][c] = false
      }
    }
    tilesRef.current = tiles
  }, [])

  // Check if all tiles are visited
  const allTilesVisited = () => {
    for (let r = 0; r < PYRAMID_ROWS; r++) {
      for (let c = 0; c <= r; c++) {
        if (!tilesRef.current[r]?.[c]) return false
      }
    }
    return true
  }

  // Check if position is valid on pyramid
  const isValidPosition = (row: number, col: number) => {
    return row >= 0 && row < PYRAMID_ROWS && col >= 0 && col <= row
  }

  // Stop all intervals
  const stopIntervals = useCallback(() => {
    if (enemySpawnRef.current) {
      clearInterval(enemySpawnRef.current)
      enemySpawnRef.current = null
    }
    if (enemyMoveRef.current) {
      clearInterval(enemyMoveRef.current)
      enemyMoveRef.current = null
    }
    stopGameLoop()
  }, [stopGameLoop])

  // Spawn an enemy at the top of the pyramid
  const spawnEnemy = () => {
    if (gameStateRef.current !== 'playing') return
    const type = Math.random() < 0.4 ? 'coily' : 'ball'
    const startCol = Math.random() < 0.5 ? 0 : 1
    const enemy: Enemy = {
      pos: { row: 0, col: startCol },
      type,
      id: enemyIdRef.current++ }
    enemiesRef.current.push(enemy)
  }

  const handlePlayerHit = () => {
    livesRef.current--
    setLives(livesRef.current)
    if (livesRef.current <= 0) {
      setGameState('gameover')
      emitGameEnded('kube_bert', 'loss', scoreRef.current)
      if (scoreRef.current > highScore) {
        setHighScore(scoreRef.current)
        try {
          localStorage.setItem('kubeBertHighScore', String(scoreRef.current))
        } catch {
          // Ignore storage errors (e.g. private browsing, quota exceeded)
        }
      }
      stopIntervals()
      return true
    }
    // Reset player to top
    playerRef.current = { row: 0, col: 0 }
    return false
  }

  // Move enemies down the pyramid
  const moveEnemies = () => {
    if (gameStateRef.current !== 'playing') return

    const player = playerRef.current
    const surviving: Enemy[] = []

    for (const enemy of enemiesRef.current) {
      // Move down: either down-left or down-right
      const newRow = enemy.pos.row + 1
      if (newRow >= PYRAMID_ROWS) {
        // Enemy fell off — remove it
        continue
      }
      const direction = Math.random() < 0.5 ? 0 : 1
      const newCol = enemy.pos.col + direction
      if (!isValidPosition(newRow, newCol)) {
        continue
      }
      enemy.pos = { row: newRow, col: newCol }

      // Check collision with player
      if (enemy.pos.row === player.row && enemy.pos.col === player.col) {
        // Player hit!
        if (handlePlayerHit()) return
        continue
      }
      surviving.push(enemy)
    }
    enemiesRef.current = surviving
  }

  // Move player
  const movePlayer = (direction: 'up-left' | 'up-right' | 'down-left' | 'down-right') => {
    if (gameStateRef.current !== 'playing' || moveLockedRef.current) return
    moveLockedRef.current = true
    setTimeout(() => { moveLockedRef.current = false }, PLAYER_MOVE_COOLDOWN_MS)

    const { row, col } = playerRef.current
    let newRow = row
    let newCol = col

    switch (direction) {
      case 'up-left':
        newRow = row - 1
        newCol = col - 1
        break
      case 'up-right':
        newRow = row - 1
        newCol = col
        break
      case 'down-left':
        newRow = row + 1
        newCol = col
        break
      case 'down-right':
        newRow = row + 1
        newCol = col + 1
        break
    }

    // Jumped off the pyramid? Lose a life
    if (!isValidPosition(newRow, newCol)) {
      handlePlayerHit()
      return
    }

    playerRef.current = { row: newRow, col: newCol }

    // Visit tile
    if (!tilesRef.current[newRow]?.[newCol]) {
      if (tilesRef.current[newRow]) {
        tilesRef.current[newRow][newCol] = true
      }
      scoreRef.current += POINTS_PER_TILE
      setScore(scoreRef.current)
    }

    // Check collision with enemies
    for (const enemy of enemiesRef.current) {
      if (enemy.pos.row === newRow && enemy.pos.col === newCol) {
        handlePlayerHit()
        return
      }
    }

    // Check level complete
    if (allTilesVisited()) {
      scoreRef.current += BONUS_PER_LEVEL
      setScore(scoreRef.current)
      levelRef.current++
      setLevel(levelRef.current)
      // Reset for next level
      initTiles()
      playerRef.current = { row: 0, col: 0 }
      enemiesRef.current = []
      // Brief pause then continue
      setGameState('levelComplete')
      stopIntervals()
      setTimeout(() => {
        if (gameStateRef.current === 'levelComplete') {
          setGameState('playing')
          startEnemiesRef.current()
          startGameLoopRef.current()
        }
      }, LEVEL_TRANSITION_DELAY_MS)
    }
  }

  // Keep ref in sync so movePlayer's setTimeout can call the latest version
  startGameLoopRef.current = startGameLoop

  // Enemy intervals
  const startEnemies = () => {
    // Spawn faster at higher levels
    const spawnRate = Math.max(MIN_ENEMY_SPAWN_INTERVAL_MS, ENEMY_SPAWN_INTERVAL_MS - (levelRef.current - 1) * 300)
    const moveRate = Math.max(400, ENEMY_MOVE_INTERVAL_MS - (levelRef.current - 1) * 50)

    enemySpawnRef.current = setInterval(spawnEnemy, spawnRate)
    enemyMoveRef.current = setInterval(moveEnemies, moveRate)
  }
  // Keep ref in sync so movePlayer's setTimeout can call the latest version
  startEnemiesRef.current = startEnemies

  const startGame = () => {
    stopIntervals()
    buildTileLabels()
    initTiles()
    playerRef.current = { row: 0, col: 0 }
    enemiesRef.current = []
    enemyIdRef.current = 0
    levelRef.current = 1
    scoreRef.current = 0
    livesRef.current = INITIAL_LIVES
    setScore(0)
    setLevel(1)
    setLives(INITIAL_LIVES)
    setGameState('playing')
    emitGameStarted('kube_bert')

    // Mark starting tile as visited
    if (tilesRef.current[0]) {
      tilesRef.current[0][0] = true
    }
    scoreRef.current += POINTS_PER_TILE
    setScore(scoreRef.current)

    startEnemies()
    startGameLoop()
  }

  // Keyboard controls — scoped to visible game container (KeepAlive-safe)
  const handleBertKeyDown = (e: KeyboardEvent) => {
    if (gameStateRef.current !== 'playing') return

    // Q*bert uses diagonal movement mapped to arrow keys:
    // Up = up-left, Right = up-right, Down = down-right, Left = down-left
    switch (e.key) {
      case 'ArrowUp':
      case 'w':
      case 'W':
        e.preventDefault()
        movePlayer('up-left')
        break
      case 'ArrowRight':
      case 'd':
      case 'D':
        e.preventDefault()
        movePlayer('up-right')
        break
      case 'ArrowDown':
      case 's':
      case 'S':
        e.preventDefault()
        movePlayer('down-right')
        break
      case 'ArrowLeft':
      case 'a':
      case 'A':
        e.preventDefault()
        movePlayer('down-left')
        break
    }
  }
  useGameKeys(containerRef, { onKeyDown: handleBertKeyDown })

  // Cleanup on unmount
  useEffect(() => {
    return () => stopIntervals()
  }, [stopIntervals])

  // Initial render
  useEffect(() => {
    buildTileLabels()
    initTiles()
    render()
  }, [buildTileLabels, initTiles, render])

  return {
    canvasRef,
    containerRef,
    gameState,
    score,
    level,
    livesRef,
    highScore,
    startGame,
    movePlayer,
  }
}
