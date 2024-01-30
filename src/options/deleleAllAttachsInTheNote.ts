import { Notice, TFile, TFolder } from "obsidian";
import { getFileParentFolder } from "src/util";
import { deleteFile } from "src/utils/deleteFile";
import AttachFlowPlugin from "../../src/main";
/**
 * delAllAttachsByCommand
 *
 * 1. get current file
 * 2. get TFile of the attachment referenced by file
 */
export const deleteAllAttachs = async (plugin: AttachFlowPlugin) => {
	// 1. get current file
	const activeMd: TFile = app.workspace.getActiveFile() as TFile;
	const resolvedLinks = app.metadataCache.resolvedLinks;
	const attachsPaths: string[] = [];
	for (const [mdFile, links] of Object.entries(resolvedLinks)) {
		if (activeMd?.path === mdFile) {
			let fileCount = 0;
			let flag = false;
			for (const [filePath, nr] of Object.entries(links)) {
				// If the filePath ends with '.md' ,which indicates the file is markdown file, and do not delete it
				if (filePath.match(/.*\.md$/m)) continue;
				// if the attachment in the note has been referenced by other notes  simultaneously skip it.
				if (isReferencedByOtherNotes(filePath, activeMd)) continue;
				attachsPaths.push(filePath);
				try {
					// 2. get TFile of the attachment referenced by file
					const AttachFile: TFile = app.vault.getAbstractFileByPath(
						filePath
					) as TFile;
					if (AttachFile instanceof TFile) {
						deleteFile(AttachFile, plugin);
					}
					const parentFolder = getFileParentFolder(
						AttachFile
					) as TFolder;
					if (!flag) {
						fileCount = parentFolder.children.length;
						flag = !flag;
					}
					fileCount = fileCount - 1;
					if (!fileCount) {
						await deleteFile(parentFolder, plugin);
						// await app.vault.delete(parentFolder, true);
						new Notice(
							"All attachments and its parent folder deleted!",
							3000
						);
					}
				} catch (error) {
					console.warn(error);
				}
			}
		}
	}
	// removeAllUnusedReferenceLinks(activeMd, attachsPaths);
};
/**
 *
 * @param attachPath
 * @param currentMd
 * @returns
 */
const isReferencedByOtherNotes = (
	attachPath: string,
	currentMd: TFile
): boolean => {
	const resolvedLinks = app.metadataCache.resolvedLinks;
	let flag: boolean = false;

	for (const [mdFile, links] of Object.entries(resolvedLinks)) {
		if (mdFile !== currentMd.path) {
			for (const [filePath, nr] of Object.entries(links)) {
				if (filePath === attachPath) {
					flag = true;
				}
			}
		}
	}
	return flag;
};

/**
 * Remove all reference links
 *
 * @param imagePaths  path  list  of the current deleted image without subpath,format as  name.extension
 * @param mdFile  the markdown file containing the deleted image
 */
export const removeAllUnusedReferenceLinks = async (
	activeMd: TFile,
	attachsPaths: string[]
) => {
	// 1.get path list of all unused attachments
	const originContents = await app.vault.read(activeMd);
	const lines = originContents.split("\n");
	const newContents: string[] = [];
	let isNotTargetLine: boolean = true;

	// 2. clear all unused attachments links in the note
	// Escape . to \. for regular expresion
	for (const line of lines) {
		for (const index in attachsPaths) {
			const regMdRefLink = new RegExp(
				"!\\[(.*)?\\]\\(((.*\\/)+)?" + attachsPaths[index] + "\\)",
				"gm"
			);
			const regWikiRefLink2 = new RegExp(
				"!\\[\\[.*?" + attachsPaths[index] + "(\\|\\d*)?\\]\\]",
				"gm"
			);
			const decodeLine = decodeURI(line);
			const isIncludeImage = decodeLine.includes(attachsPaths[index]);
			const isMarkdownStyle = decodeLine.match(regMdRefLink) != null;
			const isWikiStyle = decodeLine.match(regWikiRefLink2) != null;
			if (isIncludeImage && isMarkdownStyle) {
				isNotTargetLine = false;
				newContents.push(decodeLine.replace(regMdRefLink, ""));
				break;
			} else if (isIncludeImage && isWikiStyle) {
				isNotTargetLine = false;
				newContents.push(decodeLine.replace(regWikiRefLink2, ""));
				break;
			} else {
				continue;
			}
		}
		if (isNotTargetLine) newContents.push(line);
	}
	app.vault.adapter.write(activeMd.path, newContents.join("\n"));
};
export const getRefencedLinkCount = (): number => {
	const activeMd: TFile = app.workspace.getActiveFile() as TFile;
	const resolvedLinks = app.metadataCache.resolvedLinks;
	const attachsPaths: string[] = [];
	for (const [mdFile, links] of Object.entries(resolvedLinks)) {
		if (activeMd?.path === mdFile) {
			for (const [filePath, nr] of Object.entries(links)) {
				if (filePath.match(/.*\.md$/m)) continue;
				if (isReferencedByOtherNotes(filePath, activeMd)) continue;
				attachsPaths.push(filePath);
			}
		}
	}
	return attachsPaths.length;
};
