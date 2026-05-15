import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import QualityDashboard from '../QualityDashboard';
import * as useCachedData from '../../../hooks/useCachedData';
import * as CardDataContext from '../CardDataContext';

// Mock i18next
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

// Mock hooks
vi.mock('../../../hooks/useCachedData');
vi.mock('../CardDataContext');

describe('QualityDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading state correctly', () => {
    vi.mocked(useCachedData.useCachedQuality).mockReturnValue({
      data: {
        bugsFoundCount: 0,
        remediationsFixed: 0,
        driftEventsCount: 0,
        healthScore: 100,
        progressPct: '0%'
      },
      isLoading: true,
      isRefreshing: false,
      isDemoFallback: false,
    } as any);

    vi.mocked(CardDataContext.useCardLoadingState).mockReturnValue({
      showSkeleton: true,
    } as any);

    render(<QualityDashboard />);
    expect(screen.getByText('messages.checking')).toBeInTheDocument();
  });

  it('renders stats correctly when data is loaded', () => {
    vi.mocked(useCachedData.useCachedQuality).mockReturnValue({
      data: {
        bugsFoundCount: 42,
        remediationsFixed: 10,
        driftEventsCount: 5,
        healthScore: 85,
        progressPct: '75%'
      },
      isLoading: false,
      isRefreshing: false,
      isDemoFallback: false,
    } as any);

    vi.mocked(CardDataContext.useCardLoadingState).mockReturnValue({
      showSkeleton: false,
    } as any);

    render(<QualityDashboard />);
    
    // Check for specific values in the rendered output
    const body = document.body.innerHTML;
    expect(body).toContain('42');
    expect(body).toContain('75%');
    expect(body).toContain('5');
    
    // Check for section headers
    expect(screen.getByText('quality.state_integrity')).toBeInTheDocument();
    expect(screen.getByText('quality.bug_sweep')).toBeInTheDocument();
  });
});
