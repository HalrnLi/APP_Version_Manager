import { App as ObsidianApp, TFolder, normalizePath } from 'obsidian';
import AppVersionManagerPlugin from '../main';
import { App, Version, Project } from '../types';

const BACKUP_FOLDER = 'app-version-manager/backups';

export class BackupService {
  app: ObsidianApp;
  plugin: AppVersionManagerPlugin;
  private backupTimer: number | null = null;

  constructor(app: ObsidianApp, plugin: AppVersionManagerPlugin) {
    this.app = app;
    this.plugin = plugin;
  }

  async ensureBackupFolder() {
    const folder = this.app.vault.getAbstractFileByPath(BACKUP_FOLDER);
    if (!folder) {
      await this.app.vault.createFolder(BACKUP_FOLDER);
    }
  }

  scheduleBackup() {
    this.clearBackupSchedule();
    
    if (!this.plugin.settings.autoBackup) return;
    
    const now = new Date();
    const targetDay = this.plugin.settings.backupDay;
    const targetHour = this.plugin.settings.backupHour;
    
    let daysUntilTarget = targetDay - now.getDay();
    if (daysUntilTarget <= 0) {
      daysUntilTarget += 7;
    }
    
    const targetDate = new Date(now);
    targetDate.setDate(now.getDate() + daysUntilTarget);
    targetDate.setHours(targetHour, 0, 0, 0);
    
    const timeUntilBackup = targetDate.getTime() - now.getTime();
    
    this.backupTimer = window.setTimeout(async () => {
      await this.performBackup();
      this.scheduleBackup();
    }, timeUntilBackup);
  }

  clearBackupSchedule() {
    if (this.backupTimer) {
      window.clearTimeout(this.backupTimer);
      this.backupTimer = null;
    }
  }

  async performBackup(): Promise<string> {
    await this.ensureBackupFolder();
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFileName = `backup-${timestamp}.json`;
    const backupPath = normalizePath(`${BACKUP_FOLDER}/${backupFileName}`);
    
    const apps = await this.plugin.dataService.getAllApps();
    const versions = await this.plugin.dataService.getAllVersions();
    const projects = await this.plugin.dataService.getAllProjects();
    
    const backupData = {
      timestamp: new Date().toISOString(),
      apps,
      versions,
      projects
    };
    
    await this.app.vault.create(backupPath, JSON.stringify(backupData, null, 2));
    
    this.plugin.settings.lastBackupTime = new Date().toISOString();
    await this.plugin.saveSettings();
    
    await this.cleanOldBackups();
    
    return backupPath;
  }

  private async cleanOldBackups() {
    const folder = this.app.vault.getAbstractFileByPath(BACKUP_FOLDER) as TFolder;
    if (!folder) return;
    
    const backupFiles = folder.children
      .filter(f => f instanceof File && f.name.startsWith('backup-'))
      .sort((a, b) => b.name.localeCompare(a.name));
    
    const maxBackups = 10;
    if (backupFiles.length > maxBackups) {
      for (let i = maxBackups; i < backupFiles.length; i++) {
        await this.app.vault.delete(backupFiles[i] as any);
      }
    }
  }

  async restoreFromBackup(backupPath: string): Promise<boolean> {
    try {
      const file = this.app.vault.getAbstractFileByPath(backupPath);
      if (!file) return false;
      
      const content = await this.app.vault.read(file as any);
      const backupData = JSON.parse(content);
      
      const { apps, versions, projects } = backupData;
      
      for (const app of apps) {
        try {
          await this.plugin.dataService.createApp(app.name);
        } catch {
          await this.plugin.dataService.updateApp(app.id, app.name);
        }
      }
      
      for (const version of versions) {
        try {
          await this.plugin.dataService.createVersion(version);
        } catch {
          await this.plugin.dataService.updateVersion(version.id, version);
        }
      }
      
      for (const project of projects) {
        try {
          await this.plugin.dataService.createProject(project);
        } catch {
          await this.plugin.dataService.updateProject(project.id, project);
        }
      }
      
      return true;
    } catch {
      return false;
    }
  }

  async getBackupList(): Promise<{ name: string; path: string; date: Date }[]> {
    const folder = this.app.vault.getAbstractFileByPath(BACKUP_FOLDER) as TFolder;
    if (!folder) return [];
    
    return folder.children
      .filter(f => (f as any).extension === 'json' && f.name.startsWith('backup-'))
      .map(f => ({
        name: f.name,
        path: f.path,
        date: new Date((f as any).stat.mtime)
      }))
      .sort((a, b) => b.date.getTime() - a.date.getTime());
  }
}
