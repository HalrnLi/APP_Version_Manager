import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock fs module first (hoisted by vitest)
vi.mock('fs', () => {
  const mod = {
    existsSync: vi.fn(() => false),
    readFileSync: vi.fn(() => '---\ntodos: []\n---\n'),
    writeFileSync: vi.fn(),
    unlinkSync: vi.fn(),
    mkdirSync: vi.fn(),
    readdirSync: vi.fn(() => []),
    statSync: vi.fn(() => ({
      isFile: () => true,
      ctime: new Date(),
      mtime: new Date(),
    })),
    renameSync: vi.fn(),
    promises: {
      readFile: vi.fn(async () => '---\ntodos: []\n---\n'),
      writeFile: vi.fn(async () => {}),
      unlink: vi.fn(async () => {}),
      rename: vi.fn(async () => {}),
    },
  };
  return { ...mod, default: mod };
});

// Break circular dependency: TodoService -> main -> TodoService
vi.mock('../main', () => ({
  default: class {},
}));

// Mock path module
vi.mock('path', () => {
  const path = {
    join: (...args: string[]) => args.join('/'),
    isAbsolute: (p: string) => p.startsWith('/') || /^[A-Za-z]:/.test(p),
    basename: (p: string, ext?: string) => {
      const base = p.split('/').pop() || '';
      return ext ? base.replace(new RegExp(ext + '$'), '') : base;
    },
    extname: (p: string) => {
      const base = p.split('/').pop() || '';
      const i = base.lastIndexOf('.');
      return i >= 0 ? base.slice(i) : '';
    },
  };
  return { ...path, default: path };
});

import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'fs';
import { App, TFile, Vault } from 'obsidian';
import { TodoService } from './TodoService';
import { ConcurrencyConflictError } from '../types';

function createMockPlugin(useAbsolutePath: boolean = false) {
  const app = new App();
  app.vault = new Vault();

  const getAbstractFileByPath = vi.fn(() => null);

  const vaultRead = vi.fn(async () => '---\ntodos: []\n---\n');
  const vaultModify = vi.fn(async () => {});
  const vaultCreate = vi.fn(async () => {});
  const vaultDelete = vi.fn(async () => {});

  (app.vault as any).getAbstractFileByPath = getAbstractFileByPath;
  (app.vault as any).read = vaultRead;
  (app.vault as any).modify = vaultModify;
  (app.vault as any).create = vaultCreate;
  (app.vault as any).delete = vaultDelete;

  const plugin = {
    app,
    settings: {
      dataPath: useAbsolutePath ? '/tmp/test-data' : 'app-version-manager',
    },
  };

  return { plugin, app, getAbstractFileByPath, vaultRead, vaultModify, vaultCreate, vaultDelete };
}

describe('TodoService (absolute path)', () => {
  let service: TodoService;
  let plugin: any;

  beforeEach(() => {
    vi.clearAllMocks();
    const mocks = createMockPlugin(true);
    plugin = mocks.plugin;
    service = new TodoService(plugin as any);
  });

  describe('getByProjectId', () => {
    it('returns empty array when file does not exist', async () => {
      (existsSync as any).mockReturnValueOnce(false);
      const todos = await service.getByProjectId('new-project');
      expect(todos).toEqual([]);
    });

    it('returns parsed todos from existing file', async () => {
      (existsSync as any).mockReturnValueOnce(true);
      (readFileSync as any).mockReturnValueOnce(
        '---\ntodos: [{"id":"1","content":"test","completed":false,"link":"","dueDate":"","projectId":"p1","createdAt":"2026-01-01","updatedAt":"2026-01-01","version":1}]\n---\n'
      );
      const todos = await service.getByProjectId('project-with-todos');
      expect(todos).toHaveLength(1);
      expect(todos[0].content).toBe('test');
      expect(todos[0].completed).toBe(false);
    });

    it('returns cached result on second call', async () => {
      (existsSync as any).mockReturnValueOnce(true);
      (readFileSync as any).mockReturnValueOnce(
        '---\ntodos: [{"id":"1","content":"cached","completed":false,"link":"","dueDate":"","projectId":"p1","createdAt":"2026-01-01","updatedAt":"2026-01-01","version":1}]\n---\n'
      );
      await service.getByProjectId('cached-project');
      await service.getByProjectId('cached-project');
      // readFileSync should only be called once due to cache
      expect(readFileSync).toHaveBeenCalledTimes(1);
    });
  });

  describe('create', () => {
    it('creates a new todo and saves to file', async () => {
      (existsSync as any).mockReturnValueOnce(false);
      const todo = await service.create('p1', { content: 'new task' });
      expect(todo.content).toBe('new task');
      expect(todo.completed).toBe(false);
      expect(todo.projectId).toBe('p1');
      expect(todo.id).toBeTruthy();
      expect(todo.version).toBe(1);
      expect(writeFileSync).toHaveBeenCalledTimes(1);
    });

    it('sets optional fields when provided', async () => {
      (existsSync as any).mockReturnValueOnce(false);
      const todo = await service.create('p1', {
        content: 'task with details',
        link: 'https://example.com',
        dueDate: '2026-05-10',
      });
      expect(todo.link).toBe('https://example.com');
      expect(todo.dueDate).toBe('2026-05-10');
    });

    it('appends to existing todos', async () => {
      (existsSync as any).mockReturnValueOnce(true);
      (readFileSync as any).mockReturnValueOnce(
        '---\ntodos: [{"id":"existing","content":"old","completed":false,"link":"","dueDate":"","projectId":"p1","createdAt":"2026-01-01","updatedAt":"2026-01-01","version":1}]\n---\n'
      );
      await service.create('p1', { content: 'new task' });
      const writeCall = (writeFileSync as any).mock.calls[0];
      expect(writeCall[0]).toContain('p1');
    });
  });

  describe('update', () => {
    it('updates an existing todo', async () => {
      (existsSync as any).mockReturnValueOnce(true);
      (readFileSync as any).mockReturnValueOnce(
        '---\ntodos: [{"id":"1","content":"original","completed":false,"link":"","dueDate":"","projectId":"p1","createdAt":"2026-01-01","updatedAt":"2026-01-01","version":1}]\n---\n'
      );
      const existing = (await service.getByProjectId('p1'))[0];
      const updated = await service.update('p1', {
        ...existing,
        content: 'updated',
        completed: true,
      }, existing.version);
      expect(updated.content).toBe('updated');
      expect(updated.completed).toBe(true);
      expect(updated.version).toBe(2);
      expect(writeFileSync).toHaveBeenCalled();
    });

    it('throws ConcurrencyConflictError on version mismatch', async () => {
      (existsSync as any).mockReturnValueOnce(true);
      (readFileSync as any).mockReturnValueOnce(
        '---\ntodos: [{"id":"1","content":"original","completed":false,"link":"","dueDate":"","projectId":"p1","createdAt":"2026-01-01","updatedAt":"2026-01-01","version":3}]\n---\n'
      );
      const existing = (await service.getByProjectId('p1'))[0];
      await expect(
        service.update('p1', existing, 1)
      ).rejects.toThrow(ConcurrencyConflictError);
    });

    it('throws when todo not found', async () => {
      (existsSync as any).mockReturnValueOnce(true);
      (readFileSync as any).mockReturnValueOnce('---\ntodos: []\n---\n');
      await expect(
        service.update('p1', {
          id: 'nonexistent',
          content: 'ghost',
          link: '',
          dueDate: '',
          completed: false,
          projectId: 'p1',
          createdAt: '',
          updatedAt: '',
          version: 1,
        })
      ).rejects.toThrow('Todo not found');
    });
  });

  describe('delete', () => {
    it('removes a todo by id', async () => {
      (existsSync as any).mockReturnValueOnce(true);
      (readFileSync as any).mockReturnValueOnce(
        '---\ntodos: [{"id":"1","content":"keep","completed":false,"link":"","dueDate":"","projectId":"p1","createdAt":"2026-01-01","updatedAt":"2026-01-01","version":1},{"id":"2","content":"delete-me","completed":false,"link":"","dueDate":"","projectId":"p1","createdAt":"2026-01-01","updatedAt":"2026-01-01","version":1}]\n---\n'
      );
      await service.delete('p1', '2');
      expect(writeFileSync).toHaveBeenCalledTimes(1);
    });

    it('does nothing when todo not found', async () => {
      (existsSync as any).mockReturnValueOnce(true);
      (readFileSync as any).mockReturnValueOnce(
        '---\ntodos: [{"id":"1","content":"keep","completed":false,"link":"","dueDate":"","projectId":"p1","createdAt":"2026-01-01","updatedAt":"2026-01-01","version":1}]\n---\n'
      );
      await service.delete('p1', 'nonexistent');
      expect(writeFileSync).not.toHaveBeenCalled();
    });
  });

  describe('deleteByProjectId', () => {
    it('deletes the file if it exists', async () => {
      (existsSync as any).mockReturnValueOnce(true);
      await service.deleteByProjectId('p1');
      expect(unlinkSync).toHaveBeenCalledTimes(1);
    });

    it('does nothing if file does not exist', async () => {
      (existsSync as any).mockReturnValueOnce(false);
      await service.deleteByProjectId('nonexistent');
      expect(unlinkSync).not.toHaveBeenCalled();
    });
  });
});

describe('TodoService (vault path)', () => {
  let service: TodoService;
  let mocks: ReturnType<typeof createMockPlugin>;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks = createMockPlugin(false);
    service = new TodoService(mocks.plugin as any);
  });

  describe('getByProjectId', () => {
    it('returns empty array when file does not exist', async () => {
      const todos = await service.getByProjectId('nonexistent');
      expect(todos).toEqual([]);
    });

    it('returns parsed todos from existing vault file', async () => {
      mocks.getAbstractFileByPath.mockReturnValueOnce(new TFile());
      mocks.vaultRead.mockResolvedValueOnce(
        '---\ntodos: [{"id":"1","content":"vault task","completed":false,"link":"","dueDate":"","projectId":"p1","createdAt":"2026-01-01","updatedAt":"2026-01-01","version":1}]\n---\n'
      );
      const todos = await service.getByProjectId('existing');
      expect(todos).toHaveLength(1);
      expect(todos[0].content).toBe('vault task');
    });
  });

  describe('create', () => {
    it('creates new file if none exists', async () => {
      const todo = await service.create('new-project', { content: 'hello' });
      expect(todo.content).toBe('hello');
      expect(mocks.vaultCreate).toHaveBeenCalledTimes(1);
    });
  });

  describe('deleteByProjectId', () => {
    it('deletes the file if it exists', async () => {
      mocks.getAbstractFileByPath.mockReturnValueOnce(new TFile());
      await service.deleteByProjectId('existing');
      expect(mocks.vaultDelete).toHaveBeenCalledTimes(1);
    });

    it('does nothing if file does not exist', async () => {
      await service.deleteByProjectId('no-such-project');
      expect(mocks.vaultDelete).not.toHaveBeenCalled();
    });
  });
});
