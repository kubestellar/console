import { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { HardDrive, Check, Loader2, AlertCircle, WifiOff, Download, Upload, Shield } from 'lucide-react'
import type { SyncStatus } from '../../../hooks/usePersistedSettings'
import { TOAST_DISMISS_MS } from '../../../lib/constants/network'

interface SettingsBackupSectionProps {
  syncStatus: SyncStatus
  lastSaved: Date | null
  filePath: string
  onExport: () => Promise<void>
  onImport: (file: File) => Promise<void>
}

const STATUS_ICONS: Record<SyncStatus, { icon: typeof Check; className: string }> = {
  idle: { icon: HardDrive, className: 'text-muted-foreground' },
  saving: { icon: Loader2, className: 'text-blue-400' },
  saved: { icon: Check, className: 'text-green-400' },
  error: { icon: AlertCircle, className: 'text-red-400' },
  offline: { icon: WifiOff, className: 'text-yellow-400' },
}

// Pre-resolved labels passed in from the caller so this helper does not
// need to depend on i18next's overloaded TFunction generic.
interface LastSavedLabels {
  never: string
  justNow: string
  secondsAgo: (count: number) => string
  minutesAgo: (count: number) => string
}
// Threshold (seconds) below which we render "Just now" instead of an exact
// number of seconds. Matches the original hardcoded value.
const JUST_NOW_THRESHOLD_SEC = 5
// Boundary for switching from seconds-ago to minutes-ago / minutes-ago to
// absolute time. 60s in a minute, 60m in an hour.
const SECONDS_PER_MINUTE = 60
const MINUTES_PER_HOUR = 60
function formatLastSaved(date: Date | null, labels: LastSavedLabels): string {
  if (!date) return labels.never
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffSec = Math.floor(diffMs / 1000)
  if (diffSec < JUST_NOW_THRESHOLD_SEC) return labels.justNow
  if (diffSec < SECONDS_PER_MINUTE) return labels.secondsAgo(diffSec)
  const diffMin = Math.floor(diffSec / SECONDS_PER_MINUTE)
  if (diffMin < MINUTES_PER_HOUR) return labels.minutesAgo(diffMin)
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
  const importSuccessTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => {
    return () => clearTimeout(importSuccessTimerRef.current)
  }, [])

  const STATUS_LABELS: Record<SyncStatus, string> = {
    idle: t('settings.backup.initializing'),
    saving: t('settings.backup.saving'),
    saved: t('settings.backup.saved'),
    error: t('settings.backup.saveFailed'),
    offline: t('settings.backup.backendOffline'),
  }
  const status = STATUS_ICONS[syncStatus]
  const statusLabel = STATUS_LABELS[syncStatus]
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
      clearTimeout(importSuccessTimerRef.current)
      importSuccessTimerRef.current = setTimeout(() => setImportSuccess(false), TOAST_DISMISS_MS)
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
                <p className={`text-sm font-medium ${status.className}`}>{statusLabel}</p>
                <p className="text-xs text-muted-foreground">
                  {t('settings.backup.lastSaved', {
                    time: formatLastSaved(lastSaved, {
                      never: t('settings.backup.never'),
                      justNow: t('settings.backup.justNow'),
                      secondsAgo: (count: number) => t('settings.backup.secondsAgo', { count }),
                      minutesAgo: (count: number) => t('settings.backup.minutesAgo', { count }),
                    }),
                  })}
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
