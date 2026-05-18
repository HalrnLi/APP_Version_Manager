import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'fs';
import { join, isAbsolute } from 'path';
import { normalizePath } from 'obsidian';
import AppVersionManagerPlugin from '../main';
import { Todo, CreateTodoInput, ConcurrencyConflictError } from '../types';
import { DataCache } from '../utils/DataCache';
import { parseFrontmatter, createFrontmatter } from '../utils/frontmatter';
import { generateId } from '../utils/idUtils';

export class TodoService {
  private plugin: AppVersionManagerPlugin;
  private cache: DataCache;

  constructor(plugin: AppVersionManagerPlugin) {
    this.plugin = plugin;
    this.cache = new DataCache(5000);
  }

  private getDataPath(): string {
    return this.plugin.settings.dataPath || 'app-version-manager';
  }

  private isAbsolutePath(): boolean {
    const path = this.getDataPath();
    return isAbsolute(path) || /^[A-Za-z]:/.test(path);
  }

  private getProjectsFolder(): string {
    const dataPath = this.getDataPath();
    return this.isAbsolutePath() ? join(dataPath, 'projects') : `${dataPath}/projects`;
  }

  private getTodosFilePath(projectId: string): string {
    const folder = this.getProjectsFolder();
    return this.isAbsolutePath() ? join(folder, `todos__${projectId}.md`) : normalizePath(`${folder}/todos__${projectId}.md`);
  }

  async getByProjectId(projectId: string): Promise<Todo[]> {
    const cacheKey = `todos:${projectId}`;
    const cached = this.cache.get<Todo[]>(cacheKey);
    if (cached) return cached;

    const filePath = this.getTodosFilePath(projectId);

    if (this.isAbsolutePath()) {
      if (!existsSync(filePath)) return [];
      const content = readFileSync(filePath, 'utf-8');
      const parsed = parseFrontmatter(content);
      const todos = (parsed?.todos || []) as Todo[];
      this.cache.set(cacheKey, todos);
      return todos;
    } else {
      const file = this.plugin.app.vault.getAbstractFileByPath(filePath);
      if (!file) return [];
      const content = await this.plugin.app.vault.read(file as any);
      const parsed = parseFrontmatter(content);
      const todos = (parsed?.todos || []) as Todo[];
      this.cache.set(cacheKey, todos);
      return todos;
    }
  }

  async create(projectId: string, input: CreateTodoInput): Promise<Todo> {
    const todos = await this.getByProjectId(projectId);
    const now = new Date().toISOString();
    const todo: Todo = {
      id: generateId(),
      content: input.content,
      link: input.link || '',
      dueDate: input.dueDate || '',
      completed: false,
      testStageRef: input.testStageRef,
      projectId,
      createdAt: now,
      updatedAt: now,
      version: 1,
    };
    todos.push(todo);
    await this.saveTodos(projectId, todos);
    return todo;
  }

  async update(projectId: string, todo: Todo, expectedVersion?: number): Promise<Todo> {
    const todos = await this.getByProjectId(projectId);
    const index = todos.findIndex((t) => t.id === todo.id);
    if (index === -1) throw new Error(`Todo not found: ${todo.id}`);

    const existing = todos[index];
    if (expectedVersion !== undefined && existing.version !== expectedVersion) {
      throw new ConcurrencyConflictError(`待办: ${todo.content}`, existing.version, expectedVersion);
    }

    todo.updatedAt = new Date().toISOString();
    todo.version = existing.version + 1;
    todos[index] = todo;
    await this.saveTodos(projectId, todos);
    return todo;
  }

  async delete(projectId: string, todoId: string): Promise<void> {
    const todos = await this.getByProjectId(projectId);
    const filtered = todos.filter((t) => t.id !== todoId);
    if (filtered.length === todos.length) return;
    await this.saveTodos(projectId, filtered);
  }

  async deleteByProjectId(projectId: string): Promise<void> {
    const filePath = this.getTodosFilePath(projectId);
    this.cache.invalidate(`todos:${projectId}`);

    if (this.isAbsolutePath()) {
      if (existsSync(filePath)) unlinkSync(filePath);
    } else {
      const file = this.plugin.app.vault.getAbstractFileByPath(filePath);
      if (file) await this.plugin.app.vault.delete(file as any);
    }
  }

  private async saveTodos(projectId: string, todos: Todo[]): Promise<void> {
    const filePath = this.getTodosFilePath(projectId);
    const frontmatter = createFrontmatter({ todos });
    this.cache.invalidate(`todos:${projectId}`);

    if (this.isAbsolutePath()) {
      writeFileSync(filePath, frontmatter, 'utf-8');
    } else {
      const file = this.plugin.app.vault.getAbstractFileByPath(filePath);
      if (file) {
        await this.plugin.app.vault.modify(file as any, frontmatter);
      } else {
        await this.plugin.app.vault.create(filePath, frontmatter);
      }
    }
  }
}
