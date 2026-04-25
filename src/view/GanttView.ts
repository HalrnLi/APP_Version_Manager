import { Menu, App as ObsidianApp } from 'obsidian';
import AppVersionManagerPlugin from '../main';
import { Project, Version, ProjectProgress, getProgressOrder, App, TEST_STAGES, getNextStageInfo } from '../types';

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

  private cellWidth: number = 40;
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
    this.timelineStart.setDate(now.getDate() - 3);

    this.timelineEnd = new Date(now);
    this.timelineEnd.setDate(now.getDate() + 60);
  }

  private getProjectVersion(versionId: string): Version | undefined {
    return this.versions.find(v => v.id === versionId);
  }

  private getTimelineDays(): number {
    const diff = this.timelineEnd.getTime() - this.timelineStart.getTime();
    return Math.floor(diff / (1000 * 60 * 60 * 24));
  }

  private formatDate(date: Date): string {
    const month = date.getMonth() + 1;
    const day = date.getDate();
    return `${month}/${day}`;
  }

  private getDateFromIndex(index: number): Date {
    const date = new Date(this.timelineStart);
    date.setDate(this.timelineStart.getDate() + index);
    return date;
  }

  private getIndexFromDate(date: Date): number {
    const diff = date.getTime() - this.timelineStart.getTime();
    return Math.floor(diff / (1000 * 60 * 60 * 24));
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

    for (let i = 0; i < days; i++) {
      const date = this.getDateFromIndex(i);

      const cell = timelineEl.createDiv({ cls: 'avm-gantt-day-cell' });
      cell.style.width = `${this.cellWidth}px`;
      cell.style.minWidth = `${this.cellWidth}px`;

      // 周末高亮
      const dayOfWeek = date.getDay();
      if (dayOfWeek === 0 || dayOfWeek === 6) {
        cell.addClass('avm-gantt-weekend');
      }

      // 今天高亮
      if (date.getTime() === today.getTime()) {
        cell.addClass('avm-gantt-today');
      }

      // 显示日期
      cell.createDiv({ cls: 'avm-gantt-date-label', text: this.formatDate(date) });
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

    // 时间轴格子区域
    const cellsContainer = row.createDiv({ cls: 'avm-gantt-cells' });
    const days = this.getTimelineDays();

    for (let i = 0; i < days; i++) {
      cellsContainer.createDiv({ cls: 'avm-gantt-time-cell' });
    }

    // 获取该项目的所有测试阶段时间
    const bars = this.getProjectGanttBars(project);

    bars.forEach(bar => {
      this.renderBar(cellsContainer, bar, days);
    });
  }

  // 阶段颜色数组，相邻阶段颜色不同
  private stageColors = [
    '#6366f1', // 靛蓝 - B1集成
    '#818cf8', // 浅靛蓝 - B1系统
    '#ec4899', // 粉色 - B2集成
    '#f472b6', // 浅粉 - B2系统
    '#f59e0b', // 琥珀 - B3集成
    '#fbbf24', // 浅琥珀 - B3系统
    '#10b981', // 翠绿 - B4集成
    '#34d399', // 浅翠绿 - B4系统
  ];

  private getProjectGanttBars(project: Project): GanttBar[] {
    const bars: GanttBar[] = [];

    TEST_STAGES.forEach((stage, index) => {
      const timeStr = (project as unknown as Record<string, string>)[stage.key];
      if (!timeStr) return;

      // 手动解析日期字符串
      const [year, month, day] = timeStr.split('-').map(Number);
      if (isNaN(year) || isNaN(month) || isNaN(day)) return;
      const startDate = new Date(year, month - 1, day);
      if (isNaN(startDate.getTime())) return;
      startDate.setHours(0, 0, 0, 0);

      // 确定结束日期
      let endDate: Date | null = null;
      for (let j = index + 1; j < TEST_STAGES.length; j++) {
        const nextTimeStr = (project as unknown as Record<string, string>)[TEST_STAGES[j].key];
        if (nextTimeStr) {
          const [y, m, d] = nextTimeStr.split('-').map(Number);
          if (isNaN(y) || isNaN(m) || isNaN(d)) continue;
          endDate = new Date(y, m - 1, d);
          if (isNaN(endDate.getTime())) continue;
          endDate.setHours(0, 0, 0, 0);
          break;
        }
      }

      if (!endDate) {
        endDate = new Date(startDate);
        endDate.setDate(startDate.getDate() + 7);
      }

      bars.push({
        project,
        stage: stage.key,
        stageLabel: stage.label,
        startDate,
        endDate,
        color: this.stageColors[index] || '#64748b'
      });
    });

    return bars;
  }

  private renderBar(container: HTMLElement, bar: GanttBar, totalDays: number) {
    const startIndex = this.getIndexFromDate(bar.startDate);
    const endIndex = this.getIndexFromDate(bar.endDate!);

    // 计算跨越的格子数
    const spanCells = endIndex - startIndex + 1;

    // 创建时间条，绝对定位
    const barEl = container.createDiv({ cls: 'avm-gantt-bar' });
    barEl.style.left = `${startIndex * this.cellWidth}px`;
    barEl.style.width = `${spanCells * this.cellWidth - 4}px`;
    barEl.style.backgroundColor = bar.color;

    // 标签
    barEl.createDiv({ cls: 'avm-gantt-bar-label', text: bar.stageLabel });

    // tooltip
    barEl.setAttribute('title', `${bar.project.name} - ${bar.stageLabel}\n${this.formatDate(bar.startDate)} ~ ${this.formatDate(bar.endDate!)}`);

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
