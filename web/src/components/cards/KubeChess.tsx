import { useState, useEffect, useMemo, useRef } from 'react'
import { useCardExpanded } from './CardWrapper'
import { useReportCardDataState } from './CardDataContext'
import { RotateCcw, ChevronLeft, ChevronRight, Crown, Settings } from 'lucide-react'
import { DynamicCardErrorBoundary } from './DynamicCardErrorBoundary'
import { emitGameStarted, emitGameEnded } from '../../lib/analytics'

// Chess piece types
import {
  type PieceType, type Color, type GameState,
  AI_THINK_DELAY_MS, PIECE_SYMBOLS, STORAGE_KEY, STORAGE_KEY_STATS,
  positionKey, createInitialState,
  getPieceMoves, isInCheck, makeMove,
  getGameResult, findBestMove,
} from './KubeChess.engine'

function KubeChessInternal() {
  const { isExpanded } = useCardExpanded()

  const [gameState, setGameState] = useState<GameState>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        const parsed = JSON.parse(saved) as GameState
        // Migrate older saves that pre-date threefold-repetition tracking.
        // Seed the history with the loaded position so it counts as
        // occurrence 1 — otherwise the current position would need to
        // appear 3 MORE times (total 4) to trigger the draw (#7894).
        if (!parsed.positionHistory || parsed.positionHistory.length === 0) {
          parsed.positionHistory = [positionKey({
            board: parsed.board,
            turn: parsed.turn,
            castlingRights: parsed.castlingRights,
            enPassantTarget: parsed.enPassantTarget
          })]
        }
        return parsed
      }
    } catch { /* ignore */ }
    return createInitialState()
  })

  const [selectedSquare, setSelectedSquare] = useState<{ row: number; col: number } | null>(null)
  const [validMoves, setValidMoves] = useState<{ row: number; col: number }[]>([])
  const [playerColor, setPlayerColor] = useState<Color>('white')
  const [difficulty, setDifficulty] = useState<1 | 2 | 3>(2) // 1=easy, 2=medium, 3=hard
  const [isThinking, setIsThinking] = useState(false)
  const isThinkingRef = useRef(false)
  /** Incremented on reset/flip to signal in-flight AI setTimeout to bail out. */
  const aiGenerationRef = useRef(0)
  const [showSettings, setShowSettings] = useState(false)
  const [promotionPending, setPromotionPending] = useState<{ from: { row: number; col: number }; to: { row: number; col: number } } | null>(null)
  const [stats, setStats] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_STATS)
      if (saved) return JSON.parse(saved)
    } catch { /* ignore */ }
    return { wins: 0, losses: 0, draws: 0 }
  })

  const gameResult = useMemo(() => getGameResult(gameState), [gameState])
  const inCheck = isInCheck(gameState.board, gameState.turn, gameState)

  // Save game state
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(gameState))
    } catch { /* ignore storage errors */ }
  }, [gameState])

  // Save stats
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_STATS, JSON.stringify(stats))
    } catch { /* ignore storage errors */ }
  }, [stats])

  // AI move - use ref to prevent re-triggering loops
  useEffect(() => {
    if (gameState.turn !== playerColor && gameResult === 'ongoing' && !isThinkingRef.current) {
      isThinkingRef.current = true
      setIsThinking(true)

      // Capture the current generation so we can detect reset/flip during compute
      const generation = aiGenerationRef.current

      // Use setTimeout to allow UI to update before heavy computation
      const id = setTimeout(() => {
        try {
          // Bail out if the game was reset/flipped while waiting
          if (aiGenerationRef.current !== generation) return

          const depth = difficulty + 1 // 2, 3, or 4
          const bestMove = findBestMove(gameState, depth)

          // Bail out if reset/flipped during computation
          if (aiGenerationRef.current !== generation) return

          if (bestMove) {
            // UI commit: track repetition history.
            setGameState(prev => makeMove(prev, bestMove.from, bestMove.to, undefined, true))
          }
        } finally {
          // Always clear thinking state, even if computation errors
          isThinkingRef.current = false
          setIsThinking(false)
        }
      }, AI_THINK_DELAY_MS)
      return () => {
        clearTimeout(id)
        isThinkingRef.current = false
        setIsThinking(false)
      }
    }
  }, [gameState.turn, playerColor, gameResult, difficulty, gameState])

  // Update stats on game end
  useEffect(() => {
    if (gameResult !== 'ongoing') {
      if (gameResult === 'stalemate' || gameResult === 'repetition') {
        setStats((prev: typeof stats) => ({ ...prev, draws: prev.draws + 1 }))
        emitGameEnded('chess', 'draw', 0)
      } else {
        const winner = gameState.turn === 'white' ? 'black' : 'white'
        if (winner === playerColor) {
          setStats((prev: typeof stats) => ({ ...prev, wins: prev.wins + 1 }))
          emitGameEnded('chess', 'win', 0)
        } else {
          setStats((prev: typeof stats) => ({ ...prev, losses: prev.losses + 1 }))
          emitGameEnded('chess', 'loss', 0)
        }
      }
    }
  }, [gameResult, gameState.turn, playerColor])

  // Handle square click
  const handleSquareClick = (row: number, col: number) => {
    if (gameState.turn !== playerColor || gameResult !== 'ongoing' || isThinking) return

    const piece = gameState.board[row][col]

    // If a piece is selected
    if (selectedSquare) {
      // Check if clicking a valid move
      const isValidMove = validMoves.some(m => m.row === row && m.col === col)

      if (isValidMove) {
        const movingPiece = gameState.board[selectedSquare.row][selectedSquare.col]

        // Check for pawn promotion
        if (movingPiece?.type === 'P' && (row === 0 || row === 7)) {
          setPromotionPending({ from: selectedSquare, to: { row, col } })
        } else {
          // UI commit: track repetition history.
          setGameState(prev => makeMove(prev, selectedSquare, { row, col }, undefined, true))
        }

        setSelectedSquare(null)
        setValidMoves([])
        return
      }

      // Deselect if clicking same square or invalid move
      if (selectedSquare.row === row && selectedSquare.col === col) {
        setSelectedSquare(null)
        setValidMoves([])
        return
      }
    }

    // Select a piece of the current player
    if (piece && piece.color === playerColor) {
      setSelectedSquare({ row, col })

      // Calculate valid moves
      const moves = getPieceMoves(gameState.board, row, col, gameState)
      const legalMoves = moves.filter(to => {
        const newState = makeMove(gameState, { row, col }, to)
        return !isInCheck(newState.board, playerColor, newState)
      })
      setValidMoves(legalMoves)
    } else {
      setSelectedSquare(null)
      setValidMoves([])
    }
  }

  // Handle promotion
  const handlePromotion = (pieceType: PieceType) => {
    if (promotionPending) {
      // UI commit: track repetition history.
      setGameState(prev => makeMove(prev, promotionPending.from, promotionPending.to, pieceType, true))
      setPromotionPending(null)
    }
  }

  // Reset game — bump generation to abort any in-flight AI computation
  const resetGame = () => {
    aiGenerationRef.current++
    isThinkingRef.current = false
    setIsThinking(false)
    setGameState(createInitialState())
    setSelectedSquare(null)
    setValidMoves([])
    setPromotionPending(null)
    emitGameStarted('chess')
  }

  // Flip board — bump generation to abort any in-flight AI computation
  const flipBoard = () => {
    aiGenerationRef.current++
    isThinkingRef.current = false
    setIsThinking(false)
    setPlayerColor(prev => prev === 'white' ? 'black' : 'white')
  }

  const cellSize = isExpanded ? 56 : 40

  // Render the board
  const renderBoard = () => {
    const rows = []
    const boardRows = playerColor === 'white' ? [0, 1, 2, 3, 4, 5, 6, 7] : [7, 6, 5, 4, 3, 2, 1, 0]
    const boardCols = playerColor === 'white' ? [0, 1, 2, 3, 4, 5, 6, 7] : [7, 6, 5, 4, 3, 2, 1, 0]

    for (const row of boardRows) {
      const cols = []
      for (const col of boardCols) {
        const piece = gameState.board[row][col]
        const isLight = (row + col) % 2 === 0
        const isSelected = selectedSquare?.row === row && selectedSquare?.col === col
        const isValidMove = validMoves.some(m => m.row === row && m.col === col)
        const isLastMove = gameState.moveHistory.length > 0 && (
          (gameState.moveHistory[gameState.moveHistory.length - 1].from.row === row &&
           gameState.moveHistory[gameState.moveHistory.length - 1].from.col === col) ||
          (gameState.moveHistory[gameState.moveHistory.length - 1].to.row === row &&
           gameState.moveHistory[gameState.moveHistory.length - 1].to.col === col)
        )
        const isInCheckSquare = inCheck && piece?.type === 'K' && piece?.color === gameState.turn

        cols.push(
          <div
            key={`${row}-${col}`}
            onClick={() => handleSquareClick(row, col)}
            className={`
              flex items-center justify-center cursor-pointer relative
              ${isLight ? 'bg-yellow-100 dark:bg-yellow-200' : 'bg-yellow-700 dark:bg-yellow-800'}
              ${isSelected ? 'ring-2 ring-blue-500 ring-inset z-10' : ''}
              ${isLastMove ? 'bg-yellow-300/50 dark:bg-yellow-400/30' : ''}
              ${isInCheckSquare ? 'bg-red-500/50' : ''}
            `}
            style={{ width: cellSize, height: cellSize }}
          >
            {/* Valid move indicator */}
            {isValidMove && (
              <div className={`absolute inset-0 flex items-center justify-center ${piece ? '' : ''}`}>
                {piece ? (
                  <div className="absolute inset-1 border-4 border-blue-500/50 rounded-full" />
                ) : (
                  <div className="w-3 h-3 rounded-full bg-blue-500/50" />
                )}
              </div>
            )}

            {/* Piece */}
            {piece && (
              <span
                className={`text-${isExpanded ? '4xl' : '2xl'} select-none ${
                  piece.color === 'white' ? 'text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)]' : 'text-gray-900 dark:text-gray-950'
                }`}
                style={{ fontSize: cellSize * 0.7 }}
              >
                {PIECE_SYMBOLS[piece.color][piece.type]}
              </span>
            )}
          </div>
        )
      }
      rows.push(
        <div key={row} className="flex">
          {cols}
        </div>
      )
    }
    return rows
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex flex-col items-center gap-3">
        {/* Status */}
        <div className="flex flex-wrap items-center justify-between gap-y-2 w-full max-w-xs">
          <div className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded-full ${gameState.turn === 'white' ? 'bg-white border border-gray-300 dark:border-gray-600' : 'bg-gray-800 dark:bg-gray-900'}`} />
            <span className="text-sm font-medium">
              {isThinking ? 'AI thinking...' : (
                gameResult !== 'ongoing' ? (
                  gameResult === 'checkmate' ? `Checkmate! ${gameState.turn === 'white' ? 'Black' : 'White'} wins!` :
                  gameResult === 'repetition' ? 'Draw by threefold repetition!' :
                  'Stalemate - Draw!'
                ) : (
                  inCheck ? 'Check!' : `${gameState.turn}'s turn`
                )
              )}
            </span>
          </div>
          <div className="text-xs text-muted-foreground">
            Move {gameState.fullMoveNumber}
          </div>
        </div>

        {/* Board */}
        <div className="relative">
          <div className="border-2 border-yellow-900 rounded overflow-hidden shadow-lg">
            {renderBoard()}
          </div>

          {/* Promotion dialog */}
          {promotionPending && (
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
              <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-xl">
                <p className="text-sm font-medium mb-3 text-center">Promote to:</p>
                <div className="flex gap-2">
                  {(['Q', 'R', 'B', 'N'] as PieceType[]).map(type => (
                    <button
                      key={type}
                      onClick={() => handlePromotion(type)}
                      className="w-12 h-12 flex items-center justify-center bg-yellow-100 dark:bg-yellow-200 rounded hover:bg-yellow-200 dark:hover:bg-yellow-300 transition-colors"
                    >
                      <span className="text-3xl">
                        {PIECE_SYMBOLS[playerColor][type]}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Game over overlay */}
          {gameResult !== 'ongoing' && (
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
              <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-xl text-center">
                <Crown className={`w-12 h-12 mx-auto mb-2 ${
                  // Draws (stalemate/repetition) get the neutral yellow;
                  // checkmate is colored by who won (#7894).
                  gameResult === 'stalemate' || gameResult === 'repetition' ? 'text-yellow-500' :
                  (gameState.turn !== playerColor ? 'text-green-500' : 'text-red-500')
                }`} />
                <p className="text-lg font-bold mb-3">
                  {gameResult === 'checkmate'
                    ? (gameState.turn !== playerColor ? 'You Win!' : 'You Lose!')
                    : gameResult === 'repetition'
                      ? 'Draw by threefold repetition!'
                      : 'Stalemate!'}
                </p>
                <button
                  onClick={resetGame}
                  className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90"
                >
                  New Game
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="flex gap-2 flex-wrap justify-center">
          <button
            onClick={resetGame}
            className="flex items-center gap-1 px-3 py-1 bg-secondary hover:bg-secondary/80 rounded text-sm"
            title="New Game"
          >
            <RotateCcw className="w-4 h-4" />
            New
          </button>
          <button
            onClick={flipBoard}
            className="flex items-center gap-1 px-3 py-1 bg-secondary hover:bg-secondary/80 rounded text-sm"
            title="Play as other color"
          >
            <ChevronLeft className="w-4 h-4" />
            <ChevronRight className="w-4 h-4" />
            Flip
          </button>
          <button
            onClick={() => setShowSettings(!showSettings)}
            className={`flex items-center gap-1 px-3 py-1 rounded text-sm ${
              showSettings ? 'bg-primary/20 text-primary' : 'bg-secondary hover:bg-secondary/80'
            }`}
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>

        {/* Settings panel */}
        {showSettings && (
          <div className="w-full max-w-xs p-3 bg-secondary/30 rounded-lg">
            <div className="mb-3">
              <label className="text-xs text-muted-foreground block mb-1">Difficulty</label>
              <div className="flex gap-1">
                {[1, 2, 3].map(d => (
                  <button
                    key={d}
                    onClick={() => setDifficulty(d as 1 | 2 | 3)}
                    className={`flex-1 py-1 text-xs rounded ${
                      difficulty === d
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-secondary hover:bg-secondary/80'
                    }`}
                  >
                    {d === 1 ? 'Easy' : d === 2 ? 'Medium' : 'Hard'}
                  </button>
                ))}
              </div>
            </div>
            <div className="text-xs text-muted-foreground">
              Stats: W{stats.wins} / L{stats.losses} / D{stats.draws}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export function KubeChess() {
  useReportCardDataState({ hasData: true, isFailed: false, consecutiveFailures: 0, isDemoData: false })
  return (
    <DynamicCardErrorBoundary cardId="KubeChess">
      <KubeChessInternal />
    </DynamicCardErrorBoundary>
  )
}
