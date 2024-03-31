import AttachFlowPlugin from './main';
import { PluginSettingTab, Setting, App } from 'obsidian';
import { setDebug } from './util';



export interface AttachFlowSettings {
    deleteOption: string;
    logsModal: boolean;
    dragResize: boolean;
    clickView: boolean;
    debug: boolean;
}

export const DEFAULT_SETTINGS: AttachFlowSettings = {
    deleteOption: '.trash',
    logsModal: true,
    dragResize: true,
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
        containerEl.createEl('h2', { text: 'AttachFlow plugin Settings' });

        new Setting(containerEl)
            .setName('Deleted Attachment Destination')
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
            .setName("Drag To Resize Images")
            .setDesc("拖拽调整图片大小")
            .addToggle((toggle) => {
                toggle.setValue(this.plugin.settings.dragResize)
                    .onChange(async (value) => {
                        this.plugin.settings.dragResize = value;
                        await this.plugin.saveSettings();
                    });
            });

        new Setting(containerEl)
            .setName("Click to View Images")
            .setDesc("点击图片右半区域查看大图")
            .addToggle((toggle) => {
                toggle.setValue(this.plugin.settings.clickView)
                    .onChange(async (value) => {
                        this.plugin.settings.clickView = value;
                        await this.plugin.saveSettings();
                    });
            });

        new Setting(containerEl)
            .setName("Print Debug Information")
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
