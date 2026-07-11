import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock all external dependencies so the module can be imported without errors
// ---------------------------------------------------------------------------

// —— Obsidian API ——
vi.mock('obsidian', () => {
  class MockComponent {
    containerEl: HTMLElement;
    constructor() {
      this.containerEl = document.createElement('div');
    }
    empty() { /* noop */ }
    registerEvent() { /* noop */ }
  }
  class MockItemView extends MockComponent {
    getViewType() { return 'mock'; }
    getDisplayText() { return 'mock'; }
    getIcon() { return 'mock'; }
    app = { workspace: { getLeavesOfType: () => [] } };
    containerEl = document.createElement('div');
    addClass() { /* noop */ }
    onClose() { return Promise.resolve(); }
    loadData() { return Promise.resolve({}); }
    saveData() { return Promise.resolve(); }
  }
  return {
    ItemView: MockItemView,
    WorkspaceLeaf: class {},
    App: class {},
    Setting: class {
      constructor() { /* noop */ }
      setName() { return this; }
      setDesc() { return this; }
      addText() { return this; }
      addButton() { return this; }
      addToggle() { return this; }
      addSlider() { return this; }
      addDropdown() { return this; }
      setValue() { return this; }
      onChange() { return this; }
    },
    ButtonComponent: class {
      constructor() { /* noop */ }
      setIcon() { return this; }
      setButtonText() { return this; }
      setTooltip() { return this; }
      setClass() { return this; }
      onClick() { return this; }
    },
    Notice: class {},
    Menu: class {
      addItem() { return this; }
      addSeparator() { return this; }
      showAtMouseEvent() { /* noop */ }
    },
    TFile: class {},
    TFolder: class { children = []; },
    Modal: class { open() { /* noop */ } },
    Plugin: class {
      loadData() { return Promise.resolve({}); }
      saveData() { return Promise.resolve({}); }
    },
    PluginSettingTab: class {
      constructor() { /* noop */ }
      display() { /* noop */ }
    },
    normalizePath: (p: string) => p,
  };
});

// —— Main plugin (circular) ——
vi.mock('../main', () => ({
  default: class {
    settings = {
      dataPath: 'app-version-manager',
      progressStages: [
        { name: '需求分解', color: '#6366f1' },
        { name: '已发布', color: '#10b981' },
      ],
      overdueWarningDays: 3,
      autoRefreshInterval: 0,
      defaultTodos: [],
      defaultAppId: null,
      autoBackup: true,
      backupDay: 5,
      backupHour: 23,
      lastBackupTime: null,
      backupPath: '',
    };
    dataService = {
      getAllApps: vi.fn(async () => []),
      getVersionsByAppId: vi.fn(async () => []),
      getAllProjects: vi.fn(async () => []),
      getAllPlans: vi.fn(async () => []),
      getProjectById: vi.fn(async () => null),
      getProjectMemoPath: vi.fn(() => ''),
      ensureMemoFile: vi.fn(async () => ''),
      isAbsolutePath: vi.fn(() => false),
      updateProject: vi.fn(async () => null),
      deleteProject: vi.fn(async () => true),
    };
    todoService = {
      getByProjectId: vi.fn(async () => []),
    };
    backupService = {
      scheduleBackup: vi.fn(),
      clearBackupSchedule: vi.fn(),
    };
    loadData = vi.fn(async () => ({}));
    saveData = vi.fn(async () => {});
    app = { workspace: { getLeavesOfType: () => [] } };
  },
}));

// —— Sub-views ——
vi.mock('./DualPaneView', () => ({ DualPaneView: class {} }));
vi.mock('./KanbanView', () => ({ KanbanView: class {} }));
vi.mock('./TableView', () => ({ TableView: class {} }));
vi.mock('./TodoSidePanel', () => ({
  TodoSidePanel: class {
    constructor() { /* noop */ }
    isOpen = () => false;
    detachFromDOM = () => { /* noop */ };
    attachToDOM = () => { /* noop */ };
    open = () => { /* noop */ };
  },
}));

// —— Modals ——
vi.mock('./ConfirmModal', () => ({ ConfirmModal: class { open() { /* noop */ } } }));
vi.mock('./EditProjectModal', () => ({ EditProjectModal: class { open() { /* noop */ } } }));
vi.mock('./TestPlanModal', () => ({ TestPlanModal: class { open() { /* noop */ } } }));
vi.mock('./ConvertPlanModal', () => ({ ConvertPlanModal: class { open() { /* noop */ } } }));
vi.mock('./modals', () => ({
  CreateAppModal: class { open() { /* noop */ } },
  RenameAppModal: class { open() { /* noop */ } },
  CreateVersionModal: class { open() { /* noop */ } },
  CreateProjectModal: class { open() { /* noop */ } },
  DeleteFilterModal: class { open() { /* noop */ } },
  ExportModal: class { open() { /* noop */ } },
  ImportModal: class { open() { /* noop */ } },
  PlanModal: class { open() { /* noop */ } },
}));

// —— Services ——
vi.mock('../services/ImportExportService', () => ({
  ImportExportService: class {
    constructor() { /* noop */ }
    exportData = vi.fn();
    importData = vi.fn();
  },
}));

// —— Utils ——
vi.mock('../utils/linkUtils', () => ({
  openExternalLink: vi.fn(),
  openProjectNote: vi.fn(async () => {}),
}));
vi.mock('../utils/projectSorting', () => ({
  checkOverdue: vi.fn(() => false),
  isProjectHighlighted: vi.fn(() => false),
  calculateOverdueStats: vi.fn(() => ({ overdue: 0, warning: 0, onTrack: 0 })),
  sortProjectsByPriority: vi.fn((p: any[]) => p),
}));

// —— Now import the module under test (will throw if any import is missing) ——
import { VIEW_TYPE_APP_VERSION_MANAGER, AppVersionManagerView } from './AppVersionManagerView';

describe('AppVersionManagerView', () => {
  it('exports VIEW_TYPE constant', () => {
    expect(VIEW_TYPE_APP_VERSION_MANAGER).toBe('app-version-manager-view');
  });

  it('can be imported without errors', () => {
    // If we got here, all imports resolved successfully
    expect(AppVersionManagerView).toBeDefined();
  });

  describe('construction', () => {
    it('can be instantiated with mocks', () => {
      const leaf = {} as any;
      const plugin = {
        settings: {
          dataPath: 'app-version-manager',
          progressStages: [
            { name: '需求分解', color: '#6366f1' },
            { name: '已发布', color: '#10b981' },
          ],
          overdueWarningDays: 3,
          autoRefreshInterval: 0,
          defaultTodos: [],
          defaultAppId: null,
          autoBackup: true,
          backupDay: 5,
          backupHour: 23,
          lastBackupTime: null,
          backupPath: '',
        },
        dataService: {
          getAllApps: vi.fn(async () => []),
          getVersionsByAppId: vi.fn(async () => []),
          getAllProjects: vi.fn(async () => []),
          getAllPlans: vi.fn(async () => []),
          getProjectById: vi.fn(async () => null),
          getProjectMemoPath: vi.fn(() => ''),
          ensureMemoFile: vi.fn(async () => ''),
          isAbsolutePath: vi.fn(() => false),
          updateProject: vi.fn(async () => null),
          deleteProject: vi.fn(async () => true),
        },
        todoService: { getByProjectId: vi.fn(async () => []) },
        backupService: { scheduleBackup: vi.fn(), clearBackupSchedule: vi.fn() },
        loadData: vi.fn(async () => ({})),
        saveData: vi.fn(async () => {}),
        app: { workspace: { getLeavesOfType: () => [] } },
      } as any;
      const view = new AppVersionManagerView(leaf, plugin);
      expect(view).toBeDefined();
      expect(view.getViewType()).toBe('app-version-manager-view');
      expect(view.getDisplayText()).toBe('APP Version Manager');
    });
  });
});
