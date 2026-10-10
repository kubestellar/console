import { Box, Server, RotateCcw, Trophy, Play, Loader2 } from 'lucide-react'
import { CardComponentProps } from './cardRegistry.types'
import { useCardExpanded } from './CardWrapper'
import { useReportCardDataState, useCardDemoState } from './CardDataContext'
import { useTranslation } from 'react-i18next'
import { Select } from '../ui/Select'
import { PieceComponent } from './CheckersPiece'
import type { Difficulty } from './Checkers.types'
import { useCheckersGame } from './useCheckersGame'


export function Checkers(_props: CardComponentProps) {
  const { t } = useTranslation(['cards', 'common'])
  const { shouldUseDemoData } = useCardDemoState({ requires: 'none' })
  useReportCardDataState({ hasData: true, isFailed: false, consecutiveFailures: 0, isDemoData: shouldUseDemoData })
  const { isExpanded } = useCardExpanded()
  const {
    board,
    currentPlayer,
    selectedPos,
    validMoves,
    difficulty,
    setDifficulty,
    isThinking,
    gameOver,
    mustContinueJump,
    moveCount,
    pirateTaunt,
    combatCell,
    showCombat,
    highScore,
    handleCellClick,
    newGame,
  } = useCheckersGame()

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

      {/* Board */}
      <div className="flex-1 flex items-center justify-center min-h-0">
        <div className="inline-block border border-border rounded overflow-hidden">
          {board.map((row, rowIdx) => (
            <div key={rowIdx} className="flex shrink-0">
              {row.map((piece, colIdx) => {
                const isDark = (rowIdx + colIdx) % 2 === 1
                const isSelected = selectedPos?.row === rowIdx && selectedPos?.col === colIdx
                const isValidMove = validMoves.some(m => m.to.row === rowIdx && m.to.col === colIdx)
                const isCapture = validMoves.some(m =>
                  m.to.row === rowIdx && m.to.col === colIdx && m.isJump
                )
                const isCombatCell = showCombat && combatCell?.row === rowIdx && combatCell?.col === colIdx

                return (
                  <div
                    key={colIdx}
                    onClick={() => handleCellClick(rowIdx, colIdx)}
                    className={`
                      ${cellSize} shrink-0 flex items-center justify-center cursor-pointer transition-colors relative
                      ${isDark ? 'bg-green-800' : 'bg-green-200'}
                      ${isValidMove && !isCapture ? 'ring-2 ring-inset ring-green-400' : ''}
                      ${isCapture ? 'ring-2 ring-inset ring-red-400 bg-red-500/30' : ''}
                      ${isSelected ? 'bg-yellow-500/30' : ''}
                      ${isCombatCell ? 'animate-pulse bg-red-600' : ''}
                    `}>
                    {/* Combat explosion effect */}
                    {isCombatCell && (
                      <div className="absolute inset-0 flex items-center justify-center z-10">
                        <span className="text-2xl animate-bounce">💥</span>
                      </div>
                    )}
                    {piece && (
                      <PieceComponent
                        piece={piece}
                        isSelected={isSelected}
                        isSmall={isSmall}
                      />
                    )}
                    {isValidMove && !piece && (
                      <div className={`${isSmall ? 'w-2 h-2' : 'w-3 h-3'} rounded-full ${isCapture ? 'bg-red-400' : 'bg-green-400'} opacity-60`} />
                    )}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>

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

      {/* Game over overlay */}
      {gameOver && (
        <div className="absolute inset-0 bg-background/80 flex items-center justify-center rounded-lg">
          <div className="text-center p-6 bg-card rounded-xl border border-border shadow-lg">
            <Trophy className={`w-12 h-12 mx-auto mb-3 ${gameOver === 'pods' ? 'text-blue-400' : 'text-orange-400'}`} />
            <h3 className="text-xl font-bold text-foreground mb-2">
              {gameOver === 'pods' ? t('checkers.youWon') : t('checkers.aiWinsExclaim')}
            </h3>
            <p className="text-muted-foreground mb-4">
              {moveCount} {t('checkers.movesPlayed')}
            </p>
            <button
              onClick={newGame}
              className="flex items-center gap-2 px-4 py-2 bg-purple-500/20 text-purple-400 rounded-lg mx-auto hover:bg-purple-500/30"
            >
              <Play className="w-4 h-4" />
              {t('checkers.playAgain')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
