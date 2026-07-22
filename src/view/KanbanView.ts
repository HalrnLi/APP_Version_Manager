import { Menu, Modal, App as ObsidianApp, Setting, Notice } from 'obsidian';
import AppVersionManagerPlugin from '../main';
import { Project, Version, ProjectProgress, getProgressOrder, getProgressColors, App, getNextStageInfo, getLastProgress, isProjectInPreRelease, getCurrentBRound, ROUND_COLORS } from '../types';
import { ConfirmModal } from './ConfirmModal';
import { createActionButtons } from './ModalUtils';
import { EditProjectModal } from './EditProjectModal';
import { sortProjectsByPriority, isProjectHighlighted, checkOverdue } from '../utils/projectSorting';

export class KanbanView {
  containerEl: HTMLElement;
  plugin: AppVersionManagerPlugin;
  projects: Project[];
  versions: Version[];
  apps: App[];
  onRefresh: () => void;
  getTodoStats: (projectId: string) => Promise<{ total: number; completed: number; overdue: number }>;
  onOpenTodos: (projectId: string, projectName: string) => void;

  constructor(
    containerEl: HTMLElement,
    plugin: AppVersionManagerPlugin,
    projects: Project[],
    versions: Version[],
    apps: App[],
    onRefresh: () => void = () => {},
    getTodoStats: (projectId: string) => Promise<{ total: number; completed: number; overdue: number }>,
    onOpenTodos: (projectId: string, projectName: string) => void,
  ) {
    this.containerEl = containerEl;
    this.plugin = plugin;
    this.projects = projects;
    this.versions = versions;
    this.apps = apps;
    this.onRefresh = onRefresh;
    this.getTodoStats = getTodoStats;
    this.onOpenTodos = onOpenTodos;

    this.render();
  }

  private render() {
    this.containerEl.empty();
    this.containerEl.addClass('avm-kanban');

    const progressOrder = getProgressOrder(this.plugin.settings.progressStages);
    const progressColors = getProgressColors(this.plugin.settings.progressStages);

    progressOrder.forEach((progress) => {
      this.renderColumn(progress, progressColors);
    });
  }

  private renderColumn(progress: ProjectProgress, progressColors: Record<string, string>) {
    const column = this.containerEl.createDiv({ cls: 'avm-kanban-column' });

    const header = column.createDiv({ cls: 'avm-kanban-column-header' });
    header.createDiv({ cls: 'avm-kanban-column-title', text: progress });

    const count = this.projects.filter((p) => p.progress === progress).length;
    header.createDiv({ cls: 'avm-kanban-column-count', text: count.toString() });

    const columnStyle = header.createDiv({ cls: 'avm-kanban-column-indicator' });
    columnStyle.style.backgroundColor = progressColors[progress] || '#64748b';

    const cards = column.createDiv({ cls: 'avm-kanban-cards' });

    const progressProjects = this.projects.filter((p) => p.progress === progress);

    // 按下一阶段时间排序
    const sortedProjects = this.sortProjectsByNextStage(progressProjects);

    sortedProjects.forEach((project) => {
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

    // 预发布横幅
    const lastProgress = getLastProgress(this.plugin.settings.progressStages);
    if (isProjectInPreRelease(project, this.plugin.settings.preReleaseRound, lastProgress)) {
      const banner = card.createDiv({ cls: 'avm-pre-release-banner avm-pre-release-banner-small' });
      banner.createSpan({ cls: 'avm-pre-release-icon', text: '⚠' });
      banner.createSpan({
        cls: 'avm-pre-release-text',
        text: `预发布（${this.plugin.settings.preReleaseRound}）`,
      });
      card.addClass('avm-pre-release-item');
    }

    const header = card.createDiv({ cls: 'avm-card-header' });
    header.createDiv({ cls: 'avm-card-title', text: project.name });

    // Add todo badge
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

    // 当前 B 轮阶段徽章
    const currentRound = getCurrentBRound(project);
    const stageMeta = card.createDiv({ cls: 'avm-card-meta avm-kanban-stage' });
    stageMeta.createSpan({ cls: 'avm-stage-label', text: '阶段:' });
    const stageValue = stageMeta.createSpan({ cls: 'avm-stage-value', text: currentRound });
    stageValue.style.color = ROUND_COLORS[currentRound] || '#64748b';
    stageValue.style.fontWeight = '600';

    if (project.manager) {
      card.createDiv({ cls: 'avm-card-meta', text: `👤 ${project.manager}` });
    }

    const links = card.createDiv({ cls: 'avm-card-links' });

    if (project.projectLink) {
      links.createEl('a', {
        cls: 'avm-link',
        text: '项目链接',
        attr: { href: this.ensureProtocol(project.projectLink), target: '_blank', rel: 'noopener noreferrer' },
      });
    }

    if (project.componentLink) {
      links.createEl('a', {
        cls: 'avm-link',
        text: '组件库',
        attr: { href: this.ensureProtocol(project.componentLink), target: '_blank', rel: 'noopener noreferrer' },
      });
    }

    if (project.features) {
      card.createDiv({ cls: 'avm-card-features', text: project.features.substring(0, 60) + (project.features.length > 60 ? '...' : '') });
    }

    if (project.spec) {
      card.createDiv({ cls: 'avm-card-spec', text: project.spec.substring(0, 60) + (project.spec.length > 60 ? '...' : '') });
    }

    card.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.showCardContextMenu(project, e);
    });
  }

  private isProjectHighlighted(project: Project): boolean {
    return isProjectHighlighted(project, this.plugin.settings.overdueWarningDays);
  }

  private ensureProtocol(url: string): string {
    if (!url) return url;
    if (!/^https?:\/\//i.test(url)) {
      return 'https://' + url;
    }
    return url;
  }

  private checkOverdue(project: Project): boolean {
    return checkOverdue(project, this.plugin.settings.progressStages, this.plugin.settings.overdueWarningDays);
  }

  private showCardContextMenu(project: Project, event: MouseEvent) {
    const menu = new Menu();

    menu.addItem((item) =>
      item
        .setTitle('编辑')
        .setIcon('pencil')
        .onClick(() => this.showEditProjectModal(project)),
    );

    menu.addItem((item) =>
      item
        .setTitle('更改进度')
        .setIcon('arrow-right')
        .onClick(() => this.showProgressChangeModal(project)),
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
              await this.plugin.dataService.deleteProject(project.id);
              setTimeout(() => this.onRefresh(), 100);
            },
            undefined,
            true,
          ).open();
        }),
    );

    menu.showAtMouseEvent(event);
  }

  private showEditProjectModal(project: Project) {
    new EditProjectModal(
      this.plugin.app,
      project,
      this.apps,
      this.versions,
      this.plugin.settings.progressStages,
      this.plugin.settings.responsiblePersons,
      async (data) => {
        try {
          await this.plugin.dataService.updateProject(project.id, data, project.version);
          this.onRefresh();
        } catch (error) {
          new Notice(error instanceof Error ? error.message : String(error));
        }
      },
      {
        versionLabelFn: (v, app) => (app ? `${app.name} - ${v.versionNumber}` : v.versionNumber),
      },
    ).open();
  }

  private showProgressChangeModal(project: Project) {
    new ProgressChangeModal(this.plugin.app, project, this.plugin.settings.progressStages, async (newProgress) => {
      try {
        await this.plugin.dataService.updateProject(project.id, { progress: newProgress }, project.version);
        this.onRefresh();
      } catch (error) {
        new Notice(error instanceof Error ? error.message : String(error));
      }
    }).open();
  }
}

class ProgressChangeModal extends Modal {
  project: Project;
  progressStages: { name: string; color: string }[];
  onSubmit: (progress: ProjectProgress) => void;

  constructor(
    app: ObsidianApp,
    project: Project,
    progressStages: { name: string; color: string }[],
    onSubmit: (progress: ProjectProgress) => void,
  ) {
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

    new Setting(contentEl).setName('选择新进度').addDropdown((dropdown) => {
      const progressOrder = getProgressOrder(this.progressStages);
      progressOrder.forEach((progress) => {
        dropdown.addOption(progress, progress);
      });
      dropdown.setValue(this.project.progress);
      dropdown.onChange((value) => (newProgress = value as ProjectProgress));
    });

    createActionButtons(contentEl, {
      confirmText: '确认',
      cancelText: '取消',
      onConfirm: () => {
        this.onSubmit(newProgress);
        this.close();
      },
      onCancel: () => this.close(),
    });
  }

  onClose() {
    this.contentEl.empty();
  }
}
