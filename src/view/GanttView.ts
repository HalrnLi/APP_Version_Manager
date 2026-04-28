import { Menu, App as ObsidianApp } from 'obsidian';
import AppVersionManagerPlugin from '../main';
import { Project, Version, ProjectProgress, getProgressOrder, App, TEST_STAGES, getNextStageInfo } from '../types';

interface TestDateMarker {
  date: Date;
  label: string;
  color: string;
  index: number;
}

interface ProjectBar {
  project: Project;
  startDate: Date;
  endDate: Date;
  markers: TestDateMarker[];
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
    this.timelineEnd.setDate(now.getDate() + 15);
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

    // 左侧项目信息区域
    const sidebar = this.chartContainer.createDiv({ cls: 'avm-gantt-sidebar' });

    // 右侧时间轴容器
    const timelineContainer = this.chartContainer.createDiv({ cls: 'avm-gantt-timeline-container' });

    // 渲染时间轴头部
    this.renderTimelineHeader(sidebar, timelineContainer);

    // 渲染项目行
    this.renderProjectRows(sidebar, timelineContainer);

    // 同步左右两侧垂直滚动
    sidebar.addEventListener('scroll', () => {
      timelineContainer.scrollTop = sidebar.scrollTop;
    });
    timelineContainer.addEventListener('scroll', () => {
      sidebar.scrollTop = timelineContainer.scrollTop;
    });
  }

  private renderTimelineHeader(sidebar: HTMLElement, timelineContainer: HTMLElement) {
    const days = this.getTimelineDays();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // 左侧项目名称列头
    sidebar.createDiv({ cls: 'avm-gantt-sidebar-header', text: '项目' });

    // 时间轴头部
    const header = timelineContainer.createDiv({ cls: 'avm-gantt-timeline-header' });

    // 时间轴
    const timelineEl = header.createDiv({ cls: 'avm-gantt-timeline' });

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

  private renderProjectRows(sidebar: HTMLElement, timelineContainer: HTMLElement) {
    const sortedProjects = this.sortProjectsByNextStage();

    if (sortedProjects.length === 0) {
      timelineContainer.createDiv({
        cls: 'avm-gantt-empty',
        text: '暂无项目数据'
      });
      return;
    }

    sortedProjects.forEach(project => {
      this.renderProjectRow(project, sidebar, timelineContainer);
    });
  }

  private hasTestDateInRange(project: Project): boolean {
    for (const stage of TEST_STAGES) {
      const timeStr = (project as unknown as Record<string, string>)[stage.key];
      if (!timeStr) continue;

      const [year, month, day] = timeStr.split('-').map(Number);
      if (isNaN(year) || isNaN(month) || isNaN(day)) continue;
      const testDate = new Date(year, month - 1, day);
      if (isNaN(testDate.getTime())) continue;
      testDate.setHours(0, 0, 0, 0);

      if (testDate >= this.timelineStart && testDate <= this.timelineEnd) {
        return true;
      }
    }
    return false;
  }

  private sortProjectsByNextStage(): Project[] {
    return [...this.projects]
      .filter(p => p.progress !== '已发布')
      .filter(p => this.hasTestDateInRange(p))
      .sort((a, b) => {
        const nextA = getNextStageInfo(a);
        const nextB = getNextStageInfo(b);

        if (!nextA.time && !nextB.time) return 0;
        if (!nextA.time) return 1;
        if (!nextB.time) return -1;

        return new Date(nextA.time).getTime() - new Date(nextB.time).getTime();
      });
  }

  private renderProjectRow(project: Project, sidebar: HTMLElement, timelineContainer: HTMLElement) {
    const days = this.getTimelineDays();

    // 左侧项目信息 - 在 sidebar 中
    const sidebarRow = sidebar.createDiv({ cls: 'avm-gantt-sidebar-row' });
    sidebarRow.createDiv({ cls: 'avm-gantt-project-name', text: project.name });
    const version = this.getProjectVersion(project.versionId);
    if (version) {
      sidebarRow.createDiv({ cls: 'avm-gantt-project-version', text: version.versionNumber });
    }

    // 右侧时间轴行
    const row = timelineContainer.createDiv({ cls: 'avm-gantt-row' });

    // 时间轴格子区域
    const cellsContainer = row.createDiv({ cls: 'avm-gantt-cells' });

    for (let i = 0; i < days; i++) {
      cellsContainer.createDiv({ cls: 'avm-gantt-time-cell' });
    }

    // 获取该项目的单一甘特条（包含所有测试日期标记）
    const bar = this.getProjectBar(project);

    if (bar) {
      this.renderProjectBar(cellsContainer, bar, days);
    }
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

  private getProjectBar(project: Project): ProjectBar | null {
    const markers: TestDateMarker[] = [];
    let earliestDate: Date | null = null;
    let latestDate: Date | null = null;

    TEST_STAGES.forEach((stage, index) => {
      const timeStr = (project as unknown as Record<string, string>)[stage.key];
      if (!timeStr) return;

      const [year, month, day] = timeStr.split('-').map(Number);
      if (isNaN(year) || isNaN(month) || isNaN(day)) return;
      const testDate = new Date(year, month - 1, day);
      if (isNaN(testDate.getTime())) return;
      testDate.setHours(0, 0, 0, 0);

      // 只记录在可见范围内的测试日期
      if (testDate >= this.timelineStart && testDate <= this.timelineEnd) {
        markers.push({
          date: testDate,
          label: stage.label,
          color: this.stageColors[index] || '#64748b',
          index: this.getIndexFromDate(testDate)
        });
      }

      // 跟踪最早和最晚日期（用于确定条形图范围，不限于可见范围）
      if (!earliestDate || testDate < earliestDate) {
        earliestDate = testDate;
      }
      if (!latestDate || testDate > latestDate) {
        latestDate = testDate;
      }
    });

    if (markers.length === 0) {
      return null;
    }

    // 默认持续7天如果只有一个日期
    const effectiveEarliest = earliestDate!;
    const effectiveLatest = latestDate!;
    if (effectiveEarliest.getTime() === effectiveLatest.getTime()) {
      latestDate = new Date(effectiveEarliest);
      latestDate.setDate(latestDate.getDate() + 7);
    }

    return {
      project,
      startDate: effectiveEarliest,
      endDate: latestDate!,
      markers,
      color: '#6366f1'
    };
  }

  private renderProjectBar(container: HTMLElement, bar: ProjectBar, totalDays: number) {
    const startIndex = this.getIndexFromDate(bar.startDate);
    const endIndex = this.getIndexFromDate(bar.endDate);

    // 只渲染可见范围内的部分
    const visibleStartIndex = Math.max(0, startIndex);
    const visibleEndIndex = Math.min(totalDays - 1, endIndex);

    // 如果完全不可见，跳过渲染
    if (visibleStartIndex > visibleEndIndex) {
      return;
    }

    const spanCells = visibleEndIndex - visibleStartIndex + 1;

    // 创建单一时间条
    const barEl = container.createDiv({ cls: 'avm-gantt-project-bar' });
    barEl.style.left = `${visibleStartIndex * this.cellWidth}px`;
    barEl.style.width = `${spanCells * this.cellWidth - 4}px`;
    barEl.style.backgroundColor = bar.color;
    barEl.style.height = '28px';
    barEl.style.top = '10px';
    barEl.style.borderRadius = '4px';

    // 在条形上渲染每个测试日期的菱形标记
    bar.markers.forEach(marker => {
      const markerIndex = this.getIndexFromDate(marker.date);
      // 只渲染在可见范围内的标记
      if (markerIndex >= visibleStartIndex && markerIndex <= visibleEndIndex) {
        const markerEl = barEl.createDiv({ cls: 'avm-gantt-marker' });
        const relativePos = (markerIndex - visibleStartIndex) / spanCells;
        markerEl.style.left = `${relativePos * 100}%`;
        markerEl.style.transform = 'translateX(-50%) translateY(-50%) rotate(45deg)';
        markerEl.style.backgroundColor = marker.color;
        markerEl.setAttribute('title', `${bar.project.name} - ${marker.label}\n${this.formatDate(marker.date)}`);
      }
    });

    // tooltip
    const markerDates = bar.markers.map(m => `${m.label}: ${this.formatDate(m.date)}`).join('\n');
    barEl.setAttribute('title', `${bar.project.name}\n${markerDates}`);

    // 右键菜单
    barEl.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.showProjectBarContextMenu(bar, e);
    });
  }

  private showProjectBarContextMenu(bar: ProjectBar, event: MouseEvent) {
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
