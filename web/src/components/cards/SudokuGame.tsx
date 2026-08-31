import {
  Play, Pause, Lightbulb, Pencil, Undo2, Redo2,
  Save, Trophy, Settings, Sparkles, X
} from 'lucide-react'
import { DynamicCardErrorBoundary } from './DynamicCardErrorBoundary'
import { useCardExpanded } from './CardWrapper'
import { useReportCardDataState } from './CardDataContext'
import { useTranslation } from 'react-i18next'
import { SudokuBoard, SudokuVictoryModal } from './SudokuBoard'
import { useSudokuGame } from './useSudokuGame'
import { DIFFICULTIES } from './sudoku.constants'
import { formatTime } from './sudoku.utils'
import type { SudokuGameProps } from './sudoku.types'

function SudokuGameInternal({ config: _config }: SudokuGameProps) {
  const { t } = useTranslation()
  useReportCardDataState({ hasData: true, isFailed: false, consecutiveFailures: 0, isDemoData: false })

  const {
    gameState,
    selectedCell,
    pencilMode,
    setPencilMode,
    showSettings,
    setShowSettings,
    showVictory,
    setShowVictory,
    bestTimes,
    historyIndex,
    historyLength,
    saveGame,
    startNewGame,
    handleCellClick,
    handleNumberInput,
    handleHint,
    undo,
    redo,
    togglePause,
  } = useSudokuGame()

  const { isExpanded } = useCardExpanded()
  const isMaximized = isExpanded
  const cellSize = isMaximized ? 'w-[70px] h-[70px] text-3xl' : 'w-6 h-6 text-2xs'
  const noteSize = isMaximized ? 'text-sm' : 'text-[5px]'
  const numberPadSize = isMaximized ? 'h-12 text-xl' : 'h-6 text-2xs'
  const controlButtonSize = isMaximized ? 'px-5 py-3 text-base' : 'px-1 py-1 text-2xs'
  const iconSize = isMaximized ? 'w-5 h-5' : 'w-2.5 h-2.5'

  if (!gameState) return null

  return (
    <div className="h-full flex-1 flex flex-col min-h-card content-loaded">
      {/* Header */}
      <div className={`flex flex-wrap items-center justify-between gap-y-2 ${isMaximized ? 'mb-4' : 'mb-1.5'}`}>
        <div className={`flex items-center ${isMaximized ? 'gap-3' : 'gap-1.5'}`}>
          <Sparkles className={isMaximized ? 'w-5 h-5 text-purple-400' : 'w-3.5 h-3.5 text-purple-400'} />
          <span className={`font-medium text-muted-foreground ${isMaximized ? 'text-base' : 'text-xs'}`}>Sudoku</span>
        </div>
        <div className={`flex items-center ${isMaximized ? 'gap-2' : 'gap-0.5'}`}>
          <button
            onClick={() => setShowSettings(true)}
            className={`${isMaximized ? 'p-2' : 'p-0.5'} hover:bg-secondary rounded transition-colors text-muted-foreground hover:text-purple-400`}
            title="Settings"
          >
            <Settings className={isMaximized ? 'w-5 h-5' : 'w-3.5 h-3.5'} />
          </button>
        </div>
      </div>

      {/* Game info */}
      <div className={`flex flex-wrap items-center justify-between gap-y-2 ${isMaximized ? 'mb-4 text-sm' : 'mb-1.5 text-2xs'}`}>
        <div className={`flex items-center ${isMaximized ? 'gap-4' : 'gap-2'}`}>
          <span className={`${isMaximized ? 'px-3 py-1' : 'px-1.5 py-0.5'} rounded bg-purple-500/20 text-purple-400 font-medium`}>
            {DIFFICULTIES[gameState.difficulty].label}
          </span>
          <span className="text-muted-foreground">{formatTime(gameState.timer)}</span>
        </div>
        <div className={`flex items-center ${isMaximized ? 'gap-3' : 'gap-1.5'}`}>
          <span className={`text-muted-foreground flex items-center ${isMaximized ? 'gap-1' : 'gap-0.5'}`}>
            <Lightbulb className={isMaximized ? 'w-4 h-4' : 'w-2.5 h-2.5'} />
            {gameState.hintsRemaining}
          </span>
          {bestTimes[gameState.difficulty] && (
            <span className={`text-muted-foreground flex items-center ${isMaximized ? 'gap-1' : 'gap-0.5'}`}>
              <Trophy className={`${isMaximized ? 'w-4 h-4' : 'w-2.5 h-2.5'} text-yellow-500`} />
              {formatTime(bestTimes[gameState.difficulty]!)}
            </span>
          )}
        </div>
      </div>

      {/* Sudoku Grid */}
      <div className={`flex-1 flex items-center justify-center ${isMaximized ? 'mb-8' : 'mb-1.5'}`}>
        <SudokuBoard
          board={gameState.board}
          selectedCell={selectedCell}
          isComplete={gameState.isComplete}
          isMaximized={isMaximized}
          cellSize={cellSize}
          noteSize={noteSize}
          onCellClick={handleCellClick}
        />
      </div>

      {/* Controls */}
      <div className={isMaximized ? 'space-y-4' : 'space-y-1'}>
        {/* Number pad */}
        <div className={`grid grid-cols-9 ${isMaximized ? 'gap-2' : 'gap-0.5'}`}>
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
            <button
              key={num}
              onClick={() => handleNumberInput(num)}
              disabled={!selectedCell || gameState.isComplete}
              className={`${numberPadSize} rounded bg-secondary/50 hover:bg-purple-500/20 font-medium transition-colors disabled:opacity-30 disabled:cursor-not-allowed`}
            >
              {num}
            </button>
          ))}
        </div>

        {/* Action buttons */}
        <div className={`grid grid-cols-4 ${isMaximized ? 'gap-2' : 'gap-0.5'}`}>
          <button
            onClick={() => setPencilMode(!pencilMode)}
            className={`flex items-center justify-center gap-1 ${controlButtonSize} rounded transition-colors ${
              pencilMode ? 'bg-purple-500/30 text-purple-400' : 'bg-secondary/50 hover:bg-secondary'
            }`}
          >
            <Pencil className={iconSize} />
            <span className={isMaximized ? 'inline' : 'hidden @sm:inline'}>Notes</span>
          </button>
          <button
            onClick={handleHint}
            disabled={!selectedCell || gameState.hintsRemaining <= 0 || gameState.isComplete}
            className={`flex items-center justify-center gap-1 ${controlButtonSize} rounded bg-secondary/50 hover:bg-secondary transition-colors disabled:opacity-30 disabled:cursor-not-allowed`}
          >
            <Lightbulb className={iconSize} />
            <span className={isMaximized ? 'inline' : 'hidden @sm:inline'}>Hint</span>
          </button>
          <button
            onClick={undo}
            disabled={historyIndex <= 0}
            className={`flex items-center justify-center gap-1 ${controlButtonSize} rounded bg-secondary/50 hover:bg-secondary transition-colors disabled:opacity-30 disabled:cursor-not-allowed`}
          >
            <Undo2 className={iconSize} />
            {isMaximized && <span>Undo</span>}
          </button>
          <button
            onClick={redo}
            disabled={historyIndex >= historyLength - 1}
            className={`flex items-center justify-center gap-1 ${controlButtonSize} rounded bg-secondary/50 hover:bg-secondary transition-colors disabled:opacity-30 disabled:cursor-not-allowed`}
          >
            <Redo2 className={iconSize} />
            {isMaximized && <span>Redo</span>}
          </button>
        </div>

        {/* Bottom controls */}
        <div className={`flex ${isMaximized ? 'gap-3' : 'gap-0.5'}`}>
          <button
            onClick={togglePause}
            disabled={gameState.isComplete}
            className={`flex-1 flex items-center justify-center gap-1 ${controlButtonSize} rounded bg-secondary/50 hover:bg-secondary transition-colors disabled:opacity-30`}
          >
            {gameState.isPaused ? <Play className={iconSize} /> : <Pause className={iconSize} />}
            <span className={isMaximized ? 'inline' : 'hidden @sm:inline'}>{gameState.isPaused ? 'Resume' : 'Pause'}</span>
          </button>
          <button
            onClick={saveGame}
            className={`flex-1 flex items-center justify-center gap-1 ${controlButtonSize} rounded bg-secondary/50 hover:bg-secondary transition-colors`}
          >
            <Save className={iconSize} />
            <span className={isMaximized ? 'inline' : 'hidden @sm:inline'}>{t('common.save')}</span>
          </button>
        </div>
      </div>

      {/* Settings Modal */}
      {showSettings && (
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-50 rounded-lg">
          <div className="bg-background border border-border rounded-lg p-4 max-w-xs w-full mx-4">
            <div className="flex flex-wrap items-center justify-between gap-y-2 mb-3">
              <h3 className="text-sm font-medium">New Game</h3>
              <button
                onClick={() => setShowSettings(false)}
                className="p-1 hover:bg-secondary rounded transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-2">
              {(Object.keys(DIFFICULTIES) as Array<keyof typeof DIFFICULTIES>).map(difficulty => (
                <button
                  key={difficulty}
                  onClick={() => startNewGame(difficulty)}
                  className="w-full text-left px-3 py-2 rounded bg-secondary/50 hover:bg-purple-500/20 transition-colors"
                >
                  <div className="flex flex-wrap items-center justify-between gap-y-2">
                    <span className="font-medium">{DIFFICULTIES[difficulty].label}</span>
                    {bestTimes[difficulty] && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Trophy className="w-3 h-3 text-yellow-500" />
                        {formatTime(bestTimes[difficulty]!)}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {DIFFICULTIES[difficulty].hints} hints available
                  </p>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Victory Modal */}
      {showVictory && (
        <SudokuVictoryModal
          gameState={gameState}
          bestTimes={bestTimes}
          formatTime={formatTime}
          difficulties={DIFFICULTIES}
          onPlayAgain={() => { setShowVictory(false); setShowSettings(true) }}
        />
      )}

      {/* Pause overlay */}
      {gameState.isPaused && !showSettings && !showVictory && (
        <div className="absolute inset-0 bg-black/70 flex items-center justify-center z-40 rounded-lg">
          <div className="text-center">
            <Pause className="w-12 h-12 text-purple-400 mx-auto mb-2" />
            <p className="text-lg font-medium">Paused</p>
          </div>
        </div>
      )}
    </div>
  )
}

export function SudokuGame(props: SudokuGameProps) {
  return (
    <DynamicCardErrorBoundary cardId="SudokuGame">
      <SudokuGameInternal {...props} />
    </DynamicCardErrorBoundary>
  )
}
