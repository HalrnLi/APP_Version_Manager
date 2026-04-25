import { Menu, Modal, App as ObsidianApp, Setting, ButtonComponent, TFile, Notice } from 'obsidian';
import AppVersionManagerPlugin from '../main';
import { Version, Project, ProjectProgress, getProgressOrder, getProgressColors, App, parseDateInput, getNextStageInfo, getLastProgress, ProgressStage } from '../types';
import { ConfirmModal } from './ConfirmModal';
import { createSaveButtons, createActionButtons } from './ModalUtils';
import { TestPlanModal } from './TestPlanModal';
import { sortProjectsByPriority, isProjectHighlighted, checkOverdue, calculateOverdueStats } from '../utils/projectSorting';

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
    const versionProjects = this.projects.filter(p => p.versionId === version.id);
    const projectCount = versionProjects.length;
    meta.createSpan({ text: `${projectCount} 个项目` });

    // 计算延期统计
    const warningDays = this.plugin.settings.overdueWarningDays;
    const stats = calculateOverdueStats(versionProjects, this.plugin.settings.progressStages, warningDays);

    if (stats.overdue > 0) {
      const overdueBadge = meta.createSpan({
        cls: 'avm-version-badge avm-version-badge-overdue',
        text: `${stats.overdue} 延期`
      });
      overdueBadge.style.color = '#ef4444';
      overdueBadge.style.fontWeight = '500';
      overdueBadge.style.marginLeft = '6px';
    }

    if (stats.warning > 0) {
      const warningBadge = meta.createSpan({
        cls: 'avm-version-badge avm-version-badge-warning',
        text: `${stats.warning} 预警`
      });
      warningBadge.style.color = '#f59e0b';
      warningBadge.style.fontWeight = '500';
      warningBadge.style.marginLeft = '6px';
    }

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
      .onClick(() => {
        new ConfirmModal(
          this.plugin.app,
          '删除版本',
          `确定要删除版本 ${version.versionNumber} 吗？\n关联的项目将保留但解除关联。`,
          async () => {
            try {
              await this.plugin.dataService.deleteVersion(version.id);
              this.onRefresh();
            } catch (error) {
              new Notice(error instanceof Error ? error.message : String(error));
            }
          },
          undefined,
          true
        ).open();
      }));
    
    menu.showAtMouseEvent(event);
  }
  
  private showEditVersionModal(version: Version) {
    new EditVersionModal(this.plugin.app, version, async (data) => {
      try {
        await this.plugin.dataService.updateVersion(version.id, data, version.version);
        this.onRefresh();
      } catch (error) {
        new Notice(error instanceof Error ? error.message : String(error));
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
  
  private isProjectHighlighted(project: Project): boolean {
    return isProjectHighlighted(project, this.plugin.settings.overdueWarningDays);
  }
  
  private applySorting(projects: Project[]): Project[] {
    return sortProjectsByPriority(projects, this.plugin.settings.progressStages);
  }
  
  private renderProjectItem(container: HTMLElement, project: Project) {
    const item = container.createDiv({ cls: 'avm-project-item' });
    
    // 添加高亮样式（今天或明天）
    if (this.isProjectHighlighted(project)) {
      item.addClass('avm-highlighted-row');
    }
    
    const header = item.createDiv({ cls: 'avm-project-header' });
    header.createDiv({ cls: 'avm-project-name', text: project.name });
    
    const progressColors = getProgressColors(this.plugin.settings.progressStages);
    const progressBadge = header.createDiv({
      cls: 'avm-progress-badge',
      text: project.progress
    });
    progressBadge.style.backgroundColor = progressColors[project.progress] || '#64748b';

    if (project.features) {
      const featuresEl = item.createDiv({ cls: 'avm-project-features' });
      featuresEl.createEl('strong', { text: '特性:' });
      featuresEl.createSpan({ text: project.features.substring(0, 100) + (project.features.length > 100 ? '...' : '') });
    }

    if (project.spec) {
      const specEl = item.createDiv({ cls: 'avm-project-spec' });
      specEl.createEl('strong', { text: '配置组件/规格:' });
      specEl.createSpan({ text: project.spec.substring(0, 100) + (project.spec.length > 100 ? '...' : '') });
    }

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
    const memoPath = await this.plugin.dataService.ensureMemoFile(project.name);
    
    // 无论是否为绝对路径，都尝试在 Obsidian 中打开
    const file = this.plugin.app.vault.getAbstractFileByPath(memoPath);
    if (file instanceof TFile) {
      const leaf = this.plugin.app.workspace.getLeaf(false);
      await leaf.openFile(file);
    } else {
      // 如果文件不在 vault 内，使用外部打开
      window.open(`file://${memoPath}`, '_blank');
    }
  }
  
  private openExternalLink(rawUrl: string) {
    const normalized = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
    try {
      const url = new URL(normalized);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        new Notice('仅允许打开 http/https 链接');
        return;
      }
      window.open(url.toString(), '_blank', 'noopener,noreferrer');
    } catch {
      new Notice('链接格式无效');
    }
  }

  private checkOverdue(project: Project): boolean {
    return checkOverdue(project, this.plugin.settings.progressStages, this.plugin.settings.overdueWarningDays);
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
      .onClick(() => {
        new ConfirmModal(
          this.plugin.app,
          '删除项目',
          `确定要删除项目 "${project.name}" 吗？`,
          async () => {
            try {
              await this.plugin.dataService.deleteProject(project.id);
              setTimeout(() => this.onRefresh(), 100);
            } catch (error) {
              new Notice(error instanceof Error ? error.message : String(error));
            }
          },
          undefined,
          true
        ).open();
      }));
    
    menu.showAtMouseEvent(event);
  }
  
  private showEditProjectModal(project: Project) {
    new EditProjectModal(this.plugin.app, project, this.apps, this.versions, this.plugin.settings.progressStages, async (data) => {
      try {
        await this.plugin.dataService.updateProject(project.id, data, project.version);
        this.onRefresh();
      } catch (error) {
        new Notice(error instanceof Error ? error.message : String(error));
      }
    }).open();
  }
  
  private showTestPlanModal(project: Project) {
    new TestPlanModal(this.plugin.app, project, async (data) => {
      try {
        await this.plugin.dataService.updateProject(project.id, data, project.version);
        this.onRefresh();
      } catch (error) {
        new Notice(error instanceof Error ? error.message : String(error));
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
    
    createSaveButtons(
      contentEl,
      () => {
        if (data.versionNumber && data.bllVersion && data.ippVersion && data.webVersion) {
          this.onSubmit(data);
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
      features: this.project.features,
      spec: this.project.spec,
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
      .setName('特性')
      .addTextArea(text => text
        .setValue(data.features)
        .onChange(value => data.features = value));

    new Setting(contentEl)
      .setName('配置组件/规格')
      .addTextArea(text => text
        .setValue(data.spec)
        .onChange(value => data.spec = value));

    new Setting(contentEl)
      .setName('项目需求')
      .addTextArea(text => text
        .setValue(data.requirements)
        .onChange(value => data.requirements = value));
    
    createSaveButtons(
      contentEl,
      () => {
        if (data.name && data.versionId) {
          this.onSubmit(data);
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
