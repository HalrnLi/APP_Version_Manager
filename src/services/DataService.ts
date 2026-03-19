import { App as ObsidianApp, TFile, TFolder, normalizePath } from 'obsidian';
import AppVersionManagerPlugin from '../main';
import { App, Version, Project, ProjectProgress, ProgressHistoryItem, ConcurrencyConflictError } from '../types';

const APPS_FOLDER = 'app-version-manager/apps';
const VERSIONS_FOLDER = 'app-version-manager/versions';
const PROJECTS_FOLDER = 'app-version-manager/projects';
const MEMOS_FOLDER = 'app-version-manager/memos';

export class DataService {
  app: ObsidianApp;
  plugin: AppVersionManagerPlugin;

  constructor(app: ObsidianApp, plugin: AppVersionManagerPlugin) {
    this.app = app;
    this.plugin = plugin;
  }

  private async ensureFolder(path: string) {
    const folder = this.app.vault.getAbstractFileByPath(path);
    if (!folder) {
      await this.app.vault.createFolder(path);
    }
  }

  private generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  async initializeDataFolders() {
    await this.ensureFolder(APPS_FOLDER);
    await this.ensureFolder(VERSIONS_FOLDER);
    await this.ensureFolder(PROJECTS_FOLDER);
    await this.ensureFolder(MEMOS_FOLDER);
  }

  async getAllApps(): Promise<App[]> {
    await this.initializeDataFolders();
    const apps: App[] = [];
    const folder = this.app.vault.getAbstractFileByPath(APPS_FOLDER) as TFolder;
    
    if (!folder) return apps;
    
    for (const file of folder.children) {
      if (file instanceof TFile && file.extension === 'md') {
        const app = await this.parseAppFile(file);
        if (app) apps.push(app);
      }
    }
    
    return apps.sort((a, b) => a.name.localeCompare(b.name));
  }

  private async parseAppFile(file: TFile): Promise<App | null> {
    try {
      const content = await this.app.vault.read(file);
      const frontmatter = this.parseFrontmatter(content);
      if (!frontmatter) return null;
      
      return {
        id: frontmatter.id || file.basename,
        name: frontmatter.name || file.basename,
        createdAt: frontmatter.createdAt || file.stat.ctime.toString(),
        updatedAt: frontmatter.updatedAt || file.stat.mtime.toString(),
        version: frontmatter.version || 1
      };
    } catch {
      return null;
    }
  }

  private parseFrontmatter(content: string): Record<string, any> | null {
    const match = content.match(/^---\n([\s\S]*?)\n---/);
    if (!match) return {};
    
    const frontmatter: Record<string, any> = {};
    const lines = match[1].split('\n');
    
    for (const line of lines) {
      const colonIndex = line.indexOf(':');
      if (colonIndex > 0) {
        const key = line.substring(0, colonIndex).trim();
        let value: any = line.substring(colonIndex + 1).trim();
        
        if (value.startsWith('[') && value.endsWith(']')) {
          value = value.slice(1, -1).split(',').map((v: string) => v.trim()).filter((v: string) => v);
        } else if (value === 'true') {
          value = true;
        } else if (value === 'false') {
          value = false;
        }
        
        frontmatter[key] = value;
      }
    }
    
    return frontmatter;
  }

  private createFrontmatter(data: Record<string, any>): string {
    let fm = '---\n';
    for (const [key, value] of Object.entries(data)) {
      if (Array.isArray(value)) {
        fm += `${key}: [${value.join(', ')}]\n`;
      } else if (typeof value === 'string' && value.includes('\n')) {
        fm += `${key}: |\n  ${value.replace(/\n/g, '\n  ')}\n`;
      } else {
        fm += `${key}: ${value}\n`;
      }
    }
    fm += '---\n\n';
    return fm;
  }

  async createApp(name: string): Promise<App> {
    await this.initializeDataFolders();
    
    const apps = await this.getAllApps();
    if (apps.some(a => a.name === name)) {
      throw new Error('APP name already exists');
    }
    
    const id = this.generateId();
    const now = Date.now().toString();
    const app: App = { id, name, createdAt: now, updatedAt: now, version: 1 };
    
    const frontmatter = this.createFrontmatter({
      id: app.id,
      name: app.name,
      createdAt: app.createdAt,
      updatedAt: app.updatedAt,
      version: app.version
    });
    
    const fileName = this.sanitizeFileName(name);
    await this.app.vault.create(normalizePath(`${APPS_FOLDER}/${fileName}.md`), frontmatter);
    
    return app;
  }

  async updateApp(id: string, name: string, expectedVersion?: number): Promise<App | null> {
    const apps = await this.getAllApps();
    const app = apps.find(a => a.id === id);
    if (!app) return null;
    
    if (expectedVersion !== undefined && app.version !== expectedVersion) {
      throw new ConcurrencyConflictError(`APP: ${app.name}`, app.version, expectedVersion);
    }
    
    if (apps.some(a => a.name === name && a.id !== id)) {
      throw new Error('APP name already exists');
    }
    
    const oldName = app.name;
    app.name = name;
    app.updatedAt = Date.now().toString();
    app.version = (app.version || 1) + 1;
    
    const oldFileName = this.sanitizeFileName(oldName);
    const newFileName = this.sanitizeFileName(name);
    
    const oldPath = normalizePath(`${APPS_FOLDER}/${oldFileName}.md`);
    const file = this.app.vault.getAbstractFileByPath(oldPath) as TFile;
    
    if (file) {
      const frontmatter = this.createFrontmatter({
        id: app.id,
        name: app.name,
        createdAt: app.createdAt,
        updatedAt: app.updatedAt,
        version: app.version
      });
      
      await this.app.vault.modify(file, frontmatter);
      
      if (oldFileName !== newFileName) {
        const newPath = normalizePath(`${APPS_FOLDER}/${newFileName}.md`);
        await this.app.vault.rename(file, newPath);
      }
    }
    
    return app;
  }

  async deleteApp(id: string): Promise<boolean> {
    const apps = await this.getAllApps();
    const app = apps.find(a => a.id === id);
    if (!app) return false;
    
    const versions = await this.getVersionsByAppId(id);
    for (const version of versions) {
      await this.deleteVersion(version.id);
    }
    
    const fileName = this.sanitizeFileName(app.name);
    const filePath = normalizePath(`${APPS_FOLDER}/${fileName}.md`);
    const file = this.app.vault.getAbstractFileByPath(filePath);
    
    if (file instanceof TFile) {
      await this.app.vault.delete(file);
    }
    
    return true;
  }

  async getVersionsByAppId(appId: string): Promise<Version[]> {
    await this.initializeDataFolders();
    const versions: Version[] = [];
    const folder = this.app.vault.getAbstractFileByPath(VERSIONS_FOLDER) as TFolder;
    
    if (!folder) return versions;
    
    for (const file of folder.children) {
      if (file instanceof TFile && file.extension === 'md') {
        const version = await this.parseVersionFile(file);
        if (version && version.appId === appId) {
          versions.push(version);
        }
      }
    }
    
    return versions.sort((a, b) => this.compareVersions(b.versionNumber, a.versionNumber));
  }

  private compareVersions(a: string, b: string): number {
    const partsA = a.split('.').map(Number);
    const partsB = b.split('.').map(Number);
    const maxLength = Math.max(partsA.length, partsB.length);
    
    for (let i = 0; i < maxLength; i++) {
      const numA = partsA[i] || 0;
      const numB = partsB[i] || 0;
      if (numA !== numB) return numA - numB;
    }
    return 0;
  }

  private async parseVersionFile(file: TFile): Promise<Version | null> {
    try {
      const content = await this.app.vault.read(file);
      const frontmatter = this.parseFrontmatter(content);
      if (!frontmatter || !frontmatter.appId) return null;
      
      return {
        id: frontmatter.id || file.basename,
        appId: frontmatter.appId,
        versionNumber: frontmatter.versionNumber || '',
        bllVersion: frontmatter.bllVersion || '',
        ippVersion: frontmatter.ippVersion || '',
        webVersion: frontmatter.webVersion || '',
        updateContent: frontmatter.updateContent || '',
        isArchived: frontmatter.isArchived === true,
        createdAt: frontmatter.createdAt || file.stat.ctime.toString(),
        updatedAt: frontmatter.updatedAt || file.stat.mtime.toString(),
        version: frontmatter.version || 1
      };
    } catch {
      return null;
    }
  }

  async createVersion(data: {
    appId: string;
    versionNumber: string;
    bllVersion: string;
    ippVersion: string;
    webVersion: string;
    updateContent?: string;
  }): Promise<Version> {
    await this.initializeDataFolders();
    
    const existingVersions = await this.getVersionsByAppId(data.appId);
    if (existingVersions.some(v => v.versionNumber === data.versionNumber)) {
      throw new Error('Version number already exists for this APP');
    }
    
    const id = this.generateId();
    const now = Date.now().toString();
    const version: Version = {
      id,
      ...data,
      updateContent: data.updateContent || '',
      isArchived: false,
      createdAt: now,
      updatedAt: now,
      version: 1
    };
    
    const frontmatter = this.createFrontmatter({
      id: version.id,
      appId: version.appId,
      versionNumber: version.versionNumber,
      bllVersion: version.bllVersion,
      ippVersion: version.ippVersion,
      webVersion: version.webVersion,
      updateContent: version.updateContent,
      isArchived: version.isArchived,
      createdAt: version.createdAt,
      updatedAt: version.updatedAt,
      version: version.version
    });
    
    const app = (await this.getAllApps()).find(a => a.id === data.appId);
    const appName = app ? this.sanitizeFileName(app.name) : 'unknown';
    const versionNum = this.sanitizeFileName(data.versionNumber);
    const fileName = `${appName}_${versionNum}`;
    
    await this.app.vault.create(normalizePath(`${VERSIONS_FOLDER}/${fileName}.md`), frontmatter);
    
    return version;
  }

  async updateVersion(id: string, data: Partial<Version>, expectedVersion?: number): Promise<Version | null> {
    const allVersions = await this.getAllVersions();
    const version = allVersions.find(v => v.id === id);
    if (!version) return null;
    
    if (expectedVersion !== undefined && version.version !== expectedVersion) {
      throw new ConcurrencyConflictError(`版本: ${version.versionNumber}`, version.version, expectedVersion);
    }
    
    if (data.versionNumber && data.versionNumber !== version.versionNumber) {
      const appVersions = await this.getVersionsByAppId(version.appId);
      if (appVersions.some(v => v.versionNumber === data.versionNumber && v.id !== id)) {
        throw new Error('Version number already exists for this APP');
      }
    }
    
    Object.assign(version, data, { updatedAt: Date.now().toString() });
    version.version = (version.version || 1) + 1;
    
    const app = (await this.getAllApps()).find(a => a.id === version.appId);
    const appName = app ? this.sanitizeFileName(app.name) : 'unknown';
    const versionNum = this.sanitizeFileName(version.versionNumber);
    const fileName = `${appName}_${versionNum}`;
    
    const files = (this.app.vault.getAbstractFileByPath(VERSIONS_FOLDER) as TFolder)?.children || [];
    const file = files.find(f => f instanceof TFile && f.basename.startsWith(`${appName}_`)) as TFile;
    
    if (file) {
      const frontmatter = this.createFrontmatter({
        id: version.id,
        appId: version.appId,
        versionNumber: version.versionNumber,
        bllVersion: version.bllVersion,
        ippVersion: version.ippVersion,
        webVersion: version.webVersion,
        updateContent: version.updateContent,
        isArchived: version.isArchived,
        createdAt: version.createdAt,
        updatedAt: version.updatedAt,
        version: version.version
      });
      
      await this.app.vault.modify(file, frontmatter);
      
      if (file.basename !== fileName) {
        await this.app.vault.rename(file, normalizePath(`${VERSIONS_FOLDER}/${fileName}.md`));
      }
    }
    
    return version;
  }

  async deleteVersion(id: string): Promise<boolean> {
    const allVersions = await this.getAllVersions();
    const version = allVersions.find(v => v.id === id);
    if (!version) return false;
    
    const projects = await this.getProjectsByVersionId(id);
    for (const project of projects) {
      await this.updateProject(project.id, { versionId: '' });
    }
    
    const files = (this.app.vault.getAbstractFileByPath(VERSIONS_FOLDER) as TFolder)?.children || [];
    const file = files.find(f => f instanceof TFile && this.parseVersionFile(f as TFile).then(v => v?.id === id));
    
    for (const f of files) {
      if (f instanceof TFile) {
        const v = await this.parseVersionFile(f);
        if (v?.id === id) {
          await this.app.vault.delete(f);
          return true;
        }
      }
    }
    
    return false;
  }

  async getAllVersions(): Promise<Version[]> {
    await this.initializeDataFolders();
    const versions: Version[] = [];
    const folder = this.app.vault.getAbstractFileByPath(VERSIONS_FOLDER) as TFolder;
    
    if (!folder) return versions;
    
    for (const file of folder.children) {
      if (file instanceof TFile && file.extension === 'md') {
        const version = await this.parseVersionFile(file);
        if (version) versions.push(version);
      }
    }
    
    return versions;
  }

  async archiveVersion(id: string, expectedVersion?: number): Promise<Version | null> {
    return this.updateVersion(id, { isArchived: true }, expectedVersion);
  }

  async unarchiveVersion(id: string, expectedVersion?: number): Promise<Version | null> {
    return this.updateVersion(id, { isArchived: false }, expectedVersion);
  }

  async getProjectsByVersionId(versionId: string): Promise<Project[]> {
    await this.initializeDataFolders();
    const projects: Project[] = [];
    const folder = this.app.vault.getAbstractFileByPath(PROJECTS_FOLDER) as TFolder;
    
    if (!folder) return projects;
    
    for (const file of folder.children) {
      if (file instanceof TFile && file.extension === 'md') {
        const project = await this.parseProjectFile(file);
        if (project && project.versionId === versionId) {
          projects.push(project);
        }
      }
    }
    
    return projects.sort((a, b) => {
      const progressOrder = [
        ProjectProgress.REQUIREMENT_DECOMPOSITION,
        ProjectProgress.CONFIG_COMPONENT_FILL,
        ProjectProgress.COMPONENT_UPLOAD,
        ProjectProgress.SELF_TEST,
        ProjectProgress.SUBMITTED,
        ProjectProgress.RELEASED
      ];
      return progressOrder.indexOf(a.progress) - progressOrder.indexOf(b.progress);
    });
  }

  private async parseProjectFile(file: TFile): Promise<Project | null> {
    try {
      const content = await this.app.vault.read(file);
      const frontmatter = this.parseFrontmatter(content);
      if (!frontmatter) return null;
      
      return {
        id: frontmatter.id || file.basename,
        name: frontmatter.name || '',
        versionId: frontmatter.versionId || '',
        manager: frontmatter.manager || '',
        projectLink: frontmatter.projectLink || '',
        componentLink: frontmatter.componentLink || '',
        requirements: frontmatter.requirements || '',
        progress: frontmatter.progress || ProjectProgress.REQUIREMENT_DECOMPOSITION,
        progressHistory: frontmatter.progressHistory || [],
        plannedTestTime: frontmatter.plannedTestTime || '',
        plannedReleaseTime: frontmatter.plannedReleaseTime || '',
        actualReleaseTime: frontmatter.actualReleaseTime || '',
        createdAt: frontmatter.createdAt || file.stat.ctime.toString(),
        updatedAt: frontmatter.updatedAt || file.stat.mtime.toString(),
        version: frontmatter.version || 1
      };
    } catch {
      return null;
    }
  }

  async createProject(data: {
    name: string;
    versionId: string;
    manager?: string;
    projectLink?: string;
    componentLink?: string;
    requirements?: string;
    progress?: ProjectProgress;
    plannedTestTime?: string;
    plannedReleaseTime?: string;
    actualReleaseTime?: string;
  }): Promise<Project> {
    await this.initializeDataFolders();
    
    const existingProjects = await this.getAllProjects();
    if (existingProjects.some(p => p.name === data.name)) {
      throw new Error('Project name already exists');
    }
    
    const id = this.generateId();
    const now = Date.now().toString();
    const project: Project = {
      id,
      name: data.name,
      versionId: data.versionId,
      manager: data.manager || '',
      projectLink: data.projectLink || '',
      componentLink: data.componentLink || '',
      requirements: data.requirements || '',
      progress: data.progress || ProjectProgress.REQUIREMENT_DECOMPOSITION,
      progressHistory: [{
        progress: data.progress || ProjectProgress.REQUIREMENT_DECOMPOSITION,
        changedAt: now
      }],
      plannedTestTime: data.plannedTestTime || '',
      plannedReleaseTime: data.plannedReleaseTime || '',
      actualReleaseTime: data.actualReleaseTime || '',
      createdAt: now,
      updatedAt: now,
      version: 1
    };
    
    const frontmatter = this.createFrontmatter({
      id: project.id,
      name: project.name,
      versionId: project.versionId,
      manager: project.manager,
      projectLink: project.projectLink,
      componentLink: project.componentLink,
      requirements: project.requirements,
      progress: project.progress,
      progressHistory: project.progressHistory.map(h => `${h.progress}@${h.changedAt}`),
      plannedTestTime: project.plannedTestTime,
      plannedReleaseTime: project.plannedReleaseTime,
      actualReleaseTime: project.actualReleaseTime,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      version: project.version
    });
    
    const fileName = this.sanitizeFileName(data.name);
    await this.app.vault.create(normalizePath(`${PROJECTS_FOLDER}/${fileName}.md`), frontmatter);
    
    await this.app.vault.create(normalizePath(`${MEMOS_FOLDER}/${fileName}.md`), '');
    
    return project;
  }

  async updateProject(id: string, data: Partial<Project>, expectedVersion?: number): Promise<Project | null> {
    const allProjects = await this.getAllProjects();
    const project = allProjects.find(p => p.id === id);
    if (!project) return null;
    
    if (expectedVersion !== undefined && project.version !== expectedVersion) {
      throw new ConcurrencyConflictError(`项目: ${project.name}`, project.version, expectedVersion);
    }
    
    if (data.name && data.name !== project.name) {
      if (allProjects.some(p => p.name === data.name && p.id !== id)) {
        throw new Error('Project name already exists');
      }
    }
    
    const oldName = project.name;
    const progressChanged = data.progress && data.progress !== project.progress;
    
    Object.assign(project, data, { updatedAt: Date.now().toString() });
    project.version = (project.version || 1) + 1;
    
    if (progressChanged && data.progress) {
      project.progressHistory.push({
        progress: data.progress,
        changedAt: Date.now().toString()
      });
    }
    
    const frontmatter = this.createFrontmatter({
      id: project.id,
      name: project.name,
      versionId: project.versionId,
      manager: project.manager,
      projectLink: project.projectLink,
      componentLink: project.componentLink,
      requirements: project.requirements,
      progress: project.progress,
      progressHistory: project.progressHistory.map(h => `${h.progress}@${h.changedAt}`),
      plannedTestTime: project.plannedTestTime,
      plannedReleaseTime: project.plannedReleaseTime,
      actualReleaseTime: project.actualReleaseTime,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      version: project.version
    });
    
    const oldFileName = this.sanitizeFileName(oldName);
    const newFileName = this.sanitizeFileName(project.name);
    
    const oldPath = normalizePath(`${PROJECTS_FOLDER}/${oldFileName}.md`);
    const file = this.app.vault.getAbstractFileByPath(oldPath) as TFile;
    
    if (file) {
      await this.app.vault.modify(file, frontmatter);
      
      if (oldFileName !== newFileName) {
        const newPath = normalizePath(`${PROJECTS_FOLDER}/${newFileName}.md`);
        await this.app.vault.rename(file, newPath);
        
        const oldMemoPath = normalizePath(`${MEMOS_FOLDER}/${oldFileName}.md`);
        const newMemoPath = normalizePath(`${MEMOS_FOLDER}/${newFileName}.md`);
        const memoFile = this.app.vault.getAbstractFileByPath(oldMemoPath);
        if (memoFile instanceof TFile) {
          await this.app.vault.rename(memoFile, newMemoPath);
        }
      }
    }
    
    return project;
  }

  async deleteProject(id: string): Promise<boolean> {
    const allProjects = await this.getAllProjects();
    const project = allProjects.find(p => p.id === id);
    if (!project) return false;
    
    const fileName = this.sanitizeFileName(project.name);
    const filePath = normalizePath(`${PROJECTS_FOLDER}/${fileName}.md`);
    const file = this.app.vault.getAbstractFileByPath(filePath);
    
    const memoPath = normalizePath(`${MEMOS_FOLDER}/${fileName}.md`);
    const memoFile = this.app.vault.getAbstractFileByPath(memoPath);
    
    if (file instanceof TFile) {
      await this.app.vault.delete(file);
    }
    
    if (memoFile instanceof TFile) {
      await this.app.vault.delete(memoFile);
    }
    
    return true;
  }

  async getAllProjects(): Promise<Project[]> {
    await this.initializeDataFolders();
    const projects: Project[] = [];
    const folder = this.app.vault.getAbstractFileByPath(PROJECTS_FOLDER) as TFolder;
    
    if (!folder) return projects;
    
    for (const file of folder.children) {
      if (file instanceof TFile && file.extension === 'md') {
        const project = await this.parseProjectFile(file);
        if (project) projects.push(project);
      }
    }
    
    return projects;
  }

  private sanitizeFileName(name: string): string {
    return name.replace(/[\\/:*?"<>|]/g, '_').trim();
  }

  async searchProjects(keyword: string): Promise<Project[]> {
    const allProjects = await this.getAllProjects();
    const lowerKeyword = keyword.toLowerCase();
    
    return allProjects.filter(p => 
      p.name.toLowerCase().includes(lowerKeyword) ||
      p.manager.toLowerCase().includes(lowerKeyword) ||
      p.requirements.toLowerCase().includes(lowerKeyword)
    );
  }

  async getProjectById(id: string): Promise<Project | null> {
    const allProjects = await this.getAllProjects();
    return allProjects.find(p => p.id === id) || null;
  }

  async getVersionById(id: string): Promise<Version | null> {
    const allVersions = await this.getAllVersions();
    return allVersions.find(v => v.id === id) || null;
  }

  async getAppById(id: string): Promise<App | null> {
    const allApps = await this.getAllApps();
    return allApps.find(a => a.id === id) || null;
  }

  getProjectMemoPath(projectName: string): string {
    const fileName = this.sanitizeFileName(projectName);
    return normalizePath(`${MEMOS_FOLDER}/${fileName}.md`);
  }
}
