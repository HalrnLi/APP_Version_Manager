import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the main plugin module (circular dep)
vi.mock('../main', () => ({
  default: class {},
}));

import { TodoSidePanel } from './TodoSidePanel';

function createMockPlugin() {
  const todoService = {
    getByProjectId: vi.fn(async (_projectId: string) => []),
    create: vi.fn(async (_projectId: string, _input: any) => ({
      id: 'new-id',
      content: _input.content,
      link: _input.link || '',
      dueDate: _input.dueDate || '',
      completed: false,
      projectId: _projectId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
    })),
    update: vi.fn(async (_projectId: string, todo: any) => ({
      ...todo,
      version: todo.version + 1,
    })),
    delete: vi.fn(async () => {}),
  };

  return {
    todoService,
    plugin: { todoService },
  };
}

describe('TodoSidePanel', () => {
  let panel: TodoSidePanel;
  let containerEl: HTMLElement;
  let mocks: ReturnType<typeof createMockPlugin>;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks = createMockPlugin();
    containerEl = document.createElement('div');
    panel = new TodoSidePanel(containerEl, mocks.plugin as any);
  });

  describe('open/close', () => {
    it('opens the panel', async () => {
      panel.open('proj-1', 'Test Project');

      // Wait for requestAnimationFrame
      await new Promise((r) => requestAnimationFrame(r));

      const overlay = containerEl.querySelector('.avm-todo-overlay');
      const panelEl = containerEl.querySelector('.avm-todo-panel');

      expect(overlay).not.toBeNull();
      expect(panelEl).not.toBeNull();
      expect(overlay?.classList.contains('open')).toBe(true);
      expect(panelEl?.classList.contains('open')).toBe(true);
    });

    it('closes the panel', async () => {
      panel.open('proj-1', 'Test Project');
      await new Promise((r) => requestAnimationFrame(r));

      panel.close();

      const overlay = containerEl.querySelector('.avm-todo-overlay');
      const panelEl = containerEl.querySelector('.avm-todo-panel');
      expect(overlay?.classList.contains('open')).toBe(false);
      expect(panelEl?.classList.contains('open')).toBe(false);
    });

    it('shows project name in header', async () => {
      panel.open('proj-1', 'My Project');
      await new Promise((r) => requestAnimationFrame(r));

      const title = containerEl.querySelector('.avm-todo-panel-title');
      expect(title?.textContent).toContain('My Project');
    });
  });

  describe('todo list rendering', () => {
    it('shows empty state when no todos', async () => {
      mocks.todoService.getByProjectId.mockResolvedValueOnce([]);
      panel.open('proj-1', 'Test');
      await new Promise((r) => requestAnimationFrame(r));

      const empty = containerEl.querySelector('.avm-todo-empty');
      expect(empty).not.toBeNull();
      expect(empty?.textContent).toBe('暂无待办');
    });

    it('renders todo items', async () => {
      mocks.todoService.getByProjectId.mockResolvedValueOnce([
        {
          id: '1',
          content: 'Task 1',
          link: '',
          dueDate: '',
          completed: false,
          projectId: 'proj-1',
          createdAt: '',
          updatedAt: '',
          version: 1,
        },
        {
          id: '2',
          content: 'Task 2',
          link: '',
          dueDate: '2026-05-10',
          completed: false,
          projectId: 'proj-1',
          createdAt: '',
          updatedAt: '',
          version: 1,
        },
      ]);
      panel.open('proj-1', 'Test');
      await new Promise((r) => requestAnimationFrame(r));

      const items = containerEl.querySelectorAll('.avm-todo-item');
      expect(items).toHaveLength(2);
      // Tasks with dueDate sort before those without
      expect(items[0].querySelector('.avm-todo-content')?.textContent).toBe('Task 2');
      expect(items[0].querySelector('.avm-todo-due')?.textContent).toBe('2026-05-10');
      expect(items[1].querySelector('.avm-todo-content')?.textContent).toBe('Task 1');
    });

    it('adds completed class for completed items', async () => {
      mocks.todoService.getByProjectId.mockResolvedValueOnce([
        {
          id: '1',
          content: 'Done',
          link: '',
          dueDate: '',
          completed: true,
          projectId: 'proj-1',
          createdAt: '',
          updatedAt: '',
          version: 1,
        },
      ]);
      panel.open('proj-1', 'Test');
      await new Promise((r) => requestAnimationFrame(r));

      const item = containerEl.querySelector('.avm-todo-item');
      expect(item?.classList.contains('completed')).toBe(true);
    });

    it('adds overdue class for past-due todos', async () => {
      mocks.todoService.getByProjectId.mockResolvedValueOnce([
        {
          id: '1',
          content: 'Overdue task',
          link: '',
          dueDate: '2020-01-01',
          completed: false,
          projectId: 'proj-1',
          createdAt: '',
          updatedAt: '',
          version: 1,
        },
      ]);
      panel.open('proj-1', 'Test');
      await new Promise((r) => requestAnimationFrame(r));

      const item = containerEl.querySelector('.avm-todo-item');
      expect(item?.classList.contains('overdue')).toBe(true);
    });

    it('renders link element when todo has link', async () => {
      mocks.todoService.getByProjectId.mockResolvedValueOnce([
        {
          id: '1',
          content: 'With link',
          link: 'https://example.com',
          dueDate: '',
          completed: false,
          projectId: 'proj-1',
          createdAt: '',
          updatedAt: '',
          version: 1,
        },
      ]);
      panel.open('proj-1', 'Test');
      await new Promise((r) => requestAnimationFrame(r));

      const link = containerEl.querySelector('.avm-todo-link');
      expect(link).not.toBeNull();
      expect((link as HTMLAnchorElement)?.href).toContain('example.com');
    });
  });

  describe('sort order', () => {
    it('sorts incomplete before completed', async () => {
      mocks.todoService.getByProjectId.mockResolvedValueOnce([
        {
          id: '1',
          content: 'Completed',
          link: '',
          dueDate: '',
          completed: true,
          projectId: 'proj-1',
          createdAt: '',
          updatedAt: '',
          version: 1,
        },
        {
          id: '2',
          content: 'Active',
          link: '',
          dueDate: '',
          completed: false,
          projectId: 'proj-1',
          createdAt: '',
          updatedAt: '',
          version: 1,
        },
      ]);
      panel.open('proj-1', 'Test');
      await new Promise((r) => requestAnimationFrame(r));

      const items = containerEl.querySelectorAll('.avm-todo-item');
      // Active (incomplete) should be first
      expect(items[0].querySelector('.avm-todo-content')?.textContent).toBe('Active');
      expect(items[1].querySelector('.avm-todo-content')?.textContent).toBe('Completed');
    });
  });

  describe('close via overlay click', () => {
    it('closes when overlay is clicked', async () => {
      panel.open('proj-1', 'Test');
      await new Promise((r) => requestAnimationFrame(r));

      const overlay = containerEl.querySelector('.avm-todo-overlay') as HTMLElement;
      overlay?.click();

      expect(overlay?.classList.contains('open')).toBe(false);
    });
  });

  describe('close via close button', () => {
    it('closes when X button is clicked', async () => {
      panel.open('proj-1', 'Test');
      await new Promise((r) => requestAnimationFrame(r));

      const closeBtn = containerEl.querySelector('.avm-todo-panel-close') as HTMLElement;
      closeBtn?.click();

      const panelEl = containerEl.querySelector('.avm-todo-panel');
      expect(panelEl?.classList.contains('open')).toBe(false);
    });
  });

  describe('input elements', () => {
    it('renders input fields for adding todos', async () => {
      panel.open('proj-1', 'Test');
      await new Promise((r) => requestAnimationFrame(r));

      const input = containerEl.querySelector('.avm-todo-input') as HTMLInputElement;
      const linkInput = containerEl.querySelector('.avm-todo-input-link') as HTMLInputElement;
      const dateInput = containerEl.querySelector('.avm-todo-input-date') as HTMLInputElement;
      const addBtn = containerEl.querySelector('.avm-todo-add-btn');

      expect(input).not.toBeNull();
      expect(linkInput).not.toBeNull();
      expect(dateInput).not.toBeNull();
      expect(addBtn).not.toBeNull();
    });

    it('date input is empty by default', async () => {
      panel.open('proj-1', 'Test');
      await new Promise((r) => requestAnimationFrame(r));

      const dateInput = containerEl.querySelector('.avm-todo-input-date') as HTMLInputElement;
      expect(dateInput.value).toBe('');
    });
  });

  describe('destroy', () => {
    it('removes overlay and panel elements', async () => {
      panel.open('proj-1', 'Test');
      await new Promise((r) => requestAnimationFrame(r));

      panel.destroy();

      const overlay = containerEl.querySelector('.avm-todo-overlay');
      const panelEl = containerEl.querySelector('.avm-todo-panel');
      expect(overlay).toBeNull();
      expect(panelEl).toBeNull();
    });
  });
});
