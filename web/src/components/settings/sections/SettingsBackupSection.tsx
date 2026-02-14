import { useState, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { HardDrive, Check, Loader2, AlertCircle, WifiOff, Download, Upload, Shield } from 'lucide-react'
import type { SyncStatus } from '../../../hooks/usePersistedSettings'

interface SettingsBackupSectionProps {
  syncStatus: SyncStatus
  lastSaved: Date | null
  filePath: string
  onExport: () => Promise<void>
  onImport: (file: File) => Promise<void>
}

const STATUS_CONFIG: Record<SyncStatus, { icon: typeof Check; label: string; className: string }> = {
  idle: { icon: HardDrive, label: 'Initializing...', className: 'text-muted-foreground' },
  saving: { icon: Loader2, label: 'Saving...', className: 'text-blue-400' },
  saved: { icon: Check, label: 'Saved', className: 'text-green-400' },
  error: { icon: AlertCircle, label: 'Save failed', className: 'text-red-400' },
  offline: { icon: WifiOff, label: 'Backend offline', className: 'text-yellow-400' },
}

function formatLastSaved(date: Date | null): string {
  if (!date) return 'Never'
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffSec = Math.floor(diffMs / 1000)
  if (diffSec < 5) return 'Just now'
  if (diffSec < 60) return `${diffSec}s ago`
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin}m ago`
  return date.toLocaleTimeString()
}

export function SettingsBackupSection({
  syncStatus,
  lastSaved,
  filePath,
  onExport,
  onImport,
}: SettingsBackupSectionProps) {
  const { t } = useTranslation()
  const [exporting, setExporting] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [importSuccess, setImportSuccess] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const status = STATUS_CONFIG[syncStatus]
  const StatusIcon = status.icon

  const handleExport = async () => {
    setExporting(true)
    try {
      await onExport()
    } catch {
      // Error handled by hook
    } finally {
      setExporting(false)
    }
  }

  const handleImportClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImporting(true)
    setImportError(null)
    setImportSuccess(false)
    try {
      await onImport(file)
      setImportSuccess(true)
      setTimeout(() => setImportSuccess(false), 3000)
    } catch {
      setImportError(t('settings.backup.importFailed'))
    } finally {
      setImporting(false)
      // Reset file input so the same file can be re-selected
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  return (
    <div id="settings-backup" className="glass rounded-xl p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 rounded-lg bg-secondary">
          <HardDrive className="w-5 h-5 text-muted-foreground" />
        </div>
        <div>
          <h2 className="text-lg font-medium text-foreground">{t('settings.backup.title')}</h2>
          <p className="text-sm text-muted-foreground">{t('settings.backup.subtitle')}</p>
        </div>
      </div>

      <div className="space-y-4">
        {/* Sync Status */}
        <div className="p-4 rounded-lg bg-secondary/30 border border-border">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <StatusIcon className={`w-4 h-4 ${status.className} ${syncStatus === 'saving' ? 'animate-spin' : ''}`} />
              <div>
                <p className={`text-sm font-medium ${status.className}`}>{status.label}</p>
                <p className="text-xs text-muted-foreground">
                  Last saved: {formatLastSaved(lastSaved)}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">{t('settings.backup.encrypted')}</span>
            </div>
          </div>
        </div>

        {/* File Path */}
        <div className="flex items-center justify-between px-1">
          <span className="text-xs text-muted-foreground">{t('settings.backup.fileLocation')}</span>
          <code className="text-xs text-muted-foreground font-mono bg-secondary/50 px-2 py-0.5 rounded">
            {filePath}
          </code>
        </div>

        {/* Export / Import Buttons */}
        <div className="flex gap-3">
          <button
            onClick={handleExport}
            disabled={exporting || syncStatus === 'offline'}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-secondary/50 border border-border hover:bg-secondary/80 text-sm text-foreground transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {exporting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            {t('settings.backup.exportBackup')}
          </button>
          <button
            onClick={handleImportClick}
            disabled={importing || syncStatus === 'offline'}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-secondary/50 border border-border hover:bg-secondary/80 text-sm text-foreground transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {importing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Upload className="w-4 h-4" />
            )}
            {t('settings.backup.importBackup')}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleFileChange}
            className="hidden"
          />
        </div>

        {/* Import feedback */}
        {importError && (
          <p className="text-xs text-red-400 px-1">{importError}</p>
        )}
        {importSuccess && (
          <p className="text-xs text-green-400 px-1">{t('settings.backup.importSuccess')}</p>
        )}

        {/* Info text */}
        <p className="text-xs text-muted-foreground/70 px-1">
          {t('settings.backup.securityNote')}
        </p>
      </div>
    </div>
  )
}
