/**
 * LLM-d Configurator Showcase
 *
 * Interactive visualization of LLM-d tuning options
 * with preset configurations and impact previews.
 */
import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Settings, Zap, Split, Layers, Scale, ChevronRight, Check, Copy, ExternalLink } from 'lucide-react'
import { getConfiguratorPresets, type ConfiguratorPreset } from '../../../lib/llmd/mockData'

const CATEGORY_ICONS = {
  scheduling: Zap,
  disaggregation: Split,
  parallelism: Layers,
  autoscaling: Scale,
}

const CATEGORY_COLORS = {
  scheduling: { bg: 'bg-amber-500/10', border: 'border-amber-500/30', text: 'text-amber-400' },
  disaggregation: { bg: 'bg-cyan-500/10', border: 'border-cyan-500/30', text: 'text-cyan-400' },
  parallelism: { bg: 'bg-purple-500/10', border: 'border-purple-500/30', text: 'text-purple-400' },
  autoscaling: { bg: 'bg-green-500/10', border: 'border-green-500/30', text: 'text-green-400' },
}

interface PresetCardProps {
  preset: ConfiguratorPreset
  isSelected: boolean
  onSelect: () => void
}

function PresetCard({ preset, isSelected, onSelect }: PresetCardProps) {
  const Icon = CATEGORY_ICONS[preset.category]
  const colors = CATEGORY_COLORS[preset.category]

  return (
    <motion.div
      className={`${colors.bg} ${colors.border} border rounded-lg p-3 cursor-pointer transition-all ${
        isSelected ? 'ring-2 ring-white/30' : 'hover:border-white/20'
      }`}
      onClick={onSelect}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <Icon size={14} className={colors.text} />
          <span className="text-sm font-medium text-white">{preset.name}</span>
        </div>
        {isSelected && (
          <div className="w-4 h-4 rounded-full bg-green-500 flex items-center justify-center">
            <Check size={10} className="text-white" />
          </div>
        )}
      </div>

      <p className="text-xs text-muted-foreground mb-3 line-clamp-2">
        {preset.description}
      </p>

      {/* Impact preview */}
      <div className="flex items-center gap-3 text-xs">
        <div className="flex items-center gap-1">
          <span className="text-muted-foreground">TTFT:</span>
          <span className="text-green-400 font-mono">-{preset.expectedImpact.ttftImprovement}%</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-muted-foreground">Throughput:</span>
          <span className="text-green-400 font-mono">+{preset.expectedImpact.throughputImprovement}%</span>
        </div>
      </div>
    </motion.div>
  )
}

interface ParameterSliderProps {
  param: {
    name: string
    value: number | string | boolean
    min?: number
    max?: number
    unit?: string
    description: string
  }
  onChange: (value: number | string | boolean) => void
}

function ParameterSlider({ param, onChange }: ParameterSliderProps) {
  if (typeof param.value === 'boolean') {
    return (
      <div className="flex items-center justify-between py-2 border-b border-slate-700/50">
        <div>
          <div className="text-sm text-white">{param.name}</div>
          <div className="text-xs text-muted-foreground">{param.description}</div>
        </div>
        <button
          onClick={() => onChange(!param.value)}
          className={`w-10 h-5 rounded-full relative transition-colors ${
            param.value ? 'bg-green-500' : 'bg-slate-600'
          }`}
        >
          <motion.div
            className="absolute top-0.5 w-4 h-4 bg-white rounded-full"
            animate={{ left: param.value ? '22px' : '2px' }}
          />
        </button>
      </div>
    )
  }

  if (typeof param.value === 'string') {
    return (
      <div className="py-2 border-b border-slate-700/50">
        <div className="flex items-center justify-between mb-1">
          <div className="text-sm text-white">{param.name}</div>
          <div className="text-sm font-mono text-purple-400">{param.value}</div>
        </div>
        <div className="text-xs text-muted-foreground">{param.description}</div>
      </div>
    )
  }

  // Numeric slider
  return (
    <div className="py-2 border-b border-slate-700/50">
      <div className="flex items-center justify-between mb-1">
        <div className="text-sm text-white">{param.name}</div>
        <div className="text-sm font-mono text-purple-400">
          {param.value}{param.unit || ''}
        </div>
      </div>
      <div className="text-xs text-muted-foreground mb-2">{param.description}</div>
      {param.min !== undefined && param.max !== undefined && (
        <input
          type="range"
          min={param.min}
          max={param.max}
          value={param.value as number}
          onChange={e => onChange(Number(e.target.value))}
          className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-purple-500"
        />
      )}
    </div>
  )
}

export function LLMdConfigurator() {
  const presets = useMemo(() => getConfiguratorPresets(), [])
  const [selectedPresetId, setSelectedPresetId] = useState<string>(presets[0]?.id || '')
  const [customParams, setCustomParams] = useState<Record<string, unknown>>({})
  const [copied, setCopied] = useState(false)

  const selectedPreset = useMemo(
    () => presets.find(p => p.id === selectedPresetId),
    [presets, selectedPresetId]
  )

  const currentParams = useMemo(() => {
    if (!selectedPreset) return []
    return selectedPreset.parameters.map(p => ({
      ...p,
      value: (customParams[p.name] !== undefined ? customParams[p.name] : p.value) as number | string | boolean,
    }))
  }, [selectedPreset, customParams])

  const handleParamChange = (name: string, value: unknown) => {
    setCustomParams(prev => ({ ...prev, [name]: value }))
  }

  // Generate YAML config
  const yamlConfig = useMemo(() => {
    if (!selectedPreset) return ''

    const params = currentParams.reduce((acc, p) => {
      acc[p.name] = p.value
      return acc
    }, {} as Record<string, unknown>)

    return `# LLM-d Configuration: ${selectedPreset.name}
apiVersion: llmd.io/v1alpha1
kind: ModelService
metadata:
  name: my-llm-service
spec:
  preset: ${selectedPreset.id}
  config:
${Object.entries(params).map(([k, v]) => `    ${k}: ${v}`).join('\n')}`
  }, [selectedPreset, currentParams])

  const copyConfig = () => {
    navigator.clipboard.writeText(yamlConfig)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="p-4 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Settings size={18} className="text-purple-400" />
          <span className="font-medium text-white">Configurator</span>
        </div>

        <div className="flex items-center gap-2">
          <a
            href="https://github.com/llm-d/llm-d"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 px-2 py-1 text-xs text-muted-foreground hover:text-white transition-colors"
          >
            <ExternalLink size={12} />
            Docs
          </a>
          <span className="px-2 py-0.5 bg-amber-500/20 text-amber-400 text-xs rounded">
            Demo
          </span>
        </div>
      </div>

      {/* Presets grid */}
      <div className="grid grid-cols-2 gap-2 mb-4">
        {presets.map(preset => (
          <PresetCard
            key={preset.id}
            preset={preset}
            isSelected={selectedPresetId === preset.id}
            onSelect={() => {
              setSelectedPresetId(preset.id)
              setCustomParams({})
            }}
          />
        ))}
      </div>

      {/* Selected preset details */}
      <AnimatePresence mode="wait">
        {selectedPreset && (
          <motion.div
            key={selectedPreset.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex-1 flex flex-col min-h-0"
          >
            {/* Parameters */}
            <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
              <ChevronRight size={12} />
              Parameters
            </div>

            <div className="flex-1 overflow-auto bg-slate-800/30 rounded-lg p-3 mb-4">
              {currentParams.map(param => (
                <ParameterSlider
                  key={param.name}
                  param={param}
                  onChange={value => handleParamChange(param.name, value)}
                />
              ))}
            </div>

            {/* Expected impact */}
            <div className="grid grid-cols-3 gap-2 mb-4">
              <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-2 text-center">
                <div className="text-xs text-muted-foreground">TTFT Improvement</div>
                <div className="text-lg font-bold text-green-400">
                  -{selectedPreset.expectedImpact.ttftImprovement}%
                </div>
              </div>
              <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-2 text-center">
                <div className="text-xs text-muted-foreground">Throughput</div>
                <div className="text-lg font-bold text-green-400">
                  +{selectedPreset.expectedImpact.throughputImprovement}%
                </div>
              </div>
              <div className={`border rounded-lg p-2 text-center ${
                selectedPreset.expectedImpact.costChange > 0
                  ? 'bg-amber-500/10 border-amber-500/20'
                  : 'bg-green-500/10 border-green-500/20'
              }`}>
                <div className="text-xs text-muted-foreground">Cost Impact</div>
                <div className={`text-lg font-bold ${
                  selectedPreset.expectedImpact.costChange > 0 ? 'text-amber-400' : 'text-green-400'
                }`}>
                  {selectedPreset.expectedImpact.costChange > 0 ? '+' : ''}
                  {selectedPreset.expectedImpact.costChange}%
                </div>
              </div>
            </div>

            {/* Config export */}
            <div className="bg-slate-900 rounded-lg p-3 border border-slate-700">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-muted-foreground">Generated Config</span>
                <button
                  onClick={copyConfig}
                  className="flex items-center gap-1 px-2 py-1 text-xs bg-slate-800 hover:bg-slate-700 rounded transition-colors"
                >
                  {copied ? (
                    <>
                      <Check size={12} className="text-green-400" />
                      <span className="text-green-400">Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy size={12} />
                      <span>Copy</span>
                    </>
                  )}
                </button>
              </div>
              <pre className="text-xs text-muted-foreground font-mono overflow-auto max-h-24">
                {yamlConfig}
              </pre>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default LLMdConfigurator
