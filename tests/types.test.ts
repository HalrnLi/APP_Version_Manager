import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  parseDateInput,
  getNextStageInfo,
  getProgressOrder,
  getProgressColors,
  getFirstProgress,
  getLastProgress,
  DEFAULT_PROGRESS_STAGES,
  ProgressStage,
  Project,
  ConcurrencyConflictError,
} from '../src/types';

describe('parseDateInput', () => {
  let realDateNow: typeof Date.now;

  beforeEach(() => {
    const now = new Date(2026, 4, 3).getTime(); // May 3, 2026
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns null for empty input', () => {
    expect(parseDateInput('')).toBeNull();
    expect(parseDateInput('   ')).toBeNull();
  });

  it('parses YYYY-MM-DD format', () => {
    // formatLocalDate pads with leading zeros
    expect(parseDateInput('2026-05-03')).toBe('2026-05-03');
    expect(parseDateInput('2026-12-25')).toBe('2026-12-25');
  });

  it('parses YYYY/MM/DD format', () => {
    expect(parseDateInput('2026/05/03')).toBe('2026-05-03');
  });

  it('parses YYYY年MM月DD日 format', () => {
    expect(parseDateInput('2026年5月3日')).toBe('2026-05-03');
  });

  it('parses MM.DD format (current year)', () => {
    expect(parseDateInput('5.3')).toBe('2026-05-03');
    expect(parseDateInput('12.25')).toBe('2026-12-25');
  });

  it('parses MM-DD format (current year)', () => {
    expect(parseDateInput('05-03')).toBe('2026-05-03');
    expect(parseDateInput('12-25')).toBe('2026-12-25');
  });

  it('parses MM月DD日 format (current year)', () => {
    expect(parseDateInput('5月3日')).toBe('2026-05-03');
  });

  it('parses DD日MM月 format (current year)', () => {
    expect(parseDateInput('3日5月')).toBe('2026-05-03');
  });

  it('pads single-digit month/day with leading zero', () => {
    expect(parseDateInput('2026-1-5')).toBe('2026-01-05');
  });

  it('returns null for invalid date strings', () => {
    expect(parseDateInput('not a date')).toBeNull();
    expect(parseDateInput('2026-13-01')).toBeNull(); // invalid month
  });
});

describe('getProgressOrder', () => {
  it('returns stage names in order', () => {
    const stages: ProgressStage[] = [
      { name: '需求分解', color: '#6366f1' },
      { name: '已发布', color: '#10b981' },
    ];
    expect(getProgressOrder(stages)).toEqual(['需求分解', '已发布']);
  });

  it('returns empty array for empty stages', () => {
    expect(getProgressOrder([])).toEqual([]);
  });
});

describe('getProgressColors', () => {
  it('returns name-to-color mapping', () => {
    const stages: ProgressStage[] = [
      { name: '需求分解', color: '#6366f1' },
      { name: '已发布', color: '#10b981' },
    ];
    expect(getProgressColors(stages)).toEqual({
      '需求分解': '#6366f1',
      '已发布': '#10b981',
    });
  });
});

describe('getFirstProgress', () => {
  it('returns first stage name', () => {
    const stages: ProgressStage[] = [
      { name: '需求分解', color: '#6366f1' },
      { name: '已发布', color: '#10b981' },
    ];
    expect(getFirstProgress(stages)).toBe('需求分解');
  });

  it('returns empty string for empty stages', () => {
    expect(getFirstProgress([])).toBe('');
  });
});

describe('getLastProgress', () => {
  it('returns last stage name', () => {
    const stages: ProgressStage[] = [
      { name: '需求分解', color: '#6366f1' },
      { name: '已发布', color: '#10b981' },
    ];
    expect(getLastProgress(stages)).toBe('已发布');
  });

  it('returns empty string for empty stages', () => {
    expect(getLastProgress([])).toBe('');
  });
});

describe('getNextStageInfo', () => {
  beforeEach(() => {
    const now = new Date(2026, 4, 3).getTime();
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns "无" and empty time when no test stages set', () => {
    const project = createMockProject({});
    const info = getNextStageInfo(project);
    expect(info.stage).toBe('无');
    expect(info.time).toBe('');
  });

  it('returns the earliest upcoming test stage', () => {
    const project = createMockProject({
      b1IntegrationTestTime: '2026-5-10',
      b2IntegrationTestTime: '2026-5-5',
    });
    const info = getNextStageInfo(project);
    expect(info.stage).toBe('B2集成测试');
    expect(info.time).toBe('2026-5-5');
  });

  it('skips past dates', () => {
    const project = createMockProject({
      b1IntegrationTestTime: '2026-1-1', // past
      b2IntegrationTestTime: '2026-6-1', // future
    });
    const info = getNextStageInfo(project);
    expect(info.stage).toBe('B2集成测试');
  });

  it('handles today as upcoming (not past)', () => {
    const project = createMockProject({
      b1IntegrationTestTime: '2026-5-3', // today
    });
    const info = getNextStageInfo(project);
    expect(info.stage).toBe('B1集成测试');
  });
});

describe('ConcurrencyConflictError', () => {
  it('creates error with correct properties', () => {
    const error = new ConcurrencyConflictError('项目: test', 2, 1);
    expect(error.entityName).toBe('项目: test');
    expect(error.currentVersion).toBe(2);
    expect(error.expectedVersion).toBe(1);
    expect(error.name).toBe('ConcurrencyConflictError');
    expect(error.message).toContain('test');
  });
});

describe('DEFAULT_PROGRESS_STAGES', () => {
  it('has 7 default stages', () => {
    expect(DEFAULT_PROGRESS_STAGES).toHaveLength(7);
  });

  it('each stage has name and color', () => {
    for (const stage of DEFAULT_PROGRESS_STAGES) {
      expect(stage.name).toBeTruthy();
      expect(stage.color).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });
});

function createMockProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 'test-proj-1',
    name: 'Test Project',
    versionId: 'v1',
    manager: '',
    projectLink: '',
    componentLink: '',
    features: '',
    spec: '',
    requirements: '',
    progress: '需求分解',
    progressHistory: [],
    b1IntegrationTestTime: '',
    b1SystemTestTime: '',
    b2IntegrationTestTime: '',
    b2SystemTestTime: '',
    b3IntegrationTestTime: '',
    b3SystemTestTime: '',
    b4IntegrationTestTime: '',
    b4SystemTestTime: '',
    actualReleaseTime: '',
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
    version: 1,
    ...overrides,
  };
}
