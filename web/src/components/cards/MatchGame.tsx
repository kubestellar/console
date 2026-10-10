import {
  Box, Terminal,
  Play, Pause, RotateCcw, Trophy, Clock, Hash
} from 'lucide-react'
import { CardComponentProps } from './cardRegistry.types'
import { useCardExpanded } from './CardWrapper'
import { useReportCardDataState } from './CardDataContext'
import { useTranslation } from 'react-i18next'
import type { CSSProperties } from 'react'
import { CARD_ICONS, DIFFICULTY_CONFIG, type Difficulty } from './MatchGame.constants'
import { useMatchGame } from './useMatchGame'

// Inline style constants
const MATCH_GAME_CANVAS_STYLE_1: CSSProperties = { width: '100%', height: '100%' }

const formatTime = (seconds: number) => {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

export function MatchGame(_props: CardComponentProps) {
  const { t } = useTranslation()
  useReportCardDataState({ hasData: true, isFailed: false, consecutiveFailures: 0, isDemoData: false })
  const { isExpanded } = useCardExpanded()
  const {
    difficulty, cards, flippedCards, moves, time, isPlaying, isPaused, gameWon, highScores,
    canvasRef, initGame, handleCardClick, togglePause, resetGame, changeDifficulty,
  } = useMatchGame()

  const { rows, cols } = DIFFICULTY_CONFIG[difficulty]

  return (
    <div className={`flex flex-col gap-2 h-full relative ${isExpanded ? 'flex-1 min-h-0' : ''}`}>
      {/* Canvas for confetti */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 pointer-events-none z-50"
        style={MATCH_GAME_CANVAS_STYLE_1}
      />

      {/* Header with controls */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {/* Difficulty selector */}
        <div className="flex gap-1">
          {(['easy', 'medium', 'hard'] as Difficulty[]).map(d => (
            <button
              key={d}
              onClick={() => changeDifficulty(d)}
              className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
                difficulty === d
                  ? 'bg-purple-500 text-white'
                  : 'bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-muted-foreground'
              }`}
            >
              {d.charAt(0).toUpperCase() + d.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Game stats */}
      {isPlaying && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-1.5">
            <Hash className="w-3.5 h-3.5 text-blue-400" />
            <span>Moves: <span className="font-bold">{moves}</span></span>
          </div>
          <div className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-green-400" />
            <span>Time: <span className="font-bold">{formatTime(time)}</span></span>
          </div>
          <div className="flex gap-1">
            <span
              role="button"
              tabIndex={0}
              aria-label={isPaused ? 'Resume game' : 'Pause game'}
              onClick={togglePause}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); togglePause() } }}
              className="p-0.5 rounded bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 transition-colors cursor-pointer"
              title={isPaused ? 'Resume' : 'Pause'}
            >
              {isPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
            </span>
            <span
              role="button"
              tabIndex={0}
              aria-label={t('common.reset')}
              onClick={resetGame}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); resetGame() } }}
              className="p-0.5 rounded bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 transition-colors cursor-pointer"
              title={t('common.reset')}
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </span>
          </div>
        </div>
      )}

      {/* High score display */}
      {highScores[difficulty] && !isPlaying && (
        <div className="text-xs text-center py-1 px-2 bg-yellow-500/10 border border-yellow-500/20 rounded">
          <Trophy className="w-3 h-3 inline mr-1 text-yellow-400" />
          Best: {highScores[difficulty]!.moves} moves in {formatTime(highScores[difficulty]!.time)}
        </div>
      )}

      {/* Start screen */}
      {!isPlaying && cards.length === 0 && (
        <div className="flex-1 flex items-center justify-center min-h-[120px]">
          <span
            role="button"
            tabIndex={0}
            aria-label="Start Match Game"
            onClick={initGame}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); initGame() } }}
            className="px-4 py-2 bg-linear-to-r from-purple-500 to-blue-500 rounded-lg text-sm font-semibold hover:from-purple-600 hover:to-blue-600 transition-all transform hover:scale-105 flex items-center gap-2 cursor-pointer"
          >
            <Play className="w-4 h-4" />
            Start Game
          </span>
        </div>
      )}

      {/* Game won screen */}
      {gameWon && (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 min-h-[120px]">
          <div className="text-2xl">🎉</div>
          <div className="text-base font-bold text-center">Congratulations!</div>
          <div className="text-center text-xs text-muted-foreground">
            <div>Completed in <span className="font-bold text-white">{moves}</span> moves</div>
            <div>Time: <span className="font-bold text-white">{formatTime(time)}</span></div>
          </div>
          <button
            onClick={resetGame}
            className="px-4 py-1.5 bg-linear-to-r from-green-500 to-green-500 rounded-lg text-sm font-semibold hover:from-green-600 hover:to-green-600 transition-all transform hover:scale-105 flex items-center gap-2"
          >
            <RotateCcw className="w-4 h-4" />
            Play Again
          </button>
        </div>
      )}

      {/* Game board */}
      {isPlaying && !gameWon && (
        <div 
          className="flex-1 grid gap-1.5 items-center justify-items-center"
          style={{
            gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
            gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))` }}
        >
          {cards.map(card => {
            const icon = CARD_ICONS.find(i => i.id === card.iconId)
            const isFlipped = flippedCards.includes(card.id) || card.matched
            const Icon = icon?.Icon || Box

            return (
              <button
                key={card.id}
                onClick={() => handleCardClick(card.id)}
                disabled={isFlipped || isPaused}
                className="relative w-full aspect-square max-w-[60px] max-h-[60px] perspective-1000"
                style={{ opacity: isPaused ? 0.5 : 1 }}
              >
                <div
                  className={`card-inner w-full h-full transition-transform duration-500 transform-style-3d ${
                    isFlipped ? 'rotate-y-180' : ''
                  }`}
                >
                  {/* Card back */}
                  <div className="card-face absolute inset-0 backface-hidden bg-linear-to-br from-purple-500/20 to-blue-500/20 border-2 border-purple-500/30 rounded flex items-center justify-center">
                    <Terminal className="w-5 h-5 text-purple-400" />
                  </div>
                  
                  {/* Card front */}
                  <div className={`card-face absolute inset-0 backface-hidden rotate-y-180 ${
                    card.matched ? 'bg-green-500/20 border-green-500/30' : 'bg-black/10 dark:bg-white/10 border-black/20 dark:border-white/20'
                  } border-2 rounded flex items-center justify-center`}>
                    <Icon className={`w-6 h-6 ${icon?.color || 'text-blue-400'}`} />
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}

      {/* Pause overlay */}
      {isPaused && (
        <div className="absolute inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center z-10 rounded-xl">
          <div className="text-center">
            <Pause className="w-8 h-8 mx-auto mb-2 text-white" />
            <div className="text-base font-bold">Paused</div>
            <button
              onClick={togglePause}
              className="mt-2 px-3 py-1.5 text-sm bg-black/10 dark:bg-white/10 hover:bg-black/20 dark:hover:bg-white/20 rounded-lg transition-colors"
            >
              Resume
            </button>
          </div>
        </div>
      )}

      <style>{`
        .perspective-1000 {
          perspective: 1000px;
        }
        .transform-style-3d {
          transform-style: preserve-3d;
        }
        .backface-hidden {
          backface-visibility: hidden;
        }
        .rotate-y-180 {
          transform: rotateY(180deg);
        }
        .card-inner {
          position: relative;
          width: 100%;
          height: 100%;
          transition: transform 0.5s;
          transform-style: preserve-3d;
        }
        .card-face {
          position: absolute;
          width: 100%;
          height: 100%;
          backface-visibility: hidden;
        }
      `}</style>
    </div>
  )
}
