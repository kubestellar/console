import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { PredictionSettings } from '../../../../types/predictions'

vi.mock('../../../../hooks/usePredictionFeedback', () => ({
  usePredictionFeedback: () => ({
    getStats: () => ({
      totalPredictions: 0,
      accurateFeedback: 0,
      inaccurateFeedback: 0,
      accuracyRate: 0,
      byProvider: {},
    }),
    clearFeedback: vi.fn(),
    feedbackCount: 0,
  }),
}))

vi.mock('../../../../lib/analytics', () => ({
  emitAIPredictionsToggled: vi.fn(),
  emitConfidenceThresholdChanged: vi.fn(),
  emitConsensusModeToggled: vi.fn(),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en', changeLanguage: vi.fn() } }),
}))

import { PredictionSettingsSection } from '../PredictionSettingsSection'

const TEST_SETTINGS: PredictionSettings = {
  aiEnabled: true,
  interval: 120,
  minConfidence: 70,
  maxPredictions: 10,
  consensusMode: false,
  thresholds: {
    highRestartCount: 3,
    cpuPressure: 80,
    memoryPressure: 85,
    gpuMemoryPressure: 90,
  },
}

describe('PredictionSettingsSection', () => {
  it('renders filled slider tracks for prediction settings', () => {
    render(
      <PredictionSettingsSection
        settings={TEST_SETTINGS}
        updateSettings={vi.fn()}
        resetSettings={vi.fn()}
      />,
    )

    const analysisSlider = screen.getByLabelText('settings.predictions.analysisInterval')
    const analysisFill = analysisSlider.parentElement?.querySelector('[data-slider-fill="true"]')
    expect(analysisFill).toHaveStyle({ width: '100%' })

    const confidenceSlider = screen.getByLabelText('settings.predictions.minConfidence')
    const confidenceFill = confidenceSlider.parentElement?.querySelector('[data-slider-fill="true"]')
    expect(confidenceFill).toHaveStyle({ width: '50%' })
  })
})
