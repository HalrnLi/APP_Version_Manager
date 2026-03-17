import { Menu, Modal, App as ObsidianApp, Setting } from 'obsidian';
import AppVersionManagerPlugin from '../main';
import { Project, Version, ProjectProgress, PROGRESS_ORDER, PROGRESS_COLORS } from '../types';

export class KanbanView {
  containerEl: HTMLElement;
  plugin: AppVersionManagerPlugin;
  projects: Project[];
  versions: Version[];
  onRefresh: () => void;
  
  constructor(
    containerEl: HTMLElement,
    plugin: AppVersionManagerPlugin,
    projects: Project[],
    versions: Version[],
    onRefresh: () => void = () => {}
  ) {
    this.containerEl = containerEl;
    this.plugin = plugin;
    this.projects = projects;
    this.versions = versions;
    this.onRefresh = onRefresh;
    
    this.render();
  }
  
  private render() {
    this.containerEl.empty();
    this.containerEl.addClass('avm-kanban');
    
    PROGRESS_ORDER.forEach(progress => {
      this.renderColumn(progress);
    });
  }
  
  private renderColumn(progress: ProjectProgress) {
    const column = this.containerEl.createDiv({ cls: 'avm-kanban-column' });
    
    const header = column.createDiv({ cls: 'avm-kanban-column-header' });
    header.createDiv({ cls: 'avm-kanban-column-title', text: progress });
    
    const count = this.projects.filter(p => p.progress === progress).length;
    header.createDiv({ cls: 'avm-kanban-column-count', text: count.toString() });
    
    const columnStyle = header.createDiv({ cls: 'avm-kanban-column-indicator' });
    columnStyle.style.backgroundColor = PROGRESS_COLORS[progress];
    
    const cards = column.createDiv({ cls: 'avm-kanban-cards' });
    
    const progressProjects = this.projects.filter(p => p.progress === progress);
    
    progressProjects.forEach(project => {
      this.renderCard(cards, project);
    });
    
    if (progressProjects.length === 0) {
      cards.createDiv({ cls: 'avm-kanban-empty', text: '暂无项目' });
    }
  }
  
  private renderCard(container: HTMLElement, project: Project) {
    const card = container.createDiv({ cls: 'avm-kanban-card' });
    
    const isOverdue = this.checkOverdue(project);
    if (isOverdue) {
      card.addClass('avm-overdue');
    }
    
    const header = card.createDiv({ cls: 'avm-card-header' });
    header.createDiv({ cls: 'avm-card-title', text: project.name });
    
    const version = this.versions.find(v => v.id === project.versionId);
    if (version) {
      header.createDiv({ cls: 'avm-card-version', text: version.versionNumber });
    }
    
    if (project.manager) {
      card.createDiv({ cls: 'avm-card-meta', text: `👤 ${project.manager}` });
    }
    
    if (project.plannedTestTime) {
      const testTime = card.createDiv({ cls: 'avm-card-meta' });
      testTime.createSpan({ text: `📅 提测: ${project.plannedTestTime}` });
      if (isOverdue) {
        testTime.addClass('avm-overdue-text');
      }
    }
    
    if (project.plannedReleaseTime) {
      card.createDiv({ cls: 'avm-card-meta', text: `🚀 发布: ${project.plannedReleaseTime}` });
    }
    
    const links = card.createDiv({ cls: 'avm-card-links' });
    
    if (project.projectLink) {
      const link = links.createEl('a', { cls: 'avm-link', text: '项目链接', attr: { href: project.projectLink, target: '_blank', rel: 'noopener noreferrer' } });
      link.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const { shell } = require('electron');
        const url = this.ensureProtocol(project.projectLink);
        shell.openExternal(url);
      });
    }

    if (project.componentLink) {
      const link = links.createEl('a', { cls: 'avm-link', text: '组件库', attr: { href: project.componentLink, target: '_blank', rel: 'noopener noreferrer' } });
      link.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const { shell } = require('electron');
        const url = this.ensureProtocol(project.componentLink);
        shell.openExternal(url);
      });
    }
    
    card.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.showCardContextMenu(project, e);
    });
  }
  
  private ensureProtocol(url: string): string {
    if (!url) return url;
    if (!/^https?:\/\//i.test(url)) {
      return 'https://' + url;
    }
    return url;
  }

  private checkOverdue(project: Project): boolean {
    if (!project.plannedTestTime) return false;
    if (project.progress === ProjectProgress.SUBMITTED || project.progress === ProjectProgress.RELEASED) return false;
    
    const plannedDate = new Date(project.plannedTestTime);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    return plannedDate < today;
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
      .onClick(async () => {
        const confirmed = confirm(`确定要删除项目 "${project.name}" 吗？`);
        if (confirmed) {
          await this.plugin.dataService.deleteProject(project.id);
          this.onRefresh();
        }
      }));
    
    menu.showAtMouseEvent(event);
  }
  
  private showEditProjectModal(project: Project) {
    new KanbanEditProjectModal(this.plugin.app, project, async (data) => {
      try {
        await this.plugin.dataService.updateProject(project.id, data);
        this.onRefresh();
      } catch (error) {
        alert(error);
      }
    }).open();
  }
  
  private showProgressChangeModal(project: Project) {
    new ProgressChangeModal(this.plugin.app, project, async (newProgress) => {
      try {
        await this.plugin.dataService.updateProject(project.id, { progress: newProgress });
        this.onRefresh();
      } catch (error) {
        alert(error);
      }
    }).open();
  }
}

class KanbanEditProjectModal extends Modal {
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
    
    contentEl.createEl('h2', { text: '编辑项目' });
    
    const data = {
      name: this.project.name,
      manager: this.project.manager,
      projectLink: this.project.projectLink,
      componentLink: this.project.componentLink,
      requirements: this.project.requirements,
      progress: this.project.progress,
      plannedTestTime: this.project.plannedTestTime,
      plannedReleaseTime: this.project.plannedReleaseTime
    };
    
    new Setting(contentEl)
      .setName('项目名称 *')
      .addText(text => text
        .setValue(data.name)
        .onChange(value => data.name = value));
    
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
        text.setValue(data.plannedTestTime)
          .onChange(value => data.plannedTestTime = value);
      });
    
    new Setting(contentEl)
      .setName('计划发布时间')
      .addText(text => {
        text.inputEl.type = 'date';
        text.setValue(data.plannedReleaseTime)
          .onChange(value => data.plannedReleaseTime = value);
      });
    
    new Setting(contentEl)
      .addButton(btn => btn
        .setButtonText('保存')
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

class ProgressChangeModal extends Modal {
  project: Project;
  onSubmit: (progress: ProjectProgress) => void;
  
  constructor(app: ObsidianApp, project: Project, onSubmit: (progress: ProjectProgress) => void) {
    super(app);
    this.project = project;
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
        PROGRESS_ORDER.forEach(progress => {
          dropdown.addOption(progress, progress);
        });
        dropdown.setValue(this.project.progress);
        dropdown.onChange(value => newProgress = value as ProjectProgress);
      });
    
    new Setting(contentEl)
      .addButton(btn => btn
        .setButtonText('确认')
        .setCta()
        .onClick(() => {
          this.onSubmit(newProgress);
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
