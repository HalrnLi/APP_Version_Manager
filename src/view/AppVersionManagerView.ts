import { ItemView, WorkspaceLeaf, Modal, App as ObsidianApp, Setting, ButtonComponent, Notice } from 'obsidian';
import AppVersionManagerPlugin from '../main';
import { App, Version, Project, ProjectProgress, SavedFilter, Plan, getProgressOrder, getProgressColors, getFirstProgress, parseDateInput } from '../types';
import { DualPaneView } from './DualPaneView';
import { KanbanView } from './KanbanView';
import { TableView } from './TableView';
import { GanttView } from './GanttView';
import { ConfirmModal } from './ConfirmModal';
import { ConvertPlanModal } from './ConvertPlanModal';
import { createSaveButtons, createActionButtons } from './ModalUtils';
import { ImportExportService } from '../services/ImportExportService';

export const VIEW_TYPE_APP_VERSION_MANAGER = 'app-version-manager-view';

type ViewType = 'dual' | 'kanban' | 'table' | 'gantt';

interface CreateProjectData {
  name: string;
  versionId: string;
  manager: string;
  projectLink: string;
  componentLink: string;
  features: string;
  spec: string;
  requirements: string;
  progress: ProjectProgress;
}

export class AppVersionManagerView extends ItemView {
  plugin: AppVersionManagerPlugin;
  apps: App[] = [];
  versions: Version[] = [];
  projects: Project[] = [];
  selectedAppId: string | null = null;
  selectedVersionId: string | null = null;
  currentView: ViewType = 'dual';
  currentTab: 'projects' | 'plans' = 'projects';
  plans: Plan[] = [];
  savedFilters: SavedFilter[] = [];
  currentFilter: { progress: ProjectProgress | null; keyword: string } = { progress: null, keyword: '' };
  importExportService: ImportExportService;
  
  private viewContainerEl: HTMLElement;
  private headerEl: HTMLElement;
  private mainEl: HTMLElement;
  private searchDebounceTimer: number | null = null;
  private autoRefreshTimer: number | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: AppVersionManagerPlugin) {
    super(leaf);
    this.plugin = plugin;
    this.importExportService = new ImportExportService(this.app, this.plugin);
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
    await this.loadData();
    this.render();
    this.registerEvents();
    this.startAutoRefresh();
  }

  private renderLoading() {
    this.containerEl.empty();
    this.containerEl.addClass('app-version-manager');
    const loadingEl = this.containerEl.createDiv({ cls: 'avm-loading' });
    loadingEl.createEl('span', { text: '加载中...' });
  }

  private async loadData() {
    this.apps = await this.plugin.dataService.getAllApps();
    
    if (this.apps.length > 0) {
      if (!this.selectedAppId || !this.apps.find(a => a.id === this.selectedAppId)) {
        this.selectedAppId = this.plugin.settings.defaultAppId || this.apps[0].id;
      }
      
      this.versions = await this.plugin.dataService.getVersionsByAppId(this.selectedAppId);
      this.projects = await this.plugin.dataService.getAllProjects();
      this.plans = await this.plugin.dataService.getAllPlans();
    }
  }

  private async loadSavedFilters() {
    const data = await this.plugin.loadData() || {};
    this.savedFilters = data.savedFilters || [];
  }

  private async saveSavedFilters() {
    const data = await this.plugin.loadData() || {};
    data.savedFilters = this.savedFilters;
    await this.plugin.saveData(data);
  }

  private registerEvents() {
  }

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

  async refresh() {
    await this.loadData();
    this.render();
  }

  private render() {
    this.containerEl.empty();
    this.containerEl.addClass('app-version-manager');
    
    this.headerEl = this.containerEl.createDiv({ cls: 'avm-header' });
    this.renderHeader();
    
    this.mainEl = this.containerEl.createDiv({ cls: 'avm-main' });
    this.renderMainView();
  }

  private renderHeader() {
    this.headerEl.empty();

    // Tab 切换栏
    const tabBar = this.headerEl.createDiv({ cls: 'avm-tab-bar' });
    const tabs: { key: 'projects' | 'plans'; label: string }[] = [
      { key: 'projects', label: '项目' },
      { key: 'plans', label: '规划' }
    ];
    tabs.forEach(({ key, label }) => {
      const tabEl = tabBar.createDiv({ cls: 'avm-tab' + (this.currentTab === key ? ' avm-tab-active' : '') });
      tabEl.setText(label);
      tabEl.addEventListener('click', () => {
        if (this.currentTab !== key) {
          this.currentTab = key;
          this.render();
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

    const topBar = this.headerEl.createDiv({ cls: 'avm-top-bar' });
    
    const appSelector = topBar.createDiv({ cls: 'avm-app-selector' });
    const select = appSelector.createEl('select', { cls: 'avm-select' });
    
    this.apps.forEach(app => {
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
      { type: 'gantt', label: '甘特图', icon: 'calendar' }
    ];
    
    viewTypes.forEach(({ type, label, icon }) => {
      const btn = new ButtonComponent(viewSwitcher)
        .setIcon(icon)
        .setTooltip(label)
        .onClick(() => {
          this.currentView = type;
          this.render();
        });
      if (this.currentView === type) {
        btn.setClass('avm-view-btn-active');
      }
    });
    
    const filterBar = this.headerEl.createDiv({ cls: 'avm-filter-bar' });
    
    const searchInput = filterBar.createEl('input', {
      cls: 'avm-search-input',
      attr: { type: 'text', placeholder: '搜索项目、项目经理、项目需求...' }
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
    progressOrder.forEach(progress => {
      const option = progressFilter.createEl('option', { value: progress, text: progress });
      if (progress === this.currentFilter.progress) {
        option.selected = true;
      }
    });
    progressFilter.addEventListener('change', (e) => {
      const value = (e.target as HTMLSelectElement).value;
      this.currentFilter.progress = value as ProjectProgress || null;
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
      this.savedFilters.forEach(filter => {
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
          new DeleteFilterModal(this.app, this.savedFilters, async (filterId) => {
            this.savedFilters = this.savedFilters.filter(f => f.id !== filterId);
            await this.saveSavedFilters();
          }, () => {
            this.render();
          }).open();
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
    
    const appFilteredProjects = this.getAppFilteredProjects();
    const filteredVersions = this.selectedAppId 
      ? this.versions.filter(v => v.appId === this.selectedAppId)
      : [];
    
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
          () => this.refresh()
        );
        break;
      case 'kanban':
        new KanbanView(
          this.mainEl,
          this.plugin,
          appFilteredProjects,
          filteredVersions,
          this.apps,
          () => this.refresh()
        );
        break;
      case 'table':
        new TableView(
          this.mainEl,
          this.plugin,
          appFilteredProjects,
          filteredVersions,
          this.apps,
          () => this.refresh()
        );
        break;
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
    }
  }

  private getFilteredProjects(): Project[] {
    let projects = this.projects;
    
    if (this.selectedAppId) {
      const appVersionIds = this.versions
        .filter(v => v.appId === this.selectedAppId)
        .map(v => v.id);
      projects = projects.filter(p => appVersionIds.includes(p.versionId));
    }
    
    if (this.selectedVersionId) {
      projects = projects.filter(p => p.versionId === this.selectedVersionId);
    }
    
    if (this.currentFilter.progress) {
      projects = projects.filter(p => p.progress === this.currentFilter.progress);
    }
    
    if (this.currentFilter.keyword) {
      const keyword = this.currentFilter.keyword.toLowerCase();
      projects = projects.filter(p =>
        p.name.toLowerCase().includes(keyword) ||
        p.manager.toLowerCase().includes(keyword) ||
        p.features.toLowerCase().includes(keyword) ||
        p.requirements.toLowerCase().includes(keyword)
      );
    }
    
    return projects;
  }

  private getAppFilteredProjects(): Project[] {
    let projects = this.projects;
    
    if (this.selectedAppId) {
      const appVersionIds = this.versions
        .filter(v => v.appId === this.selectedAppId)
        .map(v => v.id);
      projects = projects.filter(p => appVersionIds.includes(p.versionId));
    }
    
    if (this.currentFilter.progress) {
      projects = projects.filter(p => p.progress === this.currentFilter.progress);
    }
    
    if (this.currentFilter.keyword) {
      const keyword = this.currentFilter.keyword.toLowerCase();
      projects = projects.filter(p =>
        p.name.toLowerCase().includes(keyword) ||
        p.manager.toLowerCase().includes(keyword) ||
        p.features.toLowerCase().includes(keyword) ||
        p.requirements.toLowerCase().includes(keyword)
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
    const app = this.apps.find(a => a.id === this.selectedAppId);
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
    const app = this.apps.find(a => a.id === this.selectedAppId);
    if (!app) return;

    new ConfirmModal(
      this.app,
      '删除APP',
      `确定要删除APP "${app.name}" 吗？\n这将同时删除该APP下的所有版本和项目数据！`,
      async () => {
        try {
          await this.plugin.dataService.deleteApp(this.selectedAppId!);
          this.selectedAppId = this.apps.length > 1 ? this.apps.find(a => a.id !== this.selectedAppId)?.id || null : null;
          await this.refresh();
        } catch (error) {
          new Notice(error instanceof Error ? error.message : String(error));
        }
      },
      undefined,
      true
    ).open();
  }

  private showCreateVersionModal() {
    if (!this.selectedAppId) return;
    
    new CreateVersionModal(this.app, async (data) => {
      try {
        await this.plugin.dataService.createVersion({
          appId: this.selectedAppId!,
          ...data
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
      keyword: this.currentFilter.keyword
    };
    this.savedFilters.push(filter);
    await this.saveSavedFilters();
    this.render();
  }

  private async applySavedFilter(filterId: string) {
    const filter = this.savedFilters.find(f => f.id === filterId);
    if (!filter) return;
    
    this.selectedAppId = filter.appId;
    this.selectedVersionId = filter.versionId;
    this.currentFilter.progress = filter.progress;
    this.currentFilter.keyword = filter.keyword;
    
    await this.refresh();
  }

  private async deleteSavedFilter(filterId: string) {
    const filter = this.savedFilters.find(f => f.id === filterId);
    if (!filter) return;

    new ConfirmModal(
      this.app,
      '删除筛选条件',
      `确定要删除筛选条件 "${filter.name}" 吗？`,
      async () => {
        this.savedFilters = this.savedFilters.filter(f => f.id !== filterId);
        await this.saveSavedFilters();
        this.render();
      }
    ).open();
  }

  private showExportModal() {
    new ExportModal(this.app, this.importExportService, this.getFilteredProjects(), this.versions).open();
  }

  private showImportModal() {
    if (!this.selectedAppId) {
      new Notice('请先选择一个APP');
      return;
    }
    new ImportModal(this.app, this.importExportService, this.selectedAppId, async () => {
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

    const appVersions = this.versions.filter(v => v.appId === this.selectedAppId);

    new ConvertPlanModal(
      this.app,
      plan,
      appVersions,
      this.plugin.dataService,
      async () => {
        new Notice('已转为正式项目');
        this.currentTab = 'projects';
        await this.refresh();
        // 自动选中新创建项目对应的版本
        const allProjects = await this.plugin.dataService.getAllProjects();
        const newProject = allProjects.find(p => p.versionId && appVersions.some(v => v.id === p.versionId));
        if (newProject) {
          this.selectedVersionId = newProject.versionId;
        }
      }
    ).open();
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
      true
    ).open();
  }

  private renderPlansView() {
    const plans = [...this.plans].sort((a, b) => {
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    if (plans.length === 0) {
      this.mainEl.createDiv({
        cls: 'avm-empty-state',
        text: '暂无规划，点击左上角「新建规划」创建'
      });
      return;
    }

    const wrapper = this.mainEl.createDiv({ cls: 'avm-plans-wrapper' });
    const table = wrapper.createEl('table', { cls: 'avm-table avm-plans-table' });

    // 表头
    const thead = table.createEl('thead');
    const headerRow = thead.createEl('tr');
    ['项目主题', '项目经理', '提测时间', '发布时间', '操作'].forEach(text => {
      headerRow.createEl('th', { text });
    });

    // 表体
    const tbody = table.createEl('tbody');
    plans.forEach(plan => {
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

class CreateAppModal extends Modal {
  onSubmit: (name: string) => void;
  
  constructor(app: ObsidianApp, onSubmit: (name: string) => void) {
    super(app);
    this.onSubmit = onSubmit;
  }
  
  onOpen() {
    const { contentEl } = this;
    contentEl.addClass('avm-modal');
    
    contentEl.createEl('h2', { text: '新建APP' });
    
    let appName = '';
    
    new Setting(contentEl)
      .setName('APP名称')
      .addText(text => text
        .setPlaceholder('输入APP名称')
        .onChange(value => appName = value));
    
    createActionButtons(
      contentEl,
      {
        confirmText: '创建',
        cancelText: '取消',
        onConfirm: () => {
          if (appName.trim()) {
            this.onSubmit(appName.trim());
            this.close();
          }
        },
        onCancel: () => this.close()
      }
    );
  }
  
  onClose() {
    this.contentEl.empty();
  }
}

class RenameAppModal extends Modal {
  currentName: string;
  onSubmit: (newName: string) => void;
  
  constructor(app: ObsidianApp, currentName: string, onSubmit: (newName: string) => void) {
    super(app);
    this.currentName = currentName;
    this.onSubmit = onSubmit;
  }
  
  onOpen() {
    const { contentEl } = this;
    contentEl.addClass('avm-modal');
    
    contentEl.createEl('h2', { text: '重命名APP' });
    
    let newName = this.currentName;
    
    new Setting(contentEl)
      .setName('APP名称')
      .addText(text => text
        .setValue(this.currentName)
        .onChange(value => newName = value));
    
    createSaveButtons(
      contentEl,
      () => {
        if (newName.trim() && newName !== this.currentName) {
          this.onSubmit(newName.trim());
          this.close();
        }
      },
      () => this.close()
    );
  }
  
  onClose() {
    this.contentEl.empty();
  }
}

class CreateVersionModal extends Modal {
  onSubmit: (data: { versionNumber: string; bllVersion: string; ippVersion: string; webVersion: string; updateContent: string }) => void;
  
  constructor(app: ObsidianApp, onSubmit: (data: { versionNumber: string; bllVersion: string; ippVersion: string; webVersion: string; updateContent: string }) => void) {
    super(app);
    this.onSubmit = onSubmit;
  }
  
  onOpen() {
    const { contentEl } = this;
    contentEl.addClass('avm-modal');
    
    contentEl.createEl('h2', { text: '新建版本' });
    
    const data = {
      versionNumber: '',
      bllVersion: '',
      ippVersion: '',
      webVersion: '',
      updateContent: ''
    };
    
    new Setting(contentEl)
      .setName('APP版本号 *')
      .addText(text => text
        .setPlaceholder('如: 1.0.0')
        .onChange(value => data.versionNumber = value));
    
    new Setting(contentEl)
      .setName('BLL版本 *')
      .addText(text => text
        .onChange(value => data.bllVersion = value));
    
    new Setting(contentEl)
      .setName('IPP版本 *')
      .addText(text => text
        .onChange(value => data.ippVersion = value));
    
    new Setting(contentEl)
      .setName('Web版本 *')
      .addText(text => text
        .onChange(value => data.webVersion = value));
    
    new Setting(contentEl)
      .setName('更新内容')
      .addTextArea(text => text
        .setPlaceholder('可选')
        .onChange(value => data.updateContent = value));
    
    createActionButtons(
      contentEl,
      {
        confirmText: '创建',
        cancelText: '取消',
        onConfirm: () => {
          if (data.versionNumber && data.bllVersion && data.ippVersion && data.webVersion) {
            this.onSubmit(data);
            this.close();
          }
        },
        onCancel: () => this.close()
      }
    );
  }
  
  onClose() {
    this.contentEl.empty();
  }
}

class CreateProjectModal extends Modal {
  versionId: string;
  progressStages: { name: string; color: string }[];
  onSubmit: (data: CreateProjectData) => void;
  
  constructor(app: ObsidianApp, versionId: string, progressStages: { name: string; color: string }[], onSubmit: (data: CreateProjectData) => void) {
    super(app);
    this.versionId = versionId;
    this.progressStages = progressStages;
    this.onSubmit = onSubmit;
  }
  
  onOpen() {
    const { contentEl } = this;
    contentEl.addClass('avm-modal');
    
    contentEl.createEl('h2', { text: '新建项目' });
    
    const firstProgress = getFirstProgress(this.progressStages);
    const data = {
      name: '',
      versionId: this.versionId,
      manager: '',
      projectLink: '',
      componentLink: '',
      features: '',
      spec: '',
      requirements: '',
      progress: firstProgress
    };
    
    new Setting(contentEl)
      .setName('项目名称 *')
      .addText(text => text
        .setPlaceholder('输入项目名称')
        .onChange(value => data.name = value));
    
    new Setting(contentEl)
      .setName('项目经理')
      .addText(text => text
        .onChange(value => data.manager = value));
    
    new Setting(contentEl)
      .setName('项目链接')
      .addText(text => text
        .setPlaceholder('https://...')
        .onChange(value => data.projectLink = value));
    
    new Setting(contentEl)
      .setName('组件库链接')
      .addText(text => text
        .setPlaceholder('https://...')
        .onChange(value => data.componentLink = value));
    
    new Setting(contentEl)
      .setName('项目进度')
      .addDropdown(dropdown => {
        const progressOrder = getProgressOrder(this.progressStages);
        progressOrder.forEach(progress => {
          dropdown.addOption(progress, progress);
        });
        dropdown.setValue(data.progress);
        dropdown.onChange(value => data.progress = value as ProjectProgress);
      });

    new Setting(contentEl)
      .setName('特性')
      .addTextArea(text => text
        .setPlaceholder('可选')
        .onChange(value => data.features = value));

    new Setting(contentEl)
      .setName('配置组件/规格')
      .addTextArea(text => text
        .setPlaceholder('可选')
        .onChange(value => data.spec = value));

    new Setting(contentEl)
      .setName('项目需求')
      .addTextArea(text => text
        .setPlaceholder('可选')
        .onChange(value => data.requirements = value));
    
    createActionButtons(
      contentEl,
      {
        confirmText: '创建',
        cancelText: '取消',
        onConfirm: () => {
          if (data.name) {
            this.onSubmit(data);
            this.close();
          }
        },
        onCancel: () => this.close()
      }
    );
  }
  
  onClose() {
    this.contentEl.empty();
  }
}

class DeleteFilterModal extends Modal {
  filters: SavedFilter[];
  onSubmit: (filterId: string) => Promise<void>;
  onCloseCallback: () => void;
  
  constructor(app: ObsidianApp, filters: SavedFilter[], onSubmit: (filterId: string) => Promise<void>, onCloseCallback: () => void) {
    super(app);
    this.filters = filters;
    this.onSubmit = onSubmit;
    this.onCloseCallback = onCloseCallback;
  }
  
  onOpen() {
    const { contentEl } = this;
    contentEl.addClass('avm-modal');
    
    contentEl.createEl('h2', { text: '删除筛选条件' });
    
    this.filters.forEach(filter => {
      new Setting(contentEl)
        .setName(filter.name)
        .addButton(btn => btn
          .setButtonText('删除')
          .setWarning()
          .onClick(() => {
            this.doDelete(filter.id);
          }));
    });
    
    new Setting(contentEl)
      .addButton(btn => btn
        .setButtonText('关闭')
        .onClick(() => this.close()));
  }
  
  private async doDelete(filterId: string) {
    const filter = this.filters.find(f => f.id === filterId);
    if (!filter) return;
    
    this.filters = this.filters.filter(f => f.id !== filterId);
    await this.onSubmit(filterId);
    
    if (this.filters.length === 0) {
      this.close();
    } else {
      this.contentEl.empty();
      this.onOpen();
    }
  }
  
  onClose() {
    this.contentEl.empty();
    setTimeout(() => {
      this.onCloseCallback();
    }, 100);
  }
}

class ExportModal extends Modal {
  importExportService: ImportExportService;
  projects: Project[];
  versions: Version[];
  format: 'csv' | 'xlsx' = 'csv';
  
  constructor(app: ObsidianApp, service: ImportExportService, projects: Project[], versions: Version[]) {
    super(app);
    this.importExportService = service;
    this.projects = projects;
    this.versions = versions;
  }
  
  onOpen() {
    const { contentEl } = this;
    contentEl.addClass('avm-modal');
    
    contentEl.createEl('h2', { text: '导出数据' });
    
    new Setting(contentEl)
      .setName('导出格式')
      .addDropdown(dropdown => {
        dropdown.addOption('csv', 'CSV');
        dropdown.addOption('xlsx', 'Excel (XLSX)');
        dropdown.setValue(this.format);
        dropdown.onChange(value => {
          this.format = value === 'xlsx' ? 'xlsx' : 'csv';
        });
      });
    
    const statusEl = contentEl.createDiv({ cls: 'avm-export-status' });
    
    createActionButtons(
      contentEl,
      {
        confirmText: '导出',
        cancelText: '取消',
        onConfirm: async () => {
          statusEl.setText('处理中...');
          try {
            if (this.format === 'xlsx') {
              const buffer = await this.importExportService.exportToExcel(this.projects, this.versions);
              this.downloadFile(buffer, 'projects.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            } else {
              const csv = await this.importExportService.exportToCSV(this.projects, this.versions);
              this.downloadFile(csv, 'projects.csv', 'text/csv');
            }
            statusEl.setText('导出成功');
            setTimeout(() => this.close(), 800);
          } catch (error) {
            statusEl.setText(`导出失败: ${error instanceof Error ? error.message : String(error)}`);
          }
        },
        onCancel: () => this.close()
      }
    );
  }
  
  private downloadFile(content: string | ArrayBuffer, filename: string, mimeType: string) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }
  
  onClose() {
    this.contentEl.empty();
  }
}

class ImportModal extends Modal {
  importExportService: ImportExportService;
  appId: string;
  onComplete: () => void;
  
  constructor(app: ObsidianApp, service: ImportExportService, appId: string, onComplete: () => void) {
    super(app);
    this.importExportService = service;
    this.appId = appId;
    this.onComplete = onComplete;
  }
  
  onOpen() {
    const { contentEl } = this;
    contentEl.addClass('avm-modal');
    
    contentEl.createEl('h2', { text: '导入数据' });
    
    const fileInput = contentEl.createEl('input', {
      attr: { type: 'file', accept: '.csv,.xlsx,.xls' }
    });
    
    const statusEl = contentEl.createDiv({ cls: 'avm-import-status' });
    
    createActionButtons(
      contentEl,
      {
        confirmText: '导入',
        cancelText: '取消',
        onConfirm: async () => {
          const file = fileInput.files?.[0];
          if (!file) {
            new Notice('请选择文件');
            return;
          }
          
          statusEl.setText('处理中...');
          
          try {
            let result;
            if (file.name.endsWith('.csv')) {
              const content = await file.text();
              result = await this.importExportService.importFromCSV(content, this.appId);
            } else {
              const buffer = await file.arrayBuffer();
              result = await this.importExportService.importFromExcel(buffer, this.appId);
            }
            
            new Notice(`导入完成！成功: ${result.success} 条${result.errors.length > 0 ? `\n错误: ${result.errors.join('\n')}` : ''}`);
            statusEl.setText('导入成功');
            setTimeout(() => {
              this.onComplete();
              this.close();
            }, 800);
          } catch (error) {
            statusEl.setText(`导入失败: ${error instanceof Error ? error.message : String(error)}`);
          }
        },
        onCancel: () => this.close()
      }
    );
  }
  
  onClose() {
    this.contentEl.empty();
  }
}

interface PlanFormData {
  topic: string;
  manager?: string;
  testDate?: string;
  releaseDate?: string;
  requirements?: string;
}

class PlanModal extends Modal {
  plan?: Plan;
  onSubmit: (data: PlanFormData) => void;

  constructor(app: ObsidianApp, plan: Plan | undefined, onSubmit: (data: PlanFormData) => void) {
    super(app);
    this.plan = plan;
    this.onSubmit = onSubmit;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.addClass('avm-modal');
    
    contentEl.createEl('h2', { text: this.plan ? '编辑规划' : '新建规划' });
    
    const data: PlanFormData = {
      topic: this.plan?.topic ?? '',
      manager: this.plan?.manager ?? '',
      testDate: this.plan?.testDate ?? '',
      releaseDate: this.plan?.releaseDate ?? '',
      requirements: this.plan?.requirements ?? ''
    };

    new Setting(contentEl)
      .setName('项目主题 *')
      .addText(text => text
        .setPlaceholder('输入项目主题')
        .setValue(data.topic)
        .onChange(value => data.topic = value));

    new Setting(contentEl)
      .setName('项目经理')
      .addText(text => text
        .setPlaceholder('选填')
        .setValue(data.manager ?? '')
        .onChange(value => data.manager = value || undefined));

    new Setting(contentEl)
      .setName('提测时间')
      .addText(text => text
        .setPlaceholder('选填，如 2026-04-01')
        .setValue(data.testDate ?? '')
        .onChange(value => data.testDate = parseDateInput(value) || undefined));

    new Setting(contentEl)
      .setName('发布时间')
      .addText(text => text
        .setPlaceholder('选填，如 2026-05-01')
        .setValue(data.releaseDate ?? '')
        .onChange(value => data.releaseDate = parseDateInput(value) || undefined));

    new Setting(contentEl)
      .setName('项目需求')
      .addTextArea(text => text
        .setPlaceholder('选填')
        .setValue(data.requirements ?? '')
        .onChange(value => data.requirements = value || undefined));

    createActionButtons(
      contentEl,
      {
        confirmText: this.plan ? '保存' : '创建',
        cancelText: '取消',
        onConfirm: () => {
          if (data.topic.trim()) {
            this.onSubmit({
              topic: data.topic.trim(),
              manager: data.manager?.trim() || '',
              testDate: data.testDate?.trim() || '',
              releaseDate: data.releaseDate?.trim() || '',
              requirements: data.requirements?.trim() || ''
            });
            this.close();
          }
        },
        onCancel: () => this.close()
      }
    );
  }

  onClose() {
    this.contentEl.empty();
  }
}
