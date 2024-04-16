import AttachFlowPlugin from './main';
import { PluginSettingTab, Setting, App, Notice } from 'obsidian';
import { setDebug } from './util';



export interface AttachFlowSettings {
    deleteOption: string;
    logsModal: boolean;
    dragResize: boolean;
    resizeInterval: number;
    clickView: boolean;
    debug: boolean;
}

export const DEFAULT_SETTINGS: AttachFlowSettings = {
    deleteOption: '.trash',
    logsModal: true,
    dragResize: true,
    resizeInterval: 0,
    clickView: false,
    debug: false,
};


export class AttachFlowSettingsTab extends PluginSettingTab {

    plugin: AttachFlowPlugin;


    constructor(app: App, plugin: AttachFlowPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }


    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        new Setting(containerEl)
            .setName('Deleted attachment destination')
            .setDesc('Select where you want Attachments to be moved once they are deleted')
            .addDropdown((dropdown) => {
                dropdown.addOption('permanent', 'Delete Permanently');
                dropdown.addOption('.trash', 'Move to Obsidian Trash');
                dropdown.addOption('system-trash', 'Move to System Trash');
                dropdown.setValue(this.plugin.settings.deleteOption);
                dropdown.onChange((option) => {
                    this.plugin.settings.deleteOption = option;
                    this.plugin.saveSettings();
                });
            });

        new Setting(containerEl)
            .setName("Click to view images")
            .setDesc("点击图片右半区域查看大图")
            .addToggle((toggle) => {
                toggle.setValue(this.plugin.settings.clickView)
                    .onChange(async (value) => {
                        this.plugin.settings.clickView = value;
                        await this.plugin.saveSettings();
                    });
            });

        new Setting(containerEl).setName('Drag to resize images').setHeading();
        new Setting(containerEl)
            .setName("Drag to resize images")
            .setDesc("拖拽调整图片大小开关")
            .addToggle((toggle) => {
                toggle.setValue(this.plugin.settings.dragResize)
                    .onChange(async (value) => {
                        this.plugin.settings.dragResize = value;
                        await this.plugin.saveSettings();
                    });
            });

        new Setting(containerEl)
            .setName("Resize interval")
            .setDesc("拖拽调节最小刻度")
            .addText((text) => {
                text.setValue(this.plugin.settings.resizeInterval.toString())
                    .onChange(async (value) => {
                        // 判断输入值是否为正整数
                        if (value === '') {
                            // Input is empty. Set to default value 0
                            this.plugin.settings.resizeInterval = 0;
                            await this.plugin.saveSettings();
                        }else if (/^\d+$/.test(value) && Number(value) >= 0) {
                            this.plugin.settings.resizeInterval = parseInt(value);
                            await this.plugin.saveSettings();
                        } else {
                            // 不符合要求时，可以给出提示
                            new Notice('请输入正整数');
                            text.setValue(this.plugin.settings.resizeInterval.toString()); // 重新设置为原来的值
                        }
                    });
            });

        new Setting(containerEl).setName('Debug').setHeading();
        new Setting(containerEl)
            .setName("Print debug information in console")
            .setDesc("控制台输出调试信息")
            .addToggle((toggle) => {
                toggle.setValue(this.plugin.settings.debug)
                    .onChange(async (value) => {
                        this.plugin.settings.debug = value;
                        setDebug(value);
                        await this.plugin.saveSettings();
                    });
            });
    }
}
