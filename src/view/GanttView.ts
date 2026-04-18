import { Menu, App as ObsidianApp } from 'obsidian';
import AppVersionManagerPlugin from '../main';
import { Project, Version, ProjectProgress, getProgressOrder, getProgressColors, App, TEST_STAGES, getNextStageInfo } from '../types';

interface GanttBar {
  project: Project;
  stage: string;
  stageLabel: string;
  startDate: Date;
  endDate: Date | null;
  color: string;
}

export class GanttView {
  containerEl: HTMLElement;
  plugin: AppVersionManagerPlugin;
  projects: Project[];
  versions: Version[];
  apps: App[];
  onRefresh: () => void;

  private dayWidth: number = 30;
  private timelineStart: Date = new Date();
  private timelineEnd: Date = new Date();
  private chartContainer: HTMLElement | null = null;

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

    this.calculateTimelineBounds();
    this.render();
  }

  private calculateTimelineBounds() {
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    this.timelineStart = new Date(now);
    this.timelineStart.setDate(now.getDate() - 7);

    this.timelineEnd = new Date(now);
    this.timelineEnd.setDate(now.getDate() + 60);
  }

  private getProjectVersion(versionId: string): Version | undefined {
    return this.versions.find(v => v.id === versionId);
  }

  private getProjectApp(versionId: string): App | undefined {
    const version = this.getProjectVersion(versionId);
    if (!version) return undefined;
    return this.apps.find(a => a.id === version.appId);
  }

  private getTimelineDays(): number {
    return Math.ceil((this.timelineEnd.getTime() - this.timelineStart.getTime()) / (1000 * 60 * 60 * 24));
  }

  private formatDate(date: Date): string {
    const month = date.getMonth() + 1;
    const day = date.getDate();
    return `${month}/${day}`;
  }

  private getDatePosition(date: Date): number {
    const days = Math.ceil((date.getTime() - this.timelineStart.getTime()) / (1000 * 60 * 60 * 24));
    return days * this.dayWidth;
  }

  private render() {
    this.containerEl.empty();
    this.containerEl.addClass('avm-gantt');

    const header = this.containerEl.createDiv({ cls: 'avm-gantt-header' });
    header.createDiv({ cls: 'avm-gantt-title', text: '甘特图视图' });

    this.renderChart();
  }

  private renderChart() {
    this.chartContainer = this.containerEl.createDiv({ cls: 'avm-gantt-chart' });

    // 渲染时间轴头部
    this.renderTimelineHeader();

    // 渲染项目行
    this.renderProjectRows();
  }

  private renderTimelineHeader() {
    const header = this.chartContainer!.createDiv({ cls: 'avm-gantt-timeline-header' });

    // 左侧项目名称列头
    header.createDiv({ cls: 'avm-gantt-row-header avm-gantt-col-header', text: '项目' });

    // 时间轴
    const timelineEl = header.createDiv({ cls: 'avm-gantt-timeline' });
    const days = this.getTimelineDays();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = 0; i <= days; i++) {
      const date = new Date(this.timelineStart);
      date.setDate(this.timelineStart.getDate() + i);

      const cell = timelineEl.createDiv({ cls: 'avm-gantt-day-cell' });
      cell.style.width = `${this.dayWidth}px`;

      // 周末高亮
      const dayOfWeek = date.getDay();
      if (dayOfWeek === 0 || dayOfWeek === 6) {
        cell.addClass('avm-gantt-weekend');
      }

      // 今天高亮
      if (date.getTime() === today.getTime()) {
        cell.addClass('avm-gantt-today');
      }

      // 显示日期（只显示1,7,14,21等7的倍数的天）
      if (i % 7 === 0) {
        cell.createDiv({ cls: 'avm-gantt-date-label', text: this.formatDate(date) });
      }
    }
  }

  private renderProjectRows() {
    const sortedProjects = this.sortProjectsByNextStage();

    if (sortedProjects.length === 0) {
      this.chartContainer!.createDiv({
        cls: 'avm-gantt-empty',
        text: '暂无项目数据'
      });
      return;
    }

    sortedProjects.forEach(project => {
      this.renderProjectRow(project);
    });
  }

  private sortProjectsByNextStage(): Project[] {
    return [...this.projects].sort((a, b) => {
      const nextA = getNextStageInfo(a);
      const nextB = getNextStageInfo(b);

      if (!nextA.time && !nextB.time) return 0;
      if (!nextA.time) return 1;
      if (!nextB.time) return -1;

      return new Date(nextA.time).getTime() - new Date(nextB.time).getTime();
    });
  }

  private renderProjectRow(project: Project) {
    const row = this.chartContainer!.createDiv({ cls: 'avm-gantt-row' });

    // 左侧项目信息
    const rowHeader = row.createDiv({ cls: 'avm-gantt-row-header' });
    rowHeader.createDiv({ cls: 'avm-gantt-project-name', text: project.name });
    const version = this.getProjectVersion(project.versionId);
    if (version) {
      rowHeader.createDiv({ cls: 'avm-gantt-project-version', text: version.versionNumber });
    }

    // 时间条区域
    const barsContainer = row.createDiv({ cls: 'avm-gantt-bars' });

    // 获取该项目的所有测试阶段时间
    const bars = this.getProjectGanttBars(project);

    bars.forEach(bar => {
      this.renderBar(barsContainer, bar);
    });
  }

  private getProjectGanttBars(project: Project): GanttBar[] {
    const bars: GanttBar[] = [];
    const progressColors = getProgressColors(this.plugin.settings.progressStages);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    TEST_STAGES.forEach((stage, index) => {
      const timeStr = (project as any)[stage.key] as string;
      if (!timeStr) return;

      const startDate = new Date(timeStr);
      startDate.setHours(0, 0, 0, 0);

      // 确定结束日期（下一个有时间的阶段或今天）
      let endDate: Date | null = null;
      for (let j = index + 1; j < TEST_STAGES.length; j++) {
        const nextTimeStr = (project as any)[TEST_STAGES[j].key] as string;
        if (nextTimeStr) {
          endDate = new Date(nextTimeStr);
          endDate.setHours(0, 0, 0, 0);
          break;
        }
      }

      // 如果没有下一个阶段，且当前阶段有时间为已完成状态，设置结束日期为今天
      if (!endDate && project.progress === stage.label) {
        endDate = new Date(today);
      }

      if (!endDate) {
        // 默认持续7天
        endDate = new Date(startDate);
        endDate.setDate(startDate.getDate() + 7);
      }

      bars.push({
        project,
        stage: stage.key,
        stageLabel: stage.label,
        startDate,
        endDate,
        color: progressColors[project.progress] || '#64748b'
      });
    });

    return bars;
  }

  private renderBar(container: HTMLElement, bar: GanttBar) {
    const barEl = container.createDiv({ cls: 'avm-gantt-bar' });

    // 计算位置和宽度
    const left = this.getDatePosition(bar.startDate);
    const rightPos = this.getDatePosition(bar.endDate!);
    const width = Math.max(rightPos - left, this.dayWidth);

    barEl.style.left = `${left}px`;
    barEl.style.width = `${width}px`;
    barEl.style.backgroundColor = bar.color;

    // 标签
    barEl.createDiv({ cls: 'avm-gantt-bar-label', text: bar.stageLabel });

    // tooltip
    barEl.setAttribute('title', `${bar.project.name} - ${bar.stageLabel}\n${bar.startDate.toLocaleDateString()} ~ ${bar.endDate?.toLocaleDateString() || '进行中'}`);

    // 右键菜单
    barEl.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.showBarContextMenu(bar, e);
    });
  }

  private showBarContextMenu(bar: GanttBar, event: MouseEvent) {
    const menu = new Menu();

    menu.addItem(item => item
      .setTitle(bar.project.name)
      .setIcon('document')
      .onClick(() => { }));

    menu.addSeparator();

    menu.addItem(item => item
      .setTitle('编辑项目')
      .setIcon('pencil')
      .onClick(() => {
        // TODO: 触发编辑项目
      }));

    menu.showAtMouseEvent(event);
  }
}
