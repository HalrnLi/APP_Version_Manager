import { ItemView, WorkspaceLeaf, App as ObsidianApp, Setting, ButtonComponent, Notice, Menu, TFile } from 'obsidian';
import AppVersionManagerPlugin from '../main';
import { App, Version, Project, ProjectProgress, SavedFilter, Plan, getProgressOrder, getProgressColors } from '../types';
import { DualPaneView } from './DualPaneView';
import { KanbanView } from './KanbanView';
import { TableView } from './TableView';
// import { GanttView } from './GanttView';
import { TodoSidePanel } from './TodoSidePanel';
import { ConfirmModal } from './ConfirmModal';
import { EditProjectModal } from './EditProjectModal';
import { TestPlanModal } from './TestPlanModal';
import { ConvertPlanModal } from './ConvertPlanModal';
import { ImportExportService } from '../services/ImportExportService';
import { openExternalLink, openProjectNote } from '../utils/linkUtils';
import { checkOverdue, isProjectHighlighted } from '../utils/projectSorting';
import {
  CreateAppModal,
  RenameAppModal,
  CreateVersionModal,
  CreateProjectModal,
  DeleteFilterModal,
  ExportModal,
  ImportModal,
  PlanModal,
} from './modals';
import type { CreateProjectData, PlanFormData } from './modals';

export const VIEW_TYPE_APP_VERSION_MANAGER = 'app-version-manager-view';

type ViewType = 'dual' | 'kanban' | 'table'; // | 'gantt';

export class AppVersionManagerView extends ItemView {
  plugin: AppVersionManagerPlugin;
  apps: App[] = [];
  versions: Version[] = [];
  projects: Project[] = [];
  selectedAppId: string | null = null;
  selectedVersionId: string | null = null;
  currentView: ViewType = 'dual';
  currentTab: 'projects' | 'plans' | 'archived' = 'projects';
  plans: Plan[] = [];
  savedFilters: SavedFilter[] = [];
  currentFilter: { progress: ProjectProgress | null; keyword: string } = { progress: null, keyword: '' };
  importExportService: ImportExportService;
  todoSidePanel: TodoSidePanel;

  private viewContainerEl: HTMLElement;
  private headerEl: HTMLElement;
  private mainEl: HTMLElement;
  private searchDebounceTimer: number | null = null;
  private autoRefreshTimer: number | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: AppVersionManagerPlugin) {
    super(leaf);
    this.plugin = plugin;
    this.importExportService = new ImportExportService(this.app, this.plugin);
    this.todoSidePanel = new TodoSidePanel(this.containerEl, this.plugin, () => this.refresh());
    this.loadSavedFilters();
  }

  getViewType(): string {
    return VIEW_TYPE_APP_VERSION_MANAGER;
  }

  getDisplayText(): string {
    return 'APP Version Manager';
  }

  getIcon(): string {
    return 'layers';
  }

  async onOpen() {
    this.renderLoading();
    try {
      await this.loadData();
      this.render();
    } catch (error) {
      this.renderError(error instanceof Error ? error.message : String(error));
    }
    this.registerEvents();
    this.startAutoRefresh();
  }

  private renderLoading() {
    this.containerEl.empty();
    this.containerEl.addClass('app-version-manager');
    const loadingEl = this.containerEl.createDiv({ cls: 'avm-loading' });
    loadingEl.createEl('span', { text: '加载中...' });
  }

  private renderError(message: string) {
    this.containerEl.empty();
    this.containerEl.addClass('app-version-manager');
    const errorEl = this.containerEl.createDiv({ cls: 'avm-error' });
    errorEl.createEl('p', { text: `加载失败: ${message}` });
    const retryBtn = errorEl.createEl('button', { text: '重试' });
    retryBtn.addEventListener('click', () => this.refresh());
  }

  private async loadData() {
    this.apps = await this.plugin.dataService.getAllApps();

    if (this.apps.length > 0) {
      if (!this.selectedAppId || !this.apps.find((a) => a.id === this.selectedAppId)) {
        this.selectedAppId = this.plugin.settings.defaultAppId || this.apps[0].id;
      }

      this.versions = await this.plugin.dataService.getVersionsByAppId(this.selectedAppId);
      // 只保留当前 app 关联的 projects（用 Set 过滤，避免 O(n*m) 的 .includes()）
      const allProjects = await this.plugin.dataService.getAllProjects();
      const versionIds = new Set(this.versions.map((v) => v.id));
      this.projects = allProjects.filter((p) => versionIds.has(p.versionId));
      this.plans = await this.plugin.dataService.getAllPlans();
    }
  }

  private async loadSavedFilters() {
    const data = (await this.plugin.loadData()) || {};
    this.savedFilters = data.savedFilters || [];
  }

  private async saveSavedFilters() {
    const data = (await this.plugin.loadData()) || {};
    data.savedFilters = this.savedFilters;
    await this.plugin.saveData(data);
  }

  private registerEvents() {}

  handleCreateVersion() {
    if (this.selectedAppId) {
      this.showCreateVersionModal();
    }
  }

  handleCreateProject() {
    if (this.selectedVersionId) {
      this.showCreateProjectModal();
    }
  }

  async getTodoStats(projectId: string): Promise<{ total: number; completed: number; overdue: number }> {
    try {
      const todos = await this.plugin.todoService.getByProjectId(projectId);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayStr = `${today.getFullYear()}-${(today.getMonth() + 1).toString().padStart(2, '0')}-${today.getDate().toString().padStart(2, '0')}`;

      const completed = todos.filter((t) => t.completed).length;
      const overdue = todos.filter((t) => !t.completed && t.dueDate && t.dueDate < todayStr).length;

      return { total: todos.length, completed, overdue };
    } catch (error) {
      console.error('Failed to get todo stats:', error);
      return { total: 0, completed: 0, overdue: 0 };
    }
  }

  onOpenTodos(projectId: string, projectName: string): void {
    this.todoSidePanel.open(projectId, projectName);
  }

  async refresh() {
    await this.loadData();
    this.render();
  }

  private render() {
    const panelWasOpen = this.todoSidePanel.isOpen();
    if (panelWasOpen) {
      this.todoSidePanel.detachFromDOM();
    }

    this.containerEl.empty();
    this.containerEl.addClass('app-version-manager');

    try {
      this.headerEl = this.containerEl.createDiv({ cls: 'avm-header' });
      this.renderHeader();

      this.mainEl = this.containerEl.createDiv({ cls: 'avm-main' });
      this.renderMainView();
    } catch (error) {
      this.renderError(error instanceof Error ? error.message : String(error));
    }

    if (panelWasOpen) {
      this.todoSidePanel.attachToDOM(this.containerEl);
    }
  }

  /** 仅更新 tab bar 的 active 状态，不重建整个 header */
  private updateTabBar(): void {
    const tabBar = this.headerEl?.querySelector('.avm-tab-bar');
    if (!tabBar) return;
    const tabs = tabBar.querySelectorAll('.avm-tab');
    tabs.forEach((tab, i) => {
      const keys: Array<'projects' | 'plans' | 'archived'> = ['projects', 'plans', 'archived'];
      const isActive = keys[i] === this.currentTab;
      tab.classList.toggle('avm-tab-active', isActive);
    });
  }

  private renderHeader() {
    this.headerEl.empty();

    // Tab 切换栏
    const tabBar = this.headerEl.createDiv({ cls: 'avm-tab-bar' });
    const tabs: { key: 'projects' | 'plans' | 'archived'; label: string }[] = [
      { key: 'projects', label: '项目' },
      { key: 'plans', label: '规划' },
      { key: 'archived', label: '已归档' },
    ];
    tabs.forEach(({ key, label }) => {
      const tabEl = tabBar.createDiv({ cls: 'avm-tab' + (this.currentTab === key ? ' avm-tab-active' : '') });
      tabEl.setText(label);
      tabEl.addEventListener('click', () => {
        if (this.currentTab !== key) {
          this.currentTab = key;
          this.renderHeader();
          this.renderMainView();
        }
      });
    });

    if (this.currentTab === 'plans') {
      // 规划 Tab：只显示新建按钮
      const planActionBar = this.headerEl.createDiv({ cls: 'avm-plan-action-bar' });
      new ButtonComponent(planActionBar)
        .setIcon('plus')
        .setButtonText('新建规划')
        .onClick(() => this.showCreatePlanModal());
      return;
    }

    if (this.currentTab === 'archived') {
      // 已归档 Tab：只显示搜索
      return;
    }

    const topBar = this.headerEl.createDiv({ cls: 'avm-top-bar' });

    const appSelector = topBar.createDiv({ cls: 'avm-app-selector' });
    const select = appSelector.createEl('select', { cls: 'avm-select' });

    this.apps.forEach((app) => {
      const option = select.createEl('option', { value: app.id, text: app.name });
      if (app.id === this.selectedAppId) {
        option.selected = true;
      }
    });

    select.addEventListener('change', async (e) => {
      this.selectedAppId = (e.target as HTMLSelectElement).value;
      this.selectedVersionId = null;
      await this.refresh();
    });

    const appActions = appSelector.createDiv({ cls: 'avm-app-actions' });

    new ButtonComponent(appActions)
      .setIcon('plus')
      .setTooltip('新建APP')
      .onClick(() => this.showCreateAppModal());

    new ButtonComponent(appActions)
      .setIcon('pencil')
      .setTooltip('重命名APP')
      .setDisabled(!this.selectedAppId)
      .onClick(() => {
        if (this.selectedAppId) {
          this.showRenameAppModal();
        }
      });

    new ButtonComponent(appActions)
      .setIcon('trash')
      .setTooltip('删除APP')
      .setDisabled(!this.selectedAppId)
      .onClick(() => {
        if (this.selectedAppId) {
          this.confirmDeleteApp();
        }
      });

    const viewSwitcher = topBar.createDiv({ cls: 'avm-view-switcher' });

    const viewTypes: { type: ViewType; label: string; icon: string }[] = [
      { type: 'dual', label: '双栏视图', icon: 'layout' },
      { type: 'kanban', label: '看板视图', icon: 'trello' },
      { type: 'table', label: '表格视图', icon: 'table' },
      // { type: 'gantt', label: '甘特图', icon: 'calendar' }
    ];

    viewTypes.forEach(({ type, label, icon }) => {
      const btn = new ButtonComponent(viewSwitcher)
        .setIcon(icon)
        .setTooltip(label)
        .onClick(() => {
          this.currentView = type;
          this.renderMainView();
        });
      if (this.currentView === type) {
        btn.setClass('avm-view-btn-active');
      }
    });

    const filterBar = this.headerEl.createDiv({ cls: 'avm-filter-bar' });

    const searchInput = filterBar.createEl('input', {
      cls: 'avm-search-input',
      attr: { type: 'text', placeholder: '搜索项目、项目经理、项目需求...' },
    });
    searchInput.value = this.currentFilter.keyword;
    searchInput.addEventListener('input', (e) => {
      this.currentFilter.keyword = (e.target as HTMLInputElement).value;
      if (this.searchDebounceTimer) {
        clearTimeout(this.searchDebounceTimer);
      }
      this.searchDebounceTimer = window.setTimeout(() => {
        this.renderMainView();
      }, 180);
    });

    const progressFilter = filterBar.createEl('select', { cls: 'avm-select' });
    progressFilter.createEl('option', { value: '', text: '全部进度' });
    const progressOrder = getProgressOrder(this.plugin.settings.progressStages);
    progressOrder.forEach((progress) => {
      const option = progressFilter.createEl('option', { value: progress, text: progress });
      if (progress === this.currentFilter.progress) {
        option.selected = true;
      }
    });
    progressFilter.addEventListener('change', (e) => {
      const value = (e.target as HTMLSelectElement).value;
      this.currentFilter.progress = (value as ProjectProgress) || null;
      this.renderMainView();
    });

    const filterActions = filterBar.createDiv({ cls: 'avm-filter-actions' });

    new ButtonComponent(filterActions)
      .setIcon('save')
      .setTooltip('保存筛选条件')
      .onClick(() => this.showSaveFilterModal());

    if (this.savedFilters.length > 0) {
      const savedFilterSelect = filterActions.createEl('select', { cls: 'avm-select avm-saved-filter' });
      savedFilterSelect.createEl('option', { value: '', text: '已保存的筛选' });
      this.savedFilters.forEach((filter) => {
        savedFilterSelect.createEl('option', { value: filter.id, text: filter.name });
      });
      savedFilterSelect.addEventListener('change', (e) => {
        const filterId = (e.target as HTMLSelectElement).value;
        if (filterId) {
          this.applySavedFilter(filterId);
        }
      });

      new ButtonComponent(filterActions)
        .setIcon('trash')
        .setTooltip('删除筛选')
        .onClick(() => {
          if (this.savedFilters.length === 0) {
            new Notice('没有可删除的筛选条件');
            return;
          }
          new DeleteFilterModal(
            this.app,
            this.savedFilters,
            async (filterId) => {
              this.savedFilters = this.savedFilters.filter((f) => f.id !== filterId);
              await this.saveSavedFilters();
            },
            () => {
              this.render();
            },
          ).open();
        });
    }

    const actionButtons = filterBar.createDiv({ cls: 'avm-action-buttons' });

    new ButtonComponent(actionButtons)
      .setIcon('download')
      .setTooltip('导出数据')
      .onClick(() => this.showExportModal());

    new ButtonComponent(actionButtons)
      .setIcon('upload')
      .setTooltip('导入数据')
      .onClick(() => this.showImportModal());

    new ButtonComponent(actionButtons)
      .setIcon('refresh-cw')
      .setTooltip('刷新')
      .onClick(() => this.refresh());
  }

  private renderMainView() {
    this.mainEl.empty();

    if (this.currentTab === 'plans') {
      this.renderPlansView();
      return;
    }

    if (this.currentTab === 'archived') {
      this.renderArchivedView();
      return;
    }

    const appFilteredProjects = this.getFilteredProjects({ versionId: '' });
    const filteredVersions = this.selectedAppId ? this.versions.filter((v) => v.appId === this.selectedAppId) : [];

    switch (this.currentView) {
      case 'dual':
        new DualPaneView(
          this.mainEl,
          this.plugin,
          this.apps,
          filteredVersions,
          appFilteredProjects,
          this.selectedVersionId,
          (versionId) => {
            this.selectedVersionId = versionId;
            this.render();
          },
          () => this.showCreateVersionModal(),
          () => this.showCreateProjectModal(),
          () => this.refresh(),
          (projectId) => this.getTodoStats(projectId),
          (projectId, projectName) => this.onOpenTodos(projectId, projectName),
        );
        break;
      case 'kanban':
        new KanbanView(
          this.mainEl,
          this.plugin,
          appFilteredProjects,
          filteredVersions,
          this.apps,
          () => this.refresh(),
          (projectId) => this.getTodoStats(projectId),
          (projectId, projectName) => this.onOpenTodos(projectId, projectName),
        );
        break;
      case 'table':
        new TableView(
          this.mainEl,
          this.plugin,
          appFilteredProjects,
          filteredVersions,
          this.apps,
          () => this.refresh(),
          (projectId) => this.getTodoStats(projectId),
          (projectId, projectName) => this.onOpenTodos(projectId, projectName),
        );
        break;
      /* // 甘特图视图已禁用
      case 'gantt':
        new GanttView(
          this.mainEl,
          this.plugin,
          appFilteredProjects,
          filteredVersions,
          this.apps,
          () => this.refresh()
        );
        break;
      */
    }
  }

  private getFilteredProjects(options?: { versionId?: string }): Project[] {
    // this.projects 已在 loadData() 中按 app 过滤，无需再次过滤 appVersionIds
    let projects = this.projects;

    // 排除已归档项目（最后一个进度阶段）
    const lastProgress = getProgressOrder(this.plugin.settings.progressStages).at(-1);
    if (lastProgress) {
      projects = projects.filter((p) => p.progress !== lastProgress);
    }

    const versionFilter = options?.versionId ?? this.selectedVersionId;
    if (versionFilter) {
      projects = projects.filter((p) => p.versionId === versionFilter);
    }

    if (this.currentFilter.progress) {
      projects = projects.filter((p) => p.progress === this.currentFilter.progress);
    }

    if (this.currentFilter.keyword) {
      const keyword = this.currentFilter.keyword.toLowerCase();
      projects = projects.filter(
        (p) =>
          p.name.toLowerCase().includes(keyword) ||
          p.manager.toLowerCase().includes(keyword) ||
          p.features.toLowerCase().includes(keyword) ||
          p.requirements.toLowerCase().includes(keyword),
      );
    }

    return projects;
  }

  private showCreateAppModal() {
    new CreateAppModal(this.app, async (name) => {
      try {
        await this.plugin.dataService.createApp(name);
        await this.refresh();
      } catch (error) {
        new Notice(error instanceof Error ? error.message : String(error));
      }
    }).open();
  }

  private showRenameAppModal() {
    const app = this.apps.find((a) => a.id === this.selectedAppId);
    if (!app) return;

    new RenameAppModal(this.app, app.name, async (newName) => {
      try {
        await this.plugin.dataService.updateApp(this.selectedAppId!, newName, app.version);
        await this.refresh();
      } catch (error) {
        new Notice(error instanceof Error ? error.message : String(error));
      }
    }).open();
  }

  private async confirmDeleteApp() {
    const app = this.apps.find((a) => a.id === this.selectedAppId);
    if (!app) return;

    new ConfirmModal(
      this.app,
      '删除APP',
      `确定要删除APP "${app.name}" 吗？\n这将同时删除该APP下的所有版本和项目数据！`,
      async () => {
        try {
          await this.plugin.dataService.deleteApp(this.selectedAppId!);
          this.selectedAppId = this.apps.length > 1 ? this.apps.find((a) => a.id !== this.selectedAppId)?.id || null : null;
          await this.refresh();
        } catch (error) {
          new Notice(error instanceof Error ? error.message : String(error));
        }
      },
      undefined,
      true,
    ).open();
  }

  private showCreateVersionModal() {
    if (!this.selectedAppId) return;

    new CreateVersionModal(this.app, async (data) => {
      try {
        await this.plugin.dataService.createVersion({
          appId: this.selectedAppId!,
          ...data,
        });
        await this.refresh();
      } catch (error) {
        new Notice(error instanceof Error ? error.message : String(error));
      }
    }).open();
  }

  private showCreateProjectModal() {
    if (!this.selectedVersionId) return;

    new CreateProjectModal(this.app, this.selectedVersionId, this.plugin.settings.progressStages, async (data) => {
      try {
        await this.plugin.dataService.createProject(data);
        await this.refresh();
      } catch (error) {
        new Notice(error instanceof Error ? error.message : String(error));
      }
    }).open();
  }

  private async showSaveFilterModal() {
    const keyword = this.currentFilter.keyword.trim();
    if (!keyword) return;

    const filter: SavedFilter = {
      id: Date.now().toString(),
      name: keyword,
      appId: this.selectedAppId,
      versionId: this.selectedVersionId,
      progress: this.currentFilter.progress,
      keyword: this.currentFilter.keyword,
    };
    this.savedFilters.push(filter);
    await this.saveSavedFilters();
    this.render();
  }

  private async applySavedFilter(filterId: string) {
    const filter = this.savedFilters.find((f) => f.id === filterId);
    if (!filter) return;

    this.selectedAppId = filter.appId;
    this.selectedVersionId = filter.versionId;
    this.currentFilter.progress = filter.progress;
    this.currentFilter.keyword = filter.keyword;

    await this.refresh();
  }

  private async deleteSavedFilter(filterId: string) {
    const filter = this.savedFilters.find((f) => f.id === filterId);
    if (!filter) return;

    new ConfirmModal(this.app, '删除筛选条件', `确定要删除筛选条件 "${filter.name}" 吗？`, async () => {
      this.savedFilters = this.savedFilters.filter((f) => f.id !== filterId);
      await this.saveSavedFilters();
      this.render();
    }).open();
  }

  private showExportModal() {
    new ExportModal(this.app, this.importExportService, this.getFilteredProjects(), this.versions).open();
  }

  private showImportModal() {
    if (!this.selectedAppId) {
      new Notice('请先选择一个APP');
      return;
    }
    new ImportModal(this.app, this.importExportService, this.plugin.backupService, this.selectedAppId, async () => {
      await this.refresh();
    }).open();
  }

  // ---------- 规划相关方法 ----------

  private showCreatePlanModal() {
    new PlanModal(this.app, undefined, async (data) => {
      try {
        await this.plugin.dataService.createPlan(data);
        await this.refresh();
      } catch (error) {
        new Notice(error instanceof Error ? error.message : String(error));
      }
    }).open();
  }

  private showEditPlanModal(plan: Plan) {
    new PlanModal(this.app, plan, async (data) => {
      try {
        await this.plugin.dataService.updatePlan(plan.id, data, plan.version);
        await this.refresh();
      } catch (error) {
        new Notice(error instanceof Error ? error.message : String(error));
      }
    }).open();
  }

  private handleConvertPlan(plan: Plan) {
    if (!this.selectedAppId) {
      new Notice('请先选择 APP 再转为正式项目');
      return;
    }

    const appVersions = this.versions.filter((v) => v.appId === this.selectedAppId);

    new ConvertPlanModal(this.app, plan, appVersions, this.plugin.dataService, async () => {
      new Notice('已转为正式项目');
      this.currentTab = 'projects';
      await this.refresh();
      // 自动选中新创建项目对应的版本
      const allProjects = await this.plugin.dataService.getAllProjects();
      const newProject = allProjects.find((p) => p.versionId && appVersions.some((v) => v.id === p.versionId));
      if (newProject) {
        this.selectedVersionId = newProject.versionId;
      }
    }).open();
  }

  private async confirmDeletePlan(plan: Plan) {
    new ConfirmModal(
      this.app,
      '删除规划',
      `确定要删除规划 "${plan.topic}" 吗？`,
      async () => {
        try {
          await this.plugin.dataService.deletePlan(plan.id);
          await this.refresh();
        } catch (error) {
          new Notice(error instanceof Error ? error.message : String(error));
        }
      },
      undefined,
      true,
    ).open();
  }

  private renderPlansView() {
    const plans = [...this.plans].sort((a, b) => {
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    if (plans.length === 0) {
      this.mainEl.createDiv({
        cls: 'avm-empty-state',
        text: '暂无规划，点击左上角「新建规划」创建',
      });
      return;
    }

    const wrapper = this.mainEl.createDiv({ cls: 'avm-plans-wrapper' });
    const table = wrapper.createEl('table', { cls: 'avm-table avm-plans-table' });

    // 表头
    const thead = table.createEl('thead');
    const headerRow = thead.createEl('tr');
    ['项目主题', '项目经理', '提测时间', '发布时间', '操作'].forEach((text) => {
      headerRow.createEl('th', { text });
    });

    // 表体
    const tbody = table.createEl('tbody');
    plans.forEach((plan) => {
      const row = tbody.createEl('tr');

      row.createEl('td', { cls: 'avm-cell-name', text: plan.topic });

      row.createEl('td', { text: plan.manager || '-' });

      row.createEl('td', { text: plan.testDate || '-' });

      row.createEl('td', { text: plan.releaseDate || '-' });

      const actionsCell = row.createEl('td', { cls: 'avm-cell-actions' });

      new ButtonComponent(actionsCell)
        .setIcon('pencil')
        .setTooltip('编辑')
        .setClass('avm-btn-icon')
        .onClick(() => this.showEditPlanModal(plan));

      new ButtonComponent(actionsCell)
        .setIcon('trash')
        .setTooltip('删除')
        .setClass('avm-btn-icon')
        .setClass('avm-btn-danger')
        .onClick(() => this.confirmDeletePlan(plan));

      new ButtonComponent(actionsCell)
        .setIcon('arrow-right-circle')
        .setTooltip('转为正式项目')
        .setClass('avm-btn-icon')
        .onClick(() => this.handleConvertPlan(plan));
    });
  }

  private getArchivedProjects(): Project[] {
    const lastProgress = getProgressOrder(this.plugin.settings.progressStages).at(-1);
    if (!lastProgress) return [];
    return this.projects.filter((p) => p.progress === lastProgress);
  }

  private renderArchivedView() {
    const archivedProjects = this.getArchivedProjects();

    if (archivedProjects.length === 0) {
      this.mainEl.createDiv({
        cls: 'avm-empty-state',
        text: '暂无已归档项目',
      });
      return;
    }

    const searchBar = this.mainEl.createDiv({ cls: 'avm-archived-search-bar' });
    const searchInput = searchBar.createEl('input', {
      cls: 'avm-search-input',
      attr: { type: 'text', placeholder: '搜索已归档项目...' },
    });
    let searchKeyword = '';
    searchInput.addEventListener('input', (e) => {
      searchKeyword = (e.target as HTMLInputElement).value.toLowerCase();
      this.renderArchivedList(archivedProjects, searchKeyword);
    });

    const listContainer = this.mainEl.createDiv({ cls: 'avm-project-list' });
    this.renderArchivedList(archivedProjects, searchKeyword, listContainer);
  }

  private renderArchivedList(archivedProjects: Project[], keyword: string, listContainer?: HTMLElement) {
    const container = listContainer || this.mainEl.querySelector('.avm-project-list') || this.mainEl;
    const existingList = container.querySelector('.avm-archived-items');
    if (existingList) existingList.remove();

    const filtered = keyword
      ? archivedProjects.filter(
          (p) =>
            p.name.toLowerCase().includes(keyword) ||
            p.manager.toLowerCase().includes(keyword) ||
            p.features.toLowerCase().includes(keyword),
        )
      : archivedProjects;

    if (filtered.length === 0) {
      container.createDiv({ cls: 'avm-empty-state', text: '没有找到匹配的项目' });
      return;
    }

    const itemsEl = container.createDiv({ cls: 'avm-archived-items' });
    filtered.forEach((project) => {
      this.renderArchivedProjectCard(itemsEl, project);
    });
  }

  private renderArchivedProjectCard(container: HTMLElement, project: Project) {
    const item = container.createDiv({ cls: 'avm-project-item' });

    if (isProjectHighlighted(project, this.plugin.settings.overdueWarningDays)) {
      item.addClass('avm-highlighted-row');
    }

    // Header: name + progress badge
    const header = item.createDiv({ cls: 'avm-project-header' });
    header.createDiv({ cls: 'avm-project-name', text: project.name });

    const progressColors = getProgressColors(this.plugin.settings.progressStages);
    const progressBadge = header.createDiv({
      cls: 'avm-progress-badge',
      text: project.progress,
    });
    progressBadge.style.backgroundColor = progressColors[project.progress] || '#64748b';

    // Todo badge
    const todoBadge = header.createDiv({ cls: 'avm-todo-badge', text: '📋' });
    todoBadge.addEventListener('click', (e) => {
      e.stopPropagation();
      this.onOpenTodos(project.id, project.name);
    });
    this.getTodoStats(project.id)
      .then((stats) => {
        if (stats.total > 0) {
          todoBadge.setText(`${stats.completed}/${stats.total}`);
          if (stats.overdue > 0) todoBadge.addClass('has-overdue');
        }
      })
      .catch(console.error);

    // Features
    if (project.features) {
      const featuresEl = item.createDiv({ cls: 'avm-project-features' });
      featuresEl.createEl('strong', { text: '特性:' });
      featuresEl.createSpan({ text: project.features.substring(0, 100) + (project.features.length > 100 ? '...' : '') });
    }

    // Spec
    if (project.spec) {
      const specEl = item.createDiv({ cls: 'avm-project-spec' });
      specEl.createEl('strong', { text: '配置组件/规格:' });
      specEl.createSpan({ text: project.spec.substring(0, 100) + (project.spec.length > 100 ? '...' : '') });
    }

    // Overdue
    if (checkOverdue(project, this.plugin.settings.progressStages, this.plugin.settings.overdueWarningDays)) {
      item.addClass('avm-overdue');
    }

    // Meta info
    const meta = item.createDiv({ cls: 'avm-project-meta' });
    if (project.manager) {
      meta.createSpan({ cls: 'avm-meta-item', text: `👤 ${project.manager}` });
    }
    const version = this.versions.find((v) => v.id === project.versionId);
    const app = version ? this.apps.find((a) => a.id === version.appId) : null;
    if (app) {
      meta.createSpan({ cls: 'avm-meta-item', text: `📦 ${app.name} / ${version?.versionNumber || '-'}` });
    }
    if (project.actualReleaseTime) {
      meta.createSpan({ cls: 'avm-meta-item', text: `📅 ${project.actualReleaseTime}` });
    }

    // Links
    const links = item.createDiv({ cls: 'avm-project-links' });
    if (project.projectLink) {
      const link = links.createEl('a', {
        cls: 'avm-link',
        text: '项目链接',
        attr: { href: project.projectLink, target: '_blank', rel: 'noopener noreferrer' },
      });
      link.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        openExternalLink(project.projectLink);
      });
    }
    if (project.componentLink) {
      const link = links.createEl('a', {
        cls: 'avm-link',
        text: '组件库',
        attr: { href: project.componentLink, target: '_blank', rel: 'noopener noreferrer' },
      });
      link.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        openExternalLink(project.componentLink);
      });
    }

    // Requirements
    if (project.requirements) {
      const req = item.createDiv({ cls: 'avm-project-requirements' });
      req.createEl('strong', { text: '需求:' });
      req.createSpan({ text: project.requirements.substring(0, 100) + (project.requirements.length > 100 ? '...' : '') });
    }

    // Context menu
    item.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.showArchivedContextMenu(project, e);
    });

    // Double-click to open memo
    item.addEventListener('dblclick', async (e) => {
      e.preventDefault();
      const memoPath = await this.plugin.dataService.ensureMemoFile(project.name);
      await openProjectNote(this.plugin.app, memoPath, this.plugin.dataService.isAbsolutePath());
    });
  }

  private showArchivedContextMenu(project: Project, event: MouseEvent) {
    const menu = new Menu();

    menu.addItem((item) =>
      item
        .setTitle('编辑')
        .setIcon('pencil')
        .onClick(() => this.showEditArchivedProject(project)),
    );

    menu.addItem((item) =>
      item
        .setTitle('提测计划')
        .setIcon('calendar')
        .onClick(() => this.showTestPlanForArchived(project)),
    );

    menu.addItem((item) =>
      item
        .setTitle('待办事项')
        .setIcon('checkmark')
        .onClick(() => this.onOpenTodos(project.id, project.name)),
    );

    menu.addSeparator();

    menu.addItem((item) =>
      item
        .setTitle('删除')
        .setIcon('trash')
        .onClick(() => {
          new ConfirmModal(
            this.plugin.app,
            '删除项目',
            `确定要删除项目 "${project.name}" 吗？`,
            async () => {
              try {
                await this.plugin.dataService.deleteProject(project.id);
                await this.refresh();
              } catch (error) {
                new Notice(error instanceof Error ? error.message : String(error));
              }
            },
            undefined,
            true,
          ).open();
        }),
    );

    menu.showAtMouseEvent(event);
  }

  private showEditArchivedProject(project: Project) {
    new EditProjectModal(this.plugin.app, project, this.apps, this.versions, this.plugin.settings.progressStages, async (data) => {
      try {
        await this.plugin.dataService.updateProject(project.id, data, project.version);
        await this.refresh();
      } catch (error) {
        new Notice(error instanceof Error ? error.message : String(error));
      }
    }).open();
  }

  private showTestPlanForArchived(project: Project) {
    new TestPlanModal(this.plugin.app, project, async (data) => {
      try {
        await this.plugin.dataService.updateProject(project.id, data, project.version);
        await this.refresh();
      } catch (error) {
        new Notice(error instanceof Error ? error.message : String(error));
      }
    }).open();
  }

  async onClose() {
    if (this.searchDebounceTimer) {
      clearTimeout(this.searchDebounceTimer);
      this.searchDebounceTimer = null;
    }
    this.stopAutoRefresh();
    this.containerEl.empty();
  }

  private startAutoRefresh() {
    this.stopAutoRefresh();
    const interval = this.plugin.settings.autoRefreshInterval;
    if (interval > 0) {
      const milliseconds = interval * 60 * 1000;
      this.autoRefreshTimer = window.setInterval(() => {
        this.refresh();
      }, milliseconds);
    }
  }

  private stopAutoRefresh() {
    if (this.autoRefreshTimer) {
      clearInterval(this.autoRefreshTimer);
      this.autoRefreshTimer = null;
    }
  }
}
