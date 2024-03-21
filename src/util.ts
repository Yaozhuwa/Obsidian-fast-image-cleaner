import AttachFlowPlugin from "src/main";
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

let DEBUG = true;
const SUCCESS_NOTICE_TIMEOUT = 1800;

export const print=(message?: any, ...optionalParams: any[]) =>{
    if (DEBUG) {
        console.log(message, ...optionalParams);
    }
}

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
				print('filePath', filePath)
				print(FileBaseName)
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
	plugin: AttachFlowPlugin
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
	plugin: AttachFlowPlugin,
	target_type: string,
	target_pos: number,
	in_table: boolean,
	in_callout: boolean
) => {
	let logs: string[];
	let modal;
	const target_file = getFileByBaseName(currentMd, FileBaseName) as TFile;
	const refInfo = checkReferenceInfo(target_file, currentMd);
	let state = refInfo.state;
	switch (state) {
		case 0:
			// clear attachment directly
			deleteCurTargetLink(FileBaseName, plugin, target_type, target_pos, in_table, in_callout);
			PureClearAttachment(target_file, target_type, plugin);
			break;
		case 1:
		case 2:
			deleteCurTargetLink(FileBaseName, plugin, target_type, target_pos, in_table, in_callout);
			// referenced by eithor only note or other mutiple notes more than once
			logs = refInfo.mdPath as string[];
			// 由于有别的引用，所以只删除当前的引用链接而不删除文件
			new Notice("As other references of current file exist, " + 
				"just deleted the current reference link without deleting the actual file.", 
				3500);
		default:
			break;
	}
}

// 如果是 type 是 "img"，就准确删除图片引用链接的部分，如果是其他类型，直接删除整行
// target_line （1-based） 和 target_ch 是指示附件所在的位置
export const deleteCurTargetLink = (
	file_base_name: string,
	plugin: AttachFlowPlugin,
	target_type: string,
	target_pos: number,
	in_table: boolean,
	in_callout: boolean
) => {
	file_base_name = file_base_name.startsWith('/') ? file_base_name.substring(1):file_base_name;
	const activeView = plugin.app.workspace.getActiveViewOfType(MarkdownView) as MarkdownView;
	const editor = activeView.editor;
	//  @ts-expect-error, not typed
	const editorView = editor.cm as EditorView;

	let target_line = editorView.state.doc.lineAt(target_pos);
	let line_text = target_line.text;

	if (!in_table && !in_callout){
		let finds = findLinkInLine(file_base_name, line_text);
		if (finds.length == 0){
			new Notice("Fail to find the link-text, please delete it manually!", 0);
			return;
		}
		else if(finds.length != 1){
			new Notice("Find multiple same Link in current line, please delete it manually!", 0);
			return;
		}
		else{
			// editorView.dispatch({changes: {from: target_line.from + finds[0][0], to: target_line.from + finds[0][1], insert: ''}});
			editor.replaceRange('', {line: target_line.number-1, ch: finds[0][0]}, {line: target_line.number-1, ch: finds[0][1]});
			return;
		}
	}

	type RegDictionary = {
		[key: string]: RegExp;
	};
	
	let startReg: RegDictionary = {
		'table': /^\s*\|/,
		'callout': /^>/,
	};

	let mode = in_table ? 'table' : 'callout';
	let finds_lines: number[] = [];
	let finds_all: [from:number, to:number][] = [];
	for (let i=target_line.number; i<=editor.lineCount(); i++){
		let line_text = editor.getLine(i-1);
		if (!startReg[mode].test(line_text)) break;
		print(`line_${i}_text:`, line_text)
		let finds = findLinkInLine(file_base_name, line_text);
		if (finds.length > 0){
			finds_lines.push(...new Array(finds.length).fill(i));
			finds_all.push(...finds);
		}
	}

	for (let i=target_line.number-1; i>=1; i--){
		let line_text = editor.getLine(i-1);
		if (!startReg[mode].test(line_text)) break;
		print(`line_${i}_text:`, line_text)
		let finds = findLinkInLine(file_base_name, line_text);
		if (finds.length > 0){
			finds_lines.push(...new Array(finds.length).fill(i));
			finds_all.push(...finds);
		}
	}

	if (finds_all.length == 0){
		new Notice(`Fail to find the link-text (for links in ${mode}), please delete it manually!`, 0);
		return;
	}
	else if(finds_all.length != 1){
		new Notice(`Find multiple same Link in current ${mode}, please delete it manually!`, 0);
		return;
	}
	else{
		editor.replaceRange('', {line: finds_lines[0]-1, ch: finds_all[0][0]}, {line: finds_lines[0]-1, ch: finds_all[0][1]});
	}

	editor.focus();
}

// copy img file to clipboard
export const handlerCopyFile = async (
	FileBaseName: string,
	currentMd: TFile,
	plugin: AttachFlowPlugin
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
		// exec(`xclip -selection clipboard -t $(file --mime-type -b "${filePath}") -i "${filePath}"`, callback);
    } else if (process.platform === 'win32') {
        exec(`powershell -command "Set-Clipboard -Path '${filePath}'"`, callback);
    }
}

const findLinkInLine = (file_name: string, line_text: string) =>{
	const file_name_mdlink = file_name.replace(/ /g, '%20');
	let regWikiLink = /\!\[\[[^\[\]]*?\]\]/g;
    let regMdLink = /\!\[[^\[\]]*?\]\([^\s\)\(\[\]\{\}']*\)/g;
	print('target_name (WIKI/MD):', file_name, file_name_mdlink)

	// console.log('search in line_text:', line_text)
	let search_result: [from:number, to:number][] = []
	if (line_text.includes(file_name)){
		while(true){
			let match = regWikiLink.exec(line_text);
			if(!match) break;
			let matched_link = match[0];
			print('matched_link:', matched_link)
			print('matched_link.includes(file_name)', matched_link.includes(file_name))
			if (matched_link.includes(file_name)){
				search_result.push([match.index, match.index+matched_link.length]);
			}
		}
	}

	if (line_text.includes(file_name_mdlink)){
		while(true){
			let match = regMdLink.exec(line_text);
			if(!match) break;
			let matched_link = match[0];
			print('matched_link:', matched_link)
			print('matched_link.includes(file_name_mdlink)', matched_link.includes(file_name_mdlink))
			if (matched_link.includes(file_name_mdlink)){
				search_result.push([match.index, match.index+matched_link.length]);
			}
		}
	}
	return search_result;
}