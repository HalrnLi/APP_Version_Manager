import { Menu, Modal, App as ObsidianApp, Setting, ButtonComponent, TFile } from 'obsidian';
import AppVersionManagerPlugin from '../main';
import { Version, Project, ProjectProgress, getProgressOrder, getProgressColors, App, parseDateInput, getNextStageInfo, getLastProgress } from '../types';

export class DualPaneView {
  containerEl: HTMLElement;
  plugin: AppVersionManagerPlugin;
  apps: App[];
  versions: Version[];
  projects: Project[];
  selectedVersionId: string | null;
  onVersionSelect: (versionId: string | null) => void;
  onCreateVersion: () => void;
  onCreateProject: () => void;
  onRefresh: () => void;
  
  constructor(
    containerEl: HTMLElement,
    plugin: AppVersionManagerPlugin,
    apps: App[],
    versions: Version[],
    projects: Project[],
    selectedVersionId: string | null,
    onVersionSelect: (versionId: string | null) => void,
    onCreateVersion: () => void,
    onCreateProject: () => void,
    onRefresh: () => void
  ) {
    this.containerEl = containerEl;
    this.plugin = plugin;
    this.apps = apps;
    this.versions = versions;
    this.projects = projects;
    this.selectedVersionId = selectedVersionId;
    this.onVersionSelect = onVersionSelect;
    this.onCreateVersion = onCreateVersion;
    this.onCreateProject = onCreateProject;
    this.onRefresh = onRefresh;
    
    this.render();
  }
  
  private render() {
    this.containerEl.empty();
    this.containerEl.addClass('avm-dual-pane');
    
    const leftPane = this.containerEl.createDiv({ cls: 'avm-left-pane' });
    this.renderVersionList(leftPane);
    
    const rightPane = this.containerEl.createDiv({ cls: 'avm-right-pane' });
    this.renderProjectList(rightPane);
  }
  
  private renderVersionList(container: HTMLElement) {
    container.empty();
    
    const header = container.createDiv({ cls: 'avm-pane-header' });
    header.createEl('h3', { text: '版本列表' });
    
    new ButtonComponent(header)
      .setIcon('plus')
      .setTooltip('新建版本')
      .onClick(() => {
        this.onCreateVersion();
      });
    
    const versionList = container.createDiv({ cls: 'avm-version-list' });
    
    const activeVersions = this.versions.filter(v => !v.isArchived);
    const archivedVersions = this.versions.filter(v => v.isArchived);
    
    activeVersions.forEach(version => {
      this.renderVersionItem(versionList, version);
    });
    
    if (archivedVersions.length > 0) {
      const archivedHeader = versionList.createDiv({ cls: 'avm-archived-header' });
      archivedHeader.createEl('span', { text: `已归档 (${archivedVersions.length})` });
      
      archivedVersions.forEach(version => {
        this.renderVersionItem(versionList, version, true);
      });
    }
    
    if (this.versions.length === 0) {
      versionList.createDiv({ cls: 'avm-empty-state', text: '暂无版本，点击右上角添加' });
    }
  }
  
  private renderVersionItem(container: HTMLElement, version: Version, isArchived: boolean = false) {
    const item = container.createDiv({
      cls: `avm-version-item ${this.selectedVersionId === version.id ? 'avm-selected' : ''} ${isArchived ? 'avm-archived' : ''}`
    });
    
    item.createDiv({ cls: 'avm-version-number', text: version.versionNumber });
    
    const meta = item.createDiv({ cls: 'avm-version-meta' });
    const projectCount = this.projects.filter(p => p.versionId === version.id).length;
    meta.createSpan({ text: `${projectCount} 个项目` });
    
    item.addEventListener('click', () => {
      this.onVersionSelect(version.id);
    });
    
    item.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.showVersionContextMenu(version, e, isArchived);
    });
  }
  
  private showVersionContextMenu(version: Version, event: MouseEvent, isArchived: boolean) {
    const menu = new Menu();
    
    menu.addItem(item => item
      .setTitle('编辑')
      .setIcon('pencil')
      .onClick(() => this.showEditVersionModal(version)));
    
    if (isArchived) {
      menu.addItem(item => item
        .setTitle('取消归档')
        .setIcon('archive')
        .onClick(async () => {
          await this.plugin.dataService.unarchiveVersion(version.id);
          this.onRefresh();
        }));
    } else {
      menu.addItem(item => item
        .setTitle('归档')
        .setIcon('archive')
        .onClick(async () => {
          await this.plugin.dataService.archiveVersion(version.id);
          this.onRefresh();
        }));
    }
    
    menu.addSeparator();
    
    menu.addItem(item => item
      .setTitle('删除')
      .setIcon('trash')
      .onClick(async () => {
        const confirmed = confirm(`确定要删除版本 ${version.versionNumber} 吗？\n关联的项目将保留但解除关联。`);
        if (confirmed) {
          try {
            await this.plugin.dataService.deleteVersion(version.id);
            this.onRefresh();
          } catch (error) {
            alert(error instanceof Error ? error.message : String(error));
          }
        }
      }));
    
    menu.showAtMouseEvent(event);
  }
  
  private showEditVersionModal(version: Version) {
    new EditVersionModal(this.plugin.app, version, async (data) => {
      try {
        await this.plugin.dataService.updateVersion(version.id, data, version.version);
        this.onRefresh();
      } catch (error) {
        alert(error instanceof Error ? error.message : String(error));
      }
    }).open();
  }
  
  private renderProjectList(container: HTMLElement) {
    container.empty();
    
    const header = container.createDiv({ cls: 'avm-pane-header' });
    header.createEl('h3', { text: '项目列表' });
    
    if (this.selectedVersionId) {
      new ButtonComponent(header)
        .setIcon('plus')
        .setTooltip('新建项目')
        .onClick(() => {
          this.onCreateProject();
        });
    }
    
    const projectList = container.createDiv({ cls: 'avm-project-list' });
    
    if (!this.selectedVersionId) {
      projectList.createDiv({ cls: 'avm-empty-state', text: '请选择一个版本查看项目' });
      return;
    }
    
    const versionProjects = this.projects.filter(p => p.versionId === this.selectedVersionId);
    
    if (versionProjects.length === 0) {
      projectList.createDiv({ cls: 'avm-empty-state', text: '暂无项目，点击右上角添加' });
      return;
    }
    
    const sortedProjects = this.applySorting(versionProjects);
    
    sortedProjects.forEach(project => {
      this.renderProjectItem(projectList, project);
    });
  }
  
  private applySorting(projects: Project[]): Project[] {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const lastProgress = getLastProgress(this.plugin.settings.progressStages);
    
    const projectsWithPriority = projects.map(project => {
      const nextStageInfo = getNextStageInfo(project);
      
      let priority = 3;
      let sortTime = new Date(project.createdAt).getTime();
      
      if (project.progress === lastProgress) {
        priority = 4;
      } else if (nextStageInfo.time) {
        const nextDate = new Date(nextStageInfo.time);
        nextDate.setHours(0, 0, 0, 0);
        
        const daysDiff = Math.floor((nextDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        
        if (daysDiff === 0) {
          priority = 1;
        } else if (daysDiff === 1) {
          priority = 2;
        }
        
        sortTime = nextDate.getTime();
      }
      
      return { project, priority, sortTime };
    });
    
    return projectsWithPriority
      .sort((a, b) => {
        if (a.priority !== b.priority) {
          return a.priority - b.priority;
        }
        return a.sortTime - b.sortTime;
      })
      .map(item => item.project);
  }
  
  private renderProjectItem(container: HTMLElement, project: Project) {
    const item = container.createDiv({ cls: 'avm-project-item' });
    
    const header = item.createDiv({ cls: 'avm-project-header' });
    header.createDiv({ cls: 'avm-project-name', text: project.name });
    
    const progressColors = getProgressColors(this.plugin.settings.progressStages);
    const progressBadge = header.createDiv({
      cls: 'avm-progress-badge',
      text: project.progress
    });
    progressBadge.style.backgroundColor = progressColors[project.progress] || '#64748b';
    
    const isOverdue = this.checkOverdue(project);
    if (isOverdue) {
      item.addClass('avm-overdue');
    }
    
    const meta = item.createDiv({ cls: 'avm-project-meta' });
    
    if (project.manager) {
      meta.createSpan({ cls: 'avm-meta-item', text: `👤 ${project.manager}` });
    }
    
    const links = item.createDiv({ cls: 'avm-project-links' });
    
    if (project.projectLink) {
      const link = links.createEl('a', { cls: 'avm-link', text: '项目链接', attr: { href: project.projectLink, target: '_blank', rel: 'noopener noreferrer' } });
      link.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.openExternalLink(project.projectLink);
      });
    }

    if (project.componentLink) {
      const link = links.createEl('a', { cls: 'avm-link', text: '组件库', attr: { href: project.componentLink, target: '_blank', rel: 'noopener noreferrer' } });
      link.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.openExternalLink(project.componentLink);
      });
    }
    
    if (project.requirements) {
      const req = item.createDiv({ cls: 'avm-project-requirements' });
      req.createEl('strong', { text: '需求:' });
      req.createSpan({ text: project.requirements.substring(0, 100) + (project.requirements.length > 100 ? '...' : '') });
    }
    
    item.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.showProjectContextMenu(project, e);
    });

    item.addEventListener('dblclick', (e) => {
      e.preventDefault();
      this.openProjectNote(project);
    });
  }

  private async openProjectNote(project: Project) {
    const memoPath = this.plugin.dataService.getProjectMemoPath(project.name);
    let file = this.plugin.app.vault.getAbstractFileByPath(memoPath);
    
    if (!file) {
      try {
        file = await this.plugin.app.vault.create(memoPath, '');
      } catch {
        file = this.plugin.app.vault.getAbstractFileByPath(memoPath);
      }
    }
    
    if (file instanceof TFile) {
      const leaf = this.plugin.app.workspace.getLeaf(false);
      await leaf.openFile(file);
    }
  }
  
  private openExternalLink(rawUrl: string) {
    const { shell } = require('electron');
    const normalized = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
    try {
      const url = new URL(normalized);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        alert('仅允许打开 http/https 链接');
        return;
      }
      shell.openExternal(url.toString());
    } catch {
      alert('链接格式无效');
    }
  }

  private checkOverdue(project: Project): boolean {
    const progressOrder = getProgressOrder(this.plugin.settings.progressStages);
    const lastTwoProgresses = progressOrder.slice(-2);
    
    if (lastTwoProgresses.includes(project.progress)) return false;
    
    const nextStageInfo = getNextStageInfo(project);
    if (!nextStageInfo.time) return false;
    
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    
    const nextDate = new Date(nextStageInfo.time);
    nextDate.setHours(0, 0, 0, 0);
    
    const diffDays = Math.floor((nextDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    
    return diffDays >= 0 && diffDays <= 1;
  }
  
  private showProjectContextMenu(project: Project, event: MouseEvent) {
    const menu = new Menu();
    
    menu.addItem(item => item
      .setTitle('编辑')
      .setIcon('pencil')
      .onClick(() => this.showEditProjectModal(project)));
    
    menu.addItem(item => item
      .setTitle('提测计划')
      .setIcon('calendar')
      .onClick(() => this.showTestPlanModal(project)));
    
    menu.addSeparator();
    
    menu.addItem(item => item
      .setTitle('删除')
      .setIcon('trash')
      .onClick(async () => {
        const confirmed = confirm(`确定要删除项目 "${project.name}" 吗？`);
        if (confirmed) {
          try {
            await this.plugin.dataService.deleteProject(project.id);
            this.onRefresh();
          } catch (error) {
            alert(error instanceof Error ? error.message : String(error));
          }
        }
      }));
    
    menu.showAtMouseEvent(event);
  }
  
  private showEditProjectModal(project: Project) {
    new EditProjectModal(this.plugin.app, project, this.apps, this.versions, this.plugin.settings.progressStages, async (data) => {
      try {
        await this.plugin.dataService.updateProject(project.id, data, project.version);
        this.onRefresh();
      } catch (error) {
        alert(error instanceof Error ? error.message : String(error));
      }
    }).open();
  }
  
  private showTestPlanModal(project: Project) {
    new DualPaneTestPlanModal(this.plugin.app, project, async (data) => {
      try {
        await this.plugin.dataService.updateProject(project.id, data, project.version);
        this.onRefresh();
      } catch (error) {
        alert(error instanceof Error ? error.message : String(error));
      }
    }).open();
  }
}

class EditVersionModal extends Modal {
  version: Version;
  onSubmit: (data: Partial<Version>) => void;
  
  constructor(app: ObsidianApp, version: Version, onSubmit: (data: Partial<Version>) => void) {
    super(app);
    this.version = version;
    this.onSubmit = onSubmit;
  }
  
  onOpen() {
    const { contentEl } = this;
    contentEl.addClass('avm-modal');
    
    contentEl.createEl('h2', { text: '编辑版本' });
    
    const data = {
      versionNumber: this.version.versionNumber,
      bllVersion: this.version.bllVersion,
      ippVersion: this.version.ippVersion,
      webVersion: this.version.webVersion,
      updateContent: this.version.updateContent
    };
    
    new Setting(contentEl)
      .setName('APP版本号 *')
      .addText(text => text
        .setValue(data.versionNumber)
        .onChange(value => data.versionNumber = value));
    
    new Setting(contentEl)
      .setName('BLL版本 *')
      .addText(text => text
        .setValue(data.bllVersion)
        .onChange(value => data.bllVersion = value));
    
    new Setting(contentEl)
      .setName('IPP版本 *')
      .addText(text => text
        .setValue(data.ippVersion)
        .onChange(value => data.ippVersion = value));
    
    new Setting(contentEl)
      .setName('Web版本 *')
      .addText(text => text
        .setValue(data.webVersion)
        .onChange(value => data.webVersion = value));
    
    new Setting(contentEl)
      .setName('更新内容')
      .addTextArea(text => text
        .setValue(data.updateContent)
        .onChange(value => data.updateContent = value));
    
    new Setting(contentEl)
      .addButton(btn => btn
        .setButtonText('保存')
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
class DualPaneTestPlanModal extends Modal {
  project: Project;
  onSubmit: (data: Partial<Project>) => void;
  
  constructor(app: ObsidianApp, project: Project, onSubmit: (data: Partial<Project>) => void) {
    super(app);
    this.project = project;
    this.onSubmit = onSubmit;
  }
  
  onOpen() {
    const { contentEl } = this;
    contentEl.addClass('avm-modal');
    
    contentEl.createEl('h2', { text: '提测计划配置' });
    
    const data = {
      b1IntegrationTestTime: this.project.b1IntegrationTestTime,
      b1SystemTestTime: this.project.b1SystemTestTime,
      b2IntegrationTestTime: this.project.b2IntegrationTestTime,
      b2SystemTestTime: this.project.b2SystemTestTime,
      b3IntegrationTestTime: this.project.b3IntegrationTestTime,
      b3SystemTestTime: this.project.b3SystemTestTime,
      b4IntegrationTestTime: this.project.b4IntegrationTestTime,
      b4SystemTestTime: this.project.b4SystemTestTime
    };
    
    // B1阶段
    contentEl.createEl('h3', { text: 'B1阶段' });
    new Setting(contentEl)
      .setName('B1集成测试时间')
      .addText(text => text
        .setPlaceholder('YYYY-MM-DD 或其他格式')
        .setValue(data.b1IntegrationTestTime)
        .onChange(value => data.b1IntegrationTestTime = parseDateInput(value) || ''));
    
    new Setting(contentEl)
      .setName('B1系统测试时间')
      .addText(text => text
        .setPlaceholder('YYYY-MM-DD 或其他格式')
        .setValue(data.b1SystemTestTime)
        .onChange(value => data.b1SystemTestTime = parseDateInput(value) || ''));
    
    // B2阶段
    contentEl.createEl('h3', { text: 'B2阶段' });
    new Setting(contentEl)
      .setName('B2集成测试时间')
      .addText(text => text
        .setPlaceholder('YYYY-MM-DD 或其他格式')
        .setValue(data.b2IntegrationTestTime)
        .onChange(value => data.b2IntegrationTestTime = parseDateInput(value) || ''));
    
    new Setting(contentEl)
      .setName('B2系统测试时间')
      .addText(text => text
        .setPlaceholder('YYYY-MM-DD 或其他格式')
        .setValue(data.b2SystemTestTime)
        .onChange(value => data.b2SystemTestTime = parseDateInput(value) || ''));
    
    // B3阶段
    contentEl.createEl('h3', { text: 'B3阶段' });
    new Setting(contentEl)
      .setName('B3集成测试时间')
      .addText(text => text
        .setPlaceholder('YYYY-MM-DD 或其他格式')
        .setValue(data.b3IntegrationTestTime)
        .onChange(value => data.b3IntegrationTestTime = parseDateInput(value) || ''));
    
    new Setting(contentEl)
      .setName('B3系统测试时间')
      .addText(text => text
        .setPlaceholder('YYYY-MM-DD 或其他格式')
        .setValue(data.b3SystemTestTime)
        .onChange(value => data.b3SystemTestTime = parseDateInput(value) || ''));
    
    // B4阶段
    contentEl.createEl('h3', { text: 'B4阶段' });
    new Setting(contentEl)
      .setName('B4集成测试时间')
      .addText(text => text
        .setPlaceholder('YYYY-MM-DD 或其他格式')
        .setValue(data.b4IntegrationTestTime)
        .onChange(value => data.b4IntegrationTestTime = parseDateInput(value) || ''));
    
    new Setting(contentEl)
      .setName('B4系统测试时间')
      .addText(text => text
        .setPlaceholder('YYYY-MM-DD 或其他格式')
        .setValue(data.b4SystemTestTime)
        .onChange(value => data.b4SystemTestTime = parseDateInput(value) || ''));
    
    new Setting(contentEl)
      .addButton(btn => btn
        .setButtonText('保存')
        .setCta()
        .onClick(() => {
          this.onSubmit(data);
          this.close();
        }))
      .addButton(btn => btn
        .setButtonText('取消')
        .onClick(() => this.close()));
  }
  
  onClose() {
    this.contentEl.empty();
  }
}
class EditProjectModal extends Modal {
  project: Project;
  onSubmit: (data: Partial<Project>) => void;
  apps: App[];
  versions: Version[];
  progressStages: { name: string; color: string }[];
  
  constructor(
    app: ObsidianApp, 
    project: Project, 
    apps: App[], 
    versions: Version[], 
    progressStages: { name: string; color: string }[],
    onSubmit: (data: Partial<Project>) => void
  ) {
    super(app);
    this.project = project;
    this.apps = apps;
    this.versions = versions;
    this.progressStages = progressStages;
    this.onSubmit = onSubmit;
  }
  
  onOpen() {
    const { contentEl } = this;
    contentEl.addClass('avm-modal');
    
    contentEl.createEl('h2', { text: '编辑项目' });
    
    const data = {
      name: this.project.name,
      versionId: this.project.versionId,
      manager: this.project.manager,
      projectLink: this.project.projectLink,
      componentLink: this.project.componentLink,
      requirements: this.project.requirements,
      progress: this.project.progress
    };
    
    new Setting(contentEl)
      .setName('项目名称 *')
      .addText(text => text
        .setValue(data.name)
        .onChange(value => data.name = value));
    
    new Setting(contentEl)
      .setName('所属版本')
      .addDropdown(dropdown => {
        this.versions.forEach(version => {
          dropdown.addOption(version.id, version.versionNumber);
        });
        if (data.versionId) {
          dropdown.setValue(data.versionId);
        }
        dropdown.onChange(value => data.versionId = value);
      });
    
    new Setting(contentEl)
      .setName('项目经理')
      .addText(text => text
        .setValue(data.manager)
        .onChange(value => data.manager = value));
    
    new Setting(contentEl)
      .setName('项目链接')
      .addText(text => text
        .setValue(data.projectLink)
        .onChange(value => data.projectLink = value));
    
    new Setting(contentEl)
      .setName('组件库链接')
      .addText(text => text
        .setValue(data.componentLink)
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
      .setName('项目需求')
      .addTextArea(text => text
        .setValue(data.requirements)
        .onChange(value => data.requirements = value));
    
    new Setting(contentEl)
      .addButton(btn => btn
        .setButtonText('保存')
        .setCta()
        .onClick(() => {
          if (data.name && data.versionId) {
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
