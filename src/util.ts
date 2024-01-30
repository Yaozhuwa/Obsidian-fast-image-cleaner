import NathanImageCleaner from "src/main";
import { TFile, Notice, TFolder, MarkdownView, Editor} from "obsidian";
import { imageReferencedState } from "./enum/imageReferencedState";
import { resultDetermineImageDeletion as deletionResult } from "./interface/resultDetermineImageDeletion";
import * as fs from 'fs';
import { exec, execSync } from 'child_process';
import { existsSync } from 'fs';
import {
	ElectronWindow, FileSystemAdapterWithInternalApi,
	loadImageBlob, AppWithDesktopInternalApi, EditorInternalApi
  } from "./helpers"

const SUCCESS_NOTICE_TIMEOUT = 1800;

/**
 *
 * @param target_file 要删除的目标文件
 * @param currentMd	当前所在的 markdown 文件
 * @returns
 */
export const checkReferenceInfo = (
	target_file: TFile,
	currentMd: TFile
): { state: number; mdPath: string[] } => {

	const resolvedLinks = app.metadataCache.resolvedLinks;
	let CurMDPath: string;
	// // record the state of image referenced and all paths of markdown referencing to the image
	let result: deletionResult = {
		state: 0,
		mdPath: [],
	};
	let refNum = 0; // record the number of note referencing to the image.
	for (const [mdFile, links] of Object.entries(resolvedLinks)) {
		if (currentMd.path === mdFile) {
			CurMDPath = currentMd.path;
			result.mdPath.unshift(CurMDPath);
		}
		for (const [filePath, nr] of Object.entries(links)) {
			if (target_file?.path === filePath) {
				refNum++;
				// if the deleted target image referenced by current note more than once
				if (nr > 1) {
					result.state = imageReferencedState.MORE;
					result.mdPath.push(mdFile);
					return result;
				}
				result.mdPath.push(mdFile);
			}
		}
	}
	if (refNum > 1) {
		result.state = imageReferencedState.MUTIPLE;
	} else {
		result.state = imageReferencedState.ONCE;
	}
	return result;
};


/**
 * 	通过当前md文件和图片名 获取 图片文件对象   ，类型为TFile
 * 
	@param currentMd  当前需要被删除的curMd所在的markdown文件
	@param FileBaseName  当前需要被删除的curMd名 name.extension
 *  @returns  AttachFile
 */
export const getFileByBaseName = (
	currentMd: TFile,
	FileBaseName: string
): TFile | undefined => {
	const resolvedLinks = app.metadataCache.resolvedLinks;
	for (const [mdFile, links] of Object.entries(resolvedLinks)) {
		if (currentMd.path === mdFile) {
			for (const [filePath, nr] of Object.entries(links)) {
				if (filePath.includes(FileBaseName)) {
					try {
						const AttachFile: TFile =
							app.vault.getAbstractFileByPath(filePath) as TFile;
						if (AttachFile instanceof TFile) {
							return AttachFile;
						}
					} catch (error) {
						new Notice(` cannot get the image file`);
						console.error(error);
					}
				}
			}
		}
	}
};

/**
 * 删除指定附件文件
 *
 * @param file  指定的附件文件
 * @param plugin 当前插件
 * @returns
 */
export const PureClearAttachment = async (
	file: TFile,
	target_type: string,
	plugin: NathanImageCleaner
) => {
	const deleteOption = plugin.settings.deleteOption;
	const delFileFolder = onlyOneFileExists(file);
	const fileFolder = getFileParentFolder(file) as TFolder;
	let name = target_type=='img' ? 'Image' : 'File';
	try {
		if (deleteOption === ".trash") {
			await app.vault.trash(file, false);
			new Notice(
				name + " moved to Obsidian Trash !",
				SUCCESS_NOTICE_TIMEOUT
			);
			if (delFileFolder) {
				await app.vault.trash(fileFolder, false);
				new Notice("Attachment folder have been deleted!", 3000);
			}
		} else if (deleteOption === "system-trash") {
			await app.vault.trash(file, true);
			new Notice(name + " moved to System Trash !", SUCCESS_NOTICE_TIMEOUT);
			if (delFileFolder) {
				await app.vault.trash(fileFolder, true);
				new Notice("Attachment folder have been deleted!", 3000);
			}
		} else if (deleteOption === "permanent") {
			await app.vault.delete(file);
			new Notice(name + " deleted Permanently !", SUCCESS_NOTICE_TIMEOUT);
			if (delFileFolder) {
				await app.vault.delete(fileFolder, true);
				new Notice("Attachment folder have been deleted!", 3000);
			}
		}
	} catch (error) {
		console.error(error);
		new Notice("Faild to delelte the " + name + "!", SUCCESS_NOTICE_TIMEOUT);
	}
};


export const handlerDelFileNew = (
	FileBaseName: string,
	currentMd: TFile,
	plugin: NathanImageCleaner,
	target_type: string,
	target_line: number,
	target_ch: number
) => {
	let logs: string[];
	let modal;
	const target_file = getFileByBaseName(currentMd, FileBaseName) as TFile;
	const refInfo = checkReferenceInfo(target_file, currentMd);
	let state = refInfo.state;
	switch (state) {
		case 0:
			// clear attachment directly
			deleteCurTargetLink(FileBaseName, plugin, target_type, target_line, target_ch);
			PureClearAttachment(target_file, target_type, plugin);
			break;
		case 1:
		case 2:
			deleteCurTargetLink(FileBaseName, plugin, target_type, target_line, target_ch);
			// referenced by eithor only note or other mutiple notes more than once
			logs = refInfo.mdPath as string[];
			// 由于有别的引用，所以只删除当前的引用链接而不删除文件
			new Notice("As other references exist, " + 
				"we have only deleted the current reference link without removing the actual file.", 
				3500);
		default:
			break;
	}
}

// 如果是 type 是 "img"，就准确删除图片引用链接的部分，如果是其他类型，直接删除整行
// target_line （1-based） 和 target_ch 是指示附件所在的位置
export const deleteCurTargetLink = (
	file_base_name: string,
	plugin: NathanImageCleaner,
	target_type: string,
	target_line: number,
	target_ch: number
) => {
	file_base_name = file_base_name.startsWith('/') ? file_base_name.substring(1):file_base_name;
	const editor = plugin.app.workspace.getActiveViewOfType(MarkdownView)?.editor as Editor;
	let line_text = editor.getLine(target_line-1);
	// 非图片，直接删除整行
	if (target_type != 'img')
	{
		if (editor.lineCount()>target_line){
			editor.replaceRange('', {line: target_line-1, ch: 0}, {line: target_line, ch: 0});
		}else{
			editor.replaceRange('', {line: target_line-1, ch: 0}, {line: target_line-1, ch: line_text.length});
		}
		return;
	}
	// 如果是图片，就准确删除图片引用链接的部分
	let match_context = line_text.substring(0, target_ch);
	// console.log('line_text', line_text)
	// console.log('context to match:', match_context);

	let regWikiLink = /\!\[\[[^\[\]]*?\]\]$/g;
    let regMdLink = /\!\[[^\[\]]*?\]\([^\s\)\(\[\]\{\}']*\)$/g;
	let matched_link = "";
	
	if (match_context.charAt(match_context.length-1) == ']'){
		// WIKI LINK
		let match = match_context.match(regWikiLink);
		matched_link = match ? match[0] : '';
		// console.log('matched_link', matched_link)
		if (!matched_link.contains(file_base_name)){
			matched_link = '';
		}
	}
	else if (match_context.charAt(match_context.length-1) == ')'){
		// MD LINK
		let match = match_context.match(regMdLink);
		matched_link = match ? match[0] : '';
		// console.log('matched_link', matched_link)
		if (!matched_link.contains(file_base_name.replace(' ', '%20'))){
			matched_link = '';
		}
	}
	console.log('file_base_name', file_base_name)
	if (matched_link == ''){
		if (line_text.startsWith('>')){
			new Notice("Fail to delete the link-text (for links in callout), please delete it manually!", 0);
		}
		else{
			new Notice("Fail to delete the link-text (for links in table), please delete it manually!", 0);
		}
		return;
	}

	let new_line = match_context.substring(0, match_context.length-matched_link.length)+line_text.substring(target_ch);
	// console.log('new_line', new_line)
	if (!/^\s*$/.test(new_line)){
		editor.setLine(target_line-1, new_line);
	}
	else{
		console.log('line count', editor.lineCount())
		if (editor.lineCount()>target_line){
			editor.replaceRange('', {line: target_line-1, ch: 0}, {line: target_line, ch: 0});
		}
		else{
			editor.replaceRange('', {line: target_line-1, ch: 0}, {line: target_line-1, ch: line_text.length});
			// console.log("replace range", {line: target_line-1, ch: 0}, {line: target_line-1, ch: line_text.length});
		}
	}
	editor.focus();
}

// copy img file to clipboard
export const handlerCopyFile = async (
	FileBaseName: string,
	currentMd: TFile,
	plugin: NathanImageCleaner
) => {
	const file = getFileByBaseName(currentMd, FileBaseName) as TFile;
	const basePath = (file.vault.adapter as any).basePath
	const file_ab_path = basePath + '/' + file.path

	try{
		copyFileToClipboardCMD(file_ab_path);
		new Notice("Copied to clipboard !", SUCCESS_NOTICE_TIMEOUT);
	}
	catch (error) {
		console.error(error);
		new Notice("Faild to copy the file !", SUCCESS_NOTICE_TIMEOUT);
	}

	// copy file to clipboard
	// try {
		// console.log(file_ab_path)

		// 先查看剪贴板内容
		// const clipboardItems = await navigator.clipboard.read();
		// console.log(clipboardItems[0])
		// let tp = clipboardItems[0].types[0]
		// console.log(tp, clipboardItems[0].getType(tp))

		// 复制图片，但是只能以PNG形式粘贴，即使复制的是GIF或者JPG
		// const image = fs.readFileSync(file_ab_path);
		// let file_type: string = 'image/png';
		// const blob = new Blob([image], { type: file_type });
		// const item = new ClipboardItem({ [file_type]: blob });
		// await navigator.clipboard.write([item]);

	// 	copyFileToClipboardCMD(file_ab_path);

	// 	new Notice("Copied to clipboard !", SUCCESS_NOTICE_TIMEOUT);
	// }
	// catch (error) {
	// 	console.error(error);
	// 	new Notice("Faild to copy the file !", SUCCESS_NOTICE_TIMEOUT);
	// }
}

/**
 *
 * @param file target deleted file
 * @returns parent folder or undefiend
 */
export const getFileParentFolder = (file: TFile): TFolder | undefined => {
	if (file instanceof TFile) {
		if (file.parent instanceof TFolder) {
			return file.parent;
		}
	}
	return;
};
/**
 *
 * @param file
 * @returns
 */
const onlyOneFileExists = (file: TFile): boolean => {
	const fileFolder = getFileParentFolder(file) as TFolder;
	return fileFolder.children.length === 1;
};


// 调用系统命令复制文件到系统剪贴板
function copyFileToClipboardCMD(filePath: string) {

	if (!existsSync(filePath)) {
        console.error(`File ${filePath} does not exist`);
        return;
    }

    const callback = (error: Error | null, stdout: string, stderr: string) => {
        if (error) {
			new Notice(`Error executing command: ${error.message}`, SUCCESS_NOTICE_TIMEOUT);
			console.error(`Error executing command: ${error.message}`);
			return;
        }
    };

    if (process.platform === 'darwin') {
		// 解决方案1: 会调出Finder，产生瞬间的窗口，但是该复制操作完全是系统级别的，没有任何限制
		execSync(`open -R "${filePath}"`);
        execSync(`osascript -e 'tell application "System Events" to keystroke "c" using command down'`);
        execSync(`osascript -e 'tell application "System Events" to keystroke "w" using command down'`);
		execSync(`open -a "Obsidian.app"`);

		// ----------------------------------------------
		// 测试切换输入法方案: 模拟Shift键按下，但是失败了
		// execSync(`osascript -e 'tell application "System Events" to key down shift'`);
		// execSync(`osascript -e 'delay 0.05'`);
		// execSync(`osascript -e 'tell application "System Events" to key up shift'`);
		// ----------------------------------------------

		// ----------------------------------------------
		// 另一种解决方案，不会调出Finder，但是复制的文件无法粘贴到word或者微信中
		// const appleScript = `
		// 	on run args
		// 		set the clipboard to POSIX file (first item of args)
		// 	end
		// 	`;
		// exec(`osascript -e '${appleScript}' "${filePath}"`, callback);
		// ----------------------------------------------

    } else if (process.platform === 'linux') {
		// 目前方案
		// xclip -selection clipboard -t $(file --mime-type -b /path/to/your/file) -i /path/to/your/file
        // exec(`xclip -selection c < ${filePath}`, callback);
		exec(`xclip -selection clipboard -t $(file --mime-type -b "${filePath}") -i "${filePath}"`, callback);
    } else if (process.platform === 'win32') {
        exec(`powershell -command "Set-Clipboard -Path '${filePath}'"`, callback);
    }
}