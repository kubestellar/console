import { useState, useEffect, useRef } from 'react'
import { Box, Server, RotateCcw, Loader2 } from 'lucide-react'
import { CardComponentProps } from './cardRegistry'
import { useCardExpanded } from './CardWrapper'
import { useReportCardDataState, useCardDemoState } from './CardDataContext'
import { useTranslation } from 'react-i18next'
import { emitGameStarted, emitGameEnded } from '../../lib/analytics'
import { safeGet, safeGetJSON, safeSetJSON, safeRemove } from '../../lib/safeLocalStorage'
import { Select } from '../ui/Select'
import { CheckerBoard } from './checkers/CheckerBoard'
import { ResultSummary } from './checkers/ResultSummary'
import {
  type Board,
  type Difficulty,
  type Move,
  type Player,
  type Position,
  DIFFICULTY_DEPTH,
  applyMove,
  countPieces,
  createInitialBoard,
  getAllMoves,
  getChainJumps,
  minimax,
} from './checkers/gameLogic'

/** localStorage key for Checkers win/loss score tracking */
const SCORE_STORAGE_KEY = 'checkers-score'

// Storage key for game state
const STORAGE_KEY = 'checkers-game-state'

interface SavedGameState {
  board: Board
  currentPlayer: Player
  difficulty: Difficulty
  moveCount: number
  gameOver: Player | 'draw' | null
}

function loadGameState(): SavedGameState | null {
  const stored = safeGet(STORAGE_KEY)
  if (!stored) return null
  try {
    return JSON.parse(stored) as SavedGameState
  } catch {
    return null
  }
}

function saveGameState(state: SavedGameState) {
  safeSetJSON(STORAGE_KEY, state)
}

export function Checkers(_props: CardComponentProps) {
  const { t } = useTranslation(['cards', 'common'])
  const { shouldUseDemoData } = useCardDemoState({ requires: 'none' })
  useReportCardDataState({ hasData: true, isFailed: false, consecutiveFailures: 0, isDemoData: shouldUseDemoData })
  const { isExpanded } = useCardExpanded()
  const thinkingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const tauntIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Load saved game state on mount
  const savedState = loadGameState()

  const [board, setBoard] = useState<Board>(savedState?.board || createInitialBoard)
  const [currentPlayer, setCurrentPlayer] = useState<Player>(savedState?.currentPlayer || 'pods')
  const [selectedPos, setSelectedPos] = useState<Position | null>(null)
  const [validMoves, setValidMoves] = useState<Move[]>([])
  const [difficulty, setDifficulty] = useState<Difficulty>(savedState?.difficulty || 'medium')
  const [isThinking, setIsThinking] = useState(false)
  const [gameOver, setGameOver] = useState<Player | 'draw' | null>(savedState?.gameOver || null)
  const [mustContinueJump, setMustContinueJump] = useState<Position | null>(null)
  const [moveCount, setMoveCount] = useState(savedState?.moveCount || 0)
  const [pirateTaunt, setPirateTaunt] = useState('')
  const [combatCell, setCombatCell] = useState<Position | null>(null)
  const [showCombat, setShowCombat] = useState(false)
  const [highScore, setHighScore] = useState<{ wins: number; losses: number }>(() =>
    safeGetJSON<{ wins: number; losses: number }>(SCORE_STORAGE_KEY, { wins: 0, losses: 0 }),
  )

  // Check for game over
  useEffect(() => {
    if (gameOver) return

    const podMoves = getAllMoves(board, 'pods')
    const nodeMoves = getAllMoves(board, 'nodes')
    const counts = countPieces(board)

    if (counts.pods === 0 || podMoves.length === 0) {
      setGameOver('nodes')
      emitGameEnded('checkers', 'loss', moveCount)
      setHighScore(prev => {
        const newScore = { ...prev, losses: prev.losses + 1 }
        safeSetJSON(SCORE_STORAGE_KEY, newScore)
        return newScore
      })
    } else if (counts.nodes === 0 || nodeMoves.length === 0) {
      setGameOver('pods')
      emitGameEnded('checkers', 'win', moveCount)
      setHighScore(prev => {
        const newScore = { ...prev, wins: prev.wins + 1 }
        safeSetJSON(SCORE_STORAGE_KEY, newScore)
        return newScore
      })
    }
  }, [board, gameOver, moveCount])

  // Save game state when it changes
  useEffect(() => {
    if (gameOver) {
      // Clear saved game on game over
      safeRemove(STORAGE_KEY)
    } else {
      saveGameState({
        board,
        currentPlayer,
        difficulty,
        moveCount,
        gameOver })
    }
  }, [board, currentPlayer, difficulty, moveCount, gameOver])

  // Pirate taunts while waiting for player
  useEffect(() => {
    if (currentPlayer !== 'pods' || gameOver || moveCount === 0) {
      if (tauntIntervalRef.current) {
        clearInterval(tauntIntervalRef.current)
        tauntIntervalRef.current = null
      }
      setPirateTaunt('')
      return
    }

    // Show initial taunt after a short delay
    const initialTimeout = setTimeout(() => {
      setPirateTaunt(PIRATE_TAUNTS[Math.floor(Math.random() * PIRATE_TAUNTS.length)])
    }, INITIAL_TAUNT_DELAY_MS)

    // Change taunt every 8 seconds
    tauntIntervalRef.current = setInterval(() => {
      setPirateTaunt(PIRATE_TAUNTS[Math.floor(Math.random() * PIRATE_TAUNTS.length)])
    }, TAUNT_CYCLE_INTERVAL_MS)

    return () => {
      clearTimeout(initialTimeout)
      if (tauntIntervalRef.current) {
        clearInterval(tauntIntervalRef.current)
      }
    }
  }, [currentPlayer, gameOver, moveCount])

  // Pre-game taunt after 2 seconds of being open
  useEffect(() => {
    if (moveCount > 0 || gameOver) return

    const timer = setTimeout(() => {
      setPirateTaunt(PRE_GAME_TAUNTS[Math.floor(Math.random() * PRE_GAME_TAUNTS.length)])
    }, PRE_GAME_TAUNT_DELAY_MS)

    return () => clearTimeout(timer)
  }, [moveCount, gameOver])

  // AI move - runs when it's the AI's turn (1 second delay)
  useEffect(() => {
    // Only start AI if it's nodes turn and game is active
    if (currentPlayer !== 'nodes' || gameOver) return

    // Prevent duplicate AI runs
    if (thinkingTimeoutRef.current) return

    setIsThinking(true)
    setPirateTaunt('') // Clear taunt while thinking

    // 1 second delay before AI moves
    thinkingTimeoutRef.current = setTimeout(() => {
      const depth = DIFFICULTY_DEPTH[difficulty]
      const result = minimax(board, depth, -Infinity, Infinity, true)

      if (result.move) {
        let newBoard = applyMove(board, result.move)
        let lastPos = result.move.to
        const capturedAny = result.move.isJump

        // Show combat animation for captures
        if (result.move.isJump && result.move.captures.length > 0) {
          setCombatCell(result.move.captures[0])
          setShowCombat(true)
          setTimeout(() => {
            setShowCombat(false)
            setCombatCell(null)
          }, COMBAT_ANIMATION_MS)
        }

        // Handle chain jumps
        if (result.move.isJump) {
          let chainMoves = getChainJumps(newBoard, lastPos)
          while (chainMoves.length > 0) {
            const chainMove = chainMoves[0]
            newBoard = applyMove(newBoard, chainMove)
            lastPos = chainMove.to
            chainMoves = getChainJumps(newBoard, lastPos)
          }
        }

        setBoard(newBoard)
        setMoveCount(m => m + 1)

        // Show capture taunt
        if (capturedAny) {
          setPirateTaunt(CAPTURE_TAUNTS[Math.floor(Math.random() * CAPTURE_TAUNTS.length)])
          setTimeout(() => setPirateTaunt(''), TAUNT_DISPLAY_MS)
        }
      }

      setCurrentPlayer('pods')
      setIsThinking(false)
      thinkingTimeoutRef.current = null
    }, AI_MOVE_DELAY_MS)

    return () => {
      if (thinkingTimeoutRef.current) {
        clearTimeout(thinkingTimeoutRef.current)
        thinkingTimeoutRef.current = null
      }
    }
  }, [board, currentPlayer, gameOver, difficulty]) // Trigger on board/player change

  // Handle cell click
  const handleCellClick = (row: number, col: number) => {
    if (currentPlayer !== 'pods' || gameOver || isThinking) return

    const piece = board[row][col]
    const clickedPos = { row, col }

    // If we must continue a jump, only allow clicking valid jump destinations
    if (mustContinueJump) {
      const jumpMove = validMoves.find(m =>
        m.to.row === row && m.to.col === col
      )
      if (jumpMove) {
        const newBoard = applyMove(board, jumpMove)
        setBoard(newBoard)
        setMoveCount(m => m + 1)

        // Check for more jumps
        const chainMoves = getChainJumps(newBoard, jumpMove.to)
        if (chainMoves.length > 0) {
          setMustContinueJump(jumpMove.to)
          setSelectedPos(jumpMove.to)
          setValidMoves(chainMoves)
        } else {
          setMustContinueJump(null)
          setSelectedPos(null)
          setValidMoves([])
          setCurrentPlayer('nodes')
        }
      }
      return
    }

    // Clicking on own piece - select it
    if (piece && piece.player === 'pods') {
      const allPlayerMoves = getAllMoves(board, 'pods')
      const hasJumps = allPlayerMoves.some(m => m.isJump)

      // Get moves for this piece
      let pieceMoves = getValidMoves(board, clickedPos)

      // If jumps are available anywhere, only show jumps
      if (hasJumps) {
        pieceMoves = pieceMoves.filter(m => m.isJump)
      }

      setSelectedPos(clickedPos)
      setValidMoves(pieceMoves)
      return
    }

    // Clicking on valid move destination
    if (selectedPos) {
      const move = validMoves.find(m =>
        m.to.row === row && m.to.col === col
      )

      if (move) {
        const newBoard = applyMove(board, move)
        setBoard(newBoard)
        setMoveCount(m => m + 1)

        // Check for chain jumps
        if (move.isJump) {
          const chainMoves = getChainJumps(newBoard, move.to)
          if (chainMoves.length > 0) {
            setMustContinueJump(move.to)
            setSelectedPos(move.to)
            setValidMoves(chainMoves)
            return
          }
        }

        setSelectedPos(null)
        setValidMoves([])
        setMustContinueJump(null)
        setCurrentPlayer('nodes')
      } else {
        // Clicked elsewhere, deselect
        setSelectedPos(null)
        setValidMoves([])
      }
    }
  }

  // New game
  const newGame = () => {
    setBoard(createInitialBoard())
    setCurrentPlayer('pods')
    setSelectedPos(null)
    setValidMoves([])
    setGameOver(null)
    setMustContinueJump(null)
    setMoveCount(0)
    setIsThinking(false)
    emitGameStarted('checkers')
  }

  const isSmall = !isExpanded
  const cellSize = isSmall ? 'w-7 h-7' : 'w-12 h-12'

  return (
    <div className="h-full flex flex-col p-2 select-none">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Box className="w-3 h-3 text-blue-400" />
            {t('checkers.you')}
          </span>
          <span>{t('checkers.vs')}</span>
          <span className="flex items-center gap-1">
            <Server className="w-3 h-3 text-orange-400" />
            {t('checkers.ai')}
          </span>
          <span className="text-yellow-400">
            {t('checkers.wins')}:{highScore.wins} {t('checkers.losses')}:{highScore.losses}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <Select
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value as Difficulty)}
            selectSize="sm"
            disabled={moveCount > 0 && !gameOver}
          >
            <option value="easy">{t('checkers.easy')}</option>
            <option value="medium">{t('checkers.medium')}</option>
            <option value="hard">{t('checkers.hard')}</option>
          </Select>
          <button
            onClick={newGame}
            className="p-1.5 rounded hover:bg-secondary"
            title={t('checkers.newGame')}
            aria-label={t('checkers.newGame')}
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>
      {/* Status */}
      <div className="text-center text-xs mb-2">
        {isThinking ? (
          <span className="flex items-center justify-center gap-1 text-orange-400">
            <Loader2 className="w-3 h-3 animate-spin" />
            {t('checkers.aiThinking')}
          </span>
        ) : gameOver ? (
          <span className={gameOver === 'pods' ? 'text-blue-400' : 'text-orange-400'}>
            {gameOver === 'pods' ? t('checkers.youWin') : t('checkers.aiWins')}
          </span>
        ) : mustContinueJump ? (
          <span className="text-yellow-400">{t('checkers.continueJumping')}</span>
        ) : (
          <span className={currentPlayer === 'pods' ? 'text-blue-400' : 'text-orange-400'}>
            {currentPlayer === 'pods' ? t('checkers.yourTurn') : t('checkers.aisTurn')}
          </span>
        )}
      </div>

      <CheckerBoard
        board={board}
        selectedPos={selectedPos}
        validMoves={validMoves}
        showCombat={showCombat}
        combatCell={combatCell}
        isSmall={isSmall}
        cellSize={cellSize}
        handleCellClick={handleCellClick}
      />

      {/* Pirate Taunt — below board, no overlap */}
      {pirateTaunt && (
        <div className="shrink-0 p-1 animate-fade-in">
          <div className="flex items-start gap-2 px-2">
            <div className="text-lg shrink-0">🏴‍☠️</div>
            <div className="bg-background/80 backdrop-blur-xs border border-orange-400/50 rounded-lg px-2 py-1.5 flex-1">
              <span className="text-orange-300 italic text-xs font-medium leading-tight block">
                &quot;{pirateTaunt}&quot;
              </span>
            </div>
          </div>
        </div>
      )}

      <ResultSummary
        t={t}
        gameOver={gameOver}
        moveCount={moveCount}
        newGame={newGame}
      />
    </div>
  )
}
