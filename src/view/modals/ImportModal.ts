import { Modal, App as ObsidianApp, Setting, Notice } from 'obsidian';
import { ImportExportService } from '../../services/ImportExportService';
import { createActionButtons } from '../ModalUtils';

export class ImportModal extends Modal {
  importExportService: ImportExportService;
  appId: string;
  onComplete: () => void;

  constructor(app: ObsidianApp, service: ImportExportService, appId: string, onComplete: () => void) {
    super(app);
    this.importExportService = service;
    this.appId = appId;
    this.onComplete = onComplete;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.addClass('avm-modal');

    contentEl.createEl('h2', { text: '导入数据' });

    const fileInput = contentEl.createEl('input', {
      attr: { type: 'file', accept: '.csv,.xlsx,.xls' }
    });

    const statusEl = contentEl.createDiv({ cls: 'avm-import-status' });

    createActionButtons(
      contentEl,
      {
        confirmText: '导入',
        cancelText: '取消',
        onConfirm: async () => {
          const file = fileInput.files?.[0];
          if (!file) {
            new Notice('请选择文件');
            return;
          }

          statusEl.setText('处理中...');

          try {
            let result;
            if (file.name.endsWith('.csv')) {
              const content = await file.text();
              result = await this.importExportService.importFromCSV(content, this.appId);
            } else {
              const buffer = await file.arrayBuffer();
              result = await this.importExportService.importFromExcel(buffer, this.appId);
            }

            new Notice(`导入完成！成功: ${result.success} 条${result.errors.length > 0 ? `\n错误: ${result.errors.join('\n')}` : ''}`);
            statusEl.setText('导入成功');
            setTimeout(() => {
              this.onComplete();
              this.close();
            }, 800);
          } catch (error) {
            statusEl.setText(`导入失败: ${error instanceof Error ? error.message : String(error)}`);
          }
        },
        onCancel: () => this.close()
      }
    );
  }

  onClose() {
    this.contentEl.empty();
  }
}
