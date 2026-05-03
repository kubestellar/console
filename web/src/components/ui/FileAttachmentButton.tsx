import { Paperclip, X } from 'lucide-react'
import { useRef, useState } from 'react'
import { cn } from '../../lib/cn'
import { useTranslation } from 'react-i18next'
import { useToast } from './Toast'

interface FileAttachmentButtonProps {
  /** Called with selected file when user picks one */
  onFileSelected?: (file: File) => void
  /** Disable the button (e.g. while agent is running) */
  disabled?: boolean
  /** Compact mode for inline placement next to chat inputs */
  compact?: boolean
}

export function FileAttachmentButton({ onFileSelected, disabled = false, compact = false }: FileAttachmentButtonProps) {
  const { t } = useTranslation('common')
  const { showToast } = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)

  const handleButtonClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setSelectedFile(file)
      showToast(
        t('fileAttachment.comingSoon', { 
          defaultValue: `File attachment coming soon! Selected: ${file.name}` 
        }),
        'info'
      )
      if (onFileSelected) {
        onFileSelected(file)
      }
      // Reset input so the same file can be selected again
      e.target.value = ''
    }
  }

  const handleClearFile = () => {
    setSelectedFile(null)
  }

  const buttonSize = compact ? 'p-2' : 'p-3'
  const iconSize = compact ? 'w-4 h-4' : 'w-5 h-5'

  return (
    <div className="relative flex items-center">
      {/* Selected file indicator */}
      {selectedFile && (
        <div className="absolute bottom-full mb-2 right-0 text-xs bg-blue-500/10 text-blue-400 px-2 py-1 rounded border border-blue-500/20 flex items-center gap-1 max-w-xs z-50">
          <Paperclip className="w-3 h-3 shrink-0" />
          <span className="truncate max-w-[120px]">{selectedFile.name}</span>
          <button
            onClick={handleClearFile}
            className="ml-1 hover:text-blue-300"
            title={t('fileAttachment.clearFile', { defaultValue: 'Clear file' })}
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={handleFileChange}
        accept="*/*"
      />

      {/* Attachment button */}
      <button
        onClick={handleButtonClick}
        disabled={disabled}
        className={cn(
          buttonSize,
          'rounded-lg transition-all duration-200 relative',
          selectedFile
            ? 'bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 ring-1 ring-blue-500/30'
            : 'bg-secondary text-muted-foreground hover:bg-secondary/80 hover:text-foreground',
          disabled && 'opacity-50 cursor-not-allowed'
        )}
        title={t('fileAttachment.attachFile', { defaultValue: 'Attach file' })}
        data-testid="file-attachment-button"
      >
        <Paperclip className={iconSize} />
      </button>
    </div>
  )
}
