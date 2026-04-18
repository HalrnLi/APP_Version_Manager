import { App, Plugin, PluginSettingTab, Setting, WorkspaceLeaf, Modal, Notice } from 'obsidian';
import { AppVersionManagerView, VIEW_TYPE_APP_VERSION_MANAGER } from './view/AppVersionManagerView';
import { PluginSettings, DEFAULT_SETTINGS, ProgressStage, DEFAULT_PROGRESS_STAGES } from './types';
import { DataService } from './services/DataService';
import { BackupService } from './services/BackupService';

const STYLE_ID = 'app-version-manager-styles';

export default class AppVersionManagerPlugin extends Plugin {
  settings: PluginSettings;
  dataService: DataService;
  backupService: BackupService;
  private saveSettingsQueue: Promise<void> = Promise.resolve();

  async onload() {
    await this.loadSettings();
    
    this.injectStyles();
    
    this.dataService = new DataService(this.app, this);
    this.backupService = new BackupService(this.app, this);

    this.registerView(
      VIEW_TYPE_APP_VERSION_MANAGER,
      (leaf) => new AppVersionManagerView(leaf, this)
    );

    this.addRibbonIcon('layers', 'APP Version Manager', () => {
      this.activateView();
    });

    this.addCommand({
      id: 'open-app-version-manager',
      name: 'Open APP Version Manager',
      callback: () => this.activateView(),
      hotkeys: [{ modifiers: ['Mod', 'Shift'], key: 'v' }]
    });

    this.addCommand({
      id: 'create-new-version',
      name: 'Create New Version',
      callback: () => {
        this.app.workspace.trigger('app-version-manager:create-version');
      },
      hotkeys: [{ modifiers: ['Mod', 'Shift'], key: 'n' }]
    });

    this.addCommand({
      id: 'create-new-project',
      name: 'Create New Project',
      callback: () => {
        this.app.workspace.trigger('app-version-manager:create-project');
      },
      hotkeys: [{ modifiers: ['Mod', 'Alt'], key: 'n' }]
    });

    this.addSettingTab(new AppVersionManagerSettingTab(this.app, this));

    this.app.workspace.onLayoutReady(() => {
      this.backupService.scheduleBackup();
    });
  }

  onunload() {
    (this.app.workspace as any).unregisterViewType?.(VIEW_TYPE_APP_VERSION_MANAGER);
    this.backupService.clearBackupSchedule();
    this.removeStyles();
  }

  injectStyles() {
    const styleEl = document.createElement('style');
    styleEl.id = STYLE_ID;
    styleEl.textContent = `
.app-version-manager {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 0;
  font-size: 14px;
}

.avm-header {
  padding: 12px;
  border-bottom: 1px solid var(--background-modifier-border);
  background: var(--background-primary);
}

.avm-top-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  gap: 12px;
}

.avm-app-selector {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
}

.avm-app-actions {
  display: flex;
  gap: 4px;
}

.avm-view-switcher {
  display: flex;
  gap: 4px;
}

.avm-view-btn-active {
  background: var(--interactive-accent) !important;
  color: var(--text-on-accent) !important;
}

.avm-filter-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.avm-search-input {
  flex: 1;
  min-width: 150px;
  padding: 6px 12px;
  border: 1px solid var(--background-modifier-border);
  border-radius: 4px;
  background: var(--background-primary);
  color: var(--text-normal);
  font-size: 13px;
}

.avm-search-input:focus {
  outline: none;
  border-color: var(--interactive-accent);
}

.avm-select {
  padding: 6px 12px;
  border: 1px solid var(--background-modifier-border);
  border-radius: 4px;
  background: var(--background-primary);
  color: var(--text-normal);
  font-size: 13px;
  cursor: pointer;
}

.avm-select:focus {
  outline: none;
  border-color: var(--interactive-accent);
}

.avm-saved-filter {
  min-width: 120px;
}

.avm-filter-actions {
  display: flex;
  gap: 4px;
}

.avm-action-buttons {
  display: flex;
  gap: 4px;
  margin-left: auto;
}

.avm-main {
  flex: 1;
  overflow: hidden;
}

.avm-dual-pane {
  display: flex;
  height: 100%;
}

.avm-left-pane {
  width: 280px;
  border-right: 1px solid var(--background-modifier-border);
  display: flex;
  flex-direction: column;
  background: var(--background-secondary);
}

.avm-right-pane {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.avm-pane-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  border-bottom: 1px solid var(--background-modifier-border);
}

.avm-pane-header h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
}

.avm-version-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.avm-version-item {
  padding: 10px 12px;
  border-radius: 6px;
  cursor: pointer;
  margin-bottom: 4px;
  transition: background-color 0.15s;
}

.avm-version-item:hover {
  background: var(--background-modifier-hover);
}

.avm-version-item.avm-selected {
  background: var(--interactive-accent);
  color: var(--text-on-accent);
}

.avm-version-item.avm-archived {
  opacity: 0.6;
}

.avm-version-number {
  font-weight: 600;
  font-size: 13px;
}

.avm-version-meta {
  font-size: 12px;
  opacity: 0.7;
  margin-top: 4px;
}

.avm-archived-header {
  padding: 8px 12px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted);
  margin-top: 12px;
  border-top: 1px solid var(--background-modifier-border);
}

.avm-project-list {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
}

.avm-project-item {
  padding: 12px;
  border: 1px solid var(--background-modifier-border);
  border-radius: 8px;
  margin-bottom: 8px;
  background: var(--background-primary);
}

.avm-project-item.avm-overdue {
  border-color: #ef4444;
  background: rgba(239, 68, 68, 0.05);
}

.avm-project-item.avm-highlighted-row {
  border-color: #ef4444;
  border-width: 2px;
  background: rgba(239, 68, 68, 0.08);
}

.avm-project-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.avm-project-name {
  font-weight: 600;
  font-size: 14px;
}

.avm-progress-badge {
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 11px;
  color: white;
  font-weight: 500;
}

.avm-progress-badge-small {
  padding: 2px 6px;
  border-radius: 10px;
  font-size: 10px;
  color: white;
  font-weight: 500;
  display: inline-block;
}

.avm-clickable {
  cursor: pointer;
  transition: transform 0.1s, opacity 0.1s;
}

.avm-clickable:hover {
  opacity: 0.8;
  transform: scale(1.05);
}

.avm-progress-confirm-modal .avm-confirm-info {
  padding: 16px 0;
}

.avm-progress-confirm-modal .avm-confirm-project {
  font-size: 14px;
  margin-bottom: 20px;
  padding: 12px;
  background: var(--background-secondary);
  border-radius: 8px;
}

.avm-progress-confirm-modal .avm-confirm-label {
  color: var(--text-muted);
  font-size: 12px;
  margin-bottom: 4px;
}

.avm-progress-confirm-modal .avm-confirm-progress {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 20px;
  padding: 16px 0;
}

.avm-progress-confirm-modal .avm-progress-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.avm-progress-confirm-modal .avm-progress-arrow {
  font-size: 24px;
  color: var(--text-muted);
}

.avm-project-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  font-size: 12px;
  color: var(--text-muted);
  margin-bottom: 8px;
}

.avm-meta-item {
  display: flex;
  align-items: center;
  gap: 4px;
}

.avm-overdue-text {
  color: #ef4444;
  font-weight: 500;
}

.avm-project-links {
  display: flex;
  gap: 12px;
}

.avm-link {
  color: var(--interactive-accent);
  text-decoration: none;
  font-size: 12px;
  cursor: pointer;
}

.avm-link:hover {
  text-decoration: underline;
}

.avm-link-small {
  color: var(--interactive-accent);
  text-decoration: none;
  font-size: 11px;
  cursor: pointer;
  margin-right: 8px;
}

.avm-link-small:hover {
  text-decoration: underline;
}

.avm-project-requirements {
  font-size: 12px;
  color: var(--text-muted);
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--background-modifier-border);
}

.avm-empty-state {
  text-align: center;
  padding: 24px;
  color: var(--text-muted);
  font-size: 13px;
}

.avm-kanban {
  display: flex;
  height: 100%;
  overflow-x: auto;
  padding: 12px;
  gap: 12px;
}

.avm-kanban-column {
  min-width: 250px;
  max-width: 300px;
  background: var(--background-secondary);
  border-radius: 8px;
  display: flex;
  flex-direction: column;
}

.avm-kanban-column-header {
  padding: 12px;
  border-bottom: 1px solid var(--background-modifier-border);
  display: flex;
  align-items: center;
  gap: 8px;
}

.avm-kanban-column-title {
  font-weight: 600;
  font-size: 13px;
}

.avm-kanban-column-count {
  background: var(--background-modifier-border);
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 11px;
  color: var(--text-muted);
}

.avm-kanban-column-indicator {
  width: 4px;
  height: 16px;
  border-radius: 2px;
  margin-left: auto;
}

.avm-kanban-cards {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.avm-kanban-empty {
  text-align: center;
  padding: 16px;
  color: var(--text-muted);
  font-size: 12px;
}

.avm-kanban-card {
  background: var(--background-primary);
  border: 1px solid var(--background-modifier-border);
  border-radius: 6px;
  padding: 10px;
  margin-bottom: 8px;
  cursor: pointer;
  transition: box-shadow 0.15s;
}

.avm-kanban-card:hover {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.avm-kanban-card.avm-overdue {
  border-color: #ef4444;
}

.avm-kanban-card.avm-highlighted-row {
  border-color: #ef4444;
  border-width: 2px;
  background: rgba(239, 68, 68, 0.05);
}

.avm-card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 6px;
}

.avm-card-title {
  font-weight: 600;
  font-size: 13px;
  flex: 1;
}

.avm-card-version {
  font-size: 11px;
  color: var(--text-muted);
  background: var(--background-modifier-border);
  padding: 2px 6px;
  border-radius: 4px;
}

.avm-card-meta {
  font-size: 12px;
  color: var(--text-muted);
  margin-bottom: 4px;
}

.avm-card-links {
  display: flex;
  gap: 8px;
  margin-top: 6px;
}

.avm-table-view {
  height: 100%;
  overflow: auto;
}

.avm-table-wrapper {
  min-width: 100%;
}

.avm-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.avm-table th {
  text-align: left;
  padding: 12px;
  background: var(--background-secondary);
  border-bottom: 2px solid var(--background-modifier-border);
  font-weight: 600;
  position: sticky;
  top: 0;
  z-index: 1;
}

.avm-table td {
  padding: 10px 12px;
  border-bottom: 1px solid var(--background-modifier-border);
  vertical-align: middle;
}

.avm-table tr:hover {
  background: var(--background-modifier-hover);
}

.avm-table tr.avm-overdue-row {
  background: rgba(239, 68, 68, 0.05);
}

.avm-table tr.avm-overdue-row:hover {
  background: rgba(239, 68, 68, 0.1);
}

.avm-table tr.avm-highlighted-row {
  background: rgba(239, 68, 68, 0.1);
  border-left: 3px solid #ef4444;
}

.avm-table tr.avm-highlighted-row:hover {
  background: rgba(239, 68, 68, 0.15);
}

.avm-cell-name {
  font-weight: 500;
}

.avm-cell-links {
  display: flex;
  gap: 8px;
}

.avm-cell-actions {
  display: flex;
  gap: 4px;
}

.avm-btn-small {
  padding: 4px 8px;
  border: none;
  background: var(--background-modifier-border);
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
}

.avm-btn-small:hover {
  background: var(--background-modifier-hover);
}

.avm-btn-danger:hover {
  background: rgba(239, 68, 68, 0.2);
}

.avm-modal {
  padding: 20px;
}

.avm-modal h2 {
  margin-top: 0;
  margin-bottom: 20px;
  font-size: 18px;
}

.avm-modal .setting-item-control input[type="text"],
.avm-modal .setting-item-control textarea,
.avm-modal .setting-item-control select {
  width: 280px;
}

.avm-modal .setting-item-control textarea {
  min-height: 60px;
  resize: vertical;
}

.theme-dark .avm-kanban-card:hover {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
}

.theme-dark .avm-project-item.avm-overdue,
.theme-dark .avm-table tr.avm-overdue-row {
  background: rgba(239, 68, 68, 0.1);
}

.app-version-manager ::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

.app-version-manager ::-webkit-scrollbar-track {
  background: transparent;
}

.app-version-manager ::-webkit-scrollbar-thumb {
  background: var(--background-modifier-border);
  border-radius: 4px;
}

.app-version-manager ::-webkit-scrollbar-thumb:hover {
  background: var(--text-muted);
}

/* Gantt View */
.avm-gantt {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.avm-gantt-header {
  padding: 12px;
  border-bottom: 1px solid var(--background-modifier-border);
  background: var(--background-primary);
}

.avm-gantt-title {
  font-size: 16px;
  font-weight: 600;
}

.avm-gantt-chart {
  flex: 1;
  overflow: auto;
  padding: 12px;
}

.avm-gantt-timeline-header {
  display: flex;
  position: sticky;
  top: 0;
  z-index: 10;
  background: var(--background-secondary);
  border-bottom: 1px solid var(--background-modifier-border);
}

.avm-gantt-row-header {
  width: 200px;
  min-width: 200px;
  padding: 8px 12px;
  border-right: 1px solid var(--background-modifier-border);
  background: var(--background-secondary);
}

.avm-gantt-col-header {
  height: 40px;
  display: flex;
  align-items: center;
  font-weight: 600;
  font-size: 13px;
}

.avm-gantt-timeline {
  display: flex;
  flex: 1;
  overflow-x: hidden;
}

.avm-gantt-day-cell {
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-right: 1px solid var(--background-modifier-border);
  font-size: 11px;
  color: var(--text-muted);
}

.avm-gantt-day-cell.avm-gantt-weekend {
  background: var(--background-modifier-hover);
}

.avm-gantt-day-cell.avm-gantt-today {
  background: rgba(99, 102, 241, 0.2);
  color: var(--interactive-accent);
  font-weight: 600;
}

.avm-gantt-date-label {
  white-space: nowrap;
}

.avm-gantt-row {
  display: flex;
  border-bottom: 1px solid var(--background-modifier-border);
  min-height: 50px;
}

.avm-gantt-row:hover {
  background: var(--background-modifier-hover);
}

.avm-gantt-row-header {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 2px;
}

.avm-gantt-project-name {
  font-weight: 500;
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.avm-gantt-project-version {
  font-size: 11px;
  color: var(--text-muted);
}

.avm-gantt-bars {
  flex: 1;
  position: relative;
  min-height: 40px;
  padding: 4px 0;
}

.avm-gantt-bar {
  position: absolute;
  height: 24px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  padding: 0 8px;
  cursor: pointer;
  transition: opacity 0.15s;
  overflow: hidden;
}

.avm-gantt-bar:hover {
  opacity: 0.85;
}

.avm-gantt-bar-label {
  font-size: 11px;
  color: white;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.avm-gantt-empty {
  text-align: center;
  padding: 48px;
  color: var(--text-muted);
  font-size: 14px;
}

.theme-dark .avm-gantt-day-cell.avm-gantt-today {
  background: rgba(99, 102, 241, 0.3);
}
`;
    document.head.appendChild(styleEl);
  }

  removeStyles() {
    const styleEl = document.getElementById(STYLE_ID);
    if (styleEl) {
      styleEl.remove();
    }
  }

  async loadSettings() {
    const data = await this.loadData() || {};
    this.settings = Object.assign({}, DEFAULT_SETTINGS, data);
  }

  async saveSettings() {
    this.saveSettingsQueue = this.saveSettingsQueue
      .catch(() => {
        // Keep the queue alive even if a previous save failed.
      })
      .then(async () => {
        const data = await this.loadData() || {};
        Object.assign(data, this.settings);
        await this.saveData(data);
      });
    await this.saveSettingsQueue;
  }

  async activateView() {
    const { workspace } = this.app;
    
    let leaf: WorkspaceLeaf | null = null;
    const leaves = workspace.getLeavesOfType(VIEW_TYPE_APP_VERSION_MANAGER);
    
    if (leaves.length > 0) {
      leaf = leaves[0];
    } else {
      leaf = workspace.getLeftLeaf(false);
      if (leaf) {
        await leaf.setViewState({
          type: VIEW_TYPE_APP_VERSION_MANAGER,
          active: true
        });
      }
    }
    
    if (leaf) {
      workspace.revealLeaf(leaf);
    }
  }
}

class AppVersionManagerSettingTab extends PluginSettingTab {
  plugin: AppVersionManagerPlugin;

  constructor(app: App, plugin: AppVersionManagerPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName('数据存储路径')
      .setDesc('设置插件数据存储的根目录路径。支持相对路径（相对于vault根目录）或绝对路径')
      .addText(text => text
        .setPlaceholder('app-version-manager 或 C:\\MyData\\app-versions')
        .setValue(this.plugin.settings.dataPath)
        .onChange(async (value) => {
          const newPath = value.trim() || 'app-version-manager';
          if (newPath !== this.plugin.settings.dataPath) {
            this.plugin.settings.dataPath = newPath;
            await this.plugin.saveSettings();
            // 重新初始化数据服务以使用新路径
            this.plugin.dataService = new DataService(this.app, this.plugin);
          }
        }));

    new Setting(containerEl)
      .setName('打开数据目录')
      .setDesc('在文件管理器中打开数据存储目录')
      .addButton(btn => btn
        .setButtonText('打开数据目录')
        .onClick(() => {
          const dataPath = this.plugin.settings.dataPath;
          if (this.plugin.dataService.isAbsolutePath()) {
            // 对于绝对路径，使用系统默认方式打开文件夹
            // 这里我们不能直接打开，但可以显示路径
            new Notice(`数据存储路径: ${dataPath}\n\n请手动在文件管理器中打开此路径。`);
          } else {
            const dataFolder = this.app.vault.getAbstractFileByPath(dataPath);
            if (dataFolder) {
              const appWithShowInFolder = this.app as App & { showInFolder?: (path: string) => void };
              if (typeof appWithShowInFolder.showInFolder === 'function') {
                appWithShowInFolder.showInFolder(dataFolder.path);
              } else {
                new Notice('当前环境不支持打开系统文件管理器');
              }
            } else {
              new Notice('数据目录尚未创建，请先创建一些数据后再试');
            }
          }
        }));

    new Setting(containerEl)
      .setName('Auto Backup')
      .setDesc('Enable automatic weekly backup')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.autoBackup)
        .onChange(async (value) => {
          this.plugin.settings.autoBackup = value;
          await this.plugin.saveSettings();
          if (value) {
            this.plugin.backupService.scheduleBackup();
          } else {
            this.plugin.backupService.clearBackupSchedule();
          }
        }));

    new Setting(containerEl)
      .setName('备份路径')
      .setDesc('备份文件存储路径，不填则默认为笔记根目录下的 app-version-manager/backups 文件夹')
      .addText(text => text
        .setPlaceholder('app-version-manager/backups 或留空使用默认路径')
        .setValue(this.plugin.settings.backupPath)
        .onChange(async (value) => {
          this.plugin.settings.backupPath = value.trim();
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('手动备份')
      .setDesc('立即创建一个备份文件')
      .addButton(btn => btn
        .setButtonText('立即备份')
        .onClick(async () => {
          try {
            const backupPath = await this.plugin.backupService.performBackup();
            new Notice(`备份成功！\n备份文件：${backupPath}`);
          } catch (error) {
            new Notice(`备份失败：${error instanceof Error ? error.message : String(error)}`);
          }
        }));

    new Setting(containerEl)
      .setName('Backup Day')
      .setDesc('Day of week for backup (0=Sunday, 5=Friday)')
      .addSlider(slider => slider
        .setLimits(0, 6, 1)
        .setValue(this.plugin.settings.backupDay)
        .setDynamicTooltip()
        .onChange(async (value) => {
          this.plugin.settings.backupDay = value;
          await this.plugin.saveSettings();
          this.plugin.backupService.scheduleBackup();
        }));

    new Setting(containerEl)
      .setName('Backup Hour')
      .setDesc('Hour of day for backup (0-23)')
      .addSlider(slider => slider
        .setLimits(0, 23, 1)
        .setValue(this.plugin.settings.backupHour)
        .setDynamicTooltip()
        .onChange(async (value) => {
          this.plugin.settings.backupHour = value;
          await this.plugin.saveSettings();
          this.plugin.backupService.scheduleBackup();
        }));

    containerEl.createEl('h3', { text: '延期预警设置' });

    new Setting(containerEl)
      .setName('预警天数')
      .setDesc('项目在截止日期前多少天内显示预警（1-14天）')
      .addSlider(slider => slider
        .setLimits(1, 14, 1)
        .setValue(this.plugin.settings.overdueWarningDays)
        .setDynamicTooltip()
        .onChange(async (value) => {
          this.plugin.settings.overdueWarningDays = value;
          await this.plugin.saveSettings();
        }));

    containerEl.createEl('h3', { text: '项目进度阶段配置' });
    
    const progressDesc = containerEl.createDiv({ cls: 'avm-progress-desc' });
    progressDesc.style.marginBottom = '12px';
    progressDesc.style.color = 'var(--text-muted)';
    progressDesc.style.fontSize = '13px';
    progressDesc.setText('自定义项目进度的各个阶段名称和颜色。阶段的顺序即为项目流程的顺序。');

    this.renderProgressStagesSettings(containerEl);

    new Setting(containerEl)
      .setName('添加新阶段')
      .addButton(btn => btn
        .setButtonText('添加阶段')
        .onClick(() => {
          const stages = this.plugin.settings.progressStages;
          const newColor = this.generateRandomColor();
          stages.push({ name: `新阶段${stages.length + 1}`, color: newColor });
          this.plugin.settings.progressStages = stages;
          this.plugin.saveSettings();
          this.display();
        }));

    new Setting(containerEl)
      .setName('重置为默认阶段')
      .setDesc('恢复默认的项目进度阶段配置')
      .addButton(btn => btn
        .setButtonText('重置')
        .setWarning()
        .onClick(() => {
          this.plugin.settings.progressStages = JSON.parse(JSON.stringify(DEFAULT_PROGRESS_STAGES));
          this.plugin.saveSettings();
          this.display();
        }));
  }

  private renderProgressStagesSettings(containerEl: HTMLElement) {
    const stages = this.plugin.settings.progressStages;
    
    stages.forEach((stage, index) => {
      const setting = new Setting(containerEl)
        .setName(`阶段 ${index + 1}`)
        .setClass('avm-progress-stage-setting');

      setting.addText(text => text
        .setValue(stage.name)
        .setPlaceholder('阶段名称')
        .onChange(async (value) => {
          stages[index].name = value;
          this.plugin.settings.progressStages = stages;
          await this.plugin.saveSettings();
        }));

      setting.addColorPicker(picker => picker
        .setValue(stage.color)
        .onChange(async (value) => {
          stages[index].color = value;
          this.plugin.settings.progressStages = stages;
          await this.plugin.saveSettings();
        }));

      if (stages.length > 1) {
        setting.addExtraButton(btn => btn
          .setIcon('arrow-up')
          .setTooltip('上移')
          .onClick(async () => {
            if (index > 0) {
              [stages[index - 1], stages[index]] = [stages[index], stages[index - 1]];
              this.plugin.settings.progressStages = stages;
              await this.plugin.saveSettings();
              this.display();
            }
          }));

        setting.addExtraButton(btn => btn
          .setIcon('arrow-down')
          .setTooltip('下移')
          .onClick(async () => {
            if (index < stages.length - 1) {
              [stages[index], stages[index + 1]] = [stages[index + 1], stages[index]];
              this.plugin.settings.progressStages = stages;
              await this.plugin.saveSettings();
              this.display();
            }
          }));
      }

      setting.addExtraButton(btn => btn
        .setIcon('trash')
        .setTooltip('删除')
        .onClick(async () => {
          if (stages.length > 1) {
            stages.splice(index, 1);
            this.plugin.settings.progressStages = stages;
            await this.plugin.saveSettings();
            this.display();
          } else {
            new Notice('至少需要保留一个阶段');
          }
        }));
    });
  }

  private generateRandomColor(): string {
    const colors = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#3b82f6', '#10b981', '#ef4444', '#f97316', '#14b8a6', '#64748b'];
    return colors[Math.floor(Math.random() * colors.length)];
  }
}
