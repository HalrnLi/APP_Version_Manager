import { Menu, Modal, App as ObsidianApp, Setting } from 'obsidian';
import AppVersionManagerPlugin from '../main';
import { Project, Version, ProjectProgress, PROGRESS_ORDER, PROGRESS_COLORS } from '../types';

export class TableView {
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
    this.containerEl.addClass('avm-table-view');
    
    const tableWrapper = this.containerEl.createDiv({ cls: 'avm-table-wrapper' });
    const table = tableWrapper.createEl('table', { cls: 'avm-table' });
    
    const thead = table.createEl('thead');
    const headerRow = thead.createEl('tr');
    
    const columns = [
      { key: 'name', label: '项目名称', width: '150px' },
      { key: 'versionNumber', label: '版本号', width: '100px' },
      { key: 'manager', label: '项目经理', width: '100px' },
      { key: 'progress', label: '进度', width: '120px' },
      { key: 'plannedTestTime', label: '计划提测', width: '100px' },
      { key: 'plannedReleaseTime', label: '计划发布', width: '100px' },
      { key: 'links', label: '链接', width: '120px' }
    ];
    
    columns.forEach(col => {
      const th = headerRow.createEl('th', { text: col.label });
      th.style.width = col.width;
    });
    
    const tbody = table.createEl('tbody');
    
    if (this.projects.length === 0) {
      const emptyRow = tbody.createEl('tr');
      const emptyCell = emptyRow.createEl('td', { attr: { colspan: columns.length.toString() } });
      emptyCell.createDiv({ cls: 'avm-empty-state', text: '暂无数据' });
    } else {
      this.projects.forEach(project => {
        this.renderRow(tbody, project, columns);
      });
    }
  }
  
  private renderRow(tbody: HTMLElement, project: Project, columns: any[]) {
    const row = tbody.createEl('tr');
    
    const isOverdue = this.checkOverdue(project);
    if (isOverdue) {
      row.addClass('avm-overdue-row');
    }
    
    const version = this.versions.find(v => v.id === project.versionId);
    
    columns.forEach(col => {
      const td = row.createEl('td');
      
      switch (col.key) {
        case 'name':
          td.createDiv({ cls: 'avm-cell-name', text: project.name });
          break;
          
        case 'versionNumber':
          td.createDiv({ text: version?.versionNumber || '-' });
          break;
          
        case 'manager':
          td.createDiv({ text: project.manager || '-' });
          break;
          
        case 'progress':
          const badge = td.createDiv({ cls: 'avm-progress-badge-small', text: project.progress });
          badge.style.backgroundColor = PROGRESS_COLORS[project.progress];
          break;
          
        case 'plannedTestTime':
          const testTime = td.createDiv({ text: project.plannedTestTime || '-' });
          if (isOverdue) {
            testTime.addClass('avm-overdue-text');
          }
          break;
          
        case 'plannedReleaseTime':
          td.createDiv({ text: project.plannedReleaseTime || '-' });
          break;
          
        case 'links':
          const linksContainer = td.createDiv({ cls: 'avm-cell-links' });
          
          if (project.projectLink) {
            const link = linksContainer.createEl('a', { cls: 'avm-link-small', text: '项目', attr: { href: project.projectLink, target: '_blank', rel: 'noopener noreferrer' } });
            link.addEventListener('click', (e) => {
              e.preventDefault();
              e.stopPropagation();
              const { shell } = require('electron');
              const url = this.ensureProtocol(project.projectLink);
              shell.openExternal(url);
            });
          }

          if (project.componentLink) {
            const link = linksContainer.createEl('a', { cls: 'avm-link-small', text: '组件', attr: { href: project.componentLink, target: '_blank', rel: 'noopener noreferrer' } });
            link.addEventListener('click', (e) => {
              e.preventDefault();
              e.stopPropagation();
              const { shell } = require('electron');
              const url = this.ensureProtocol(project.componentLink);
              shell.openExternal(url);
            });
          }
          
          if (!project.projectLink && !project.componentLink) {
            td.createDiv({ text: '-' });
          }
          break;
      }
    });
    
    row.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.showRowContextMenu(project, e);
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
  
  private showRowContextMenu(project: Project, event: MouseEvent) {
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
    new TableEditProjectModal(this.plugin.app, project, async (data) => {
      try {
        await this.plugin.dataService.updateProject(project.id, data);
        this.onRefresh();
      } catch (error) {
        alert(error);
      }
    }).open();
  }
  
  private showProgressChangeModal(project: Project) {
    new TableProgressChangeModal(this.plugin.app, project, async (newProgress) => {
      try {
        await this.plugin.dataService.updateProject(project.id, { progress: newProgress });
        this.onRefresh();
      } catch (error) {
        alert(error);
      }
    }).open();
  }
}

class TableEditProjectModal extends Modal {
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

class TableProgressChangeModal extends Modal {
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
