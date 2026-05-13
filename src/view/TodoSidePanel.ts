import AppVersionManagerPlugin from '../main';
import { Todo, CreateTodoInput } from '../types';
import { parseDateInput } from '../types';
import { ConfirmModal } from './ConfirmModal';

export class TodoSidePanel {
  private plugin: AppVersionManagerPlugin;
  private containerEl: HTMLElement;
  overlayEl: HTMLElement | null = null;
  panelEl: HTMLElement | null = null;
  private currentProjectId: string | null = null;
  private currentProjectName: string = '';
  private onRefresh?: () => void;

  constructor(containerEl: HTMLElement, plugin: AppVersionManagerPlugin, onRefresh?: () => void) {
    this.containerEl = containerEl;
    this.plugin = plugin;
    this.onRefresh = onRefresh;
  }

  isOpen(): boolean {
    return this.overlayEl !== null && this.panelEl !== null &&
      this.overlayEl.classList.contains('open');
  }

  detachFromDOM(): void {
    this.overlayEl?.remove();
    this.panelEl?.remove();
  }

  attachToDOM(parent: HTMLElement): void {
    if (this.overlayEl) parent.appendChild(this.overlayEl);
    if (this.panelEl) parent.appendChild(this.panelEl);
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
    this.onRefresh?.();
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

    const addTodo = async () => {
      const content = input.value.trim();
      if (!content || !this.currentProjectId) return;

      try {
        await this.plugin.todoService.create(this.currentProjectId, {
          content,
          link: linkInput.value.trim() || undefined,
          dueDate: dateInput.value || undefined,
        });
        input.value = '';
        linkInput.value = '';
        dateInput.value = '';
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
          await this.renderTodoList(listEl);
        } catch (error) {
          console.error('Failed to update todo:', error);
          checkbox.checked = !checkbox.checked;
        }
      });

      // Display elements wrapper
      const displayWrap = item.createDiv({ cls: 'avm-todo-display-wrap' });

      // Content
      const contentEl = displayWrap.createDiv({ cls: 'avm-todo-content', text: todo.content });

      // Due date
      let dueEl: HTMLElement | null = null;
      if (todo.dueDate) {
        dueEl = displayWrap.createDiv({ cls: 'avm-todo-due', text: todo.dueDate });
        if (isOverdue) dueEl.addClass('overdue');
      }

      // Link
      let linkEl: HTMLElement | null = null;
      if (todo.link) {
        const normalized = /^https?:\/\//i.test(todo.link) ? todo.link : `https://${todo.link}`;
        linkEl = displayWrap.createEl('a', {
          cls: 'avm-todo-link',
          text: '🔗',
          attr: { href: normalized, target: '_blank', rel: 'noopener noreferrer' }
        });
      }

      // Edit button
      const editBtn = item.createEl('button', { cls: 'avm-todo-edit-btn', text: '✏️' });
      editBtn.addEventListener('click', () => {
        this.enterEditMode(item, displayWrap, editBtn, deleteBtn, todo, listEl);
      });

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

  private enterEditMode(
    item: HTMLElement,
    displayWrap: HTMLElement,
    editBtn: HTMLElement,
    deleteBtn: HTMLElement,
    todo: Todo,
    listEl: HTMLElement
  ): void {
    // Hide display elements and buttons
    displayWrap.hide();
    editBtn.hide();
    deleteBtn.hide();

    // Create edit container
    const editContainer = item.createDiv({ cls: 'avm-todo-edit-container' });

    const contentInput = editContainer.createEl('input', {
      cls: 'avm-todo-edit-content',
      attr: { type: 'text', placeholder: '待办内容' }
    });
    contentInput.value = todo.content;

    const row = editContainer.createDiv({ cls: 'avm-todo-edit-row' });
    const linkInput = row.createEl('input', {
      cls: 'avm-todo-input-link',
      attr: { type: 'url', placeholder: '链接 (可选)' }
    });
    linkInput.value = todo.link;

    const dateInput = row.createEl('input', {
      cls: 'avm-todo-input-date',
      attr: { type: 'date' }
    });
    dateInput.value = todo.dueDate;

    const btnRow = editContainer.createDiv({ cls: 'avm-todo-edit-btns' });
    const saveBtn = btnRow.createEl('button', { cls: 'avm-todo-save-btn', text: '保存' });
    const cancelBtn = btnRow.createEl('button', { cls: 'avm-todo-cancel-btn', text: '取消' });

    const exitEdit = () => {
      editContainer.remove();
      displayWrap.show();
      editBtn.show();
      deleteBtn.show();
    };

    cancelBtn.addEventListener('click', exitEdit);

    saveBtn.addEventListener('click', async () => {
      const newContent = contentInput.value.trim();
      if (!newContent) return;

      try {
        await this.plugin.todoService.update(this.currentProjectId!, {
          ...todo,
          content: newContent,
          link: linkInput.value.trim(),
          dueDate: dateInput.value,
        }, todo.version);
        await this.renderTodoList(listEl);
      } catch (error) {
        console.error('Failed to update todo:', error);
      }
    });

    // Focus content input
    contentInput.focus();
    contentInput.select();
  }
}
