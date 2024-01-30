import { Notice, TFile, TFolder } from "obsidian";
import AttachFlowPlugin from "src/main";
const SUCCESS_NOTICE_TIMEOUT = 1800;
/**
 * Delete attachment
 * @param file
 */
export const deleteFile = async (
	file: TFile | TFolder,
	plugin: AttachFlowPlugin
) => {
	const deleteOption = plugin.settings.deleteOption;
	try {
		if (deleteOption === ".trash") {
			await app.vault.trash(file, false);
		} else if (deleteOption === "system-trash") {
			await app.vault.trash(file, true);
		} else if (deleteOption === "permanent") {
			await app.vault.delete(file);
		}
	} catch (error) {
		console.error(error);
		new Notice("Faild to delete the file/folder !", SUCCESS_NOTICE_TIMEOUT);
	}
};
/**
 * Delete note
 * @param file
 */
/* export const deleteNote = (file: TFile) => {
	// @ts-ignore
	app.fileManager.promptForDeletion(file);
}; */
