import { useTranslation } from 'react-i18next'
import { Input } from '../../ui/Input'
import { Select } from '../../ui/Select'

interface ResourceRequestFieldsProps {
  gpuCount: number
  onGpuCountChange: (count: number) => void
  selectedGpuType: string
  onGpuTypeChange: (type: string) => void
  availableGpuTypes: string[]
}

export function ResourceRequestFields({
  gpuCount,
  onGpuCountChange,
  selectedGpuType,
  onGpuTypeChange,
  availableGpuTypes,
}: ResourceRequestFieldsProps) {
  const { t } = useTranslation(['cards'])

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">
          {t('gpuReservations.form.gpuCount')}
        </label>
        <Input
          type="number"
          value={gpuCount}
          onChange={(e) => onGpuCountChange(parseInt(e.target.value) || 0)}
          min="1"
          className="w-full"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-2">
          {t('gpuReservations.form.gpuType')}
        </label>
        <Select value={selectedGpuType} onValueChange={onGpuTypeChange}>
          {availableGpuTypes.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </Select>
      </div>
    </div>
  )
}
