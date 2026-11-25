import { describe, it, expect } from 'vitest'
import { getConditionStyle } from '../CRDDrillDown.types'

describe('getConditionStyle', () => {
  it('renders healthy conditions (Established=True) as green and False as red', () => {
    expect(getConditionStyle('True', 'Established').text).toBe('text-green-400')
    expect(getConditionStyle('False', 'NamesAccepted').text).toBe('text-red-400')
  })

  it('renders abnormal-true conditions as failing when True and healthy when False', () => {
    expect(getConditionStyle('True', 'NonStructuralSchema').text).toBe('text-red-400')
    expect(getConditionStyle('True', 'Terminating').text).toBe('text-red-400')
    expect(getConditionStyle('False', 'NonStructuralSchema').text).toBe('text-green-400')
  })

  it('renders Unknown as a warning regardless of polarity', () => {
    expect(getConditionStyle('Unknown', 'NonStructuralSchema').text).toBe('text-yellow-400')
    expect(getConditionStyle('Unknown', 'Established').text).toBe('text-yellow-400')
  })
})
