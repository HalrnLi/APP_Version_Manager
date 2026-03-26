import { Modal, Setting, App as ObsidianApp } from 'obsidian';
import { createActionButtons } from './ModalUtils';

export class ConfirmModal extends Modal {
  private titleText: string;
  private messageText: string;
  private onConfirmCallback: () => Promise<void> | void;
  private onCancelCallback?: () => void;

  constructor(
    app: ObsidianApp,
    titleText: string,
    messageText: string,
    onConfirmCallback: () => Promise<void> | void,
    onCancelCallback?: () => void
  ) {
    super(app);
    this.titleText = titleText;
    this.messageText = messageText;
    this.onConfirmCallback = onConfirmCallback;
    this.onCancelCallback = onCancelCallback;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.addClass('avm-modal');

    contentEl.createEl('h2', { text: this.titleText });
    contentEl.createEl('p', { text: this.messageText });

    createActionButtons(contentEl, {
      confirmText: '确定',
      cancelText: '取消',
      onConfirm: async () => {
        try {
          await this.onConfirmCallback();
        } finally {
          this.close();
        }
      },
      onCancel: () => {
        this.close();
        this.onCancelCallback?.();
      }
    });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
