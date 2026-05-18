// KubeChess engine — types, constants, board logic, move generation, AI

type PieceType = 'K' | 'Q' | 'R' | 'B' | 'N' | 'P' // King, Queen, Rook, Bishop, kNight, Pawn
type Color = 'white' | 'black'

interface Piece {
  type: PieceType
  color: Color
}

type Square = Piece | null
type Board = Square[][]

interface Move {
  from: { row: number; col: number }
  to: { row: number; col: number }
  piece: Piece
  captured?: Piece
  promotion?: PieceType
  castle?: 'kingside' | 'queenside'
  enPassant?: boolean
}

interface GameState {
  board: Board
  turn: Color
  moveHistory: Move[]
  castlingRights: {
    white: { kingside: boolean; queenside: boolean }
    black: { kingside: boolean; queenside: boolean }
  }
  enPassantTarget: { row: number; col: number } | null
  halfMoveClock: number
  fullMoveNumber: number
  /**
   * FIDE threefold-repetition tracking (#7890). Each entry is a canonical
   * position key (board + side-to-move + castling rights + en-passant target).
   * When any key appears here 3+ times the game is a draw by repetition.
   */
  positionHistory: string[]
}

/**
 * Minimum number of times a position must appear in history for the
 * FIDE threefold-repetition draw rule to trigger.
 */
const THREEFOLD_REPETITION_COUNT = 3

/**
 * Build the canonical position key for FIDE threefold-repetition. Per the
 * rules, two positions are "the same" iff board layout, side to move,
 * castling availability, and en-passant target square all match. The
 * half-move clock and full-move number are intentionally excluded.
 */
function positionKey(state: {
  board: Board
  turn: Color
  castlingRights: GameState['castlingRights']
  enPassantTarget: GameState['enPassantTarget']
}): string {
  const boardStr = state.board
    .map(row => row.map(p => (p ? `${p.color[0]}${p.type}` : '-')).join(''))
    .join('/')
  const castling = [
    state.castlingRights.white.kingside ? 'K' : '',
    state.castlingRights.white.queenside ? 'Q' : '',
    state.castlingRights.black.kingside ? 'k' : '',
    state.castlingRights.black.queenside ? 'q' : ''
  ].join('') || '-'
  // FIDE repetition: the en-passant target only differentiates positions
  // when the side-to-move actually has a pawn that can legally capture on
  // it. Otherwise two positions that are identical apart from a "dangling"
  // EP square must be counted as the same position (#7894).
  //
  // We use a geometric "a side-to-move pawn sits diagonally behind the EP
  // square" check. This matches the approximation used by Stockfish-style
  // Zobrist hashing and is correct for every EP-capture that isn't blocked
  // by a pin. Strict FIDE would also require that the capture doesn't
  // leave own king in check; we accept that approximation to avoid running
  // a full legality simulation inside positionKey (#7901, #7906). The
  // function still does a small amount of allocation (board.map/join), so
  // it's O(1) w.r.t. board size, not literally allocation-free. The
  // divergence from strict FIDE is reachable only in contrived pin
  // positions and won't change threefold detection in any realistic game.
  let ep = '-'
  if (state.enPassantTarget) {
    const { row: er, col: ec } = state.enPassantTarget
    // Side-to-move pawn that captures onto the EP square would sit
    // diagonally behind it (white captures up, black captures down).
    const captureFromRow = state.turn === 'white' ? er + 1 : er - 1
    if (captureFromRow >= 0 && captureFromRow < 8) {
      const canCaptureEP = [-1, 1].some(dc => {
        const cc = ec + dc
        if (cc < 0 || cc >= 8) return false
        const p = state.board[captureFromRow][cc]
        return !!p && p.type === 'P' && p.color === state.turn
      })
      if (canCaptureEP) ep = `${er},${ec}`
    }
  }
  return `${boardStr}|${state.turn}|${castling}|${ep}`
}

// Piece symbols for display
const PIECE_SYMBOLS: Record<Color, Record<PieceType, string>> = {
  white: { K: '\u2654', Q: '\u2655', R: '\u2656', B: '\u2657', N: '\u2658', P: '\u2659' },
  black: { K: '\u265A', Q: '\u265B', R: '\u265C', B: '\u265D', N: '\u265E', P: '\u265F' }
}

// Piece values for evaluation
const PIECE_VALUES: Record<PieceType, number> = {
  K: 0, // King is invaluable
  Q: 900,
  R: 500,
  B: 330,
  N: 320,
  P: 100
}

// Position bonuses for pieces (center control, development, etc.)
const PAWN_TABLE = [
  [0,  0,  0,  0,  0,  0,  0,  0],
  [50, 50, 50, 50, 50, 50, 50, 50],
  [10, 10, 20, 30, 30, 20, 10, 10],
  [5,  5, 10, 25, 25, 10,  5,  5],
  [0,  0,  0, 20, 20,  0,  0,  0],
  [5, -5,-10,  0,  0,-10, -5,  5],
  [5, 10, 10,-20,-20, 10, 10,  5],
  [0,  0,  0,  0,  0,  0,  0,  0]
]

const KNIGHT_TABLE = [
  [-50,-40,-30,-30,-30,-30,-40,-50],
  [-40,-20,  0,  0,  0,  0,-20,-40],
  [-30,  0, 10, 15, 15, 10,  0,-30],
  [-30,  5, 15, 20, 20, 15,  5,-30],
  [-30,  0, 15, 20, 20, 15,  0,-30],
  [-30,  5, 10, 15, 15, 10,  5,-30],
  [-40,-20,  0,  5,  5,  0,-20,-40],
  [-50,-40,-30,-30,-30,-30,-40,-50]
]

const STORAGE_KEY = 'kube_chess_state'
const STORAGE_KEY_STATS = 'kube_chess_stats'
const AI_THINK_DELAY_MS = 300 // delay before AI computation to allow UI to update
/** Maximum wall-clock time (ms) the AI is allowed to spend computing a move. */
const AI_TIMEOUT_MS = 5000

// Initialize the starting position
function createInitialBoard(): Board {
  const board: Board = Array(8).fill(null).map(() => Array(8).fill(null))

  // Set up pawns
  for (let col = 0; col < 8; col++) {
    board[1][col] = { type: 'P', color: 'black' }
    board[6][col] = { type: 'P', color: 'white' }
  }

  // Set up other pieces
  const backRow: PieceType[] = ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R']
  for (let col = 0; col < 8; col++) {
    board[0][col] = { type: backRow[col], color: 'black' }
    board[7][col] = { type: backRow[col], color: 'white' }
  }

  return board
}

function createInitialState(): GameState {
  const board = createInitialBoard()
  const castlingRights = {
    white: { kingside: true, queenside: true },
    black: { kingside: true, queenside: true }
  }
  const enPassantTarget: { row: number; col: number } | null = null
  return {
    board,
    turn: 'white',
    moveHistory: [],
    castlingRights,
    enPassantTarget,
    halfMoveClock: 0,
    fullMoveNumber: 1,
    positionHistory: [positionKey({ board, turn: 'white', castlingRights, enPassantTarget })]
  }
}

// Check if a square is on the board
function isValidSquare(row: number, col: number): boolean {
  return row >= 0 && row < 8 && col >= 0 && col < 8
}

// Check if a square is attacked by the given color (used for castling validation).
// Uses skipCastling=true to avoid infinite recursion with getPieceMoves.
function isSquareAttackedBy(board: Board, targetRow: number, targetCol: number, attackerColor: Color, state: GameState): boolean {
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = board[r][c]
      if (!piece || piece.color !== attackerColor) continue

      // For pawns, only check diagonal attack squares (not forward moves)
      if (piece.type === 'P') {
        const direction = piece.color === 'white' ? -1 : 1
        if (r + direction === targetRow && (c - 1 === targetCol || c + 1 === targetCol)) {
          return true
        }
        continue
      }

      // For all other pieces, get moves with skipCastling to avoid recursion
      const moves = getPieceMoves(board, r, c, state, true)
      if (moves.some(m => m.row === targetRow && m.col === targetCol)) {
        return true
      }
    }
  }
  return false
}

// Get all possible moves for a piece (without checking for check).
// skipCastling prevents infinite recursion when called from isSquareAttackedBy.
function getPieceMoves(board: Board, row: number, col: number, state: GameState, skipCastling = false): { row: number; col: number }[] {
  const piece = board[row][col]
  if (!piece) return []

  const moves: { row: number; col: number }[] = []
  const { color, type } = piece

  const directions: Record<string, number[][]> = {
    R: [[0, 1], [0, -1], [1, 0], [-1, 0]],
    B: [[1, 1], [1, -1], [-1, 1], [-1, -1]],
    Q: [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [1, -1], [-1, 1], [-1, -1]],
    K: [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [1, -1], [-1, 1], [-1, -1]],
    N: [[2, 1], [2, -1], [-2, 1], [-2, -1], [1, 2], [1, -2], [-1, 2], [-1, -2]]
  }

  if (type === 'P') {
    const direction = color === 'white' ? -1 : 1
    const startRow = color === 'white' ? 6 : 1

    // Forward move
    if (isValidSquare(row + direction, col) && !board[row + direction][col]) {
      moves.push({ row: row + direction, col })
      // Double move from start
      if (row === startRow && !board[row + 2 * direction][col]) {
        moves.push({ row: row + 2 * direction, col })
      }
    }

    // Captures
    for (const dc of [-1, 1]) {
      const newRow = row + direction
      const newCol = col + dc
      if (isValidSquare(newRow, newCol)) {
        const target = board[newRow][newCol]
        if (target && target.color !== color) {
          moves.push({ row: newRow, col: newCol })
        }
        // En passant
        if (state.enPassantTarget && state.enPassantTarget.row === newRow && state.enPassantTarget.col === newCol) {
          moves.push({ row: newRow, col: newCol })
        }
      }
    }
  } else if (type === 'N') {
    for (const [dr, dc] of directions.N) {
      const newRow = row + dr
      const newCol = col + dc
      if (isValidSquare(newRow, newCol)) {
        const target = board[newRow][newCol]
        if (!target || target.color !== color) {
          moves.push({ row: newRow, col: newCol })
        }
      }
    }
  } else if (type === 'K') {
    for (const [dr, dc] of directions.K) {
      const newRow = row + dr
      const newCol = col + dc
      if (isValidSquare(newRow, newCol)) {
        const target = board[newRow][newCol]
        if (!target || target.color !== color) {
          moves.push({ row: newRow, col: newCol })
        }
      }
    }
    // Castling - only when not skipping (to avoid recursion from isSquareAttackedBy)
    if (!skipCastling) {
      const rights = state.castlingRights[color]
      const backRank = color === 'white' ? 7 : 0
      const opponent = color === 'white' ? 'black' : 'white'

      if (row === backRank && col === 4) {
        // Cannot castle while in check
        const kingInCheck = isSquareAttackedBy(board, backRank, 4, opponent, state)

        if (!kingInCheck) {
          // Kingside: rook must be present, squares empty, king must not pass through or land on attacked square
          const kingsideRook = board[backRank][7]
          if (rights.kingside &&
              kingsideRook && kingsideRook.type === 'R' && kingsideRook.color === color &&
              !board[backRank][5] && !board[backRank][6] &&
              !isSquareAttackedBy(board, backRank, 5, opponent, state) &&
              !isSquareAttackedBy(board, backRank, 6, opponent, state)) {
            moves.push({ row: backRank, col: 6 })
          }

          // Queenside: rook must be present, squares empty, king must not pass through or land on attacked square
          const queensideRook = board[backRank][0]
          if (rights.queenside &&
              queensideRook && queensideRook.type === 'R' && queensideRook.color === color &&
              !board[backRank][1] && !board[backRank][2] && !board[backRank][3] &&
              !isSquareAttackedBy(board, backRank, 2, opponent, state) &&
              !isSquareAttackedBy(board, backRank, 3, opponent, state)) {
            moves.push({ row: backRank, col: 2 })
          }
        }
      }
    }
  } else {
    // Sliding pieces (R, B, Q)
    const dirs = type === 'R' ? directions.R : type === 'B' ? directions.B : directions.Q
    for (const [dr, dc] of dirs) {
      let newRow = row + dr
      let newCol = col + dc
      while (isValidSquare(newRow, newCol)) {
        const target = board[newRow][newCol]
        if (!target) {
          moves.push({ row: newRow, col: newCol })
        } else {
          if (target.color !== color) {
            moves.push({ row: newRow, col: newCol })
          }
          break
        }
        newRow += dr
        newCol += dc
      }
    }
  }

  return moves
}

// Find the king position
function findKing(board: Board, color: Color): { row: number; col: number } | null {
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const piece = board[row][col]
      if (piece && piece.type === 'K' && piece.color === color) {
        return { row, col }
      }
    }
  }
  return null
}

// Check if a color is in check
function isInCheck(board: Board, color: Color, state: GameState): boolean {
  const kingPos = findKing(board, color)
  if (!kingPos) return false

  const opponent = color === 'white' ? 'black' : 'white'

  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const piece = board[row][col]
      if (piece && piece.color === opponent) {
        const moves = getPieceMoves(board, row, col, state)
        if (moves.some(m => m.row === kingPos.row && m.col === kingPos.col)) {
          return true
        }
      }
    }
  }
  return false
}

// Make a move and return the new state
/**
 * Apply a move to the given state.
 *
 * `trackHistory` defaults to `false` because the overwhelming majority of
 * calls come from search/legality checks (`getAllLegalMoves`, `minimax`,
 * UI hover validation) where spreading `positionHistory` on every simulated
 * move is unnecessary O(n) work (#7894). Only the three UI-commit call
 * sites (user click, promotion, AI-commit) pass `trackHistory = true` to
 * actually extend the repetition record.
 */
function makeMove(state: GameState, from: { row: number; col: number }, to: { row: number; col: number }, promotion?: PieceType, trackHistory = false): GameState {
  const newBoard = state.board.map(row => [...row])
  const piece = newBoard[from.row][from.col]!
  const captured = newBoard[to.row][to.col]

  // Handle en passant capture
  let enPassantCapture = false
  if (piece.type === 'P' && state.enPassantTarget &&
      to.row === state.enPassantTarget.row && to.col === state.enPassantTarget.col) {
    const captureRow = piece.color === 'white' ? to.row + 1 : to.row - 1
    newBoard[captureRow][to.col] = null
    enPassantCapture = true
  }

  // Handle castling
  let castle: 'kingside' | 'queenside' | undefined
  if (piece.type === 'K' && Math.abs(to.col - from.col) === 2) {
    castle = to.col > from.col ? 'kingside' : 'queenside'
    const rookFromCol = castle === 'kingside' ? 7 : 0
    const rookToCol = castle === 'kingside' ? 5 : 3
    newBoard[from.row][rookToCol] = newBoard[from.row][rookFromCol]
    newBoard[from.row][rookFromCol] = null
  }

  // Move the piece
  newBoard[to.row][to.col] = piece
  newBoard[from.row][from.col] = null

  // Handle promotion
  if (piece.type === 'P' && (to.row === 0 || to.row === 7)) {
    newBoard[to.row][to.col] = { type: promotion || 'Q', color: piece.color }
  }

  // Update castling rights
  const newCastlingRights = {
    white: { ...state.castlingRights.white },
    black: { ...state.castlingRights.black }
  }

  if (piece.type === 'K') {
    newCastlingRights[piece.color] = { kingside: false, queenside: false }
  } else if (piece.type === 'R') {
    if (from.col === 0) newCastlingRights[piece.color].queenside = false
    if (from.col === 7) newCastlingRights[piece.color].kingside = false
  }

  // Update en passant target
  let newEnPassantTarget: { row: number; col: number } | null = null
  if (piece.type === 'P' && Math.abs(to.row - from.row) === 2) {
    newEnPassantTarget = { row: (from.row + to.row) / 2, col: from.col }
  }

  const move: Move = {
    from, to, piece,
    captured: captured || undefined,
    promotion: promotion,
    castle,
    enPassant: enPassantCapture
  }

  const newTurn: Color = state.turn === 'white' ? 'black' : 'white'
  // Pawn moves and captures are "irreversible" — they reset both the
  // halfMoveClock (fifty-move rule) and flush the repetition history
  // (FIDE: repetitions only count when they occur in the same game
  // continuation with no pawn move or capture in between).
  const isIrreversible = !!captured || piece.type === 'P'
  // Only compute + append the new position key when the caller asked to
  // track history (UI commits). In search paths we pass through the parent
  // reference unchanged so minimax doesn't allocate per simulated move.
  let newPositionHistory: string[]
  if (trackHistory) {
    const newKey = positionKey({
      board: newBoard,
      turn: newTurn,
      castlingRights: newCastlingRights,
      enPassantTarget: newEnPassantTarget
    })
    newPositionHistory = isIrreversible
      ? [newKey]
      : [...(state.positionHistory || []), newKey]
  } else {
    newPositionHistory = state.positionHistory || []
  }

  return {
    board: newBoard,
    turn: newTurn,
    moveHistory: [...state.moveHistory, move],
    castlingRights: newCastlingRights,
    enPassantTarget: newEnPassantTarget,
    halfMoveClock: isIrreversible ? 0 : state.halfMoveClock + 1,
    fullMoveNumber: state.turn === 'black' ? state.fullMoveNumber + 1 : state.fullMoveNumber,
    positionHistory: newPositionHistory
  }
}

// Get all legal moves for a color
function getAllLegalMoves(state: GameState, color: Color): { from: { row: number; col: number }; to: { row: number; col: number } }[] {
  const moves: { from: { row: number; col: number }; to: { row: number; col: number } }[] = []

  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const piece = state.board[row][col]
      if (piece && piece.color === color) {
        const pieceMoves = getPieceMoves(state.board, row, col, state)
        for (const to of pieceMoves) {
          // Check if the move leaves the king in check
          const newState = makeMove(state, { row, col }, to)
          if (!isInCheck(newState.board, color, newState)) {
            moves.push({ from: { row, col }, to })
          }
        }
      }
    }
  }

  return moves
}

// Check for checkmate, stalemate, or draw by threefold repetition (#7890)
function getGameResult(state: GameState): 'checkmate' | 'stalemate' | 'repetition' | 'ongoing' {
  const legalMoves = getAllLegalMoves(state, state.turn)
  if (legalMoves.length === 0) {
    return isInCheck(state.board, state.turn, state) ? 'checkmate' : 'stalemate'
  }
  // FIDE threefold-repetition: any position occurring 3+ times in the
  // current irreversible segment ends the game in a draw.
  const history = state.positionHistory || []
  const counts = new Map<string, number>()
  for (const key of history) {
    const next = (counts.get(key) || 0) + 1
    if (next >= THREEFOLD_REPETITION_COUNT) return 'repetition'
    counts.set(key, next)
  }
  return 'ongoing'
}

// Evaluate board position
function evaluateBoard(board: Board, state: GameState): number {
  let score = 0

  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const piece = board[row][col]
      if (piece) {
        let pieceScore = PIECE_VALUES[piece.type]

        // Add position bonus
        if (piece.type === 'P') {
          pieceScore += piece.color === 'white' ? PAWN_TABLE[row][col] : PAWN_TABLE[7-row][col]
        } else if (piece.type === 'N') {
          pieceScore += piece.color === 'white' ? KNIGHT_TABLE[row][col] : KNIGHT_TABLE[7-row][col]
        }

        score += piece.color === 'white' ? pieceScore : -pieceScore
      }
    }
  }

  // Bonus for check
  if (isInCheck(board, 'black', state)) score += 50
  if (isInCheck(board, 'white', state)) score -= 50

  return score
}

// Maximum number of positions to evaluate before bailing out
const MAX_POSITIONS_EVALUATED = 50_000

// Minimax with alpha-beta pruning and position count limit
function minimax(state: GameState, depth: number, alpha: number, beta: number, maximizing: boolean, counter: { count: number; deadline: number }): number {
  counter.count++

  // Bail out if we've evaluated too many positions or exceeded time budget
  if (counter.count >= MAX_POSITIONS_EVALUATED || performance.now() > counter.deadline) {
    return evaluateBoard(state.board, state)
  }

  if (depth === 0) {
    return evaluateBoard(state.board, state)
  }

  // Inline terminal checks using a single legal-move generation: calling
  // `getGameResult` here and then `getAllLegalMoves` below would double the
  // move-generation cost per search node (#7906). Generate once, then
  // derive checkmate / stalemate from `moves.length === 0`.
  //
  // Repetition ('threefold draw') is NOT reachable from inside the search
  // tree because `makeMove` calls in minimax run with `trackHistory=false`
  // for perf — `positionHistory` never accumulates matching keys here.
  // That's why we don't need the `getGameResult === 'repetition'` branch;
  // the omission is deliberate (#7901).
  const moves = getAllLegalMoves(state, state.turn)
  if (moves.length === 0) {
    return isInCheck(state.board, state.turn, state)
      ? (maximizing ? -10000 + state.moveHistory.length : 10000 - state.moveHistory.length)
      : 0 // stalemate
  }

  // Sort moves by capture value for better alpha-beta pruning
  moves.sort((a, b) => {
    const captureA = state.board[a.to.row][a.to.col]
    const captureB = state.board[b.to.row][b.to.col]
    const valueA = captureA ? PIECE_VALUES[captureA.type] : 0
    const valueB = captureB ? PIECE_VALUES[captureB.type] : 0
    return valueB - valueA // captures first
  })

  if (maximizing) {
    let maxEval = -Infinity
    for (const move of moves) {
      const newState = makeMove(state, move.from, move.to)
      const evalScore = minimax(newState, depth - 1, alpha, beta, false, counter)
      maxEval = Math.max(maxEval, evalScore)
      alpha = Math.max(alpha, evalScore)
      if (beta <= alpha) break
    }
    return maxEval
  } else {
    let minEval = Infinity
    for (const move of moves) {
      const newState = makeMove(state, move.from, move.to)
      const evalScore = minimax(newState, depth - 1, alpha, beta, true, counter)
      minEval = Math.min(minEval, evalScore)
      beta = Math.min(beta, evalScore)
      if (beta <= alpha) break
    }
    return minEval
  }
}

// AI move selection
function findBestMove(state: GameState, depth: number): { from: { row: number; col: number }; to: { row: number; col: number } } | null {
  const moves = getAllLegalMoves(state, state.turn)
  if (moves.length === 0) return null

  // Sort moves: captures first for better pruning
  moves.sort((a, b) => {
    const captureA = state.board[a.to.row][a.to.col]
    const captureB = state.board[b.to.row][b.to.col]
    const valueA = captureA ? PIECE_VALUES[captureA.type] : 0
    const valueB = captureB ? PIECE_VALUES[captureB.type] : 0
    return valueB - valueA
  })

  const counter = { count: 0, deadline: performance.now() + AI_TIMEOUT_MS }
  let bestMove = moves[0]
  let bestScore = state.turn === 'white' ? -Infinity : Infinity

  for (const move of moves) {
    // If we've hit the position limit or exceeded time budget, stop and use best so far
    if (counter.count > MAX_POSITIONS_EVALUATED || performance.now() > counter.deadline) break

    const newState = makeMove(state, move.from, move.to)
    const score = minimax(newState, depth - 1, -Infinity, Infinity, state.turn === 'black', counter)

    if (state.turn === 'white' && score > bestScore) {
      bestScore = score
      bestMove = move
    } else if (state.turn === 'black' && score < bestScore) {
      bestScore = score
      bestMove = move
    }
  }

  return bestMove
}


export {
  AI_THINK_DELAY_MS, PIECE_SYMBOLS, STORAGE_KEY, STORAGE_KEY_STATS,
  positionKey, createInitialBoard, createInitialState, isValidSquare,
  isSquareAttackedBy, getPieceMoves, findKing, isInCheck,
  makeMove, getAllLegalMoves, getGameResult, evaluateBoard,
  minimax, findBestMove,
}
export type { PieceType, Color, Piece, Square, Board, Move, GameState }
