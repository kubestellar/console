import { useEffect } from 'react'
import { useDrillDown } from '../../hooks/useDrillDown'
import { ClusterDrillDown } from './views/ClusterDrillDown'
import { NamespaceDrillDown } from './views/NamespaceDrillDown'
import { DeploymentDrillDown } from './views/DeploymentDrillDown'
import { PodDrillDown } from './views/PodDrillDown'
import { LogsDrillDown } from './views/LogsDrillDown'
import { EventsDrillDown } from './views/EventsDrillDown'
import { NodeDrillDown } from './views/NodeDrillDown'
import { GPUNodeDrillDown } from './views/GPUNodeDrillDown'
import { YAMLDrillDown } from './views/YAMLDrillDown'
import { ResourcesDrillDown } from './views/ResourcesDrillDown'

export function DrillDownModal() {
  const { state, pop, goTo, close } = useDrillDown()

  // Keyboard shortcuts
  useEffect(() => {
    if (!state.isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle if user is typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return
      }

      switch (e.key) {
        case 'Escape':
          e.preventDefault()
          close()
          break
        case 'Backspace':
        case ' ': // Space
          e.preventDefault()
          if (state.stack.length > 1) {
            pop()
          } else {
            close()
          }
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [state.isOpen, state.stack.length, close, pop])

  if (!state.isOpen || !state.currentView) return null

  // Get current view - we've already checked it's not null above
  const currentView = state.currentView
  const { type, data } = currentView

  const renderView = () => {
    switch (type) {
      case 'cluster':
        return <ClusterDrillDown data={data} />
      case 'namespace':
        return <NamespaceDrillDown data={data} />
      case 'deployment':
        return <DeploymentDrillDown data={data} />
      case 'pod':
        return <PodDrillDown data={data} />
      case 'logs':
        return <LogsDrillDown data={data} />
      case 'events':
        return <EventsDrillDown data={data} />
      case 'node':
        return <NodeDrillDown data={data} />
      case 'gpu-node':
        return <GPUNodeDrillDown data={data} />
      case 'yaml':
        return <YAMLDrillDown data={data} />
      case 'resources':
        return <ResourcesDrillDown data={data} />
      case 'custom':
        return state.currentView?.customComponent || <div>Custom view</div>
      default:
        return <div>Unknown view type</div>
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50" onClick={close}>
      <div
        className="glass w-[90vw] max-w-[1200px] h-[85vh] rounded-xl flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header with breadcrumbs */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {/* Back button */}
            {state.stack.length > 1 && (
              <button
                onClick={pop}
                className="p-2 rounded-lg hover:bg-card/50 text-muted-foreground hover:text-foreground transition-colors"
                title="Go back"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
            )}

            {/* Breadcrumbs */}
            <nav className="flex items-center gap-1 min-w-0 overflow-x-auto">
              {state.stack.map((view, index) => (
                <div key={index} className="flex items-center gap-1 shrink-0">
                  {index > 0 && (
                    <svg className="w-4 h-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  )}
                  <button
                    onClick={() => goTo(index)}
                    className={`px-2 py-1 rounded text-sm transition-colors ${
                      index === state.stack.length - 1
                        ? 'text-foreground font-medium'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {view.title}
                  </button>
                </div>
              ))}
            </nav>
          </div>

          {/* Current view subtitle */}
          {state.currentView.subtitle && (
            <span className="text-sm text-muted-foreground mx-4 hidden md:block">
              {state.currentView.subtitle}
            </span>
          )}

          {/* Close button */}
          <button
            onClick={close}
            className="p-2 rounded-lg hover:bg-card/50 text-muted-foreground hover:text-foreground transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {renderView()}
        </div>

        {/* Footer with keyboard hints */}
        <div className="px-4 py-2 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
          <span>Depth: {state.stack.length}</span>
          <div className="flex items-center gap-2">
            <kbd className="px-2 py-0.5 rounded bg-card border border-border">Esc</kbd>
            <span>close</span>
            <span className="mx-1">•</span>
            <kbd className="px-2 py-0.5 rounded bg-card border border-border">Space</kbd>
            <span>back</span>
          </div>
        </div>
      </div>
    </div>
  )
}
