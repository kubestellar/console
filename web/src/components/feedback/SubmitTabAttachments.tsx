import { useRef, useState, useCallback, useEffect } from 'react'
import { ImagePlus, Trash2, Copy, Eye, Check, Film } from 'lucide-react'
import { FETCH_DEFAULT_TIMEOUT_MS, COPY_FEEDBACK_TIMEOUT_MS } from '../../lib/constants'
import { copyBlobToClipboard } from '../../lib/clipboard'
import { useToast } from '../ui/Toast'
import type { ScreenshotItem } from './FeatureRequestTypes'
import {
  MAX_VIDEO_SIZE_BYTES,
  ACCEPTED_MEDIA_TYPES,
  ACCEPTED_VIDEO_MIME_TYPES,
  ATTACHMENT_HELP_TEXT,
} from './FeatureRequestTypes'

interface SubmitTabAttachmentsProps {
  screenshots: ScreenshotItem[]
  setScreenshots: React.Dispatch<React.SetStateAction<ScreenshotItem[]>>
  setPreviewImageSrc: (v: string | null) => void
  inputsDisabled: boolean
}

export function SubmitTabAttachments({
  screenshots,
  setScreenshots,
  setPreviewImageSrc,
  inputsDisabled,
}: SubmitTabAttachmentsProps) {
  const { showToast } = useToast()
  const [isDragOver, setIsDragOver] = useState(false)
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null)
  const screenshotInputRef = useRef<HTMLInputElement>(null)
  const copiedIndexTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (copiedIndexTimeoutRef.current) {
        clearTimeout(copiedIndexTimeoutRef.current)
      }
    }
  }, [])

  const handleScreenshotFiles = useCallback((files: FileList | null) => {
    if (!files) return
    const mediaFiles = Array.from(files).filter(f =>
      f.type.startsWith('image/') || ACCEPTED_VIDEO_MIME_TYPES.has(f.type)
    )
    mediaFiles.forEach(file => {
      const isVideo = ACCEPTED_VIDEO_MIME_TYPES.has(file.type)
      if (isVideo && file.size > MAX_VIDEO_SIZE_BYTES) {
        showToast(`Video "${file.name}" exceeds 10 MB limit. Please use a shorter or lower-resolution recording.`, 'error')
        return
      }
      const reader = new FileReader()
      reader.onload = (ev) => {
        setScreenshots(prev => [...prev, {
          file,
          preview: ev.target?.result as string,
          mediaType: isVideo ? 'video' : 'image',
        }])
      }
      reader.onerror = (err) => {
        console.error(`[Attachment] FileReader failed for ${file.name}:`, err)
        showToast(`Failed to read file "${file.name}". Try a different file.`, 'error')
      }
      reader.readAsDataURL(file)
    })
  }, [setScreenshots, showToast])

  const handleScreenshotDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }
  const handleScreenshotDragLeave = () => setIsDragOver(false)
  const handleScreenshotDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
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
      if (copiedIndexTimeoutRef.current) {
        clearTimeout(copiedIndexTimeoutRef.current)
      }
      copiedIndexTimeoutRef.current = setTimeout(() => {
        setCopiedIndex(null)
        copiedIndexTimeoutRef.current = null
      }, COPY_FEEDBACK_TIMEOUT_MS)
    } catch {
      showToast('Could not copy image to clipboard', 'error')
    }
  }

  return (
    <div>
      <label className="block text-xs font-medium text-muted-foreground mb-1.5">
        Attachments <span className="font-normal">(optional — images &amp; videos)</span>
      </label>
      <div
        onDragOver={inputsDisabled ? undefined : handleScreenshotDragOver}
        onDragLeave={inputsDisabled ? undefined : handleScreenshotDragLeave}
        onDrop={inputsDisabled ? undefined : handleScreenshotDrop}
        onClick={inputsDisabled ? undefined : () => screenshotInputRef.current?.click()}
        aria-disabled={inputsDisabled}
        className={`flex flex-col items-center gap-2 p-3 rounded-lg border-2 border-dashed transition-colors ${
          inputsDisabled
            ? 'cursor-not-allowed opacity-60 border-border'
            : `cursor-pointer ${isDragOver
              ? 'border-purple-400 bg-purple-500/10'
              : 'border-border hover:border-muted-foreground'}`
        }`}
      >
        <div className="flex items-center gap-2">
          <ImagePlus className="w-5 h-5 text-muted-foreground" />
          <Film className="w-4 h-4 text-muted-foreground" />
        </div>
        <span className="text-xs text-muted-foreground text-center">Drop images or videos here, or click to browse</span>
        <span className="text-2xs text-muted-foreground/70">{ATTACHMENT_HELP_TEXT}</span>
        <input
          ref={screenshotInputRef}
          type="file"
          accept={ACCEPTED_MEDIA_TYPES}
          multiple
          disabled={inputsDisabled}
          onChange={e => handleScreenshotFiles(e.target.files)}
          className="hidden"
        />
      </div>
      {screenshots.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {screenshots.map((s, i) => (
            <div key={i} className="relative group w-20 h-20 shrink-0">
              {s.mediaType === 'video' ? (
                <div className="w-20 h-20 rounded-lg border border-border bg-black flex items-center justify-center overflow-hidden">
                  <video
                    src={s.preview}
                    className="w-full h-full object-cover"
                    muted
                    playsInline
                  />
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
                <button
                  type="button"
                  onClick={e => { e.stopPropagation(); setPreviewImageSrc(s.preview) }}
                  className="p-1.5 rounded-md bg-secondary/80 text-foreground hover:bg-secondary transition-colors"
                  title={s.mediaType === 'video' ? 'Preview video' : 'Preview image'}
                  aria-label={s.mediaType === 'video' ? 'Preview video' : 'Preview image'}
                >
                  <Eye className="w-3.5 h-3.5" />
                </button>
                {s.mediaType !== 'video' && (
                  <button
                    type="button"
                    onClick={e => { e.stopPropagation(); void copyScreenshotToClipboard(s.preview, i) }}
                    className="p-1.5 rounded-md bg-secondary/80 text-foreground hover:bg-secondary transition-colors"
                    title="Copy to clipboard"
                  >
                    {copiedIndex === i ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                )}
                <button
                  type="button"
                  onClick={e => { e.stopPropagation(); removeScreenshot(i) }}
                  className="p-1.5 rounded-md bg-secondary/80 text-red-400 hover:bg-red-500/20 transition-colors"
                  title="Remove attachment"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {screenshots.length > 0 && (
        <p className="text-2xs text-muted-foreground mt-1">
          Attachments will be uploaded and embedded directly in the GitHub issue.
        </p>
      )}
    </div>
  )
}

