import { useMemo } from 'react'
import { ScanProgressOverlay } from './ScanProgressOverlay'
import { filterDirectoryEntries } from './missionBrowserFilterState'
import {
  MissionContentProvider,
  type MissionFilePanelProps,
  type MissionSearchPanelProps,
  type MissionContentController,
} from './MissionContentContext'
import { MissionFilePanel, MissionSearchPanel } from './MissionContentViewer.parts'

export { useMissionContentViewer } from './MissionContentViewer.hooks'
export type { UseMissionContentViewerOptions } from './MissionContentViewer.hooks'

interface MissionContentViewerProps {
  searchPanel: MissionSearchPanelProps
  filePanel: MissionFilePanelProps
  content: MissionContentController
}

export function MissionContentViewer({ searchPanel, filePanel, content }: MissionContentViewerProps) {
  const filteredEntries = useMemo(
    () => filterDirectoryEntries(content.directoryEntries, searchPanel.searchQuery),
    [content.directoryEntries, searchPanel.searchQuery],
  )

  return (
    <MissionContentProvider
      searchPanel={searchPanel}
      filePanel={filePanel}
      content={content}
      filteredEntries={filteredEntries}
    >
      <div data-testid="mission-grid" className="flex-1 flex flex-col overflow-hidden relative bg-background">
        <ScanProgressOverlay
          isScanning={content.isScanning}
          result={content.scanResult}
          onComplete={content.handleScanComplete}
          onDismiss={content.handleScanDismiss}
        />

        <div className="flex-1 overflow-y-auto p-4">
          <MissionFilePanel />
          <MissionSearchPanel />
        </div>
      </div>
    </MissionContentProvider>
  )
}
