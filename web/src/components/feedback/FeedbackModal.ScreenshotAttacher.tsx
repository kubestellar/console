import { useRef, useState } from 'react'
import { ImagePlus, Film, Copy, Check, Trash2 } from 'lucide-react'
import { useToast } from '../ui/Toast'
import { emitScreenshotAttached } from '../../lib/analytics'
import { copyBlobToClipboard } from '../../lib/clipboard'
import {
  MAX_VIDEO_SIZE_BYTES,
  ACCEPTED_MEDIA_TYPES,
  ACCEPTED_VIDEO_MIME_TYPES,
  ATTACHMENT_HELP_TEXT,
} from './FeatureRequestTypes'
import { FETCH_DEFAULT_TIMEOUT_MS, COPY_FEEDBACK_TIMEOUT_MS } from '../../lib/constants'

interface ScreenshotAttacherProps {
  screenshots: { file: File; preview: string; mediaType?: 'image' | 'video' }[]
  setScreenshots: React.Dispatch<React.SetStateAction<{ file: File; preview: string; mediaType?: 'image' | 'video' }[]>>
}

export function ScreenshotAttacher({ screenshots, setScreenshots }: ScreenshotAttacherProps) {
  const { showToast } = useToast()
  const [isDragOver, setIsDragOver] = useState(false)
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleScreenshotFiles = (files: FileList | null) => {
    if (!files) return
    const allFiles = Array.from(files)
    const mediaFiles = allFiles.filter(f => f.type.startsWith('image/') || ACCEPTED_VIDEO_MIME_TYPES.has(f.type))
    if (mediaFiles.length === 0) return
    mediaFiles.forEach(file => {
      const isVideo = ACCEPTED_VIDEO_MIME_TYPES.has(file.type)
      if (isVideo && file.size > MAX_VIDEO_SIZE_BYTES) {
        showToast(`Video "${file.name}" exceeds 10 MB limit. Please use a shorter or lower-resolution recording.`, 'error')
        return
      }
      const reader = new FileReader()
      reader.onload = (e) => {
        const dataUri = e.target?.result as string
        setScreenshots(prev => [...prev, { file, preview: dataUri, mediaType: isVideo ? 'video' : 'image' }])
      }
      reader.onerror = (err) => {
        console.error(`[Attachment] FileReader failed for ${file.name}:`, err)
        showToast(`Failed to read file "${file.name}". Try a different file.`, 'error')
      }
      reader.readAsDataURL(file)
    })
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }
  const handleDragLeave = () => setIsDragOver(false)
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    const mediaCount = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/') || ACCEPTED_VIDEO_MIME_TYPES.has(f.type)).length
    if (mediaCount > 0) emitScreenshotAttached('drop', mediaCount)
    handleScreenshotFiles(e.dataTransfer.files)
  }

  const removeScreenshot = (index: number) => {
    setScreenshots(prev => prev.filter((_, i) => i !== index))
  }

  const copyScreenshotToClipboard = async (preview: string, index: number) => {
    try {
      const res = await fetch(preview, { signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS) })
      const blob = await res.blob()
      const ok = await copyBlobToClipboard(blob)
      if (!ok) {
        showToast('Could not copy image to clipboard (browser may not support image copy)', 'error')
        return
      }
      setCopiedIndex(index)
      setTimeout(() => setCopiedIndex(null), COPY_FEEDBACK_TIMEOUT_MS)
    } catch {
      showToast('Could not copy image to clipboard', 'error')
    }
  }

  return (
    <div>
      <label className="block text-sm font-medium text-foreground mb-1.5">
        Screenshots <span className="text-muted-foreground font-normal text-xs">(optional)</span>
      </label>
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`flex flex-col items-center gap-2 p-4 rounded-lg border-2 border-dashed cursor-pointer transition-colors ${
          isDragOver
            ? 'border-purple-400 bg-purple-500/10'
            : 'border-border hover:border-muted-foreground'
        }`}
      >
        <div className="flex items-center gap-2">
          <ImagePlus className="w-5 h-5 text-muted-foreground" />
          <Film className="w-4 h-4 text-muted-foreground" />
        </div>
        <span className="text-xs text-muted-foreground text-center">Drop images or videos here, or click to browse</span>
        <span className="text-2xs text-muted-foreground/70">{ATTACHMENT_HELP_TEXT}</span>
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_MEDIA_TYPES}
          multiple
          onChange={e => {
            const files = e.target.files
            if (files && files.length > 0) emitScreenshotAttached('file_picker', files.length)
            handleScreenshotFiles(files)
          }}
          className="hidden"
        />
      </div>
      {screenshots.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {screenshots.map((s, i) => (
            <div key={i} className="relative group w-20 h-20 shrink-0">
              {s.mediaType === 'video' ? (
                <div className="w-20 h-20 rounded-lg border border-border bg-black flex items-center justify-center overflow-hidden">
                  <video src={s.preview} className="w-full h-full object-cover" muted playsInline />
                  <Film className="absolute w-5 h-5 text-white/80 drop-shadow-md" />
                </div>
              ) : (
                <img
                  src={s.preview}
                  alt={`Attachment ${i + 1}`}
                  className="w-20 h-20 object-cover rounded-lg border border-border"
                  loading="lazy"
                  width={80}
                  height={80}
                />
              )}
              <div className="absolute inset-0 flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 bg-black/60 rounded-lg transition-opacity">
                {s.mediaType !== 'video' && (
                  <button
                    type="button"
                    onClick={e => { e.stopPropagation(); void copyScreenshotToClipboard(s.preview, i) }}
                    className="p-1.5 rounded-md bg-secondary/80 text-foreground hover:bg-secondary transition-colors"
                    title="Copy to clipboard"
                    aria-label="Copy screenshot to clipboard"
                  >
                    {copiedIndex === i ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                )}
                <button
                  type="button"
                  onClick={e => { e.stopPropagation(); removeScreenshot(i) }}
                  className="p-1.5 rounded-md bg-secondary/80 text-red-400 hover:bg-red-500/20 transition-colors"
                  title="Remove attachment"
                  aria-label="Remove screenshot"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
