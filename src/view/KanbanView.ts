import { Menu, Modal, App as ObsidianApp, Setting, Notice } from 'obsidian';
import AppVersionManagerPlugin from '../main';
import { Project, Version, ProjectProgress, getProgressOrder, getProgressColors, App, getNextStageInfo, getLastProgress } from '../types';
import { ConfirmModal } from './ConfirmModal';
import { createSaveButtons, createActionButtons } from './ModalUtils';
import { sortProjectsByPriority, isProjectHighlighted, checkOverdue } from '../utils/projectSorting';

export class KanbanView {
  containerEl: HTMLElement;
  plugin: AppVersionManagerPlugin;
  projects: Project[];
  versions: Version[];
  apps: App[];
  onRefresh: () => void;
  
  constructor(
    containerEl: HTMLElement,
    plugin: AppVersionManagerPlugin,
    projects: Project[],
    versions: Version[],
    apps: App[],
    onRefresh: () => void = () => {}
  ) {
    this.containerEl = containerEl;
    this.plugin = plugin;
    this.projects = projects;
    this.versions = versions;
    this.apps = apps;
    this.onRefresh = onRefresh;
    
    this.render();
  }
  
  private render() {
    this.containerEl.empty();
    this.containerEl.addClass('avm-kanban');
    
    const progressOrder = getProgressOrder(this.plugin.settings.progressStages);
    const progressColors = getProgressColors(this.plugin.settings.progressStages);
    
    progressOrder.forEach(progress => {
      this.renderColumn(progress, progressColors);
    });
  }
  
  private renderColumn(progress: ProjectProgress, progressColors: Record<string, string>) {
    const column = this.containerEl.createDiv({ cls: 'avm-kanban-column' });
    
    const header = column.createDiv({ cls: 'avm-kanban-column-header' });
    header.createDiv({ cls: 'avm-kanban-column-title', text: progress });
    
    const count = this.projects.filter(p => p.progress === progress).length;
    header.createDiv({ cls: 'avm-kanban-column-count', text: count.toString() });
    
    const columnStyle = header.createDiv({ cls: 'avm-kanban-column-indicator' });
    columnStyle.style.backgroundColor = progressColors[progress] || '#64748b';
    
    const cards = column.createDiv({ cls: 'avm-kanban-cards' });
    
    const progressProjects = this.projects.filter(p => p.progress === progress);
    
    // 按下一阶段时间排序
    const sortedProjects = this.sortProjectsByNextStage(progressProjects);
    
    sortedProjects.forEach(project => {
      this.renderCard(cards, project, progressColors);
    });
    
    if (sortedProjects.length === 0) {
      cards.createDiv({ cls: 'avm-kanban-empty', text: '暂无项目' });
    }
  }
  
  private sortProjectsByNextStage(projects: Project[]): Project[] {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const progressOrder = getProgressOrder(this.plugin.settings.progressStages);
    
    return projects.sort((a, b) => {
      const nextA = getNextStageInfo(a);
      const nextB = getNextStageInfo(b);
      
      // 有下一阶段时间的排在前面
      if (!!nextA.time !== !!nextB.time) {
        return nextA.time ? -1 : 1;
      }
      
      if (nextA.time && nextB.time) {
        const dateA = new Date(nextA.time);
        dateA.setHours(0, 0, 0, 0);
        const dateB = new Date(nextB.time);
        dateB.setHours(0, 0, 0, 0);
        
        // 接近的日期排在前面
        return dateA.getTime() - dateB.getTime();
      }
      
      // 都没有下一阶段时间，按进度排序
      const progressIndexA = progressOrder.indexOf(a.progress);
      const progressIndexB = progressOrder.indexOf(b.progress);
      return progressIndexA - progressIndexB;
    });
  }
  
  private renderCard(container: HTMLElement, project: Project, progressColors: Record<string, string>) {
    const card = container.createDiv({ cls: 'avm-kanban-card' });
    
    // 添加高亮样式
    if (this.isProjectHighlighted(project)) {
      card.addClass('avm-highlighted-row');
    }
    
    const isOverdue = this.checkOverdue(project);
    if (isOverdue) {
      card.addClass('avm-overdue');
    }
    
    const header = card.createDiv({ cls: 'avm-card-header' });
    header.createDiv({ cls: 'avm-card-title', text: project.name });
    
    if (project.manager) {
      card.createDiv({ cls: 'avm-card-meta', text: `👤 ${project.manager}` });
    }
    
    const links = card.createDiv({ cls: 'avm-card-links' });
    
    if (project.projectLink) {
      links.createEl('a', { cls: 'avm-link', text: '项目链接', attr: { href: this.ensureProtocol(project.projectLink), target: '_blank', rel: 'noopener noreferrer' } });
    }

    if (project.componentLink) {
      links.createEl('a', { cls: 'avm-link', text: '组件库', attr: { href: this.ensureProtocol(project.componentLink), target: '_blank', rel: 'noopener noreferrer' } });
    }
    
    card.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.showCardContextMenu(project, e);
    });
  }
  
  private isProjectHighlighted(project: Project): boolean {
    return isProjectHighlighted(project);
  }
  
  private ensureProtocol(url: string): string {
    if (!url) return url;
    if (!/^https?:\/\//i.test(url)) {
      return 'https://' + url;
    }
    return url;
  }

  private checkOverdue(project: Project): boolean {
    return checkOverdue(project, this.plugin.settings.progressStages);
  }
  
  private showCardContextMenu(project: Project, event: MouseEvent) {
    const menu = new Menu();
    
    menu.addItem(item => item
      .setTitle('编辑')
      .setIcon('pencil')
      .onClick(() => this.showEditProjectModal(project)));
    
    menu.addItem(item => item
      .setTitle('更改进度')
      .setIcon('arrow-right')
      .onClick(() => this.showProgressChangeModal(project)));
    
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
            await this.plugin.dataService.deleteProject(project.id);
            setTimeout(() => this.onRefresh(), 100);
          }
        ).open();
      }));
    
    menu.showAtMouseEvent(event);
  }
  
  private showEditProjectModal(project: Project) {
    new KanbanEditProjectModal(this.plugin.app, project, this.apps, this.versions, this.plugin.settings.progressStages, async (data) => {
      try {
        await this.plugin.dataService.updateProject(project.id, data, project.version);
        this.onRefresh();
      } catch (error) {
        new Notice(error?.message || String(error));
      }
    }).open();
  }
  
  private showProgressChangeModal(project: Project) {
    new ProgressChangeModal(this.plugin.app, project, this.plugin.settings.progressStages, async (newProgress) => {
      try {
        await this.plugin.dataService.updateProject(project.id, { progress: newProgress }, project.version);
        this.onRefresh();
      } catch (error) {
        new Notice(error?.message || String(error));
      }
    }).open();
  }
}

class KanbanEditProjectModal extends Modal {
  project: Project;
  apps: App[];
  versions: Version[];
  progressStages: { name: string; color: string }[];
  onSubmit: (data: Partial<Project>) => void;
  
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
          const app = this.apps.find(a => a.id === version.appId);
          const label = app ? `${app.name} - ${version.versionNumber}` : version.versionNumber;
          dropdown.addOption(version.id, label);
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
      .setName('项目需求')
      .addTextArea(text => text
        .setValue(data.requirements)
        .onChange(value => data.requirements = value));
    
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

class ProgressChangeModal extends Modal {
  project: Project;
  progressStages: { name: string; color: string }[];
  onSubmit: (progress: ProjectProgress) => void;
  
  constructor(app: ObsidianApp, project: Project, progressStages: { name: string; color: string }[], onSubmit: (progress: ProjectProgress) => void) {
    super(app);
    this.project = project;
    this.progressStages = progressStages;
    this.onSubmit = onSubmit;
  }
  
  onOpen() {
    const { contentEl } = this;
    contentEl.addClass('avm-modal');
    
    contentEl.createEl('h2', { text: '更改进度' });
    
    let newProgress = this.project.progress;
    
    new Setting(contentEl)
      .setName('选择新进度')
      .addDropdown(dropdown => {
        const progressOrder = getProgressOrder(this.progressStages);
        progressOrder.forEach(progress => {
          dropdown.addOption(progress, progress);
        });
        dropdown.setValue(this.project.progress);
        dropdown.onChange(value => newProgress = value as ProjectProgress);
      });
    
    createActionButtons(
      contentEl,
      {
        confirmText: '确认',
        cancelText: '取消',
        onConfirm: () => {
          this.onSubmit(newProgress);
          this.close();
        },
        onCancel: () => this.close()
      }
    );
  }
  
  onClose() {
    this.contentEl.empty();
  }
}
