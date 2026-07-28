const BOARD_SIZE = 8

export type Player = 'pods' | 'nodes'
export type PieceType = 'normal' | 'king'

export interface Piece {
  player: Player
  type: PieceType
}

export interface Position {
  row: number
  col: number
}

export interface Move {
  from: Position
  to: Position
  captures: Position[]
  isJump: boolean
}

export type Board = (Piece | null)[][]

export type Difficulty = 'easy' | 'medium' | 'hard'

export const DIFFICULTY_DEPTH: Record<Difficulty, number> = {
  easy: 1,
  medium: 2,
  hard: 3,
}

export function createInitialBoard(): Board {
  const board: Board = Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(null))

  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      if ((row + col) % 2 === 1) {
        board[row][col] = { player: 'nodes', type: 'normal' }
      }
    }
  }

  for (let row = 5; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      if ((row + col) % 2 === 1) {
        board[row][col] = { player: 'pods', type: 'normal' }
      }
    }
  }

  return board
}

function cloneBoard(board: Board): Board {
  return board.map(row => row.map(cell => cell ? { ...cell } : null))
}

function getValidMoves(board: Board, pos: Position, mustJump: boolean = false): Move[] {
  const piece = board[pos.row][pos.col]
  if (!piece) return []

  const moves: Move[] = []
  const directions: number[] = []

  if (piece.type === 'king') {
    directions.push(-1, 1)
  } else {
    directions.push(piece.player === 'pods' ? -1 : 1)
  }

  for (const dRow of directions) {
    for (const dCol of [-1, 1]) {
      const jumpRow = pos.row + dRow * 2
      const jumpCol = pos.col + dCol * 2
      const midRow = pos.row + dRow
      const midCol = pos.col + dCol

      if (jumpRow >= 0 && jumpRow < BOARD_SIZE && jumpCol >= 0 && jumpCol < BOARD_SIZE) {
        const midPiece = board[midRow][midCol]
        const destPiece = board[jumpRow][jumpCol]

        if (midPiece && midPiece.player !== piece.player && !destPiece) {
          moves.push({
            from: pos,
            to: { row: jumpRow, col: jumpCol },
            captures: [{ row: midRow, col: midCol }],
            isJump: true,
          })
        }
      }
    }
  }

  if (moves.length > 0 || mustJump) {
    return moves
  }

  for (const dRow of directions) {
    for (const dCol of [-1, 1]) {
      const newRow = pos.row + dRow
      const newCol = pos.col + dCol

      if (newRow >= 0 && newRow < BOARD_SIZE && newCol >= 0 && newCol < BOARD_SIZE) {
        if (!board[newRow][newCol]) {
          moves.push({
            from: pos,
            to: { row: newRow, col: newCol },
            captures: [],
            isJump: false,
          })
        }
      }
    }
  }

  return moves
}

export function getAllMoves(board: Board, player: Player): Move[] {
  const allMoves: Move[] = []
  let hasJump = false

  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      const piece = board[row][col]
      if (piece && piece.player === player) {
        const moves = getValidMoves(board, { row, col })
        for (const move of moves) {
          if (move.isJump) hasJump = true
          allMoves.push(move)
        }
      }
    }
  }

  if (hasJump) {
    return allMoves.filter(m => m.isJump)
  }

  return allMoves
}

export function applyMove(board: Board, move: Move): Board {
  const newBoard = cloneBoard(board)
  const piece = newBoard[move.from.row][move.from.col]!

  newBoard[move.to.row][move.to.col] = piece
  newBoard[move.from.row][move.from.col] = null

  for (const cap of move.captures) {
    newBoard[cap.row][cap.col] = null
  }

  if (piece.type === 'normal') {
    if ((piece.player === 'pods' && move.to.row === 0) ||
        (piece.player === 'nodes' && move.to.row === BOARD_SIZE - 1)) {
      newBoard[move.to.row][move.to.col] = { ...piece, type: 'king' }
    }
  }

  return newBoard
}

export function getChainJumps(board: Board, pos: Position): Move[] {
  return getValidMoves(board, pos, true)
}

export function countPieces(board: Board): { pods: number; nodes: number; podKings: number; nodeKings: number } {
  let pods = 0, nodes = 0, podKings = 0, nodeKings = 0

  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      const piece = board[row][col]
      if (piece) {
        if (piece.player === 'pods') {
          pods++
          if (piece.type === 'king') podKings++
        } else {
          nodes++
          if (piece.type === 'king') nodeKings++
        }
      }
    }
  }

  return { pods, nodes, podKings, nodeKings }
}

function evaluateBoard(board: Board): number {
  const counts = countPieces(board)

  const podMoves = getAllMoves(board, 'pods')
  const nodeMoves = getAllMoves(board, 'nodes')

  if (counts.pods === 0 || podMoves.length === 0) return 1000
  if (counts.nodes === 0 || nodeMoves.length === 0) return -1000

  const nodeValue = counts.nodes + counts.nodeKings * 0.5
  const podValue = counts.pods + counts.podKings * 0.5

  let positionScore = 0
  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      const piece = board[row][col]
      if (piece) {
        const centerBonus = (3.5 - Math.abs(col - 3.5)) * 0.1
        if (piece.player === 'nodes') {
          positionScore += row * 0.1 + centerBonus
        } else {
          positionScore -= (7 - row) * 0.1 + centerBonus
        }
      }
    }
  }

  return (nodeValue - podValue) * 10 + positionScore
}

export function minimax(
  board: Board,
  depth: number,
  alpha: number,
  beta: number,
  maximizing: boolean,
): { score: number; move: Move | null } {
  const player = maximizing ? 'nodes' : 'pods'
  const moves = getAllMoves(board, player)

  if (depth === 0 || moves.length === 0) {
    return { score: evaluateBoard(board), move: null }
  }

  let bestMove: Move | null = null

  if (maximizing) {
    let maxScore = -Infinity
    for (const move of moves) {
      let newBoard = applyMove(board, move)

      if (move.isJump) {
        let chainMoves = getChainJumps(newBoard, move.to)
        while (chainMoves.length > 0) {
          const chainMove = chainMoves[0]
          newBoard = applyMove(newBoard, chainMove)
          chainMoves = getChainJumps(newBoard, chainMove.to)
        }
      }

      const result = minimax(newBoard, depth - 1, alpha, beta, false)
      if (result.score > maxScore) {
        maxScore = result.score
        bestMove = move
      }
      alpha = Math.max(alpha, result.score)
      if (beta <= alpha) break
    }
    return { score: maxScore, move: bestMove }
  }

  let minScore = Infinity
  for (const move of moves) {
    let newBoard = applyMove(board, move)

    if (move.isJump) {
      let chainMoves = getChainJumps(newBoard, move.to)
      while (chainMoves.length > 0) {
        const chainMove = chainMoves[0]
        newBoard = applyMove(newBoard, chainMove)
        chainMoves = getChainJumps(newBoard, chainMove.to)
      }
    }

    const result = minimax(newBoard, depth - 1, alpha, beta, true)
    if (result.score < minScore) {
      minScore = result.score
      bestMove = move
    }
    beta = Math.min(beta, result.score)
    if (beta <= alpha) break
  }
  return { score: minScore, move: bestMove }
}
