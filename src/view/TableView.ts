import { Menu, Modal, App as ObsidianApp, Setting, TFile } from 'obsidian';
import AppVersionManagerPlugin from '../main';
import { Project, Version, ProjectProgress, PROGRESS_ORDER, PROGRESS_COLORS, App, TEST_STAGES, getNextStageInfo, parseDateInput } from '../types';

export class TableView {
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
  
  private applySorting(projects: Project[]): Project[] {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    
    const projectsWithPriority = projects.map(project => {
      const nextStageInfo = getNextStageInfo(project);
      
      let priority = 3;
      let sortTime = new Date(project.createdAt).getTime();
      
      if (project.progress === ProjectProgress.RELEASED) {
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
      { key: 'nextStage', label: '下一阶段', width: '120px' },
      { key: 'nextStageTime', label: '下一阶段时间', width: '120px' },
      { key: 'links', label: '链接', width: '120px' }
    ];
    
    columns.forEach(col => {
      const th = headerRow.createEl('th', { text: col.label });
      th.style.width = col.width;
    });
    
    const tbody = table.createEl('tbody');
    
    const sortedProjects = this.applySorting(this.projects);
    
    if (sortedProjects.length === 0) {
      const emptyRow = tbody.createEl('tr');
      const emptyCell = emptyRow.createEl('td', { attr: { colspan: columns.length.toString() } });
      emptyCell.createDiv({ cls: 'avm-empty-state', text: '暂无数据' });
    } else {
      sortedProjects.forEach(project => {
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
          const badge = td.createDiv({ cls: 'avm-progress-badge-small avm-clickable', text: project.progress });
          badge.style.backgroundColor = PROGRESS_COLORS[project.progress];
          badge.addEventListener('click', (e) => {
            e.stopPropagation();
            this.handleProgressClick(project);
          });
          break;
          
        case 'nextStage':
          const nextStageInfo = getNextStageInfo(project);
          td.createDiv({ text: nextStageInfo.stage });
          break;
          
        case 'nextStageTime':
          const nextStageInfo2 = getNextStageInfo(project);
          td.createDiv({ text: nextStageInfo2.time });
          break;
          
        case 'links':
          const linksContainer = td.createDiv({ cls: 'avm-cell-links' });
          
          if (project.projectLink) {
            const link = linksContainer.createEl('a', { cls: 'avm-link-small', text: '项目', attr: { href: project.projectLink, target: '_blank', rel: 'noopener noreferrer' } });
            link.addEventListener('click', (e) => {
              e.preventDefault();
              e.stopPropagation();
              this.openExternalLink(project.projectLink);
            });
          }

          if (project.componentLink) {
            const link = linksContainer.createEl('a', { cls: 'avm-link-small', text: '组件', attr: { href: project.componentLink, target: '_blank', rel: 'noopener noreferrer' } });
            link.addEventListener('click', (e) => {
              e.preventDefault();
              e.stopPropagation();
              this.openExternalLink(project.componentLink);
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

    row.addEventListener('dblclick', (e) => {
      e.preventDefault();
      this.openProjectNote(project);
    });
  }

  private async openProjectNote(project: Project) {
    const memoPath = this.plugin.dataService.getProjectMemoPath(project.name, project.id);
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
    if (project.progress === ProjectProgress.SUBMITTED || project.progress === ProjectProgress.RELEASED) return false;
    
    const nextStageInfo = getNextStageInfo(project);
    if (!nextStageInfo.time) return false;
    
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    
    const nextDate = new Date(nextStageInfo.time);
    nextDate.setHours(0, 0, 0, 0);
    
    const diffDays = Math.floor((nextDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    
    return diffDays >= 0 && diffDays <= 1;
  }
  
  private showRowContextMenu(project: Project, event: MouseEvent) {
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
  
  private handleProgressClick(project: Project) {
    const currentIndex = PROGRESS_ORDER.indexOf(project.progress);
    if (currentIndex === -1 || currentIndex >= PROGRESS_ORDER.length - 1) {
      return;
    }
    
    const nextProgress = PROGRESS_ORDER[currentIndex + 1];
    new ProgressConfirmModal(
      this.plugin.app,
      project,
      nextProgress,
      async () => {
        try {
          await this.plugin.dataService.updateProject(project.id, { progress: nextProgress }, project.version);
          this.onRefresh();
        } catch (error) {
          alert(error instanceof Error ? error.message : String(error));
        }
      }
    ).open();
  }
  
  private showEditProjectModal(project: Project) {
    new TableEditProjectModal(this.plugin.app, project, this.apps, this.versions, async (data) => {
      try {
        await this.plugin.dataService.updateProject(project.id, data, project.version);
        this.onRefresh();
      } catch (error) {
        alert(error instanceof Error ? error.message : String(error));
      }
    }).open();
  }
  
  private showTestPlanModal(project: Project) {
    new TableTestPlanModal(this.plugin.app, project, async (data) => {
      try {
        await this.plugin.dataService.updateProject(project.id, data, project.version);
        this.onRefresh();
      } catch (error) {
        alert(error instanceof Error ? error.message : String(error));
      }
    }).open();
  }
}

class TableEditProjectModal extends Modal {
  project: Project;
  apps: App[];
  versions: Version[];
  onSubmit: (data: Partial<Project>) => void;
  
  constructor(
    app: ObsidianApp, 
    project: Project, 
    apps: App[], 
    versions: Version[], 
    onSubmit: (data: Partial<Project>) => void
  ) {
    super(app);
    this.project = project;
    this.apps = apps;
    this.versions = versions;
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
        PROGRESS_ORDER.forEach(progress => {
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

class ProgressConfirmModal extends Modal {
  project: Project;
  nextProgress: ProjectProgress;
  onConfirm: () => void;
  
  constructor(
    app: ObsidianApp,
    project: Project,
    nextProgress: ProjectProgress,
    onConfirm: () => void
  ) {
    super(app);
    this.project = project;
    this.nextProgress = nextProgress;
    this.onConfirm = onConfirm;
  }
  
  onOpen() {
    const { contentEl } = this;
    contentEl.addClass('avm-modal avm-progress-confirm-modal');
    
    contentEl.createEl('h2', { text: '确认更改进度' });
    
    const infoContainer = contentEl.createDiv({ cls: 'avm-confirm-info' });
    
    const projectInfo = infoContainer.createDiv({ cls: 'avm-confirm-project' });
    projectInfo.createEl('span', { cls: 'avm-confirm-label', text: '项目：' });
    projectInfo.createEl('span', { text: this.project.name });
    
    const progressContainer = infoContainer.createDiv({ cls: 'avm-confirm-progress' });
    
    const currentDiv = progressContainer.createDiv({ cls: 'avm-progress-item' });
    currentDiv.createEl('div', { cls: 'avm-confirm-label', text: '当前进度' });
    const currentBadge = currentDiv.createDiv({ cls: 'avm-progress-badge-small', text: this.project.progress });
    currentBadge.style.backgroundColor = PROGRESS_COLORS[this.project.progress];
    
    const arrow = progressContainer.createDiv({ cls: 'avm-progress-arrow' });
    arrow.createEl('span', { text: '→' });
    
    const nextDiv = progressContainer.createDiv({ cls: 'avm-progress-item' });
    nextDiv.createEl('div', { cls: 'avm-confirm-label', text: '下一进度' });
    const nextBadge = nextDiv.createDiv({ cls: 'avm-progress-badge-small', text: this.nextProgress });
    nextBadge.style.backgroundColor = PROGRESS_COLORS[this.nextProgress];
    
    new Setting(contentEl)
      .addButton(btn => btn
        .setButtonText('确认更改')
        .setCta()
        .onClick(() => {
          this.onConfirm();
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

class TableTestPlanModal extends Modal {
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
