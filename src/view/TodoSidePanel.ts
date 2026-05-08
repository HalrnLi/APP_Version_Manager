import AppVersionManagerPlugin from '../main';
import { Todo, CreateTodoInput } from '../types';
import { parseDateInput } from '../types';
import { ConfirmModal } from './ConfirmModal';

export class TodoSidePanel {
  private plugin: AppVersionManagerPlugin;
  private containerEl: HTMLElement;
  private overlayEl: HTMLElement | null = null;
  private panelEl: HTMLElement | null = null;
  private currentProjectId: string | null = null;
  private currentProjectName: string = '';
  private onRefresh?: () => void;

  constructor(containerEl: HTMLElement, plugin: AppVersionManagerPlugin, onRefresh?: () => void) {
    this.containerEl = containerEl;
    this.plugin = plugin;
    this.onRefresh = onRefresh;
  }

  open(projectId: string, projectName: string): void {
    this.currentProjectId = projectId;
    this.currentProjectName = projectName;
    this.render();
    requestAnimationFrame(() => {
      this.overlayEl?.classList.add('open');
      this.panelEl?.classList.add('open');
    });
  }

  close(): void {
    this.overlayEl?.classList.remove('open');
    this.panelEl?.classList.remove('open');
    this.currentProjectId = null;
    this.currentProjectName = '';
  }

  destroy(): void {
    this.overlayEl?.remove();
    this.panelEl?.remove();
    this.overlayEl = null;
    this.panelEl = null;
  }

  private async render(): Promise<void> {
    this.destroy();

    // Overlay
    this.overlayEl = this.containerEl.createDiv({ cls: 'avm-todo-overlay' });
    this.overlayEl.addEventListener('click', () => this.close());

    // Panel
    this.panelEl = this.containerEl.createDiv({ cls: 'avm-todo-panel' });
    this.panelEl.addEventListener('click', (e) => e.stopPropagation());

    // Header
    const header = this.panelEl.createDiv({ cls: 'avm-todo-panel-header' });
    header.createDiv({ cls: 'avm-todo-panel-title', text: `📋 ${this.currentProjectName}` });
    const closeBtn = header.createEl('button', { cls: 'avm-todo-panel-close', text: '✕' });
    closeBtn.addEventListener('click', () => this.close());

    // List
    const listEl = this.panelEl.createDiv({ cls: 'avm-todo-list' });
    await this.renderTodoList(listEl);

    // Footer
    const footer = this.panelEl.createDiv({ cls: 'avm-todo-footer' });

    const inputRow = footer.createDiv({ cls: 'avm-todo-input-row' });
    const input = inputRow.createEl('input', {
      cls: 'avm-todo-input',
      attr: { placeholder: '添加新待办...', type: 'text' }
    });
    const addBtn = inputRow.createEl('button', { cls: 'avm-todo-add-btn', text: '添加' });

    const extraRow = footer.createDiv({ cls: 'avm-todo-extra-row' });
    const linkInput = extraRow.createEl('input', {
      cls: 'avm-todo-input-link',
      attr: { placeholder: '链接 (可选)', type: 'url' }
    });
    const dateInput = extraRow.createEl('input', {
      cls: 'avm-todo-input-date',
      attr: { type: 'date' }
    });
    // Default to today
    const today = new Date();
    dateInput.value = `${today.getFullYear()}-${(today.getMonth() + 1).toString().padStart(2, '0')}-${today.getDate().toString().padStart(2, '0')}`;

    const addTodo = async () => {
      const content = input.value.trim();
      if (!content || !this.currentProjectId) return;

      try {
        await this.plugin.todoService.create(this.currentProjectId, {
          content,
          link: linkInput.value.trim() || undefined,
          dueDate: dateInput.value || undefined,
        });
        this.onRefresh?.();
        input.value = '';
        linkInput.value = '';
        await this.renderTodoList(listEl);
      } catch (error) {
        console.error('Failed to create todo:', error);
      }
    };

    addBtn.addEventListener('click', addTodo);
    const handleEnter = (e: KeyboardEvent) => {
      if (e.key === 'Enter') addTodo();
    };
    input.addEventListener('keydown', handleEnter);
    linkInput.addEventListener('keydown', handleEnter);
    dateInput.addEventListener('keydown', handleEnter);
  }

  private async renderTodoList(listEl: HTMLElement): Promise<void> {
    if (!this.currentProjectId) return;

    const todos = await this.plugin.todoService.getByProjectId(this.currentProjectId);

    listEl.empty();

    if (todos.length === 0) {
      listEl.createDiv({ cls: 'avm-todo-empty', text: '暂无待办' });
      return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = `${today.getFullYear()}-${(today.getMonth() + 1).toString().padStart(2, '0')}-${today.getDate().toString().padStart(2, '0')}`;

    // Sort: incomplete first, then by dueDate
    const sorted = [...todos].sort((a, b) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      if (!a.dueDate && !b.dueDate) return 0;
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return a.dueDate.localeCompare(b.dueDate);
    });

    for (const todo of sorted) {
      const isOverdue = !todo.completed && todo.dueDate && todo.dueDate < todayStr;
      const item = listEl.createDiv({ cls: 'avm-todo-item' });
      if (isOverdue) item.addClass('overdue');
      if (todo.completed) item.addClass('completed');

      // Checkbox
      const checkbox = item.createEl('input', {
        cls: 'avm-todo-checkbox',
        attr: { type: 'checkbox' }
      });
      checkbox.checked = todo.completed;
      checkbox.addEventListener('change', async () => {
        try {
          await this.plugin.todoService.update(this.currentProjectId!, {
            ...todo,
            completed: checkbox.checked
          }, todo.version);
          this.onRefresh?.();
          await this.renderTodoList(listEl);
        } catch (error) {
          console.error('Failed to update todo:', error);
          checkbox.checked = !checkbox.checked; // Revert on error
        }
      });

      // Content
      const content = item.createDiv({ cls: 'avm-todo-content', text: todo.content });
      content.addEventListener('click', () => {
        const newContent = prompt('编辑待办内容:', todo.content);
        if (newContent && newContent.trim() && newContent !== todo.content) {
          this.plugin.todoService.update(this.currentProjectId!, {
            ...todo,
            content: newContent.trim()
          }, todo.version).then(() => {
            this.onRefresh?.();
            this.renderTodoList(listEl);
          }).catch(console.error);
        }
      });

      // Due date
      if (todo.dueDate) {
        const dueEl = item.createDiv({ cls: 'avm-todo-due', text: todo.dueDate });
        if (isOverdue) dueEl.addClass('overdue');
        dueEl.addEventListener('click', () => {
          const newDate = prompt('编辑截止日期 (YYYY-MM-DD):', todo.dueDate);
          if (newDate !== null) {
            const parsed = parseDateInput(newDate);
            this.plugin.todoService.update(this.currentProjectId!, {
              ...todo,
              dueDate: parsed || ''
            }, todo.version).then(() => {
              this.onRefresh?.();
              this.renderTodoList(listEl);
            }).catch(console.error);
          }
        });
      }

      // Link
      if (todo.link) {
        const normalized = /^https?:\/\//i.test(todo.link) ? todo.link : `https://${todo.link}`;
        const linkEl = item.createEl('a', {
          cls: 'avm-todo-link',
          text: '🔗',
          attr: { href: normalized, target: '_blank', rel: 'noopener noreferrer' }
        });
      }

      // Delete button
      const deleteBtn = item.createEl('button', { cls: 'avm-todo-delete', text: '🗑️' });
      deleteBtn.addEventListener('click', () => {
        new ConfirmModal(
          this.plugin.app,
          '删除待办',
          '确定删除这个待办吗？',
          async () => {
            try {
              await this.plugin.todoService.delete(this.currentProjectId!, todo.id);
              this.onRefresh?.();
              await this.renderTodoList(listEl);
            } catch (error) {
              console.error('Failed to delete todo:', error);
            }
          },
          undefined,
          true
        ).open();
      });
    }
  }
}