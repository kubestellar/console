import { RotateCcw, HelpCircle, BarChart3, X } from 'lucide-react'
import { CardComponentProps } from './cardRegistry.types'
import { useCardExpanded } from './CardWrapper'
import { useKubedle, MAX_GUESSES, checkGuess } from './useKubedle'

// Keyboard layout
const KEYBOARD_ROWS = [
  ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
  ['ENTER', 'Z', 'X', 'C', 'V', 'B', 'N', 'M', '⌫'],
]

export function Kubedle(_props: CardComponentProps) {
  const { isExpanded } = useCardExpanded()
  const {
    t,
    tCards,
    gameContainerRef,
    guesses,
    currentGuess,
    gameOver,
    shake,
    showStats,
    setShowStats,
    showHelp,
    setShowHelp,
    practiceMode,
    stats,
    message,
    handleKey,
    newGame,
    states,
    targetWord,
  } = useKubedle()
  const cellSize = isExpanded ? 'w-12 h-12 text-xl' : 'w-8 h-8 text-sm'
  const keySize = isExpanded ? 'min-w-[32px] h-10 text-sm' : 'min-w-[24px] h-8 text-xs'

  return (
    <div ref={gameContainerRef} className="h-full flex flex-col p-2 select-none">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-y-2 gap-2 mb-2">
        {practiceMode && (
          <span className="text-xs text-muted-foreground">{tCards('kubedle.practiceLabel')}</span>
        )}

        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowHelp(true)}
            className="p-1.5 rounded hover:bg-secondary"
            title={tCards('kubedle.howToPlay')}
            aria-label={tCards('kubedle.howToPlay')}
          >
            <HelpCircle className="w-4 h-4" />
          </button>
          <button
            onClick={() => setShowStats(true)}
            className="p-1.5 rounded hover:bg-secondary"
            title={tCards('kubedle.statistics')}
            aria-label={tCards('kubedle.statistics')}
          >
            <BarChart3 className="w-4 h-4" />
          </button>
          <button
            onClick={() => newGame(true)}
            className="p-1.5 rounded hover:bg-secondary"
            title={tCards('kubedle.practiceMode')}
            aria-label={tCards('kubedle.practiceMode')}
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Message */}
      {message && (
        <div className="text-center text-sm font-medium mb-1 text-foreground">
          {message}
        </div>
      )}

      {/* Grid */}
      <div className="flex-1 flex flex-col items-center justify-center gap-1">
        {Array(MAX_GUESSES).fill(null).map((_, rowIdx) => {
          const guess = guesses[rowIdx]
          const isCurrentRow = rowIdx === guesses.length && !gameOver
          const displayWord = guess || (isCurrentRow ? currentGuess.padEnd(5, ' ') : '     ')
          const results = guess ? checkGuess(guess, targetWord) : []

          return (
            <div
              key={rowIdx}
              className={`flex gap-1 ${isCurrentRow && shake ? 'animate-shake' : ''}`}
            >
              {displayWord.split('').map((letter, colIdx) => {
                let bgColor = 'bg-secondary/50 border-border'
                if (guess) {
                  if (results[colIdx] === 'correct') {
                    bgColor = 'bg-green-600 border-green-600'
                  } else if (results[colIdx] === 'present') {
                    bgColor = 'bg-yellow-600 border-yellow-600'
                  } else {
                    bgColor = 'bg-gray-700 border-gray-700'
                  }
                } else if (letter !== ' ') {
                  bgColor = 'bg-secondary border-gray-500'
                }

                return (
                  <div
                    key={colIdx}
                    className={`${cellSize} flex items-center justify-center font-bold border-2 rounded ${bgColor} text-white`}
                  >
                    {letter !== ' ' ? letter : ''}
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>

      {/* Keyboard */}
      <div className="flex flex-col items-center gap-1 mt-2">
        {KEYBOARD_ROWS.map((row, rowIdx) => (
          <div key={rowIdx} className="flex gap-1">
            {row.map(key => {
              let bgColor = 'bg-gray-500 hover:bg-gray-400 dark:bg-gray-600 dark:hover:bg-gray-500'
              if (states[key] === 'correct') {
                bgColor = 'bg-green-600'
              } else if (states[key] === 'present') {
                bgColor = 'bg-yellow-600'
              } else if (states[key] === 'absent') {
                bgColor = 'bg-gray-800'
              }

              const isSpecial = key === 'ENTER' || key === '⌫'

              return (
                <button
                  key={key}
                  onClick={() => handleKey(key)}
                  className={`${keySize} ${isSpecial ? 'px-2' : 'px-1'} rounded font-semibold text-white ${bgColor} transition-colors`}
                >
                  {key}
                </button>
              )
            })}
          </div>
        ))}
      </div>

      {/* Help Modal */}
      {showHelp && (
        <div className="absolute inset-0 bg-background/90 flex items-center justify-center rounded-lg z-10 p-4">
          <div className="bg-card border border-border rounded-lg p-4 max-w-sm">
            <div className="flex flex-wrap items-center justify-between gap-y-2 mb-3">
              <h3 className="font-bold text-foreground">{tCards('kubedle.howToPlay')}</h3>
              <button onClick={() => setShowHelp(false)} aria-label={tCards('kubedle.closeHelp')}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="text-sm text-muted-foreground space-y-2">
              <p>{t('kubedle.guessInstructions')}</p>
              <p>{t('kubedle.letterInstructions')}</p>
              <div className="space-y-1 mt-3">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 bg-green-600 rounded flex items-center justify-center text-white text-xs font-bold">N</div>
                  <span>{t('kubedle.correctSpot')}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 bg-yellow-600 rounded flex items-center justify-center text-white text-xs font-bold">O</div>
                  <span>{t('kubedle.wrongSpot')}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 bg-gray-700 rounded flex items-center justify-center text-white text-xs font-bold">D</div>
                  <span>{t('kubedle.notInWord')}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Stats Modal — width bumped + horizontal scroll fallback so the
          distribution rows aren't clipped in a default-width card
          (issue #8939). */}
      {showStats && (
        <div className="absolute inset-0 bg-background/90 flex items-center justify-center rounded-lg z-10 p-2 overflow-auto">
          <div className="bg-card border border-border rounded-lg p-4 w-full min-w-[260px] max-w-[420px] max-h-full overflow-x-auto overflow-y-auto">
            <div className="flex flex-wrap items-center justify-between gap-y-2 mb-3">
              <h3 className="font-bold text-foreground">{tCards('kubedle.statistics')}</h3>
              <button onClick={() => setShowStats(false)} aria-label={tCards('kubedle.closeStatistics')}>
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 @md:grid-cols-4 gap-2 text-center mb-4">
              <div>
                <div className="text-2xl font-bold text-foreground">{stats.played}</div>
                <div className="text-xs text-muted-foreground">{tCards('kubedle.played')}</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-foreground">
                  {stats.played > 0 ? Math.round((stats.won / stats.played) * 100) : 0}%
                </div>
                <div className="text-xs text-muted-foreground">{tCards('kubedle.winPercent')}</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-foreground">{stats.currentStreak}</div>
                <div className="text-xs text-muted-foreground">{tCards('kubedle.streak')}</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-foreground">{stats.maxStreak}</div>
                <div className="text-xs text-muted-foreground">{tCards('kubedle.maxStreak')}</div>
              </div>
            </div>

            <div className="text-sm font-medium text-foreground mb-2">{tCards('kubedle.guessDistribution')}</div>
            <div className="space-y-1">
              {stats.guessDistribution.map((count, idx) => {
                const maxCount = Math.max(...stats.guessDistribution, 1)
                const width = `${Math.max((count / maxCount) * 100, 8)}%`

                return (
                  <div key={idx} className="flex items-center gap-2 text-xs">
                    <span className="w-3 text-muted-foreground">{idx + 1}</span>
                    <div
                      className="bg-green-600 text-white text-right px-1 rounded"
                      style={{ width }}
                    >
                      {count}
                    </div>
                  </div>
                )
              })}
            </div>

            {gameOver && (
              <button
                onClick={() => {
                  setShowStats(false)
                  newGame(true)
                }}
                className="mt-4 w-full py-2 bg-purple-500/20 text-purple-400 rounded-lg hover:bg-purple-500/30"
              >
                {tCards('kubedle.playAgainPractice')}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
