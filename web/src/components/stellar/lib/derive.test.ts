import { describe, it, expect, vi } from 'vitest';
import * as derive from './derive';

const { describePhase, workloadFromPodName } = derive.__testables;
const now = Date.now();
vi.useFakeTimers();
vi.setSystemTime(now);

describe('derivePhase', () => {
  it('returns correct label/color/percent/phase for known steps', () => {
    expect(describePhase('investigating', '')).toMatchObject({ label: expect.any(String), color: expect.any(String), percent: 20, phase: 'investigating' });
    expect(describePhase('root_cause', '')).toMatchObject({ phase: 'root_cause' });
    expect(describePhase('solving', '')).toMatchObject({ phase: 'solving' });
    expect(describePhase('resolved', '')).toMatchObject({ phase: 'resolved' });
    expect(describePhase('resolved_monitored', '')).toMatchObject({ phase: 'resolved_monitored' });
    expect(describePhase('escalated', '')).toMatchObject({ phase: 'escalated' });
    expect(describePhase('exhausted', '')).toMatchObject({ phase: 'exhausted' });
    expect(describePhase('unknown', 'custom')).toMatchObject({ label: 'custom', phase: 'unknown' });
  });
});

describe('workloadFromPodName', () => {
  it('parses deployment name from pod name', () => {
    expect(workloadFromPodName('foo-bar-12345-abcde')).toBe('foo-bar');
    expect(workloadFromPodName('foo-bar')).toBe('foo-bar');
  });
});

describe('severityColor', () => {
  it('returns correct color for severity', () => {
    expect(derive.severityColor('critical')).toContain('critical');
    expect(derive.severityColor('warning')).toContain('warning');
    expect(derive.severityColor('info')).toContain('info');
    expect(derive.severityColor('other')).toContain('info');
  });
});

describe('deriveShortReason', () => {
  it('returns correct summary for known patterns', () => {
    expect(derive.deriveShortReason({ title: 'CrashLoopBackOff', id: '', createdAt: '', severity: 'info', body: '', read: false })).toContain('restart loop');
    expect(derive.deriveShortReason({ title: 'OOMKill', id: '', createdAt: '', severity: 'info', body: '', read: false })).toContain('memory');
    expect(derive.deriveShortReason({ title: 'FailedScheduling', id: '', createdAt: '', severity: 'info', body: '', read: false })).toContain('placed');
    expect(derive.deriveShortReason({ title: 'FailedMount', id: '', createdAt: '', severity: 'info', body: '', read: false })).toContain('mount');
    expect(derive.deriveShortReason({ title: 'ImagePullBackOff', id: '', createdAt: '', severity: 'info', body: '', read: false })).toContain('image');
    expect(derive.deriveShortReason({ title: 'FailedCreatePodSandbox', id: '', createdAt: '', severity: 'info', body: '', read: false })).toContain('sandbox');
    expect(derive.deriveShortReason({ title: 'Unrecognized', id: '', createdAt: '', severity: 'info', body: '', read: false })).toBeNull();
  });
});

describe('deriveTags', () => {
  it('returns correct tags for hints and title', () => {
    expect(derive.deriveTags({ title: 'OOM', id: '', createdAt: '', severity: 'info', body: '', read: false, actionHints: ['restart'] }, 3)).toContain('auto-fixable');
    expect(derive.deriveTags({ title: 'CrashLoopBackOff', id: '', createdAt: '', severity: 'info', body: '', read: false }, 3)).toContain('crash-loop');
    expect(derive.deriveTags({ title: 'FailedScheduling', id: '', createdAt: '', severity: 'info', body: '', read: false }, 3)).toContain('scheduling');
    expect(derive.deriveTags({ title: 'FailedMount', id: '', createdAt: '', severity: 'info', body: '', read: false }, 3)).toContain('storage');
    expect(derive.deriveTags({ title: 'ImagePullBackOff', id: '', createdAt: '', severity: 'info', body: '', read: false }, 3)).toContain('image-pull');
    expect(derive.deriveTags({ title: 'ImagePullBackOff', id: '', createdAt: '', severity: 'info', body: '', read: false }, 3)).not.toContain('crash-loop');
    expect(derive.deriveTags({ title: 'OOM', id: '', createdAt: '', severity: 'info', body: '', read: false }, 3)).toContain('memory');
    expect(derive.deriveTags({ title: 'Unrecognized', id: '', createdAt: '', severity: 'info', body: '', read: false }, 3)).not.toContain('crash-loop');
  });
});

describe('countRelated', () => {
  it('counts notifications with same dedupeKey', () => {
    const n = { id: '1', dedupeKey: 'foo', title: '', createdAt: '', severity: 'info', body: '', read: false };
    const all = [n, { id: '2', dedupeKey: 'foo', title: '', createdAt: '', severity: 'info', body: '', read: false }, { id: '3', dedupeKey: 'bar', title: '', createdAt: '', severity: 'info', body: '', read: false }];
    expect(derive.countRelated(n, all)).toBe(1);
  });
});

describe('deriveImportance', () => {
  it('computes importance score and label', () => {
    const n = { id: '1', severity: 'critical', createdAt: new Date(now - 20 * 60_000).toISOString(), title: '', body: '', read: false };
    expect(derive.deriveImportance(n, 3)).toMatchObject({ label: expect.any(String), score: expect.any(Number) });
  });
});

describe('trendIcon', () => {
  it('returns correct icon for trend', () => {
    expect(derive.trendIcon('increasing')).toBe('↗');
    expect(derive.trendIcon('decreasing')).toBe('↘');
    expect(derive.trendIcon('stable')).toBe('↔');
    expect(derive.trendIcon('idle')).toBe('·');
  });
});

describe('renderSparkline', () => {
  it('renders unicode sparkline', () => {
    expect(derive.renderSparkline([0, 1, 2, 3, 4, 5, 6, 7])).toMatch(/[▁▂▃▄▅▆▇█]+/);
    expect(derive.renderSparkline([])).toBe('');
    expect(derive.renderSparkline([0, 0, 0])).toBe('');
  });
});
