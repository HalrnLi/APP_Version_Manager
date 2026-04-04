import { App as ObsidianApp, TFile, TFolder, normalizePath } from 'obsidian';
import { existsSync, mkdirSync, readdirSync, statSync, readFileSync, writeFileSync, unlinkSync, renameSync } from 'fs';
import { promises as fsPromises } from 'fs';
import { join, isAbsolute, basename, extname } from 'path';
import AppVersionManagerPlugin from '../main';
import { App, Version, Project, ProjectProgress, ProgressHistoryItem, ConcurrencyConflictError, getProgressOrder, getFirstProgress } from '../types';

// 自定义文件接口，用于支持绝对路径
interface CustomFile {
  path: string;
  basename: string;
  extension: string;
  stat: {
    ctime: number;
    mtime: number;
  };
  readContent(): Promise<string>;
}

// 简单内存缓存 - 使用 Map<string, T> 的方式实现类型安全
// 注意：由于 TypeScript 的类型系统限制，我们使用 string-keyed Map 来保证类型安全
// 每个 key 只存储一种类型的数据，调用方需要确保 get/set 使用相同的类型
class DataCache {
  // 使用 private cache 存储不同类型的数据，通过 key 区分
  private cache = new Map<string, unknown>();
  private ttl: number;
  private timestamps = new Map<string, number>();

  constructor(ttlMs: number = 5000) {
    this.ttl = ttlMs;
  }

  get<T>(key: string): T | null {
    if (!this.cache.has(key)) return null;
    
    const timestamp = this.timestamps.get(key) ?? 0;
    if (Date.now() - timestamp > this.ttl) {
      this.cache.delete(key);
      this.timestamps.delete(key);
      return null;
    }
    
    return this.cache.get(key) as T;
  }

  set<T>(key: string, data: T): void {
    this.cache.set(key, data);
    this.timestamps.set(key, Date.now());
  }

  invalidate(key?: string): void {
    if (key) {
      this.cache.delete(key);
      this.timestamps.delete(key);
    } else {
      this.cache.clear();
      this.timestamps.clear();
    }
  }
}

export class DataService {
  app: ObsidianApp;
  plugin: AppVersionManagerPlugin;
  private cache: DataCache;

  constructor(app: ObsidianApp, plugin: AppVersionManagerPlugin) {
    this.app = app;
    this.plugin = plugin;
    this.cache = new DataCache(5000);
  }

  private getDataPath(): string {
    return this.plugin.settings.dataPath || 'app-version-manager';
  }

  public isAbsolutePath(): boolean {
    const path = this.getDataPath();
    return isAbsolute(path) || /^[A-Za-z]:/.test(path); // Windows drive letter or absolute path
  }

  private getAppsFolder(): string {
    return this.isAbsolutePath() ? join(this.getDataPath(), 'apps') : `${this.getDataPath()}/apps`;
  }

  private getVersionsFolder(): string {
    return this.isAbsolutePath() ? join(this.getDataPath(), 'versions') : `${this.getDataPath()}/versions`;
  }

  private getProjectsFolder(): string {
    return this.isAbsolutePath() ? join(this.getDataPath(), 'projects') : `${this.getDataPath()}/projects`;
  }

  private getMemosFolder(): string {
    return this.isAbsolutePath() ? join(this.getDataPath(), 'memos') : `${this.getDataPath()}/memos`;
  }

  private async ensureFolder(path: string) {
    if (this.isAbsolutePath()) {
      // 使用文件系统API
      if (!existsSync(path)) {
        mkdirSync(path, { recursive: true });
      }
    } else {
      // 使用Obsidian vault API
      const folder = this.app.vault.getAbstractFileByPath(path);
      if (!folder) {
        await this.app.vault.createFolder(path);
      }
    }
  }

  private async writeFile(filePath: string, content: string) {
    if (this.isAbsolutePath()) {
      await fsPromises.writeFile(filePath, content, 'utf-8');
    } else {
      await this.app.vault.create(filePath, content);
    }
  }

  private async modifyFile(file: TFile | CustomFile, content: string) {
    if ('path' in file && this.isAbsolutePath()) {
      await fsPromises.writeFile(file.path, content, 'utf-8');
    } else if (file instanceof TFile) {
      await this.app.vault.modify(file, content);
    }
  }

  private async renameFile(file: TFile | CustomFile, newPath: string) {
    if ('path' in file && this.isAbsolutePath()) {
      const newFullPath = this.isAbsolutePath() ? newPath : normalizePath(newPath);
      await fsPromises.rename(file.path, newFullPath);
    } else if (file instanceof TFile) {
      await this.app.vault.rename(file, normalizePath(newPath));
    }
  }

  private async deleteFile(file: TFile | CustomFile) {
    if ('path' in file && this.isAbsolutePath()) {
      await fsPromises.unlink(file.path);
    } else if (file instanceof TFile) {
      await this.app.vault.delete(file);
    }
  }

  private generateId(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  }

  async initializeDataFolders() {
    await this.ensureFolder(this.getAppsFolder());
    await this.ensureFolder(this.getVersionsFolder());
    await this.ensureFolder(this.getProjectsFolder());
    await this.ensureFolder(this.getMemosFolder());
  }

  async getAllApps(): Promise<App[]> {
    const cacheKey = 'apps:all';
    const cached = this.cache.get<App[]>(cacheKey);
    if (cached) return cached;

    await this.initializeDataFolders();
    const apps: App[] = [];
    const files = await this.getMarkdownFiles(this.getAppsFolder());
    
    for (const file of files) {
      const app = await this.parseAppFile(file);
      if (app) apps.push(app);
    }
    
    const result = apps.sort((a, b) => a.name.localeCompare(b.name));
    this.cache.set(cacheKey, result);
    return result;
  }

  private async parseAppFile(file: TFile | CustomFile): Promise<App | null> {
    try {
      let content: string;
      const ctime = file.stat.ctime;
      const mtime = file.stat.mtime;
      
      if ('readContent' in file) {
        content = await file.readContent();
      } else {
        content = await this.app.vault.read(file);
      }
      
      const frontmatter = this.parseFrontmatter(content);
      if (!frontmatter) return null;
      
      return {
        id: frontmatter.id ?? file.basename,
        name: frontmatter.name ?? file.basename,
        createdAt: frontmatter.createdAt ?? ctime.toString(),
        updatedAt: frontmatter.updatedAt ?? mtime.toString(),
        version: this.parseNumericField(frontmatter.version, 1)
      };
    } catch (error) {
      console.error('[AppVersionManager] Failed to parse app file:', file.path, error);
      return null;
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private parseFrontmatter(content: string): Record<string, any> | null {
    const match = content.match(/^---\n([\s\S]*?)\n---/);
    if (!match) return {};
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const frontmatter: Record<string, any> = {};
    const lines = match[1].split('\n');
    
    for (const line of lines) {
      if (line.startsWith('#') || line.trim() === '') {
        continue;
      }
      
      const colonIndex = line.indexOf(':');
      if (colonIndex > 0) {
        const key = line.substring(0, colonIndex).trim();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let value: any = line.substring(colonIndex + 1).trim();
        
        if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key)) {
          continue;
        }
        
        if (value.startsWith('"') && value.endsWith('"')) {
          value = value.slice(1, -1);
        } else if (value.startsWith("'") && value.endsWith("'")) {
          value = value.slice(1, -1);
        } else if (value.startsWith('[') && value.endsWith(']')) {
          value = value.slice(1, -1).split(',').map((v: string) => v.trim()).filter((v: string) => v);
        } else if (value === 'true') {
          value = true;
        } else if (value === 'false') {
          value = false;
        } else if (value === 'null' || value === '~') {
          value = null;
        }
        
        frontmatter[key] = value;
      }
    }
    
    return frontmatter;
  }

  private parseNumericField(value: unknown, fallback: number): number {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() !== '') {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
    return fallback;
  }

  private parseProgressHistory(raw: unknown): ProgressHistoryItem[] {
    if (!Array.isArray(raw)) return [];
    const history: ProgressHistoryItem[] = [];
    for (const item of raw) {
      if (typeof item === 'string') {
        const at = item.lastIndexOf('@');
        if (at > 0) {
          const progress = item.slice(0, at) as ProjectProgress;
          const changedAt = item.slice(at + 1);
          history.push({ progress, changedAt });
        }
      } else if (item && typeof item === 'object') {
        const progress = (item as any).progress;
        const changedAt = (item as any).changedAt;
        if (typeof progress === 'string' && typeof changedAt === 'string') {
          history.push({ progress: progress as ProjectProgress, changedAt });
        }
      }
    }
    return history;
  }

  private async getMarkdownFiles(folderPath: string): Promise<(TFile | CustomFile)[]> {
    if (this.isAbsolutePath()) {
      // 使用文件系统API
      try {
        if (!existsSync(folderPath)) return [];
        const items = readdirSync(folderPath);
        const files: CustomFile[] = [];
        
        for (const item of items) {
          const fullPath = join(folderPath, item);
          const stat = statSync(fullPath);
          if (stat.isFile() && extname(item).toLowerCase() === '.md') {
            files.push({
              path: fullPath,
              basename: basename(item, '.md'),
              extension: 'md',
              stat: {
                ctime: stat.ctime.getTime(),
                mtime: stat.mtime.getTime()
              },
              readContent: () => fsPromises.readFile(fullPath, 'utf-8')
            });
          }
        }
        return files;
      } catch (error) {
        console.error('Error reading directory:', folderPath, error);
        return [];
      }
    } else {
      // 使用Obsidian vault API
      const folder = this.app.vault.getAbstractFileByPath(folderPath);
      if (!(folder instanceof TFolder)) return [];
      return folder.children.filter((file): file is TFile => file instanceof TFile && file.extension === 'md');
    }
  }

  private async findEntityFileById<T extends { id: string }>(
    folderPath: string,
    parser: (file: TFile | CustomFile) => Promise<T | null>,
    id: string
  ): Promise<TFile | CustomFile | null> {
    const files = await this.getMarkdownFiles(folderPath);
    for (const file of files) {
      const entity = await parser.call(this, file);
      if (entity?.id === id) {
        return file;
      }
    }
    return null;
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
    const filePath = this.isAbsolutePath() 
      ? join(this.getAppsFolder(), `${fileName}__${id}.md`)
      : normalizePath(`${this.getAppsFolder()}/${fileName}__${id}.md`);
    
    await this.writeFile(filePath, frontmatter);
    this.cache.invalidate('apps:all');
    
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
    app.version = (app.version ?? 1) + 1;
    
    const oldFileName = this.sanitizeFileName(oldName);
    const newFileName = this.sanitizeFileName(name);
    
    let file: TFile | CustomFile | null = null;
    
    if (this.isAbsolutePath()) {
      // 对于绝对路径，我们需要手动查找文件
      const files = await this.getMarkdownFiles(this.getAppsFolder());
      for (const f of files) {
        const appData = await this.parseAppFile(f);
        if (appData?.id === id) {
          file = f;
          break;
        }
      }
    } else {
      // 对于相对路径，使用原来的逻辑
      const oldPath = normalizePath(`${this.getAppsFolder()}/${oldFileName}__${id}.md`);
      const legacyOldPath = normalizePath(`${this.getAppsFolder()}/${oldFileName}.md`);
      const fallbackFile =
        this.app.vault.getAbstractFileByPath(oldPath)
        ?? this.app.vault.getAbstractFileByPath(legacyOldPath);
      file = (await this.findEntityFileById<App>(this.getAppsFolder(), this.parseAppFile, id))
        ?? (fallbackFile instanceof TFile ? fallbackFile : null);
    }
    
    if (file) {
      const frontmatter = this.createFrontmatter({
        id: app.id,
        name: app.name,
        createdAt: app.createdAt,
        updatedAt: app.updatedAt,
        version: app.version
      });
      
      await this.modifyFile(file, frontmatter);
      
      if (oldFileName !== newFileName) {
        const newPath = this.isAbsolutePath()
          ? join(this.getAppsFolder(), `${newFileName}__${app.id}.md`)
          : normalizePath(`${this.getAppsFolder()}/${newFileName}__${app.id}.md`);
        await this.renameFile(file, newPath);
      }
    }
    
    this.cache.invalidate('apps:all');
    return app;
  }

  async deleteApp(id: string): Promise<boolean> {
    const apps = await this.getAllApps();
    const app = apps.find(a => a.id === id);
    if (!app) return false;
    
    // 第一阶段：收集所有操作，验证它们都能执行
    const versions = await this.getVersionsByAppId(id);
    const versionFiles: (TFile | CustomFile)[] = [];
    const versionProjectUpdates: { projectId: string; versionId: string }[] = [];
    
    // 收集版本文件和需要更新的项目
    for (const version of versions) {
      const file = await this.findEntityFileById<Version>(this.getVersionsFolder(), this.parseVersionFile, version.id);
      if (file) {
        versionFiles.push(file);
      }
      const projects = await this.getProjectsByVersionId(version.id);
      for (const project of projects) {
        versionProjectUpdates.push({ projectId: project.id, versionId: '' });
      }
    }
    
    // 收集 App 文件
    const fileName = this.sanitizeFileName(app.name);
    let appFile: TFile | CustomFile | null = null;
    if (this.isAbsolutePath()) {
      const files = await this.getMarkdownFiles(this.getAppsFolder());
      for (const f of files) {
        const appData = await this.parseAppFile(f);
        if (appData?.id === id) {
          appFile = f;
          break;
        }
      }
    } else {
      const filePath = normalizePath(`${this.getAppsFolder()}/${fileName}__${id}.md`);
      const legacyFilePath = normalizePath(`${this.getAppsFolder()}/${fileName}.md`);
      const fallbackFile =
        this.app.vault.getAbstractFileByPath(filePath)
        ?? this.app.vault.getAbstractFileByPath(legacyFilePath);
      appFile = (await this.findEntityFileById<App>(this.getAppsFolder(), this.parseAppFile, id))
        ?? (fallbackFile instanceof TFile ? fallbackFile : null);
    }
    
    // 第二阶段：执行所有操作（原子性：如果任何操作失败，已执行的操作不会回滚，但会抛出错误）
    // 清空所有关联项目的 versionId
    for (const update of versionProjectUpdates) {
      await this.updateProject(update.projectId, { versionId: update.versionId });
    }
    
    // 删除所有版本文件
    for (const file of versionFiles) {
      await this.deleteFile(file);
    }
    
    // 删除 App 文件
    if (appFile) {
      await this.deleteFile(appFile);
    }
    
    this.cache.invalidate('apps:all');
    return true;
  }

  async getVersionsByAppId(appId: string): Promise<Version[]> {
    const cacheKey = `versions:${appId}`;
    const cached = this.cache.get<Version[]>(cacheKey);
    if (cached) return cached;

    await this.initializeDataFolders();
    const versions: Version[] = [];
    const files = await this.getMarkdownFiles(this.getVersionsFolder());
    
    for (const file of files) {
      const version = await this.parseVersionFile(file);
      if (version && version.appId === appId) {
        versions.push(version);
      }
    }
    
    const result = versions.sort((a, b) => this.compareVersions(b.versionNumber, a.versionNumber));
    this.cache.set(cacheKey, result);
    return result;
  }

  private compareVersions(a: string, b: string): number {
    const parse = (v: string) => {
      const [main, prerelease] = v.split('-', 2);
      const nums = main.split('.').map((part) => {
        const n = Number(part);
        return Number.isFinite(n) ? n : 0;
      });
      return { nums, prerelease: prerelease ?? '' };
    };
    const va = parse(a);
    const vb = parse(b);
    const maxLength = Math.max(va.nums.length, vb.nums.length);
    for (let i = 0; i < maxLength; i++) {
      const na = va.nums[i] ?? 0;
      const nb = vb.nums[i] ?? 0;
      if (na !== nb) return na - nb;
    }
    if (va.prerelease && !vb.prerelease) return -1;
    if (!va.prerelease && vb.prerelease) return 1;
    return va.prerelease.localeCompare(vb.prerelease);
  }

  private async parseVersionFile(file: TFile | CustomFile): Promise<Version | null> {
    try {
      let content: string;
      const ctime = file.stat.ctime;
      const mtime = file.stat.mtime;
      
      if ('readContent' in file) {
        content = await file.readContent();
      } else {
        content = await this.app.vault.read(file);
      }
      
      const frontmatter = this.parseFrontmatter(content);
      if (!frontmatter || !frontmatter.appId) return null;
      
      return {
        id: frontmatter.id ?? file.basename,
        appId: frontmatter.appId,
        versionNumber: frontmatter.versionNumber ?? '',
        bllVersion: frontmatter.bllVersion ?? '',
        ippVersion: frontmatter.ippVersion ?? '',
        webVersion: frontmatter.webVersion ?? '',
        updateContent: frontmatter.updateContent ?? '',
        isArchived: frontmatter.isArchived === true,
        createdAt: frontmatter.createdAt ?? ctime.toString(),
        updatedAt: frontmatter.updatedAt ?? mtime.toString(),
        version: this.parseNumericField(frontmatter.version, 1)
      };
    } catch (error) {
      console.error('[AppVersionManager] Failed to parse version file:', file.path, error);
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
    const fileName = `${appName}_${versionNum}__${id}`;
    const filePath = this.isAbsolutePath()
      ? join(this.getVersionsFolder(), `${fileName}.md`)
      : normalizePath(`${this.getVersionsFolder()}/${fileName}.md`);
    
    await this.writeFile(filePath, frontmatter);
    this.cache.invalidate(`versions:${data.appId}`);
    
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
    version.version = (version.version ?? 1) + 1;
    
    const app = (await this.getAllApps()).find(a => a.id === version.appId);
    const appName = app ? this.sanitizeFileName(app.name) : 'unknown';
    const versionNum = this.sanitizeFileName(version.versionNumber);
    const fileName = `${appName}_${versionNum}__${version.id}`;
    const file = await this.findEntityFileById<Version>(this.getVersionsFolder(), this.parseVersionFile, id);
    
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
      
      await this.modifyFile(file, frontmatter);
      
      if (file.basename !== fileName) {
        const newPath = this.isAbsolutePath()
          ? join(this.getVersionsFolder(), `${fileName}.md`)
          : normalizePath(`${this.getVersionsFolder()}/${fileName}.md`);
        await this.renameFile(file, newPath);
      }
    }
    
    this.cache.invalidate(`versions:${version.appId}`);
    return version;
  }

  async deleteVersion(id: string): Promise<boolean> {
    const allVersions = await this.getAllVersions();
    const version = allVersions.find(v => v.id === id);
    if (!version) return false;
    
    const appId = version.appId;
    
    // 第一阶段：收集所有操作
    const projects = await this.getProjectsByVersionId(id);
    const projectUpdates: { projectId: string; versionId: string }[] = 
      projects.map(p => ({ projectId: p.id, versionId: '' }));
    
    const file = await this.findEntityFileById<Version>(this.getVersionsFolder(), this.parseVersionFile, id);
    
    // 第二阶段：执行所有操作
    for (const update of projectUpdates) {
      await this.updateProject(update.projectId, { versionId: update.versionId });
    }
    
    if (file) {
      await this.deleteFile(file);
    }
    
    this.cache.invalidate(`versions:${appId}`);
    return true;
  }

  async getAllVersions(): Promise<Version[]> {
    await this.initializeDataFolders();
    const versions: Version[] = [];
    const files = await this.getMarkdownFiles(this.getVersionsFolder());
    
    for (const file of files) {
      const version = await this.parseVersionFile(file);
      if (version) versions.push(version);
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
    const files = await this.getMarkdownFiles(this.getProjectsFolder());
    
    for (const file of files) {
      const project = await this.parseProjectFile(file);
      if (project && project.versionId === versionId) {
        projects.push(project);
      }
    }
    
    return projects.sort((a, b) => {
      const progressOrder = getProgressOrder(this.plugin.settings.progressStages);
      return progressOrder.indexOf(a.progress) - progressOrder.indexOf(b.progress);
    });
  }

  private async parseProjectFile(file: TFile | CustomFile): Promise<Project | null> {
    try {
      let content: string;
      const ctime = file.stat.ctime;
      const mtime = file.stat.mtime;
      
      if ('readContent' in file) {
        content = await file.readContent();
      } else {
        content = await this.app.vault.read(file);
      }
      
      const frontmatter = this.parseFrontmatter(content);
      if (!frontmatter) return null;
      
      return {
        id: frontmatter.id ?? file.basename,
        name: frontmatter.name ?? '',
        versionId: frontmatter.versionId ?? '',
        manager: frontmatter.manager ?? '',
        projectLink: frontmatter.projectLink ?? '',
        componentLink: frontmatter.componentLink ?? '',
        requirements: frontmatter.requirements ?? '',
        progress: frontmatter.progress ?? getFirstProgress(this.plugin.settings.progressStages),
        progressHistory: this.parseProgressHistory(frontmatter.progressHistory),
        b1IntegrationTestTime: frontmatter.b1IntegrationTestTime ?? '',
        b1SystemTestTime: frontmatter.b1SystemTestTime ?? '',
        b2IntegrationTestTime: frontmatter.b2IntegrationTestTime ?? '',
        b2SystemTestTime: frontmatter.b2SystemTestTime ?? '',
        b3IntegrationTestTime: frontmatter.b3IntegrationTestTime ?? '',
        b3SystemTestTime: frontmatter.b3SystemTestTime ?? '',
        b4IntegrationTestTime: frontmatter.b4IntegrationTestTime ?? '',
        b4SystemTestTime: frontmatter.b4SystemTestTime ?? '',
        actualReleaseTime: frontmatter.actualReleaseTime ?? '',
        createdAt: frontmatter.createdAt ?? ctime.toString(),
        updatedAt: frontmatter.updatedAt ?? mtime.toString(),
        version: this.parseNumericField(frontmatter.version, 1)
      };
    } catch (error) {
      console.error('[AppVersionManager] Failed to parse project file:', file.path, error);
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
    b1IntegrationTestTime?: string;
    b1SystemTestTime?: string;
    b2IntegrationTestTime?: string;
    b2SystemTestTime?: string;
    b3IntegrationTestTime?: string;
    b3SystemTestTime?: string;
    b4IntegrationTestTime?: string;
    b4SystemTestTime?: string;
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
      progress: data.progress || getFirstProgress(this.plugin.settings.progressStages),
      progressHistory: [{
        progress: data.progress || getFirstProgress(this.plugin.settings.progressStages),
        changedAt: now
      }],
      b1IntegrationTestTime: data.b1IntegrationTestTime || '',
      b1SystemTestTime: data.b1SystemTestTime || '',
      b2IntegrationTestTime: data.b2IntegrationTestTime || '',
      b2SystemTestTime: data.b2SystemTestTime || '',
      b3IntegrationTestTime: data.b3IntegrationTestTime || '',
      b3SystemTestTime: data.b3SystemTestTime || '',
      b4IntegrationTestTime: data.b4IntegrationTestTime || '',
      b4SystemTestTime: data.b4SystemTestTime || '',
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
      b1IntegrationTestTime: project.b1IntegrationTestTime,
      b1SystemTestTime: project.b1SystemTestTime,
      b2IntegrationTestTime: project.b2IntegrationTestTime,
      b2SystemTestTime: project.b2SystemTestTime,
      b3IntegrationTestTime: project.b3IntegrationTestTime,
      b3SystemTestTime: project.b3SystemTestTime,
      b4IntegrationTestTime: project.b4IntegrationTestTime,
      b4SystemTestTime: project.b4SystemTestTime,
      actualReleaseTime: project.actualReleaseTime,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      version: project.version
    });
    
    const fileName = this.sanitizeFileName(data.name);
    const projectFilePath = this.isAbsolutePath()
      ? join(this.getProjectsFolder(), `${fileName}__${id}.md`)
      : normalizePath(`${this.getProjectsFolder()}/${fileName}__${id}.md`);
    const memoFilePath = this.isAbsolutePath()
      ? join(this.getMemosFolder(), `${fileName}.md`)
      : normalizePath(`${this.getMemosFolder()}/${fileName}.md`);
    
    await this.writeFile(projectFilePath, frontmatter);
    await this.writeFile(memoFilePath, '');
    this.cache.invalidate('projects:all');
    
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
    project.version = (project.version ?? 1) + 1;
    
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
      b1IntegrationTestTime: project.b1IntegrationTestTime,
      b1SystemTestTime: project.b1SystemTestTime,
      b2IntegrationTestTime: project.b2IntegrationTestTime,
      b2SystemTestTime: project.b2SystemTestTime,
      b3IntegrationTestTime: project.b3IntegrationTestTime,
      b3SystemTestTime: project.b3SystemTestTime,
      b4IntegrationTestTime: project.b4IntegrationTestTime,
      b4SystemTestTime: project.b4SystemTestTime,
      actualReleaseTime: project.actualReleaseTime,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      version: project.version
    });
    
    const oldFileName = this.sanitizeFileName(oldName);
    const newFileName = this.sanitizeFileName(project.name);
    
    let file: TFile | CustomFile | null = null;
    
    if (this.isAbsolutePath()) {
      // 对于绝对路径，我们需要手动查找文件
      const files = await this.getMarkdownFiles(this.getProjectsFolder());
      for (const f of files) {
        const projectData = await this.parseProjectFile(f);
        if (projectData?.id === id) {
          file = f;
          break;
        }
      }
    } else {
      // 对于相对路径，使用原来的逻辑
      const oldPath = normalizePath(`${this.getProjectsFolder()}/${oldFileName}.md`);
      const fallbackFile = this.app.vault.getAbstractFileByPath(oldPath);
      file = (await this.findEntityFileById<Project>(this.getProjectsFolder(), this.parseProjectFile, id))
        ?? (fallbackFile instanceof TFile ? fallbackFile : null);
    }
    
    if (file) {
      await this.modifyFile(file, frontmatter);
      
      if (oldFileName !== newFileName) {
        const newPath = this.isAbsolutePath()
          ? join(this.getProjectsFolder(), `${newFileName}__${project.id}.md`)
          : normalizePath(`${this.getProjectsFolder()}/${newFileName}__${project.id}.md`);
        await this.renameFile(file, newPath);
        
        if (this.isAbsolutePath()) {
          const oldMemoPath = join(this.getMemosFolder(), `${oldFileName}.md`);
          const newMemoPath = join(this.getMemosFolder(), `${newFileName}.md`);
          
          if (existsSync(oldMemoPath)) {
            renameSync(oldMemoPath, newMemoPath);
          }
        } else {
          const oldMemoPath = normalizePath(`${this.getMemosFolder()}/${oldFileName}.md`);
          const newMemoPath = normalizePath(`${this.getMemosFolder()}/${newFileName}.md`);
          const memoFile = this.app.vault.getAbstractFileByPath(oldMemoPath);
          if (memoFile instanceof TFile) {
            await this.app.vault.rename(memoFile, newMemoPath);
          }
        }
      }
    }
    
    this.cache.invalidate('projects:all');
    return project;
  }

  async deleteProject(id: string, expectedVersion?: number): Promise<boolean> {
    const allProjects = await this.getAllProjects();
    const project = allProjects.find(p => p.id === id);
    if (!project) return false;
    if (expectedVersion !== undefined && project.version !== expectedVersion) {
      throw new ConcurrencyConflictError(`项目: ${project.name}`, project.version, expectedVersion);
    }
    
    const fileName = this.sanitizeFileName(project.name);
    let file: TFile | CustomFile | null = null;
    let memoFile: TFile | CustomFile | null = null;
    
    if (this.isAbsolutePath()) {
      // 对于绝对路径，我们需要手动查找文件
      const files = await this.getMarkdownFiles(this.getProjectsFolder());
      for (const f of files) {
        const projectData = await this.parseProjectFile(f);
        if (projectData?.id === id) {
          file = f;
          break;
        }
      }
      
      const memoPath = this.getProjectMemoPath(project.name);
      if (existsSync(memoPath)) {
        memoFile = {
          path: memoPath,
          basename: basename(memoPath, '.md'),
          extension: 'md',
          stat: {
            ctime: statSync(memoPath).ctime.getTime(),
            mtime: statSync(memoPath).mtime.getTime()
          },
          readContent: () => fsPromises.readFile(memoPath, 'utf-8')
        } as CustomFile;
      }
    } else {
      const filePath = normalizePath(`${this.getProjectsFolder()}/${fileName}.md`);
      const fallbackFile = this.app.vault.getAbstractFileByPath(filePath);
      file = (await this.findEntityFileById<Project>(this.getProjectsFolder(), this.parseProjectFile, id))
        ?? (fallbackFile instanceof TFile ? fallbackFile : null);
      
      const memoPath = this.getProjectMemoPath(project.name);
      const memoFallbackFile = this.app.vault.getAbstractFileByPath(memoPath);
      memoFile = memoFallbackFile instanceof TFile ? memoFallbackFile : null;
    }
    
    if (file) {
      await this.deleteFile(file);
    }
    
    if (memoFile) {
      await this.deleteFile(memoFile);
    }
    
    this.cache.invalidate('projects:all');
    return true;
  }

  async getAllProjects(): Promise<Project[]> {
    const cacheKey = 'projects:all';
    const cached = this.cache.get<Project[]>(cacheKey);
    if (cached) return cached;

    await this.initializeDataFolders();
    const projects: Project[] = [];
    const files = await this.getMarkdownFiles(this.getProjectsFolder());
    
    for (const file of files) {
      const project = await this.parseProjectFile(file);
      if (project) projects.push(project);
    }
    
    this.cache.set(cacheKey, projects);
    return projects;
  }

  private sanitizeFileName(name: string): string {
    const reserved = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;
    const cleaned = name
      .replace(/[\\/:*?"<>|]/g, '_')
      .replace(/\.\.+/g, '_')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/[. ]+$/g, '');
    const safe = cleaned || 'unnamed';
    const withoutReserved = reserved.test(safe) ? `_${safe}` : safe;
    return withoutReserved.slice(0, 120);
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

  getProjectMemoPath(projectName: string, projectId?: string): string {
    const fileName = this.sanitizeFileName(projectName);
    const targetPath = `${this.getMemosFolder()}/${fileName}.md`;
    return this.isAbsolutePath() ? targetPath : normalizePath(targetPath);
  }

  async ensureMemoFile(projectName: string): Promise<string> {
    await this.ensureFolder(this.getMemosFolder());
    const memoPath = this.getProjectMemoPath(projectName);
    
    if (this.isAbsolutePath()) {
      if (!existsSync(memoPath)) {
        writeFileSync(memoPath, '', 'utf-8');
      }
    } else {
      const file = this.app.vault.getAbstractFileByPath(memoPath);
      if (!file) {
        try {
          await this.app.vault.create(memoPath, '');
        } catch {
          // 文件可能已存在
        }
      }
    }
    
    return memoPath;
  }

  async upsertAppRecord(record: App): Promise<void> {
    await this.initializeDataFolders();
    const fileName = this.sanitizeFileName(record.name);
    const targetPath = this.isAbsolutePath()
      ? join(this.getAppsFolder(), `${fileName}__${record.id}.md`)
      : normalizePath(`${this.getAppsFolder()}/${fileName}__${record.id}.md`);
    const frontmatter = this.createFrontmatter(record as unknown as Record<string, unknown>);
    const existingFile = await this.findEntityFileById<App>(this.getAppsFolder(), this.parseAppFile, record.id);
    if (existingFile) {
      await this.modifyFile(existingFile, frontmatter);
      if (existingFile.path !== targetPath) {
        await this.renameFile(existingFile, targetPath);
      }
      return;
    }
    await this.writeFile(targetPath, frontmatter);
  }

  async upsertVersionRecord(record: Version): Promise<void> {
    await this.initializeDataFolders();
    const app = await this.getAppById(record.appId);
    const appName = this.sanitizeFileName(app?.name || 'unknown');
    const versionName = this.sanitizeFileName(record.versionNumber);
    const targetPath = this.isAbsolutePath()
      ? join(this.getVersionsFolder(), `${appName}_${versionName}__${record.id}.md`)
      : normalizePath(`${this.getVersionsFolder()}/${appName}_${versionName}__${record.id}.md`);
    const frontmatter = this.createFrontmatter(record as unknown as Record<string, unknown>);
    const existingFile = await this.findEntityFileById<Version>(this.getVersionsFolder(), this.parseVersionFile, record.id);
    if (existingFile) {
      await this.modifyFile(existingFile, frontmatter);
      if (existingFile.path !== targetPath) {
        await this.renameFile(existingFile, targetPath);
      }
      return;
    }
    await this.writeFile(targetPath, frontmatter);
  }

  async upsertProjectRecord(record: Project): Promise<void> {
    await this.initializeDataFolders();
    const fileName = this.sanitizeFileName(record.name);
    const targetPath = this.isAbsolutePath()
      ? join(this.getProjectsFolder(), `${fileName}__${record.id}.md`)
      : normalizePath(`${this.getProjectsFolder()}/${fileName}__${record.id}.md`);
    const frontmatter = this.createFrontmatter({
      ...record,
      progressHistory: record.progressHistory.map(h => `${h.progress}@${h.changedAt}`)
    } as Record<string, unknown>);
    const existingFile = await this.findEntityFileById<Project>(this.getProjectsFolder(), this.parseProjectFile, record.id);
    if (existingFile) {
      await this.modifyFile(existingFile, frontmatter);
      if (existingFile.path !== targetPath) {
        await this.renameFile(existingFile, targetPath);
      }
    } else {
      await this.writeFile(targetPath, frontmatter);
    }
    const memoPath = this.getProjectMemoPath(record.name);
    if (this.isAbsolutePath()) {
      if (!existsSync(memoPath)) {
        writeFileSync(memoPath, '', 'utf-8');
      }
    } else {
      if (!this.app.vault.getAbstractFileByPath(memoPath)) {
        await this.app.vault.create(memoPath, '');
      }
    }
  }
}
