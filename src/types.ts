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
  plannedTestTime: string;
  plannedReleaseTime: string;
  actualReleaseTime: string;
  createdAt: string;
  updatedAt: string;
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
}

export interface App {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
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
}

export const DEFAULT_SETTINGS: PluginSettings = {
  defaultAppId: null,
  autoBackup: true,
  backupDay: 5,
  backupHour: 23,
  lastBackupTime: null
};

export const PROGRESS_ORDER = [
  ProjectProgress.REQUIREMENT_DECOMPOSITION,
  ProjectProgress.CONFIG_COMPONENT_FILL,
  ProjectProgress.COMPONENT_UPLOAD,
  ProjectProgress.SELF_TEST,
  ProjectProgress.SUBMITTED,
  ProjectProgress.RELEASED
];

export const PROGRESS_COLORS: Record<ProjectProgress, string> = {
  [ProjectProgress.REQUIREMENT_DECOMPOSITION]: '#6366f1',
  [ProjectProgress.CONFIG_COMPONENT_FILL]: '#8b5cf6',
  [ProjectProgress.COMPONENT_UPLOAD]: '#ec4899',
  [ProjectProgress.SELF_TEST]: '#f59e0b',
  [ProjectProgress.SUBMITTED]: '#3b82f6',
  [ProjectProgress.RELEASED]: '#10b981'
};
