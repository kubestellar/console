import React, { useEffect, useState, useRef } from 'react'
import { X, Upload, FileText } from 'lucide-react'
import { cn } from '../../../lib/cn'
import { TextArea } from '../../ui/TextArea'
import { Input } from '../../ui/Input'

interface CustomQASMModalProps {
  isOpen: boolean
  onSubmit: (content: string) => void
  onCancel: () => void
  initialContent?: string
}

const VALID_QASM_STARTS = ['openqasm', 'qasm', '//']
const MAX_SIZE_BYTES = 50 * 1024 // 50KB

const validateQASM = (content: string): { valid: boolean; error?: string } => {
  if (!content.trim()) {
    return { valid: false, error: 'QASM code cannot be empty' }
  }

  const trimmed = content.trim().toLowerCase()
  if (!VALID_QASM_STARTS.some(start => trimmed.startsWith(start))) {
    return { valid: false, error: 'QASM must start with "OPENQASM" or contain valid QASM syntax' }
  }

  if (content.length > MAX_SIZE_BYTES) {
    return { valid: false, error: `QASM file exceeds ${MAX_SIZE_BYTES / 1024}KB limit` }
  }

  return { valid: true }
}

export function CustomQASMModal({
  isOpen,
  onSubmit,
  onCancel,
  initialContent = '',
}: CustomQASMModalProps) {
  const [mode, setMode] = useState<'paste' | 'upload'>('paste')
  const [content, setContent] = useState(initialContent)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handlePasteChange = (value: string) => {
    setContent(value)
    setError(null)
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.name.toLowerCase().endsWith('.qasm')) {
      setError('Please select a .qasm file')
      return
    }

    const reader = new FileReader()
    reader.onload = (event) => {
      const text = event.target?.result as string
      const validation = validateQASM(text)
      if (!validation.valid) {
        setError(validation.error || 'Invalid QASM')
        return
      }
      setContent(text)
      setError(null)
    }
    reader.onerror = () => {
      setError('Failed to read file')
    }
    reader.readAsText(file)
  }

  const handleSubmit = () => {
    const validation = validateQASM(content)
    if (!validation.valid) {
      setError(validation.error || 'Invalid QASM')
      return
    }
    onSubmit(content)
    setContent('')
    setError(null)
  }

  const handleCancel = () => {
    setContent(initialContent)
    setError(null)
    onCancel()
  }

  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') handleCancel()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, initialContent, onCancel])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-lg max-w-2xl w-full max-h-[80vh] flex flex-col shadow-lg">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Custom QASM Circuit</h2>
          <button
            onClick={handleCancel}
            className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
          >
            <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-0 border-b border-gray-200 dark:border-gray-700 px-4">
          <button
            onClick={() => {
              setMode('paste')
              setError(null)
            }}
            className={cn(
              'px-4 py-3 font-medium text-sm border-b-2 transition-colors',
              mode === 'paste'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
            )}
          >
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4" />
              Paste Code
            </div>
          </button>
          <button
            onClick={() => {
              setMode('upload')
              setError(null)
            }}
            className={cn(
              'px-4 py-3 font-medium text-sm border-b-2 transition-colors',
              mode === 'upload'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
            )}
          >
            <div className="flex items-center gap-2">
              <Upload className="w-4 h-4" />
              Upload File
            </div>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4">
          {mode === 'paste' ? (
            <div className="space-y-2">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Paste your QASM circuit code below. Must start with "OPENQASM".
              </p>
              <TextArea
                value={content}
                onChange={e => handlePasteChange(e.target.value)}
                placeholder="OPENQASM 2.0;&#10;include &quot;qelib1.inc&quot;;&#10;qreg q[2];&#10;creg c[2];&#10;h q[0];&#10;cx q[0],q[1];&#10;measure q -&gt; c;"
                rows={16}
                textAreaSize="md"
                error={!!error}
              />
              {content && (
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  {content.length} / {MAX_SIZE_BYTES} bytes
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Select a .qasm file from your computer.
              </p>
              <div
                className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-8 text-center hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors cursor-pointer"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="w-8 h-8 text-gray-400 dark:text-gray-500 mx-auto mb-2" />
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Click to upload or drag & drop</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">QASM files up to 50KB</p>
              </div>
              <Input
                ref={fileInputRef}
                type="file"
                accept=".qasm"
                onChange={handleFileUpload}
                className="hidden"
              />
              {content && (
                <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                  <p className="text-sm text-blue-700 dark:text-blue-400">
                    ✓ File loaded ({content.length} bytes)
                  </p>
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 p-4 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={handleCancel}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!content.trim()}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 disabled:opacity-50 rounded-lg transition-colors"
          >
            Submit
          </button>
        </div>
      </div>
    </div>
  )
}
