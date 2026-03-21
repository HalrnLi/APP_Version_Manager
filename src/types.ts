export class ConcurrencyConflictError extends Error {
  constructor(
    public entityName: string,
    public currentVersion: number,
    public expectedVersion: number
  ) {
    super(`并发冲突：${entityName} 已被其他用户修改。当前版本: ${currentVersion}，期望版本: ${expectedVersion}`);
    this.name = 'ConcurrencyConflictError';
  }
}

export enum ProjectProgress {
  REQUIREMENT_DECOMPOSITION = '需求分解',
  CONFIG_COMPONENT_FILL = '配置组件填写',
  COMPONENT_UPLOAD = '组件上传',
  SELF_TEST = '自测验证',
  SUBMITTED = '已提测',
  RELEASED = '已发布'
}

export interface Project {
  id: string;
  name: string;
  versionId: string;
  manager: string;
  projectLink: string;
  componentLink: string;
  requirements: string;
  progress: ProjectProgress;
  progressHistory: ProgressHistoryItem[];
  // 提测计划时间
  b1IntegrationTestTime: string;
  b1SystemTestTime: string;
  b2IntegrationTestTime: string;
  b2SystemTestTime: string;
  b3IntegrationTestTime: string;
  b3SystemTestTime: string;
  b4IntegrationTestTime: string;
  b4SystemTestTime: string;
  actualReleaseTime: string;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface ProgressHistoryItem {
  progress: ProjectProgress;
  changedAt: string;
}

export interface Version {
  id: string;
  appId: string;
  versionNumber: string;
  bllVersion: string;
  ippVersion: string;
  webVersion: string;
  updateContent: string;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface App {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface SavedFilter {
  id: string;
  name: string;
  appId: string | null;
  versionId: string | null;
  progress: ProjectProgress | null;
  keyword: string;
}

export interface PluginSettings {
  defaultAppId: string | null;
  autoBackup: boolean;
  backupDay: number;
  backupHour: number;
  lastBackupTime: string | null;
  dataPath: string;
  backupPath: string;
}

export const DEFAULT_SETTINGS: PluginSettings = {
  defaultAppId: null,
  autoBackup: true,
  backupDay: 5,
  backupHour: 23,
  lastBackupTime: null,
  dataPath: 'app-version-manager',
  backupPath: ''
};

export const PROGRESS_ORDER = [
  ProjectProgress.REQUIREMENT_DECOMPOSITION,
  ProjectProgress.CONFIG_COMPONENT_FILL,
  ProjectProgress.COMPONENT_UPLOAD,
  ProjectProgress.SELF_TEST,
  ProjectProgress.SUBMITTED,
  ProjectProgress.RELEASED
];

// 提测计划阶段定义
export const TEST_STAGES = [
  { key: 'b1IntegrationTestTime', label: 'B1集成测试' },
  { key: 'b1SystemTestTime', label: 'B1系统测试' },
  { key: 'b2IntegrationTestTime', label: 'B2集成测试' },
  { key: 'b2SystemTestTime', label: 'B2系统测试' },
  { key: 'b3IntegrationTestTime', label: 'B3集成测试' },
  { key: 'b3SystemTestTime', label: 'B3系统测试' },
  { key: 'b4IntegrationTestTime', label: 'B4集成测试' },
  { key: 'b4SystemTestTime', label: 'B4系统测试' }
] as const;

// 日期解析函数，支持多种格式
export function parseDateInput(input: string): string | null {
  if (!input || input.trim() === '') return null;
  
  const trimmed = input.trim();
  
  // 尝试直接解析为Date对象
  const date = new Date(trimmed);
  if (!isNaN(date.getTime())) {
    return date.toISOString().split('T')[0]; // 返回YYYY-MM-DD格式
  }
  
  // 支持常见格式的正则表达式
  const patterns = [
    // YYYY-MM-DD or YYYY/MM/DD
    /^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})$/,
    // MM/DD/YYYY
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/,
    // DD/MM/YYYY
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/,
    // YYYY年MM月DD日
    /^(\d{4})年(\d{1,2})月(\d{1,2})日?$/,
    // MM月DD日YYYY年
    /^(\d{1,2})月(\d{1,2})日(\d{4})年$/,
    // DD日MM月YYYY年
    /^(\d{1,2})日(\d{1,2})月(\d{4})年$/,
    // MM-DD (month-day with current year)
    /^(\d{1,2})-(\d{1,2})$/,
    // MM.DD (month.day with current year)
    /^(\d{1,2})\.(\d{1,2})$/,
    // MM月DD日 (month day with current year)
    /^(\d{1,2})月(\d{1,2})日?$/,
    // DD日MM月 (day month with current year)
    /^(\d{1,2})日(\d{1,2})月$/
  ];
  
  for (const pattern of patterns) {
    const match = trimmed.match(pattern);
    if (match) {
      let year: number, month: number, day: number;
      
      if (pattern === patterns[0]) { // YYYY-MM-DD/YYYY/MM/DD
        year = parseInt(match[1]);
        month = parseInt(match[2]);
        day = parseInt(match[3]);
      } else if (pattern === patterns[1]) { // MM/DD/YYYY
        month = parseInt(match[1]);
        day = parseInt(match[2]);
        year = parseInt(match[3]);
      } else if (pattern === patterns[2]) { // DD/MM/YYYY (假设为DD/MM/YYYY)
        day = parseInt(match[1]);
        month = parseInt(match[2]);
        year = parseInt(match[3]);
      } else if (pattern === patterns[3]) { // YYYY年MM月DD日
        year = parseInt(match[1]);
        month = parseInt(match[2]);
        day = parseInt(match[3]);
      } else if (pattern === patterns[4]) { // MM月DD日YYYY年
        month = parseInt(match[1]);
        day = parseInt(match[2]);
        year = parseInt(match[3]);
      } else if (pattern === patterns[5]) { // DD日MM月YYYY年
        day = parseInt(match[1]);
        month = parseInt(match[2]);
        year = parseInt(match[3]);
      } else if (pattern === patterns[6]) { // MM-DD (month-day with current year)
        month = parseInt(match[1]);
        day = parseInt(match[2]);
        year = new Date().getFullYear();
      } else if (pattern === patterns[7]) { // MM.DD (month.day with current year)
        month = parseInt(match[1]);
        day = parseInt(match[2]);
        year = new Date().getFullYear();
      } else if (pattern === patterns[8]) { // MM月DD日 (month day with current year)
        month = parseInt(match[1]);
        day = parseInt(match[2]);
        year = new Date().getFullYear();
      } else { // DD日MM月 (day month with current year)
        day = parseInt(match[1]);
        month = parseInt(match[2]);
        year = new Date().getFullYear();
      }
      
      // 验证日期有效性
      const testDate = new Date(year, month - 1, day);
      if (testDate.getFullYear() === year && 
          testDate.getMonth() === month - 1 && 
          testDate.getDate() === day) {
        return `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
      }
    }
  }
  
  return null; // 无法解析
}

// 获取项目的下一阶段信息
export function getNextStageInfo(project: Project): { stage: string; time: string } {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  
  let nextStage: string | null = null;
  let nextTime: string | null = null;
  
  for (const stage of TEST_STAGES) {
    const timeStr = (project as any)[stage.key];
    if (timeStr) {
      const stageDate = new Date(timeStr);
      stageDate.setHours(0, 0, 0, 0);
      
      if (stageDate >= now) {
        if (!nextTime || stageDate < new Date(nextTime)) {
          nextStage = stage.label;
          nextTime = timeStr;
        }
      }
    }
  }
  
  return {
    stage: nextStage || '无',
    time: nextTime || ''
  };
}

export const PROGRESS_COLORS: Record<ProjectProgress, string> = {
  [ProjectProgress.REQUIREMENT_DECOMPOSITION]: '#6366f1',
  [ProjectProgress.CONFIG_COMPONENT_FILL]: '#8b5cf6',
  [ProjectProgress.COMPONENT_UPLOAD]: '#ec4899',
  [ProjectProgress.SELF_TEST]: '#f59e0b',
  [ProjectProgress.SUBMITTED]: '#3b82f6',
  [ProjectProgress.RELEASED]: '#10b981'
};
