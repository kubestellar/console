import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import {
  HIPAACard,
  NISTCard,
  ComplianceFrameworksCard,
  ScoreRing
} from '../EnterpriseComplianceCards';
import { authFetch, safeJson } from '../../../lib/api';
import { useCache } from '../../../lib/cache';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual as any,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('../../../lib/api', () => ({
  authFetch: vi.fn(),
  safeJson: vi.fn(),
}));

vi.mock('../../../lib/cache', () => ({
  useCache: vi.fn(),
}));

// Mock react-i18next
vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string) => {
      if (key === 'failedToLoad' || key === 'messages.failedToLoad') return 'failedToLoad';
      return key;
    }
  })
}));

describe('EnterpriseComplianceCards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('HIPAACard (Pattern A - useEffect/authFetch)', () => {
    it('renders loading state initially', async () => {
      // Return an unresolved promise to keep it in loading state
      const promise = new Promise(() => {});
      (authFetch as any).mockReturnValue(promise);

      render(
        <MemoryRouter>
          <HIPAACard />
        </MemoryRouter>
      );

      const loadingText = screen.getByText('Loading…');
      expect(loadingText).toBeInTheDocument();
      expect(loadingText.className).toContain('text-gray-500');
    });

    it('renders success state and navigates on click', async () => {
      const user = userEvent.setup();
      const mockResponse = { ok: true };
      const mockData = { overall_score: 85, safeguards_passed: 10, safeguards_failed: 2, phi_namespaces: 3, encrypted_flows: 7 };
      (authFetch as any).mockResolvedValue(mockResponse);
      (safeJson as any).mockResolvedValue(mockData);

      render(
        <MemoryRouter>
          <HIPAACard />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('85%')).toBeInTheDocument();
      });

      expect(screen.getByText('10')).toBeInTheDocument();
      expect(screen.getByText('2')).toBeInTheDocument();
      expect(screen.getByText('3')).toBeInTheDocument();
      expect(screen.getByText('7')).toBeInTheDocument();

      // Click card title
      const cardTitle = screen.getByText('HIPAA Compliance');
      await user.click(cardTitle);
      expect(mockNavigate).toHaveBeenCalledWith('/hipaa');
    });

    it('renders error state on fetch rejection', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      (authFetch as any).mockRejectedValue(new Error('Network error'));

      render(
        <MemoryRouter>
          <HIPAACard />
        </MemoryRouter>
      );

      await waitFor(() => {
        const errorText = screen.getByText('Network error');
        expect(errorText).toBeInTheDocument();
        expect(errorText.className).toContain('text-red-400');
      });
      consoleSpy.mockRestore();
    });

    it('renders "No data" state when response is not ok', async () => {
      (authFetch as any).mockResolvedValue({ ok: false });

      render(
        <MemoryRouter>
          <HIPAACard />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('No data')).toBeInTheDocument();
      });
      expect(safeJson).not.toHaveBeenCalled();
    });
  });

  describe('NISTCard (Pattern B - useCache)', () => {
    it('renders loading state when data is null and no error', () => {
      (useCache as any).mockReturnValue({ data: null, error: null });

      render(
        <MemoryRouter>
          <NISTCard />
        </MemoryRouter>
      );

      expect(screen.getByText('Loading…')).toBeInTheDocument();
    });

    it('renders error state with translated text', () => {
      (useCache as any).mockReturnValue({ data: null, error: new Error('fail') });

      render(
        <MemoryRouter>
          <NISTCard />
        </MemoryRouter>
      );

      const errorText = screen.getByText('failedToLoad');
      expect(errorText).toBeInTheDocument();
      expect(errorText.className).toContain('text-red-400');
    });

    it('renders success state and navigates on click', async () => {
      const user = userEvent.setup();
      const mockData = { overall_score: 72, implemented_controls: 50, partial_controls: 10, planned_controls: 5, total_controls: 65 };
      (useCache as any).mockReturnValue({ data: mockData, error: null });

      render(
        <MemoryRouter>
          <NISTCard />
        </MemoryRouter>
      );

      expect(screen.getByText('72%')).toBeInTheDocument();
      
      const cardTitle = screen.getByText('NIST 800-53');
      await user.click(cardTitle);
      expect(mockNavigate).toHaveBeenCalledWith('/nist');
    });
  });

  describe('ScoreRing (shared helper)', () => {
    it('renders green ring when score is >= 80', () => {
      render(<ScoreRing score={85} />);
      const progressCircle = screen.getByTestId('score-ring-progress');
      expect(progressCircle.getAttribute('stroke')).toContain('--chart-success');
      expect(screen.getByText('85%')).toBeInTheDocument();
    });

    it('renders amber ring when score is >= 60 and < 80', () => {
      render(<ScoreRing score={65} />);
      const progressCircle = screen.getByTestId('score-ring-progress');
      expect(progressCircle.getAttribute('stroke')).toContain('--chart-warning');
      expect(screen.getByText('65%')).toBeInTheDocument();
    });

    it('renders red ring when score is < 60', () => {
      render(<ScoreRing score={40} />);
      const progressCircle = screen.getByTestId('score-ring-progress');
      expect(progressCircle.getAttribute('stroke')).toContain('--chart-danger');
      expect(screen.getByText('40%')).toBeInTheDocument();
    });
  });

  describe('ComplianceFrameworksCard (Pattern C - static)', () => {
    it('renders without crashing and navigates on click', async () => {
      const user = userEvent.setup();
      render(
        <MemoryRouter>
          <ComplianceFrameworksCard />
        </MemoryRouter>
      );

      expect(screen.getByText('Compliance Frameworks')).toBeInTheDocument();

      const cardShell = screen.getByText('Compliance Frameworks').closest('div')?.parentElement;
      expect(cardShell).toBeTruthy();
      await user.click(cardShell!);
      expect(mockNavigate).toHaveBeenCalledWith('/compliance-frameworks');
    });
  });
});
