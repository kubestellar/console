import { Check, Copy, Film, ImagePlus, Trash2 } from 'lucide-react'
import type { DragEvent, RefObject } from 'react'
import type { ScreenshotItem } from './FeatureRequestTypes'

interface ScreenshotAttacherProps {
  screenshots: ScreenshotItem[]
  isDragOver: boolean
  copiedIndex: number | null
  attachmentHelpText: string
  acceptedMediaTypes: string
  fileInputRef: RefObject<HTMLInputElement | null>
  onDragOver: (event: DragEvent<HTMLDivElement>) => void
  onDragLeave: () => void
  onDrop: (event: DragEvent<HTMLDivElement>) => void
  onPickFiles: (files: FileList | null) => void
  onCopyScreenshot: (preview: string, index: number) => void
  onRemoveScreenshot: (index: number) => void
}

export function ScreenshotAttacher({
  screenshots,
  isDragOver,
  copiedIndex,
  attachmentHelpText,
  acceptedMediaTypes,
  fileInputRef,
  onDragOver,
  onDragLeave,
  onDrop,
  onPickFiles,
  onCopyScreenshot,
  onRemoveScreenshot,
}: ScreenshotAttacherProps) {
  return (
    <div>
      <label className="block text-sm font-medium text-foreground mb-1.5">
        Screenshots <span className="text-muted-foreground font-normal text-xs">(optional)</span>
      </label>
      <div
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
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
        <span className="text-2xs text-muted-foreground/70">{attachmentHelpText}</span>
        <input
          ref={fileInputRef}
          type="file"
          accept={acceptedMediaTypes}
          multiple
          onChange={(event) => onPickFiles(event.target.files)}
          className="hidden"
        />
      </div>
      {screenshots.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {(screenshots || []).map((screenshot, index) => (
            <div key={index} className="relative group w-20 h-20 shrink-0">
              {screenshot.mediaType === 'video' ? (
                <div className="w-20 h-20 rounded-lg border border-border bg-black flex items-center justify-center overflow-hidden">
                  <video src={screenshot.preview} className="w-full h-full object-cover" muted playsInline />
                  <Film className="absolute w-5 h-5 text-white/80 drop-shadow-md" />
                </div>
              ) : (
                <img
                  src={screenshot.preview}
                  alt={`Attachment ${index + 1}`}
                  className="w-20 h-20 object-cover rounded-lg border border-border"
                  loading="lazy"
                  width={80}
                  height={80}
                />
              )}
              <div className="absolute inset-0 flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 bg-black/60 rounded-lg transition-opacity">
                {screenshot.mediaType !== 'video' && (
                  <button
                    type="button"
                    onClick={event => { event.stopPropagation(); onCopyScreenshot(screenshot.preview, index) }}
                    className="p-1.5 rounded-md bg-secondary/80 text-foreground hover:bg-secondary transition-colors"
                    title="Copy to clipboard"
                    aria-label="Copy screenshot to clipboard"
                  >
                    {copiedIndex === index ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                )}
                <button
                  type="button"
                  onClick={event => { event.stopPropagation(); onRemoveScreenshot(index) }}
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
