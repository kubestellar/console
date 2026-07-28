import { Box, Crown, Server } from 'lucide-react'
import type { Piece } from './gameLogic'

interface PieceComponentProps {
  piece: Piece
  isSelected: boolean
  isSmall: boolean
}

export function PieceComponent({ piece, isSelected, isSmall }: PieceComponentProps) {
  const isPod = piece.player === 'pods'
  const isKing = piece.type === 'king'

  return (
    <div
      className={`
        ${isSmall ? 'w-6 h-6' : 'w-10 h-10'} rounded-full flex items-center justify-center
        ${isPod ? 'bg-blue-500' : 'bg-orange-500'}
        ${isSelected ? 'ring-2 ring-yellow-400 ring-offset-1 ring-offset-background' : ''}
        shadow-md transition-all
      `}
    >
      {isKing ? (
        <Crown className={`${isSmall ? 'w-3 h-3' : 'w-5 h-5'} text-yellow-300`} />
      ) : isPod ? (
        <Box className={`${isSmall ? 'w-3 h-3' : 'w-5 h-5'} text-blue-100`} />
      ) : (
        <Server className={`${isSmall ? 'w-3 h-3' : 'w-5 h-5'} text-orange-100`} />
      )}
    </div>
  )
}
