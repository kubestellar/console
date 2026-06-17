import './useResolutions.utils.test.setup'

describe('generateResolutionPromptContext', () => {
  it('returns empty string for empty input', () => {
    expect(generateResolutionPromptContext([])).toBe('')
  })

  it('includes resolution title and summary', () => {
    const similar: SimilarResolution[] = [
      {
        resolution: makeResolution({ title: 'Fix OOM issue', resolution: { summary: 'Bump memory', steps: [] } }),
        similarity: 0.9,
        source: 'personal',
      },
    ]

    const ctx = generateResolutionPromptContext(similar)
    expect(ctx).toContain('Fix OOM issue')
    expect(ctx).toContain('Bump memory')
  })

  it('labels personal resolutions as "Your history"', () => {
    const similar: SimilarResolution[] = [
      {
        resolution: makeResolution(),
        similarity: 0.9,
        source: 'personal',
      },
    ]

    const ctx = generateResolutionPromptContext(similar)
    expect(ctx).toContain('Your history')
  })

  it('labels shared resolutions as "Team knowledge"', () => {
    const similar: SimilarResolution[] = [
      {
        resolution: makeResolution({ visibility: 'shared' }),
        similarity: 0.9,
        source: 'shared',
      },
    ]

    const ctx = generateResolutionPromptContext(similar)
    expect(ctx).toContain('Team knowledge')
  })

  it('shows success rate when timesUsed > 0', () => {
    const similar: SimilarResolution[] = [
      {
        resolution: makeResolution({
          effectiveness: { timesUsed: 10, timesSuccessful: 8 },
        }),
        similarity: 0.9,
        source: 'personal',
      },
    ]

    const ctx = generateResolutionPromptContext(similar)
    expect(ctx).toContain('80% success rate')
  })

  it('shows "new resolution" when timesUsed is 0', () => {
    const similar: SimilarResolution[] = [
      {
        resolution: makeResolution({
          effectiveness: { timesUsed: 0, timesSuccessful: 0 },
        }),
        similarity: 0.9,
        source: 'personal',
      },
    ]

    const ctx = generateResolutionPromptContext(similar)
    expect(ctx).toContain('new resolution')
  })

  it('limits output to 3 resolutions even when given more', () => {
    const similar: SimilarResolution[] = Array.from({ length: 5 }, (_, i) => ({
      resolution: makeResolution({ id: `res-${i}`, title: `Resolution ${i}` }),
      similarity: 0.9 - i * 0.1,
      source: 'personal' as const,
    }))

    const ctx = generateResolutionPromptContext(similar)
    expect(ctx).toContain('Resolution 0')
    expect(ctx).toContain('Resolution 2')
    expect(ctx).not.toContain('Resolution 3')
    expect(ctx).not.toContain('Resolution 4')
  })

  it('includes steps when present', () => {
    const similar: SimilarResolution[] = [
      {
        resolution: makeResolution({
          resolution: {
            summary: 'Fix it',
            steps: ['Step A', 'Step B', 'Step C'],
          },
        }),
        similarity: 0.9,
        source: 'personal',
      },
    ]

    const ctx = generateResolutionPromptContext(similar)
    expect(ctx).toContain('Step A')
    expect(ctx).toContain('Step B')
    expect(ctx).toContain('Step C')
  })
})

// ---------------------------------------------------------------------------
// useResolutions hook
// ---------------------------------------------------------------------------

