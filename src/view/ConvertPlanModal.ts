import { Modal, Setting, App as ObsidianApp, Notice } from 'obsidian';
import { Version, Plan } from '../types';
import { DataService } from '../services/DataService';

interface ConvertPlanData {
  name: string;
  versionId: string;
  manager?: string;
  requirements?: string;
}

export class ConvertPlanModal extends Modal {
  plan: Plan;
  versions: Version[];
  dataService: DataService;
  onSuccess: () => void;

  private errorEl: HTMLElement | null = null;

  constructor(app: ObsidianApp, plan: Plan, versions: Version[], dataService: DataService, onSuccess: () => void) {
    super(app);
    this.plan = plan;
    this.versions = versions;
    this.dataService = dataService;
    this.onSuccess = onSuccess;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.addClass('avm-modal');

    contentEl.createEl('h2', { text: '转为正式项目' });

    this.errorEl = contentEl.createDiv({ cls: 'avm-modal-error' });
    this.errorEl.style.display = 'none';

    const data: ConvertPlanData = {
      name: '',
      versionId: '',
      manager: this.plan.manager || undefined,
      requirements: this.plan.requirements || undefined,
    };

    // 项目名（必填）
    new Setting(contentEl)
      .setName('项目名 *')
      .addText((text) => text.setPlaceholder('输入项目名').onChange((value) => (data.name = value.trim())));

    // 版本（必填）
    new Setting(contentEl).setName('版本 *').addDropdown((dropdown) => {
      this.versions.forEach((v) => {
        dropdown.addOption(v.id, v.versionNumber);
      });
      dropdown.onChange((value) => {
        data.versionId = value;
      });
    });

    // 项目经理（选填）
    new Setting(contentEl).setName('项目经理').addText((text) =>
      text
        .setPlaceholder('选填')
        .setValue(data.manager ?? '')
        .onChange((value) => (data.manager = value || undefined)),
    );

    // 项目需求（选填）
    new Setting(contentEl).setName('项目需求').addTextArea((text) =>
      text
        .setPlaceholder('选填')
        .setValue(data.requirements ?? '')
        .onChange((value) => (data.requirements = value || undefined)),
    );

    // 操作按钮
    const buttonsEl = contentEl.createDiv({ cls: 'avm-modal-buttons' });
    new Setting(buttonsEl)
      .addButton((button) =>
        button
          .setButtonText('确定')
          .setCta()
          .onClick(async () => {
            // 校验
            let errorMsg = '';
            if (!data.name) {
              errorMsg = '请填写项目名';
            } else if (!data.versionId) {
              errorMsg = '请选择版本';
            }

            if (errorMsg) {
              if (this.errorEl) {
                this.errorEl.setText(errorMsg);
                this.errorEl.style.display = 'block';
              }
              return;
            }

            // 隐藏错误
            if (this.errorEl) {
              this.errorEl.style.display = 'none';
            }

            try {
              await this.dataService.createProject({
                name: data.name,
                versionId: data.versionId,
                manager: data.manager,
                requirements: data.requirements,
                b1IntegrationTestTime: '',
                actualReleaseTime: '',
              });
              await this.dataService.deletePlan(this.plan.id);
              this.close();
              this.onSuccess();
            } catch (error) {
              new Notice(error instanceof Error ? error.message : String(error));
            }
          }),
      )
      .addButton((button) => button.setButtonText('取消').onClick(() => this.close()));
  }

  onClose() {
    this.contentEl.empty();
  }
}
