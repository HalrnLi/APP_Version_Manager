import { Modal, App as ObsidianApp, Setting } from 'obsidian';
import { Plan, parseDateInput } from '../../types';
import { createActionButtons } from '../ModalUtils';

export interface PlanFormData {
  topic: string;
  manager?: string;
  testDate?: string;
  releaseDate?: string;
  requirements?: string;
}

export class PlanModal extends Modal {
  plan?: Plan;
  onSubmit: (data: PlanFormData) => void;

  constructor(app: ObsidianApp, plan: Plan | undefined, onSubmit: (data: PlanFormData) => void) {
    super(app);
    this.plan = plan;
    this.onSubmit = onSubmit;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.addClass('avm-modal');

    contentEl.createEl('h2', { text: this.plan ? '编辑规划' : '新建规划' });

    const data: PlanFormData = {
      topic: this.plan?.topic ?? '',
      manager: this.plan?.manager ?? '',
      testDate: this.plan?.testDate ?? '',
      releaseDate: this.plan?.releaseDate ?? '',
      requirements: this.plan?.requirements ?? ''
    };

    new Setting(contentEl)
      .setName('项目主题 *')
      .addText(text => text
        .setPlaceholder('输入项目主题')
        .setValue(data.topic)
        .onChange(value => data.topic = value));

    new Setting(contentEl)
      .setName('项目经理')
      .addText(text => text
        .setPlaceholder('选填')
        .setValue(data.manager ?? '')
        .onChange(value => data.manager = value || undefined));

    new Setting(contentEl)
      .setName('提测时间')
      .addText(text => text
        .setPlaceholder('选填，如 2026-04-01')
        .setValue(data.testDate ?? '')
        .onChange(value => data.testDate = parseDateInput(value) || undefined));

    new Setting(contentEl)
      .setName('发布时间')
      .addText(text => text
        .setPlaceholder('选填，如 2026-05-01')
        .setValue(data.releaseDate ?? '')
        .onChange(value => data.releaseDate = parseDateInput(value) || undefined));

    new Setting(contentEl)
      .setName('项目需求')
      .addTextArea(text => text
        .setPlaceholder('选填')
        .setValue(data.requirements ?? '')
        .onChange(value => data.requirements = value || undefined));

    createActionButtons(
      contentEl,
      {
        confirmText: this.plan ? '保存' : '创建',
        cancelText: '取消',
        onConfirm: () => {
          if (data.topic.trim()) {
            this.onSubmit({
              topic: data.topic.trim(),
              manager: data.manager?.trim() || '',
              testDate: data.testDate?.trim() || '',
              releaseDate: data.releaseDate?.trim() || '',
              requirements: data.requirements?.trim() || ''
            });
            this.close();
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
