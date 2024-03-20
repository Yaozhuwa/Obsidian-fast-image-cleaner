import { Menu, MenuItem, Notice, Plugin, TFile, MarkdownView, Platform } from "obsidian";
import { addCommand } from "./config/addCommand-config";
import { AttachFlowSettingsTab } from "./settings";
import { AttachFlowSettings, DEFAULT_SETTINGS } from "./settings";
import * as Util from "./util";
import { print } from './util'
import { getMouseEventTarget } from "./utils/handlerEvent";
import { DeleteAllLogsModal } from "./modals/deletionPrompt";
import { EditorView, keymap, ViewUpdate } from '@codemirror/view';
import {
	ElectronWindow, FileSystemAdapterWithInternalApi,
	loadImageBlob, AppWithDesktopInternalApi, EditorInternalApi, onElement
} from "./helpers"


export default class AttachFlowPlugin extends Plugin {
	settings: AttachFlowSettings;

	async onload() {
		console.log("AttachFlow plugin loaded...");

		this.addSettingTab(new AttachFlowSettingsTab(this.app, this));

		await this.loadSettings();
		this.registerDocument(document);

		app.workspace.on("window-open", (workspaceWindow, window) => {
			this.registerDocument(window.document);
		});
		// add contextmenu on file context
		this.registerEvent(
			this.app.workspace.on("file-menu", (menu, file) => {
				if (file instanceof TFile) {
					if (!file.path.endsWith(".md")) return;
					const addMenuItem = (item: MenuItem) => {
						item.setTitle("Delete file and its attachments")
							.setIcon("trash-2")
							.setSection("danger");
						item.onClick(async () => {
							const modal = new DeleteAllLogsModal(file, this);
							modal.open();
						});
					};
					menu.addItem(addMenuItem);
				}
			})
		);
		// register all commands in addCommand function
		addCommand(this);
	}

	onunload() {
		console.log("AttachFlow plugin unloaded...");
	}

	registerDocument(document: Document) {
		this.register(
			onElement(
				document,
				"contextmenu" as keyof HTMLElementEventMap,
				"img, iframe, video, div.file-embed-title, audio",
				this.onClick.bind(this)
			)
		);
		
		this.register(
			onElement(
				document,
				"mousedown",
				"img, video",
				(event: MouseEvent) => {
					if (event.button === 0) {
						event.preventDefault();
					}
					const img = event.target as HTMLImageElement | HTMLVideoElement;
					const editor = this.app.workspace.getActiveViewOfType(MarkdownView)?.editor;
					//  @ts-expect-error, not typed
					const editorView = editor.cm as EditorView;
					const target_pos = editorView.posAtDOM(img);
					let target_line = editorView.state.doc.lineAt(target_pos);

					const inTable: boolean = img.closest('table') != null;
					const inCallout: boolean = img.closest('.callout') != null;
					print('InTable', inTable)

					const rect = img.getBoundingClientRect();
					const x = event.clientX - rect.left;
					const y = event.clientY - rect.top;
					const edgeSize = 30; // size of the edge in pixels
					if (x < edgeSize || y < edgeSize || x > rect.width - edgeSize || y > rect.height - edgeSize) {
						const startX = event.clientX;
						const startY = event.clientY;
						const startWidth = img.clientWidth;
						const startHeight = img.clientHeight;
						let lastUpdateX = startX;
						let lastUpdateY = startY;
						const updateThreshold = 5; // The mouse must move at least 5 pixels before an update
						
						const onMouseMove = (event: MouseEvent) => {
							const currentX = event.clientX;
							let newWidth = startWidth + (currentX - startX);
							const aspectRatio = startWidth / startHeight;

							// Ensure the image doesn't get too small
							newWidth = Math.max(newWidth, 50);

							let newHeight = newWidth / aspectRatio;
							// Round the values to the nearest whole number
							newWidth = Math.round(newWidth);
							newHeight = Math.round(newHeight);

							// Apply the new dimensions to the image or video
							if (img instanceof HTMLImageElement) {
								img.style.border = 'solid';
								img.style.borderWidth = '2px';
								img.style.borderColor = 'blue';
								img.style.boxSizing = 'border-box';
								img.style.width = `${newWidth}px`;
								// img.style.height = `${newHeight}px`;
							} else if (img instanceof HTMLVideoElement) {
								img.style.border = 'solid';
								img.style.borderWidth = '2px';
								img.style.borderColor = 'blue';
								img.style.boxSizing = 'border-box';
								// Check if img.parentElement is not null before trying to access its clientWidth property
								if (img.parentElement){
									const containerWidth = img.parentElement.clientWidth;
									const newWidthPercentage = (newWidth / containerWidth) * 100;
									img.style.width = `${newWidthPercentage}%`;
								}
							}

							// Check if the mouse has moved more than the update threshold
							if (Math.abs(event.clientX - lastUpdateX) > updateThreshold) {
								const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
								if (activeView) {
									print("update new Width", newWidth);
									let imageName = img.getAttribute('src');
									if (imageName?.startsWith('http')){
										updateExternalLink(activeView, img, target_pos, newWidth, newHeight, inTable, inCallout);
									}
									else{
										imageName = img.parentElement?.getAttribute('src') as string;
										updateInternalLink(activeView, img, target_pos, imageName, newWidth, newHeight, inTable, inCallout);
									}
								}

								// Update the last update coordinates
								lastUpdateX = event.clientX;
								lastUpdateY = event.clientY;
							}
						}

						const onMouseUp = (event: MouseEvent) => {
							// const editor = this.app.workspace.getActiveViewOfType(MarkdownView)?.editor;
							// //  @ts-expect-error, not typed
							// const editorView = editor.cm as EditorView;
							// if (table_changes){
							// 	editorView.dispatch(table_changes[0]);
							// }
							event.preventDefault()
							img.style.borderStyle = 'none'
							img.style.outline = 'none';
							img.style.cursor = 'default';
							document.removeEventListener("mousemove", onMouseMove);
							document.removeEventListener("mouseup", onMouseUp);
						};
						document.addEventListener("mousemove", onMouseMove);
						document.addEventListener("mouseup", onMouseUp);
					}
				}
			)
		)
		this.register(
			onElement(
				document,
				"mouseover",
				"img, video",
				(event: MouseEvent) => {
					// if (!this.settings.resizeByDragging) return;
					const img = event.target as HTMLImageElement | HTMLVideoElement;
					const rect = img.getBoundingClientRect(); // Cache this
					const edgeSize = 30; // size of the edge in pixels

					// Throttle mousemove events
					let lastMove = 0;
					const mouseOverHandler = (event: MouseEvent) => {
						const now = Date.now();
						if (now - lastMove < 100) return; // Only execute once every 100ms
						lastMove = now;

						const x = event.clientX - rect.left;
						const y = event.clientY - rect.top;

						if ((x >= rect.width - edgeSize || x <= edgeSize) || (y >= rect.height - edgeSize || y <= edgeSize)) {
							img.style.cursor = 'nwse-resize';
							img.style.outline = 'solid';
							img.style.outlineWidth = '6px';
							img.style.outlineColor = '#dfb0f283';
						} else {
							img.style.cursor = 'default';
							img.style.outline = 'none';
						}
					};
					this.registerDomEvent(img, 'mousemove', mouseOverHandler);
				}
			)
		);

		this.register(
			onElement(
				document,
				"mouseout",
				"img, video",
				(event: MouseEvent) => {
					// if (!this.settings.resizeByDragging) return;
					const img = event.target as HTMLImageElement | HTMLVideoElement;
					img.style.borderStyle = 'none';
					img.style.cursor = 'default';
					img.style.outline = 'none';
				}
			)
		);
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
	registerEscapeButton(menu: Menu, document: Document = activeDocument) {
		menu.register(
			onElement(
				document,
				"keydown" as keyof HTMLElementEventMap,
				"*",
				(e: KeyboardEvent) => {
					if (e.key === "Escape") {
						e.preventDefault();
						e.stopPropagation();
						menu.hide();
					}
				}
			)
		);
	}


	/**
	 * 设置菜单按钮，并设置点击事件
	 *
	 * @param menu
	 * @param FileBaseName
	 * @param currentMd
	 */
	addMenuExtendedSourceMode = (menu: Menu, FileBaseName: string, currentMd: TFile, target_type: string, target_pos: number, inTable: boolean, inCallout: boolean) => {
		menu.addItem((item: MenuItem) =>
			item
				.setIcon("trash-2")
				.setTitle("Clear file and associated link")
				// .setChecked(true)
				.onClick(async () => {
					try {
						// Util.handlerDelFile(FileBaseName, currentMd, this);
						Util.handlerDelFileNew(FileBaseName, currentMd, this, target_type, target_pos, inTable, inCallout);
					} catch {
						new Notice("Error, could not clear the file!");
					}
				})
		);
		this.addMenuExtendedPreviewMode(menu, FileBaseName, currentMd);
	};


	/**
	 * 设置菜单按钮，并设置点击事件
	 *
	 * @param menu
	 * @param FileBaseName
	 * @param currentMd
	 */
	addMenuExtendedPreviewMode = (menu: Menu, FileBaseName: string, currentMd: TFile) => {
		const file = Util.getFileByBaseName(currentMd, FileBaseName) as TFile;
		const basePath = (file.vault.adapter as any).basePath;
		const relativeFilePath = file.path;

		menu.addItem((item: MenuItem) =>
			item
				.setIcon("copy")
				.setTitle("Copy file to clipboard")
				// .setChecked(true)
				.onClick(async () => {
					try {
						Util.handlerCopyFile(FileBaseName, currentMd, this);
					} catch {
						new Notice("Error, could not copy the file!");
					}
				})
		);
		menu.addItem((item: MenuItem) => item
			.setIcon("arrow-up-right")
			.setTitle("Open in default app")
			.onClick(() => (this.app as AppWithDesktopInternalApi).openWithDefaultApp(file.path))
		);
		menu.addItem((item: MenuItem) => item
			.setIcon("arrow-up-right")
			.setTitle(Platform.isMacOS ? "Reveal in finder" : "Show in system explorer")
			.onClick(() => {
				(this.app as AppWithDesktopInternalApi).showInFolder(file.path);
			})
		);
		menu.addItem((item: MenuItem) => item
			.setIcon("folder")
			.setTitle("Reveal file in navigation")
			.onClick(() => {
				const abstractFilePath = this.app.vault.getAbstractFileByPath(file.path);
				(this.app as any).internalPlugins.getEnabledPluginById("file-explorer").revealInFolder(abstractFilePath);
			})
		);
	};


	/**
	 * 鼠标点击事件
	 */
	onClick(event: MouseEvent) {
		const target = getMouseEventTarget(event);
		const curTargetType = target.localName;
		// console.log(target.parentElement)
		// console.log('target, localName', target, target.localName)

		const currentMd = app.workspace.getActiveFile() as TFile;

		const RegFileBaseName = new RegExp(/\/?([^\/\n]+\.[\w\d]+$)/, "m");
		let target_name = target.parentElement?.getAttribute("src") as string;
		const FileBaseName = (target_name?.match(RegFileBaseName) as string[])[0];
		// console.log('target_name', target_name)
		// console.log('FileBaseName', FileBaseName)
		const SupportedTargetType = ["img", "iframe", "video", "div", "audio"];

		const menu = new Menu();

		if (!SupportedTargetType.includes(curTargetType)) return;

		// 判断当前点击的地方是否为表格
		// const inTable:boolean = target.parentElement?.parentElement?.getAttribute('class')=='table-cell-wrapper';
		const inTable: boolean = target.closest('table') != null;
		const inCallout: boolean = target.closest('.callout') != null;
		const inPreview:boolean = this.app.workspace.getActiveViewOfType(MarkdownView)?.getMode() == "preview";

		// 判断当前是否是阅读模式
		// console.log('Mode:', this.app.workspace.getActiveViewOfType(MarkdownView)?.getMode());
		if (inPreview) {
			if (SupportedTargetType.includes(curTargetType)) {
				// console.log("FileBaseName", FileBaseName);
				this.addMenuExtendedPreviewMode(menu, target_name, currentMd);
			}
		}
		else{
			const editor = this.app.workspace.getActiveViewOfType(MarkdownView)?.editor;
			//  @ts-expect-error, not typed
			const editorView = editor.cm as EditorView;
			const target_pos = editorView.posAtDOM(target);
			// console.log('target', target)
			// console.log('target.parentElement', target.parentElement)
			// const prev_pos = editorView.posAtDOM(target.parentElement?.previousElementSibling as HTMLElement);
			// const next_pos = editorView.posAtDOM(target.parentElement?.nextElementSibling as HTMLElement);
			// let prev_target_line = editorView.state.doc.lineAt(prev_pos);
			// let next_target_line = editorView.state.doc.lineAt(next_pos);
			// console.log('prev target line information: line-content, line-number(1-based), target.ch');
			// console.log(prev_target_line.text, prev_target_line.number, prev_pos-prev_target_line.from)

			let target_line = editorView.state.doc.lineAt(target_pos);
			print('target line information: line-content, line-number(1-based), target.ch');
			print(target_line.text, target_line.number, target_pos - target_line.from);

			// ---------- EditorInternalApi.posAtMouse 不是很准确，不知道为什么，行号和ch都不准确 ----------
			// const editor2 = this.app.workspace.getActiveViewOfType(MarkdownView)?.editor as EditorInternalApi;
		    // const position = editor2.posAtMouse(event);
			// console.log('InterAPIPos line information: line-content, line-number(1-based), target.ch')
			// console.log(editor?.getLine(position.line), position.line+1, position.ch)
			// ---------------------------------------------------------------------------------------

			// console.log('next target line information: line-content, line-number(1-based), target.ch');
			// console.log(next_target_line.text, next_target_line.number, next_pos-next_target_line.from)

			if (SupportedTargetType.includes(curTargetType)) {
				this.addMenuExtendedSourceMode(menu, target_name, currentMd, curTargetType, target_pos, inTable, inCallout);
			}
		}

		this.registerEscapeButton(menu);
		
		if (inTable && !inPreview){
			menu.showAtPosition({ x: event.pageX, y: event.pageY-136});
		}
		else{
			menu.showAtPosition({ x: event.pageX, y: event.pageY });
		}
		this.app.workspace.trigger("AttachFlow:contextmenu", menu);
	}

}

function updateInternalLink(activeView: MarkdownView, target: HTMLImageElement | HTMLVideoElement, target_pos: number, imageName: string, newWidth: number, newHeight: number, inTable: boolean, inCallout: boolean): void {
	const editor = activeView.editor;
	//  @ts-expect-error, not typed
	const editorView = editor.cm as EditorView;
	let target_line = editorView.state.doc.lineAt(target_pos);
	// print('target line information: line-content, line-number(1-based), target.ch');
	// print(target_line.text, target_line.number, target_pos - target_line.from);

	if (!inCallout && !inTable){
		let newLineText = matchLineWithInternalLink(target_line.text, imageName, newWidth, inTable);
		if (newLineText){
			editorView.dispatch({ changes: { from: target_line.from, to: target_line.to, insert: newLineText } });
		}
	}

	if (inTable){
		const table_start_reg = /^\s*\|/;
		let start_line_number = target_line.number;
		for (let i = start_line_number; i <= editor.lineCount(); i++){
			let line = editorView.state.doc.line(i);
			if (!table_start_reg.test(line.text)) break;
			let newLineText = matchLineWithInternalLink(line.text, imageName, newWidth, inTable);
			if (newLineText){
				// editor.replaceRange(newLineText, {line: i-1, ch:0}, {line:i-1, ch:line.text.length})
				editorView.dispatch({changes: { from: line.from, to: line.to, insert: newLineText}})
				return;
			}
		}

		for (let i = start_line_number; i >= 1; i--){
			let line = editorView.state.doc.line(i);
			if (!table_start_reg.test(line.text)) return;
			let newLineText = matchLineWithInternalLink(line.text, imageName, newWidth, inTable);
			if (newLineText){
				// editor.replaceRange(newLineText, {line: i-1, ch:0}, {line:i-1, ch:line.text.length})
				editorView.dispatch({changes: { from: line.from, to: line.to, insert: newLineText}})
				return;
			}
		}
	}

	if (inCallout){
		const callout_start_reg = /^>/;
		let start_line_number = target_line.number;
		for (let i = start_line_number; i <= editor.lineCount(); i++){
			let line = editorView.state.doc.line(i);
			if (!callout_start_reg.test(line.text)) break;
			let newLineText = matchLineWithInternalLink(line.text, imageName, newWidth, inTable);
			if (newLineText){
				// editor.replaceRange(newLineText, {line: i-1, ch:0}, {line:i-1, ch:line.text.length})
				editorView.dispatch({changes: { from: line.from, to: line.to, insert: newLineText}})
				return;
			}
		}

		for (let i = start_line_number; i >= 1; i--){
			let line = editorView.state.doc.line(i);
			if (!callout_start_reg.test(line.text)) return;
			let newLineText = matchLineWithInternalLink(line.text, imageName, newWidth, inTable);
			if (newLineText){
				// editor.replaceRange(newLineText, {line: i-1, ch:0}, {line:i-1, ch:line.text.length})
				editorView.dispatch({changes: { from: line.from, to: line.to, insert: newLineText}})
				return;
			}
		}
	}
}


function updateExternalLink(activeView: MarkdownView, target: HTMLImageElement | HTMLVideoElement, target_pos: number, newWidth: number, newHeight: number, inTable: boolean, inCallout: boolean): void {
	const editor = activeView.editor;
	//  @ts-expect-error, not typed
	const editorView = editor.cm as EditorView;
	let target_line = editorView.state.doc.lineAt(target_pos);

	const link = target.getAttribute('src') as string;
	const altText = target.getAttribute("alt") as string;
	let pureAltText = altText.replace(/\|\d+(\|\d+)?$/g, '');

	if (!inCallout && !inTable){
		let newLineText = matchLineWithExternalLink(target_line.text, link, altText, newWidth, inTable);
		if (newLineText){
			editorView.dispatch({ changes: { from: target_line.from, to: target_line.to, insert: newLineText } });
		}
	}

	if (inTable){
		const table_start_reg = /^\s*\|/;
		let start_line_number = target_line.number;
		for (let i = start_line_number; i <= editor.lineCount(); i++){
			let line = editorView.state.doc.line(i);
			if (!table_start_reg.test(line.text)) break;
			let newLineText = matchLineWithExternalLink(line.text, link, altText, newWidth, inTable);
			if (newLineText){
				// editor.replaceRange(newLineText, {line: i-1, ch:0}, {line:i-1, ch:line.text.length})
				editorView.dispatch({changes: { from: line.from, to: line.to, insert: newLineText}})
				return;
			}
		}

		for (let i = start_line_number; i >= 1; i--){
			let line = editorView.state.doc.line(i);
			if (!table_start_reg.test(line.text)) return;
			let newLineText = matchLineWithExternalLink(line.text, link, altText, newWidth, inTable);
			if (newLineText){
				// editor.replaceRange(newLineText, {line: i-1, ch:0}, {line:i-1, ch:line.text.length})
				editorView.dispatch({changes: { from: line.from, to: line.to, insert: newLineText}})
				return;
			}
		}
	}

	if (inCallout){
		const callout_start_reg = /^>/;
		let start_line_number = target_line.number;
		for (let i = start_line_number; i <= editor.lineCount(); i++){
			let line = editorView.state.doc.line(i);
			if (!callout_start_reg.test(line.text)) break;
			let newLineText = matchLineWithExternalLink(line.text, link, altText, newWidth, inTable);
			if (newLineText){
				// editor.replaceRange(newLineText, {line: i-1, ch:0}, {line:i-1, ch:line.text.length})
				editorView.dispatch({changes: { from: line.from, to: line.to, insert: newLineText}})
				return;
			}
		}

		for (let i = start_line_number; i >= 1; i--){
			let line = editorView.state.doc.line(i);
			if (!callout_start_reg.test(line.text)) return;
			let newLineText = matchLineWithExternalLink(line.text, link, altText, newWidth, inTable);
			if (newLineText){
				// editor.replaceRange(newLineText, {line: i-1, ch:0}, {line:i-1, ch:line.text.length})
				editorView.dispatch({changes: { from: line.from, to: line.to, insert: newLineText}})
				return;
			}
		}
	}

}


function matchLineWithInternalLink(line_text: string, target_name: string, new_width: number, intable: boolean){
	let regWikiLink = /\!\[\[[^\[\]]*?\]\]/g;
    let regMdLink = /\!\[[^\[\]]*?\]\([^\s\)\(\[\]\{\}']*\)/g;
	const target_name_mdlink = target_name.replace(/ /g, '%20');
	if (!line_text.includes(target_name) && !line_text.includes(target_name_mdlink)) return null;
	const newWikiLink = intable ? `![[${target_name}\\|${new_width}]]`:`![[${target_name}|${new_width}]]`;
	while(true){
		let match = regWikiLink.exec(line_text);
		if (!match) break;
		let matched_link = match[0];
		if (matched_link.includes(target_name)){
			let newLineText = line_text.substring(0, match.index) + 
								newWikiLink + 
								line_text.substring(match.index+matched_link.length);
			return newLineText;
		}
	}

	while(true){
		let match = regMdLink.exec(line_text);
		if (!match) break;
		let matched_link = match[0];
		if (matched_link.includes(target_name_mdlink)){
			// 找到 matched_link 中的 altText
			let alt_text_match = matched_link.match(/\[.*?\]/g) as string[];
			let alt_text = alt_text_match[0].substring(1, alt_text_match[0].length-1);
			let pure_alt = alt_text.replace(/\|\d+(\|\d+)?$/g, '');
			if (intable){
				pure_alt = alt_text.replace(/\\\|\d+(\|\d+)?$/g, '')
			}
			let newMDLink = intable ? `![${pure_alt}\\|${new_width}](${target_name_mdlink})`:`![${pure_alt}|${new_width}](${target_name_mdlink})`;
			let newLineText = line_text.substring(0, match.index) + 
								newMDLink + 
								line_text.substring(match.index+matched_link.length);
			return newLineText;
		}
	}
}


function matchLineWithExternalLink(line_text: string, link: string, alt_text: string, new_width: number, intable: boolean){
	let regMdLink = /\!\[[^\[\]]*?\]\([^\s\)\(\[\]\{\}']*\)/g;
	if (!line_text.includes(link) || !line_text.includes(alt_text)) return null;
	const newExternalLink = intable ? `![${alt_text}\\|${new_width}](${link})` : `![${alt_text}|${new_width}](${link})`;
	while(true){
		let match = regMdLink.exec(line_text);
		if (!match) break;
		let matched_link = match[0];
		if (matched_link.includes(link) && matched_link.includes(alt_text)){
			let newLineText = line_text.substring(0, match.index) + 
								newExternalLink + 
								line_text.substring(match.index+matched_link.length);
			return newLineText;
		}
	}
}