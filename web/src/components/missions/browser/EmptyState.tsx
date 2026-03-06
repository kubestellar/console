import { Folder, RefreshCw } from 'lucide-react'
import { resetMissionCache } from './missionCache'

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
      <Folder className="w-12 h-12 mb-3 opacity-30" />
      <p className="text-sm">{message}</p>
    </div>
  )
}

export function MissionFetchErrorBanner({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4">
      <div className="flex items-start gap-3">
        <span className="text-red-400 text-lg mt-0.5">⚠️</span>
        <div className="flex-1 text-sm space-y-1">
          <p className="font-medium text-red-300">Failed to load missions</p>
          <p className="text-muted-foreground">{message}</p>
          <button
            onClick={() => resetMissionCache()}
            className="inline-flex items-center gap-1.5 mt-2 px-3 py-1 text-xs rounded-md bg-red-500/20 text-red-300 hover:bg-red-500/30 transition-colors"
          >
            <RefreshCw className="w-3 h-3" />
            Retry
          </button>
        </div>
      </div>
    </div>
  )
}
