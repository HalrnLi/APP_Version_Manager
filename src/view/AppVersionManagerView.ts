import { ItemView, WorkspaceLeaf, Menu, Modal, App as ObsidianApp, Setting, ButtonComponent, EventRef } from 'obsidian';
import AppVersionManagerPlugin from '../main';
import { App, Version, Project, ProjectProgress, SavedFilter, PROGRESS_ORDER, PROGRESS_COLORS } from '../types';
import { DualPaneView } from './DualPaneView';
import { KanbanView } from './KanbanView';
import { TableView } from './TableView';
import { ImportExportService } from '../services/ImportExportService';

export const VIEW_TYPE_APP_VERSION_MANAGER = 'app-version-manager-view';

type ViewType = 'dual' | 'kanban' | 'table';

export class AppVersionManagerView extends ItemView {
  plugin: AppVersionManagerPlugin;
  apps: App[] = [];
  versions: Version[] = [];
  projects: Project[] = [];
  selectedAppId: string | null = null;
  selectedVersionId: string | null = null;
  currentView: ViewType = 'dual';
  savedFilters: SavedFilter[] = [];
  currentFilter: { progress: ProjectProgress | null; keyword: string } = { progress: null, keyword: '' };
  importExportService: ImportExportService;
  
  private viewContainerEl: HTMLElement;
  private headerEl: HTMLElement;
  private mainEl: HTMLElement;
  private eventRefs: EventRef[] = [];

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
    await this.loadData();
    this.render();
    this.registerEvents();
  }

  private async loadData() {
    this.apps = await this.plugin.dataService.getAllApps();
    
    if (this.apps.length > 0) {
      if (!this.selectedAppId || !this.apps.find(a => a.id === this.selectedAppId)) {
        this.selectedAppId = this.plugin.settings.defaultAppId || this.apps[0].id;
      }
      
      this.versions = await this.plugin.dataService.getVersionsByAppId(this.selectedAppId);
      this.projects = await this.plugin.dataService.getAllProjects();
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
    this.eventRefs.push(
      this.app.workspace.on('file-menu', (menu, file) => {})
    );
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
      { type: 'table', label: '表格视图', icon: 'table' }
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
      attr: { type: 'text', placeholder: '搜索项目...' }
    });
    searchInput.value = this.currentFilter.keyword;
    searchInput.addEventListener('input', (e) => {
      this.currentFilter.keyword = (e.target as HTMLInputElement).value;
      this.renderMainView();
    });
    
    const progressFilter = filterBar.createEl('select', { cls: 'avm-select' });
    progressFilter.createEl('option', { value: '', text: '全部进度' });
    PROGRESS_ORDER.forEach(progress => {
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
    
    const appFilteredProjects = this.getAppFilteredProjects();
    const filteredVersions = this.selectedAppId 
      ? this.versions.filter(v => v.appId === this.selectedAppId)
      : [];
    
    switch (this.currentView) {
      case 'dual':
        new DualPaneView(
          this.mainEl,
          this.plugin,
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
          () => this.refresh()
        );
        break;
      case 'table':
        new TableView(
          this.mainEl,
          this.plugin,
          appFilteredProjects,
          filteredVersions,
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
        alert(error);
      }
    }).open();
  }

  private showRenameAppModal() {
    const app = this.apps.find(a => a.id === this.selectedAppId);
    if (!app) return;
    
    new RenameAppModal(this.app, app.name, async (newName) => {
      try {
        await this.plugin.dataService.updateApp(this.selectedAppId!, newName);
        await this.refresh();
      } catch (error) {
        alert(error);
      }
    }).open();
  }

  private async confirmDeleteApp() {
    const app = this.apps.find(a => a.id === this.selectedAppId);
    if (!app) return;
    
    const confirmed = confirm(`确定要删除APP "${app.name}" 吗？\n这将同时删除该APP下的所有版本和项目数据！`);
    if (confirmed) {
      await this.plugin.dataService.deleteApp(this.selectedAppId!);
      this.selectedAppId = this.apps.length > 1 ? this.apps.find(a => a.id !== this.selectedAppId)?.id || null : null;
      await this.refresh();
    }
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
        alert(error);
      }
    }).open();
  }

  private showCreateProjectModal() {
    if (!this.selectedVersionId) return;
    
    new CreateProjectModal(this.app, this.selectedVersionId, async (data) => {
      try {
        await this.plugin.dataService.createProject(data);
        await this.refresh();
      } catch (error) {
        alert(error);
      }
    }).open();
  }

  private showSaveFilterModal() {
    new SaveFilterModal(this.app, async (name) => {
      const filter: SavedFilter = {
        id: Date.now().toString(),
        name,
        appId: this.selectedAppId,
        versionId: this.selectedVersionId,
        progress: this.currentFilter.progress,
        keyword: this.currentFilter.keyword
      };
      this.savedFilters.push(filter);
      await this.saveSavedFilters();
      this.render();
    }).open();
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

  private showExportModal() {
    new ExportModal(this.app, this.importExportService, this.getFilteredProjects(), this.versions).open();
  }

  private showImportModal() {
    if (!this.selectedAppId) {
      alert('请先选择一个APP');
      return;
    }
    new ImportModal(this.app, this.importExportService, this.selectedAppId, async () => {
      await this.refresh();
    }).open();
  }

  async onClose() {
    this.eventRefs.forEach(ref => this.app.workspace.offref(ref));
    this.eventRefs = [];
    this.containerEl.empty();
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
    
    new Setting(contentEl)
      .addButton(btn => btn
        .setButtonText('创建')
        .setCta()
        .onClick(() => {
          if (appName.trim()) {
            this.onSubmit(appName.trim());
            this.close();
          }
        }))
      .addButton(btn => btn
        .setButtonText('取消')
        .onClick(() => this.close()));
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
    
    new Setting(contentEl)
      .addButton(btn => btn
        .setButtonText('保存')
        .setCta()
        .onClick(() => {
          if (newName.trim() && newName !== this.currentName) {
            this.onSubmit(newName.trim());
            this.close();
          }
        }))
      .addButton(btn => btn
        .setButtonText('取消')
        .onClick(() => this.close()));
  }
  
  onClose() {
    this.contentEl.empty();
  }
}

class CreateVersionModal extends Modal {
  onSubmit: (data: { versionNumber: string; bllVersion: string; ippVersion: string; webVersion: string; updateContent: string }) => void;
  
  constructor(app: ObsidianApp, onSubmit: (data: any) => void) {
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
    
    new Setting(contentEl)
      .addButton(btn => btn
        .setButtonText('创建')
        .setCta()
        .onClick(() => {
          if (data.versionNumber && data.bllVersion && data.ippVersion && data.webVersion) {
            this.onSubmit(data);
            this.close();
          }
        }))
      .addButton(btn => btn
        .setButtonText('取消')
        .onClick(() => this.close()));
  }
  
  onClose() {
    this.contentEl.empty();
  }
}

class CreateProjectModal extends Modal {
  versionId: string;
  onSubmit: (data: any) => void;
  
  constructor(app: ObsidianApp, versionId: string, onSubmit: (data: any) => void) {
    super(app);
    this.versionId = versionId;
    this.onSubmit = onSubmit;
  }
  
  onOpen() {
    const { contentEl } = this;
    contentEl.addClass('avm-modal');
    
    contentEl.createEl('h2', { text: '新建项目' });
    
    const data = {
      name: '',
      versionId: this.versionId,
      manager: '',
      projectLink: '',
      componentLink: '',
      requirements: '',
      progress: ProjectProgress.REQUIREMENT_DECOMPOSITION,
      plannedTestTime: '',
      plannedReleaseTime: ''
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
      .setName('项目需求')
      .addTextArea(text => text
        .setPlaceholder('可选')
        .onChange(value => data.requirements = value));
    
    new Setting(contentEl)
      .setName('项目进度')
      .addDropdown(dropdown => {
        PROGRESS_ORDER.forEach(progress => {
          dropdown.addOption(progress, progress);
        });
        dropdown.setValue(data.progress);
        dropdown.onChange(value => data.progress = value as ProjectProgress);
      });
    
    new Setting(contentEl)
      .setName('计划提测时间')
      .addText(text => {
        text.inputEl.type = 'date';
        text.onChange(value => data.plannedTestTime = value);
      });
    
    new Setting(contentEl)
      .setName('计划发布时间')
      .addText(text => {
        text.inputEl.type = 'date';
        text.onChange(value => data.plannedReleaseTime = value);
      });
    
    new Setting(contentEl)
      .addButton(btn => btn
        .setButtonText('创建')
        .setCta()
        .onClick(() => {
          if (data.name) {
            this.onSubmit(data);
            this.close();
          }
        }))
      .addButton(btn => btn
        .setButtonText('取消')
        .onClick(() => this.close()));
  }
  
  onClose() {
    this.contentEl.empty();
  }
}

class SaveFilterModal extends Modal {
  onSubmit: (name: string) => void;
  
  constructor(app: ObsidianApp, onSubmit: (name: string) => void) {
    super(app);
    this.onSubmit = onSubmit;
  }
  
  onOpen() {
    const { contentEl } = this;
    contentEl.addClass('avm-modal');
    
    contentEl.createEl('h2', { text: '保存筛选条件' });
    
    let filterName = '';
    
    new Setting(contentEl)
      .setName('筛选条件名称')
      .addText(text => text
        .setPlaceholder('输入名称')
        .onChange(value => filterName = value));
    
    new Setting(contentEl)
      .addButton(btn => btn
        .setButtonText('保存')
        .setCta()
        .onClick(() => {
          if (filterName.trim()) {
            this.onSubmit(filterName.trim());
            this.close();
          }
        }))
      .addButton(btn => btn
        .setButtonText('取消')
        .onClick(() => this.close()));
  }
  
  onClose() {
    this.contentEl.empty();
  }
}

class ExportModal extends Modal {
  importExportService: ImportExportService;
  projects: Project[];
  versions: Version[];
  
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
      });
    
    new Setting(contentEl)
      .addButton(btn => btn
        .setButtonText('导出CSV')
        .setCta()
        .onClick(async () => {
          const csv = await this.importExportService.exportToCSV(this.projects, this.versions);
          this.downloadFile(csv, 'projects.csv', 'text/csv');
          this.close();
        }))
      .addButton(btn => btn
        .setButtonText('导出Excel')
        .setCta()
        .onClick(async () => {
          const buffer = await this.importExportService.exportToExcel(this.projects, this.versions);
          this.downloadFile(buffer, 'projects.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
          this.close();
        }))
      .addButton(btn => btn
        .setButtonText('取消')
        .onClick(() => this.close()));
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
    
    new Setting(contentEl)
      .addButton(btn => btn
        .setButtonText('导入')
        .setCta()
        .onClick(async () => {
          const file = fileInput.files?.[0];
          if (!file) {
            alert('请选择文件');
            return;
          }

          try {
            let result;
            if (file.name.endsWith('.csv')) {
              const content = await file.text();
              result = await this.importExportService.importFromCSV(content, this.appId);
            } else {
              const buffer = await file.arrayBuffer();
              result = await this.importExportService.importFromExcel(buffer, this.appId);
            }

            alert(`导入完成！成功: ${result.success} 条${result.errors.length > 0 ? `\n错误: ${result.errors.join('\n')}` : ''}`);
            this.onComplete();
            this.close();
          } catch (error) {
            alert(`导入失败: ${error}`);
          }
        }))
      .addButton(btn => btn
        .setButtonText('取消')
        .onClick(() => this.close()));
  }
  
  onClose() {
    this.contentEl.empty();
  }
}
