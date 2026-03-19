import { App, Plugin, PluginSettingTab, Setting, WorkspaceLeaf } from 'obsidian';
import { AppVersionManagerView, VIEW_TYPE_APP_VERSION_MANAGER } from './view/AppVersionManagerView';
import { PluginSettings, DEFAULT_SETTINGS } from './types';
import { DataService } from './services/DataService';
import { BackupService } from './services/BackupService';

const STYLE_ID = 'app-version-manager-styles';

export default class AppVersionManagerPlugin extends Plugin {
  settings: PluginSettings;
  dataService: DataService;
  backupService: BackupService;

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
    const data = await this.loadData() || {};
    Object.assign(data, this.settings);
    await this.saveData(data);
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
      .setDesc('在文件管理器中打开数据存储目录')
      .addButton(btn => btn
        .setButtonText('打开数据目录')
        .onClick(() => {
          const dataFolder = this.app.vault.getAbstractFileByPath('app-version-manager');
          if (dataFolder) {
            (this.app as any).showInFolder(dataFolder.path);
          } else {
            alert('数据目录尚未创建，请先创建一些数据后再试');
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
  }
}
