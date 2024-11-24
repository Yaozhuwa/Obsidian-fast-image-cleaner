import { Menu, MenuItem, Notice, Plugin, TFile, MarkdownView, Platform, Editor } from "obsidian";
import { addCommand } from "./config/addCommand-config";
import { AttachFlowSettingsTab } from "./settings";
import { AttachFlowSettings, DEFAULT_SETTINGS } from "./settings";
import * as Util from "./util";
import { print, setDebug, deleteCurTargetLink } from './util'
import { getMouseEventTarget } from "./utils/handlerEvent";
import { DeleteAllLogsModal } from "./modals/deletionPrompt";
import { EditorView, keymap, ViewUpdate } from '@codemirror/view';
import {
	ElectronWindow, FileSystemAdapterWithInternalApi,
	loadImageBlob, AppWithDesktopInternalApi, EditorInternalApi, onElement
} from "./helpers"

interface MatchedLinkInLine {
	old_link: string,
	new_link: string,
	from_ch: number,
	to_ch: number
}

export default class AttachFlowPlugin extends Plugin {
	settings: AttachFlowSettings;
	edgeSize: number;
	observer: VideoObserver;
	extImageWrapper: ExternalImageWrapper;

	async onload() {
		console.log("AttachFlow plugin loaded...");
		this.edgeSize = 20;

		this.addSettingTab(new AttachFlowSettingsTab(this.app, this));

		await this.loadSettings();
		this.registerDocument(document);
		app.workspace.on("window-open", (workspaceWindow, window) => {
			this.registerDocument(window.document);
			const targetNode = window.document.querySelector('.workspace');
			print("New Window Opened")
			if(targetNode && this.observer){
				this.observer.addTarget(targetNode);
				print("AttachFlow plugin Start to observe in new window...");
			}
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

		// 主处理函数
		this.registerDomEvent(document, 'click', async (evt: MouseEvent) => {
			if (!this.settings.clickView) return;
			const target = evt.target as HTMLElement;
			if (target.tagName !== 'IMG') {
				this.removeZoomedImage();
				return;
			}
			const rect = target.getBoundingClientRect();
			const imageCenter = rect.left + rect.width / 2;
			if (evt.clientX <= imageCenter || document.getElementById('af-zoomed-image')) return;
			evt.preventDefault();
			const mask = createZoomMask();
			const { zoomedImage, originalWidth, originalHeight } = await createZoomedImage((target as HTMLImageElement).src, this.settings.adaptiveRatio);
			const scaleDiv = createZoomScaleDiv(zoomedImage, originalWidth, originalHeight);
			zoomedImage.addEventListener('wheel', (e) => handleZoomMouseWheel(e, zoomedImage, originalWidth, originalHeight, scaleDiv));
			zoomedImage.addEventListener('contextmenu', (e) => handleZoomContextMenu(e, zoomedImage, originalWidth, originalHeight, scaleDiv));
			zoomedImage.addEventListener('mousedown', (e) => handleZoomDragStart(e, zoomedImage));
			zoomedImage.addEventListener('dblclick', (e) => {
				adaptivelyDisplayImage(zoomedImage, originalWidth, originalHeight, this.settings.adaptiveRatio);
				updateZoomScaleDiv(scaleDiv, zoomedImage, originalWidth, originalHeight);
			});
		});

		this.registerDomEvent(document, 'keydown', (evt: KeyboardEvent) => {
			if (evt.key === 'Escape') {
				this.removeZoomedImage();
			}
		});

		setDebug(this.settings.debug);
		
		const targetNode = document.querySelector('.workspace');
		if(targetNode){
			this.observer = new VideoObserver(targetNode);
			this.extImageWrapper = new ExternalImageWrapper(targetNode);
			print("AttachFlow plugin Start to observe...");
		}
	}

	onunload() {
		this.observer.disconnect();
		this.extImageWrapper.disconnect();
		console.log("AttachFlow plugin unloaded...");
	}


	removeZoomedImage() {
		if (document.getElementById('af-zoomed-image')) {
			const zoomedImage = document.getElementById('af-zoomed-image');
			if (zoomedImage) document.body.removeChild(zoomedImage);
			const scaleDiv = document.getElementById('af-scale-div');
			if (scaleDiv) document.body.removeChild(scaleDiv);
			const mask = document.getElementById('af-mask');
			if (mask) document.body.removeChild(mask);
		}
	}

	registerDocument(document: Document) {
		this.register(
			onElement(
				document,
				"contextmenu" as keyof HTMLElementEventMap,
				"img, iframe, video, div.file-embed-title, audio",
				this.onRightClickMenu.bind(this)
			)
		);

		// 以下三个事件是为了实现拖拽改变图片大小的功能，修改自 https://github.com/xRyul/obsidian-image-converter
		// 附上其 MIT License
		// MIT License
		// Copyright (c) 2023 xRyul
		// Permission is hereby granted, free of charge, to any person obtaining a copy
		// of this software and associated documentation files (the "Software"), to deal
		// in the Software without restriction, including without limitation the rights
		// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
		// copies of the Software, and to permit persons to whom the Software is
		// furnished to do so, subject to the following conditions:

		// The above copyright notice and this permission notice shall be included in all
		// copies or substantial portions of the Software.

		// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
		// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
		// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
		// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
		// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
		// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
		// SOFTWARE.

		this.register(
			onElement(
				document,
				"mousedown",
				"img, video",
				(event: MouseEvent) => {
					if (!this.settings.dragResize) return;
					const currentMd = app.workspace.getActiveFile() as TFile;
					if (currentMd.name.endsWith('.canvas')) return;
					const inPreview: boolean = this.app.workspace.getActiveViewOfType(MarkdownView)?.getMode() == "preview";
					if (inPreview) return;

					if (event.button === 0) {
						event.preventDefault();
					}
					const img = event.target as HTMLImageElement | HTMLVideoElement;
					if (img.id == 'af-zoomed-image') return;

					const editor = this.app.workspace.getActiveViewOfType(MarkdownView)?.editor;
					//  @ts-expect-error, not typed
					const editorView = editor.cm as EditorView;
					const target_pos = editorView.posAtDOM(img);
					let target_line = editorView.state.doc.lineAt(target_pos);

					const inTable: boolean = img.closest('table') != null;
					const inCallout: boolean = img.closest('.callout') != null;
					const isExcalidraw = img.classList.contains('excalidraw-embedded-img');
					print('InTable', inTable)
					print('Target Element', img)

					// print("img.parent", img.parentElement?img.parentElement:'NULL')

					// 定义事件处理函数
					let preventEvent = function (event: MouseEvent) {
						event.preventDefault();
						event.stopPropagation();
					};

					const rect = img.getBoundingClientRect();
					const x = event.clientX - rect.left;
					const y = event.clientY - rect.top;
					const edgeSize = this.edgeSize; // size of the edge in pixels
					if (x < edgeSize || y < edgeSize || x > rect.width - edgeSize || y > rect.height - edgeSize) {
						const startX = event.clientX;
						const startY = event.clientY;
						const startWidth = img.clientWidth;
						const startHeight = img.clientHeight;
						let lastUpdateX = startX;
						let lastUpdateY = startY;

						let lastUpdate = 1;
						let updatedWidth = startWidth;
						let lastMoveTime = Date.now();
						const onMouseMove = (event: MouseEvent) => {
							// this.AllowZoom = false;
							img.addEventListener('click', preventEvent);
							// img.addEventListener('mouseover', preventEvent);
							// img.addEventListener('mouseout', preventEvent);
							const currentX = event.clientX;
							lastUpdate = currentX - lastUpdateX == 0 ? lastUpdate : currentX - lastUpdateX;
							// print('lastUpdate', lastUpdate)
							let newWidth = startWidth + (currentX - startX);
							const aspectRatio = startWidth / startHeight;

							// Ensure the image doesn't get too small
							newWidth = Math.max(newWidth, 100);

							let newHeight = newWidth / aspectRatio;
							// Round the values to the nearest whole number
							newWidth = Math.round(newWidth);
							newHeight = Math.round(newHeight);
							updatedWidth = newWidth;

							// Apply the new dimensions to the image or video
							img.classList.add('image-in-drag-resize')
							img.style.width = `${newWidth}px`;

							const now = Date.now();
							if (now - lastMoveTime < 100) return; // Only execute once every 100ms
							lastMoveTime = now;
							// update image link
							this.updateImageLinkWithNewSize(img, target_pos, newWidth, newHeight);
							// Update the last update coordinates
							lastUpdateX = event.clientX;
							lastUpdateY = event.clientY;
						}

						const allowOtherEvent = () => {
							img.removeEventListener('click', preventEvent);
						}

						const onMouseUp = (event: MouseEvent) => {
							setTimeout(allowOtherEvent, 100);
							event.preventDefault()
							img.classList.remove('image-in-drag-resize', 'image-ready-click-view')
							document.removeEventListener("mousemove", onMouseMove);
							document.removeEventListener("mouseup", onMouseUp);

							// 遵循最小刻度
							if (this.settings.resizeInterval > 1) {
								let resize_interval = this.settings.resizeInterval;
								let width_offset = lastUpdate > 0 ? resize_interval : 0;
								if (updatedWidth % resize_interval != 0) {
									updatedWidth = Math.floor(updatedWidth / resize_interval) * resize_interval + width_offset;
								}
								img.style.width = `${updatedWidth}px`;
								this.updateImageLinkWithNewSize(img, target_pos, updatedWidth, 0);
								img.style.removeProperty('width');
							}

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
					const currentMd = app.workspace.getActiveFile() as TFile;
					if (currentMd.name.endsWith('.canvas')) return;
					const inPreview: boolean = this.app.workspace.getActiveViewOfType(MarkdownView)?.getMode() == "preview";
					// if (inPreview) return;

					const img = event.target as HTMLImageElement | HTMLVideoElement;

					const edgeSize = this.edgeSize; // size of the edge in pixels

					if (img.id == 'af-zoomed-image') return;

					const isExcalidraw = img.classList.contains('excalidraw-embedded-img');

					// Throttle mousemove events
					let lastMove = 0;
					const mouseOverHandler = (event: MouseEvent) => {
						if (event.buttons != 0) return;
						if (!this.settings.dragResize) return;
						const now = Date.now();
						if (now - lastMove < 100) return; // Only execute once every 100ms
						lastMove = now;
						const rect = img.getBoundingClientRect();
						const x = event.clientX - rect.left;
						const y = event.clientY - rect.top;

						if ((x >= rect.width - edgeSize || x <= edgeSize) || (y >= rect.height - edgeSize || y <= edgeSize)) {
							if (this.settings.dragResize && !inPreview) {
								img.classList.remove('image-ready-click-view')
								img.classList.add('image-ready-resize');
							}
							else if (inPreview && this.settings.clickView && x > rect.width / 2) {
								img.classList.add('image-ready-click-view')
								img.classList.remove('image-ready-resize');
							}
						}
						else if (x > rect.width / 2 && this.settings.clickView) {
							img.classList.add('image-ready-click-view')
							img.classList.remove('image-ready-resize');
						}
						else {
							img.classList.remove('image-ready-click-view', 'image-ready-resize')
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
					if (!this.settings.dragResize) return;
					const currentMd = app.workspace.getActiveFile() as TFile;
					if (currentMd.name.endsWith('.canvas')) return;
					const inPreview: boolean = this.app.workspace.getActiveViewOfType(MarkdownView)?.getMode() == "preview";
					if (event.buttons != 0) return;
					const img = event.target as HTMLImageElement | HTMLVideoElement;

					if (this.settings.clickView || this.settings.dragResize) {
						img.classList.remove('image-ready-click-view', 'image-ready-resize')
					}
				}
			)
		);

		// 我实现的外部链接右键菜单
		// 关键在于 editor.blur()，这样可以让 Obsidian 失去焦点，从而不会触发 Obsidian 的右键菜单
		this.register(
			onElement(
				document,
				"mousedown",
				"img",
				this.externalImageContextMenuCall.bind(this)
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

	updateImageLinkWithNewSize = (img: HTMLImageElement | HTMLVideoElement, target_pos: number, newWidth: number, newHeight: number) => {
		const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
		const inTable: boolean = img.closest('table') != null;
		const inCallout: boolean = img.closest('.callout') != null;
		const isExcalidraw = img.classList.contains('excalidraw-embedded-img');
		if (activeView) {
			print("update new Width", newWidth);
			let imageName = img.getAttribute('src');
			if (imageName?.startsWith('http')) {
				updateExternalLink(activeView, img, target_pos, newWidth, newHeight, inTable, inCallout);
			}
			else if (isExcalidraw) {
				let target_name = img.getAttribute('filesource') as string;
				let draw_base_name = getExcalidrawBaseName(img as HTMLImageElement);
				img.style.maxWidth = 'none';
				updateInternalLink(activeView, img, target_pos, draw_base_name, newWidth, newHeight, inTable, inCallout);
			}
			else {
				imageName = img.closest('.internal-embed')?.getAttribute('src') as string;
				updateInternalLink(activeView, img, target_pos, imageName, newWidth, newHeight, inTable, inCallout);
			}
		}
	}

	externalImageContextMenuCall(event: MouseEvent) {
		const img = event.target as HTMLImageElement;
		const inTable: boolean = img.closest('table') != null;
		const inCallout: boolean = img.closest('.callout') != null;
		if (img.id == 'af-zoomed-image') return;
		if (!img.src.startsWith('http')) return;
		if (event.button != 2) return;
		event.preventDefault();
		this.app.workspace.getActiveViewOfType(MarkdownView)?.editor?.blur();
		img.classList.remove('image-ready-click-view', 'image-ready-resize');
		const menu = new Menu();
		const inPreview = this.app.workspace.getActiveViewOfType(MarkdownView)?.getMode() == "preview";
		if (inPreview) {
			this.addExternalImageMenuPreviewMode(menu, img);
		}
		else {
			this.addExternalImageMenuSourceMode(menu, img, inTable, inCallout);
		}

		this.registerEscapeButton(menu);

		let offset = 0;
		if (!inPreview && (inTable || inCallout)) offset = -138;
		menu.showAtPosition({ x: event.pageX, y: event.pageY + offset });

		this.app.workspace.trigger("AttachFlow:contextmenu", menu);
	}


	/**
	 * 设置菜单按钮，并设置点击事件
	 *
	 * @param menu
	 * @param FileBaseName
	 * @param currentMd
	 */
	addMenuExtendedSourceMode = (menu: Menu, FileBaseName: string, currentMd: TFile, target_type: string, target_pos: number, inTable: boolean, inCallout: boolean) => {
		this.addMenuExtendedPreviewMode(menu, FileBaseName, currentMd);
		menu.addItem((item: MenuItem) =>
			item
				.setIcon("pencil")
				.setTitle("Rename")
				.onClick(async () => {
					try {
						print("test rename")
						Util.handlerRenameFile(FileBaseName, currentMd, this);
					} catch {
						new Notice("Error, could not rename the file!");
					}
				})
		)

		if (this.settings.moveFileMenu) {
			menu.addItem((item: MenuItem) =>
				item
					.setIcon("folder-tree")
					.setTitle("Move file to...")
					.onClick(async () => {
						try {
							Util.handlerMoveFile(FileBaseName, currentMd, this);
						} catch {
							new Notice("Error, could not Move the file!");
						}
					})
			);
		}

		menu.addItem((item: MenuItem) =>
			item
				.setIcon("trash-2")
				.setTitle("Clear file and associated link")
				// .setSection("attach-flow")
				.onClick(async () => {
					try {
						// Util.handlerDelFile(FileBaseName, currentMd, this);
						Util.handlerDelFileNew(FileBaseName, currentMd, this, target_type, target_pos, inTable, inCallout);
					} catch {
						new Notice("Error, could not clear the file!");
					}
				})
		);
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
		// const basePath = (file.vault.adapter as any).basePath;
		// const relativeFilePath = file.path;
		if (process.platform != 'linux') {
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
		}

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


	addExternalImageMenuPreviewMode = (menu: Menu, img: HTMLImageElement) => {
		menu.addItem((item: MenuItem) =>
			item
				.setIcon("copy")
				.setTitle("Copy image to clipboard")
				.onClick(async () => {
					try {
						const blob = await loadImageBlob(img.src);
						await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
						new Notice('Image copied to clipboard');
					}
					catch (error) {
						new Notice('Failed to copy image!');
					}
				})
		);

		menu.addItem((item: MenuItem) =>
			item
				.setIcon("link")
				.setTitle("Copy image link")
				.onClick(async () => {
					navigator.clipboard.writeText(img.src);
				})
		);
		menu.addItem((item: MenuItem) =>
			item
				.setIcon("link")
				.setTitle("Copy markdown link")
				.onClick(async () => {
					navigator.clipboard.writeText(`![](${img.src})`);
				})
		);
		menu.addItem((item: MenuItem) =>
			item
				.setIcon("external-link")
				.setTitle("Open in external browser")
				.onClick(async () => {
					window.open(img.src, '_blank');
				})
		);
	}

	addExternalImageMenuSourceMode = (menu: Menu, img: HTMLImageElement, inTable: boolean, inCallout: boolean) => {
		this.addExternalImageMenuPreviewMode(menu, img);
		menu.addItem((item: MenuItem) =>
			item
				.setIcon("trash-2")
				.setTitle("Clear image link")
				.onClick(() => {
					const editor = this.app.workspace.getActiveViewOfType(MarkdownView)?.editor;
					//  @ts-expect-error, not typed
					const editorView = editor.cm as EditorView;
					const target_pos = editorView.posAtDOM(img);
					deleteCurTargetLink(img.src, this, 'img', target_pos, inTable, inCallout);
				})
		);
	}

	/**
	 * 鼠标右键菜单事件
	 */
	onRightClickMenu(event: MouseEvent) {
		const target = getMouseEventTarget(event);
		const curTargetType = target.localName;
		if (target.id == 'af-zoomed-image') return;

		const currentMd = app.workspace.getActiveFile() as TFile;
		const inCanvas = currentMd.name.endsWith('.canvas');
		const SupportedTargetType = ["img", "iframe", "video", "div", "audio"];

		const menu = new Menu();

		if (!SupportedTargetType.includes(curTargetType)) return;

		// 判断当前点击的地方是否为表格
		// const inTable:boolean = target.parentElement?.parentElement?.getAttribute('class')=='table-cell-wrapper';
		const inTable: boolean = target.closest('table') != null;
		const inCallout: boolean = target.closest('.callout') != null;
		const inPreview: boolean = this.app.workspace.getActiveViewOfType(MarkdownView)?.getMode() == "preview";
		const isExcalidraw: boolean = target.classList.contains('excalidraw-embedded-img');

		let target_name = target.getAttribute("src") as string;
		// 对于 Callout 和 Table 中的网络图片，没有右键菜单
		if (target_name && target_name.startsWith('http')) return;

		if (inCanvas) {
			// 如果是图像节点，返回
			if (target.parentElement?.classList.contains('canvas-node-content')) return;
			let file_name = target.parentElement?.getAttribute('src');
			// print("Target Name:", file_name);

			return;
		}

		target.classList.remove('image-ready-click-view', 'image-ready-resize');

		if (isExcalidraw) {
			target_name = getExcalidrawBaseName(target as HTMLImageElement);
			target_name = target_name.replace(/^(\.\.\/)+/g, '');
		}
		else {
			target_name = target.closest('.internal-embed')?.getAttribute("src") as string;
			// 删除 target_name 可能前缀的多个 '../'，支持链接路径为当前笔记的相对路径
			target_name = target_name.replace(/^(\.\.\/)+/g, '');
			let pdf_match = target_name.match(/.*\.pdf/);
			target_name = pdf_match ? pdf_match[0] : target_name;
			if (curTargetType == 'img' && pdf_match) return;
		}

		if (inPreview) {
			if (SupportedTargetType.includes(curTargetType)) {
				// console.log("FileBaseName", FileBaseName);
				this.addMenuExtendedPreviewMode(menu, target_name, currentMd);
			}
		}
		else {
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

		let offset = -163;
		let linux_offset = -138;
		offset = process.platform == 'linux' ? linux_offset : offset;
		if (this.settings.moveFileMenu) offset -= 25;

		if (inTable && !inPreview) {
			menu.showAtPosition({ x: event.pageX, y: event.pageY + offset });
		}
		else {
			menu.showAtPosition({ x: event.pageX, y: event.pageY });
		}
		this.app.workspace.trigger("AttachFlow:contextmenu", menu);
	}

}

function updateInternalLink(activeView: MarkdownView, target: HTMLImageElement | HTMLVideoElement, target_pos: number, imageName: string, newWidth: number, newHeight: number, inTable: boolean, inCallout: boolean): void {
	const editor = activeView.editor;
	const editorView = editor.cm as EditorView;
	let target_line = editorView.state.doc.lineAt(target_pos);
	// print('target line information: line-content, line-number(1-based), target.ch');
	// print(target_line.text, target_line.number, target_pos - target_line.from);


	if (!inCallout && !inTable) {
		let matched = matchLineWithInternalLink(target_line.text, imageName, newWidth, inTable);
		if (matched.length == 1) {
			editorView.dispatch({
				changes: {
					from: target_line.from + matched[0].from_ch,
					to: target_line.from + matched[0].to_ch,
					insert: matched[0].new_link
				}
			});
			// editor.replaceRange(matched[0].new_link, 
			// 	{line:target_line.number-1, ch:matched[0].from_ch}, 
			// 	{line:target_line.number-1, ch:matched[0].to_ch}
			// 	);
		}
		else if (matched.length == 0) {
			// new Notice('Fail to find current image-link, please zoom manually!')
		}
		else {
			new Notice('Find multiple same image-link in line, please zoom manually!')
		}
		return;
	}

	type RegDictionary = {
		[key: string]: RegExp;
	};

	let startReg: RegDictionary = {
		'table': /^\s*\|/,
		'callout': /^>/,
	};

	let mode = inTable ? 'table' : 'callout';
	print('mode', mode)

	const start_reg = startReg[mode];
	let start_line_number = target_line.number;
	let matched_results: MatchedLinkInLine[] = [];
	let matched_lines: number[] = [];  //1-based
	for (let i = start_line_number; i <= editor.lineCount(); i++) {
		let line = editorView.state.doc.line(i);
		if (!start_reg.test(line.text)) break;
		let matched = matchLineWithInternalLink(line.text, imageName, newWidth, inTable);
		matched_results.push(...matched);
		matched_lines.push(...new Array(matched.length).fill(i));
	}

	for (let i = start_line_number - 1; i >= 1; i--) {
		let line = editorView.state.doc.line(i);
		if (!start_reg.test(line.text)) break;
		let matched = matchLineWithInternalLink(line.text, imageName, newWidth, inTable);
		matched_results.push(...matched);
		matched_lines.push(...new Array(matched.length).fill(i));
	}

	// print("Matched Information")
	// print(matched_results)
	// print(matched_lines)

	if (matched_results.length == 1) {
		let target_line = editorView.state.doc.line(matched_lines[0]);
		if (mode == 'table') {
			let old_text = target_line.text;
			let new_line_text = old_text.substring(0, matched_results[0].from_ch) +
				matched_results[0].new_link +
				old_text.substring(matched_results[0].to_ch);
			editorView.dispatch({
				changes: {
					from: target_line.from,
					to: target_line.from + old_text.length,
					insert: new_line_text
				}
			});
		} else {
			editorView.dispatch({
				changes: {
					from: target_line.from + matched_results[0].from_ch,
					to: target_line.from + matched_results[0].to_ch,
					insert: matched_results[0].new_link
				}
			});
		}
	}
	else if (matched_results.length == 0) {
		new Notice(`Fail to find current image-link in ${mode}, please zoom manually!`)
	}
	else {
		new Notice(`Find multiple same image-link in ${mode}, please zoom manually!`)
	}
	return;
}


function updateExternalLink(activeView: MarkdownView, target: HTMLImageElement | HTMLVideoElement, target_pos: number, newWidth: number, newHeight: number, inTable: boolean, inCallout: boolean): void {
	const editor = activeView.editor;
	const editorView = editor.cm as EditorView;
	let target_line = editorView.state.doc.lineAt(target_pos);

	const link = target.getAttribute('src') as string;
	const altText = target.getAttribute("alt") as string;

	if (!inCallout && !inTable) {
		let matched = matchLineWithExternalLink(target_line.text, link, altText, newWidth, inTable);
		if (matched.length == 1) {
			editorView.dispatch({
				changes: {
					from: target_line.from + matched[0].from_ch,
					to: target_line.from + matched[0].to_ch,
					insert: matched[0].new_link
				}
			});
		}
		else if (matched.length == 0) {
			// new Notice('Fail to find current image-link, please zoom manually!')
		}
		else {
			new Notice('Find multiple same image-link in line, please zoom manually!')
		}
		return;
	}

	type RegDictionary = {
		[key: string]: RegExp;
	};

	let startReg: RegDictionary = {
		'table': /^\s*\|/,
		'callout': /^>/,
	};

	let mode = inTable ? 'table' : 'callout';
	print('mode', mode)

	const start_reg = startReg[mode];
	let start_line_number = target_line.number;
	let matched_results: MatchedLinkInLine[] = [];
	let matched_lines: number[] = [];  //1-based
	for (let i = start_line_number; i <= editor.lineCount(); i++) {
		let line = editorView.state.doc.line(i);
		if (!start_reg.test(line.text)) break;
		let matched = matchLineWithExternalLink(line.text, link, altText, newWidth, inTable);
		matched_results.push(...matched);
		matched_lines.push(...new Array(matched.length).fill(i));
	}

	for (let i = start_line_number - 1; i >= 1; i--) {
		let line = editorView.state.doc.line(i);
		if (!start_reg.test(line.text)) break;
		let matched = matchLineWithExternalLink(line.text, link, altText, newWidth, inTable);
		matched_results.push(...matched);
		matched_lines.push(...new Array(matched.length).fill(i));
	}

	print(matched_results)
	print(matched_lines)

	if (matched_results.length == 1) {
		let target_line = editorView.state.doc.line(matched_lines[0]);
		if (mode == 'table') {
			let old_text = target_line.text;
			let new_line_text = old_text.substring(0, matched_results[0].from_ch) +
				matched_results[0].new_link +
				old_text.substring(matched_results[0].to_ch);
			editorView.dispatch({
				changes: {
					from: target_line.from,
					to: target_line.from + old_text.length,
					insert: new_line_text
				}
			});
		} else {
			editorView.dispatch({
				changes: {
					from: target_line.from + matched_results[0].from_ch,
					to: target_line.from + matched_results[0].to_ch,
					insert: matched_results[0].new_link
				}
			});
		}
	}
	else if (matched_results.length == 0) {
		new Notice(`Fail to find current image-link in ${mode}, please zoom manually!`)
	}
	else {
		new Notice(`Find multiple same image-link in ${mode}, please zoom manually!`)
	}
	return;

}


function matchLineWithInternalLink(line_text: string, target_name: string, new_width: number, intable: boolean): MatchedLinkInLine[] {
	let regWikiLink = /\!\[\[[^\[\]]*?\]\]/g;
	let regMdLink = /\!\[[^\[\]]*?\]\(\s*[^\[\]\{\}']*\s*\)/g;
	const target_name_mdlink = target_name.replace(/ /g, '%20');
	if (!line_text.includes(target_name) && !line_text.includes(target_name_mdlink)) return [];

	// print(line_text)
	let result: MatchedLinkInLine[] = [];
	// const newWikiLink = intable ? `![[${target_name}\\|${new_width}]]`:`![[${target_name}|${new_width}]]`;
	while (true) {
		let wiki_match = regWikiLink.exec(line_text);
		if (!wiki_match) break;
		const matched_link = wiki_match[0];
		// print('matched_link:', matched_link)
		if (matched_link.includes(target_name)) {
			let normal_link = intable ? matched_link.replace(/\\\|/g, '|') : matched_link;
			let link_match = normal_link.match(/!\[\[(.*?)(\||\]\])/);
			let link_text = link_match ? link_match[1] : '';

			let alt_match = matched_link.match(/!\[\[.*?(\|(.*?))\]\]/);
			let alt_text = alt_match ? alt_match[1] : '';
			let alt_text_list = alt_text.split('|');
			let alt_text_wo_size = '';
			let new_alt_text = ''
			for (let alt of alt_text_list) {
				if (!/^\d+$/.test(alt) && !/^\s*$/.test(alt)) {
					alt_text_wo_size = alt_text_wo_size + '|' + alt;
				}
			}
			new_alt_text = new_width != 0 ? `${alt_text_wo_size}|${new_width}` : alt_text_wo_size;
			new_alt_text = intable ? new_alt_text.replace(/\|/g, '\\|') : new_alt_text;
			let newWikiLink = link_match ? `![[${link_text}${new_alt_text}]]` : `![[${target_name}${new_alt_text}]]`;

			result.push({
				old_link: matched_link,
				new_link: newWikiLink,
				from_ch: wiki_match.index,
				to_ch: wiki_match.index + matched_link.length
			});
		}
	}

	while (true) {
		let match = regMdLink.exec(line_text);
		if (!match) break;
		const matched_link = match[0];
		if (matched_link.includes(target_name_mdlink)) {
			// 找到 matched_link 中的 altText
			let alt_text_match = matched_link.match(/\[.*?\]/g) as string[];
			let alt_text = alt_text_match[0].substring(1, alt_text_match[0].length - 1);
			let pure_alt = alt_text.replace(/\|\d+(\|\d+)?$/g, '');
			if (intable) {
				pure_alt = alt_text.replace(/\\\|\d+(\|\d+)?$/g, '')
			}
			let link_text = matched_link.substring(alt_text_match[0].length + 2, matched_link.length - 1)
			let newMDLink = intable ? `![${pure_alt}\\|${new_width}](${link_text})` : `![${pure_alt}|${new_width}](${link_text})`;
			if (/^\d*$/.test(alt_text)) {
				newMDLink = `![${new_width}](${link_text})`;
			}
			// let newLineText = line_text.substring(0, match.index) + 
			// 					newMDLink + 
			// 					line_text.substring(match.index+matched_link.length);
			result.push({
				old_link: matched_link,
				new_link: newMDLink,
				from_ch: match.index,
				to_ch: match.index + matched_link.length
			});
		}
	}
	print("Line Text: ", line_text)
	print("MatchedInfo:", result);
	return result;
}


function matchLineWithExternalLink(line_text: string, link: string, alt_text: string, new_width: number, intable: boolean): MatchedLinkInLine[] {
	let result: MatchedLinkInLine[] = []
	let regMdLink = /\!\[[^\[\]]*?\]\(\s*[^\[\]\{\}']*\s*\)/g;
	if (!line_text.includes(link)) return [];
	while (true) {
		let match = regMdLink.exec(line_text);
		if (!match) break;
		let matched_link = match[0];
		if (matched_link.includes(link)) {
			let alt_text_match = matched_link.match(/\[.*?\]/g) as string[];
			let alt_text = alt_text_match[0].substring(1, alt_text_match[0].length - 1);
			let pure_alt = alt_text.replace(/\|\d+(\|\d+)?$/g, '');
			if (intable) {
				pure_alt = alt_text.replace(/\\\|\d+(\|\d+)?$/g, '')
			}
			if (/^\d*$/.test(alt_text)) {
				pure_alt = '';
			}
			let link_text = matched_link.substring(alt_text_match[0].length + 2, matched_link.length - 1)
			let newExternalLink = intable ? `![${pure_alt}\\|${new_width}](${link_text})` : `![${pure_alt}|${new_width}](${link_text})`;

			result.push({
				old_link: matched_link,
				new_link: newExternalLink,
				from_ch: match.index,
				to_ch: match.index + matched_link.length
			});
		}
	}
	print("Line Text: ", line_text)
	print("MatchedInfo:", result);
	return result;
}



// 创建遮罩元素
function createZoomMask(): HTMLDivElement {
	const mask = document.createElement('div');
	mask.id = 'af-mask';
	mask.style.position = 'fixed';
	mask.style.top = '0';
	mask.style.left = '0';
	mask.style.width = '100%';
	mask.style.height = '100%';
	mask.style.background = 'rgba(0, 0, 0, 0.5)';
	mask.style.zIndex = '9998';
	document.body.appendChild(mask);
	return mask;
}

// 创建放大的图像元素
async function createZoomedImage(src: string, adaptive_ratio: number): Promise<{ zoomedImage: HTMLImageElement, originalWidth: number, originalHeight: number }> {
	const zoomedImage = document.createElement('img');
	zoomedImage.id = 'af-zoomed-image';
	zoomedImage.src = src;
	zoomedImage.style.position = 'fixed';
	zoomedImage.style.zIndex = '9999';
	zoomedImage.style.top = '50%';
	zoomedImage.style.left = '50%';
	zoomedImage.style.transform = 'translate(-50%, -50%)';
	document.body.appendChild(zoomedImage);

	let originalWidth = zoomedImage.naturalWidth;
	let originalHeight = zoomedImage.naturalHeight;

	adaptivelyDisplayImage(zoomedImage, originalWidth, originalHeight, adaptive_ratio);

	return {
		zoomedImage,
		originalWidth,
		originalHeight
	};
}

// 创建百分比指示元素
function createZoomScaleDiv(zoomedImage: HTMLImageElement, originalWidth: number, originalHeight: number): HTMLDivElement {
	const scaleDiv = document.createElement('div');
	scaleDiv.id = 'af-scale-div';
	scaleDiv.classList.add('af-scale-div');
	scaleDiv.style.zIndex = '10000';
	updateZoomScaleDiv(scaleDiv, zoomedImage, originalWidth, originalHeight);
	document.body.appendChild(scaleDiv);
	return scaleDiv;
}

function updateZoomScaleDiv(scaleDiv: HTMLDivElement, zoomedImage: HTMLImageElement, originalWidth: number, originalHeight: number) {
	// 获取当前的宽度和高度
	const width = zoomedImage.offsetWidth;
	const height = zoomedImage.offsetHeight;
	let scalePercent = width / originalWidth * 100;
	scaleDiv.innerText = `${width}×${height} (${scalePercent.toFixed(1)}%)`;
}

// 滚轮事件处理器
function handleZoomMouseWheel(e: WheelEvent, zoomedImage: HTMLImageElement, originalWidth: number, originalHeight: number, scaleDiv: HTMLDivElement) {
	e.preventDefault();
	const mouseX = e.clientX;
	const mouseY = e.clientY;
	const scale = e.deltaY > 0 ? 0.95 : 1.05;
	const newWidth = scale * zoomedImage.offsetWidth;
	const newHeight = scale * zoomedImage.offsetHeight;
	const newLeft = mouseX - (mouseX - zoomedImage.offsetLeft) * scale;
	const newTop = mouseY - (mouseY - zoomedImage.offsetTop) * scale;
	zoomedImage.style.width = `${newWidth}px`;
	zoomedImage.style.height = `${newHeight}px`;
	zoomedImage.style.left = `${newLeft}px`;
	zoomedImage.style.top = `${newTop}px`;
	updateZoomScaleDiv(scaleDiv, zoomedImage, originalWidth, originalHeight);
}

// 鼠标右键点击事件处理器
function handleZoomContextMenu(e: MouseEvent, zoomedImage: HTMLImageElement, originalWidth: number, originalHeight: number, scaleDiv: HTMLDivElement) {
	e.preventDefault();
	zoomedImage.style.width = `${originalWidth}px`;
	zoomedImage.style.height = `${originalHeight}px`;
	zoomedImage.style.left = `50%`;
	zoomedImage.style.top = `50%`;
	updateZoomScaleDiv(scaleDiv, zoomedImage, originalWidth, originalHeight);
}


function adaptivelyDisplayImage(zoomedImage: HTMLImageElement, originalWidth: number, originalHeight: number, adaptive_ratio: number) {
	zoomedImage.style.left = `50%`;
	zoomedImage.style.top = `50%`;
	// 如果图片的尺寸大于屏幕尺寸，使其大小为屏幕尺寸的 adaptive_ratio
	let screenRatio = adaptive_ratio;   // 屏幕尺寸比例
	let screenWidth = window.innerWidth;
	let screenHeight = window.innerHeight;

	// Adjust initial size of the image if it exceeds screen size
	if (originalWidth > screenWidth || originalHeight > screenHeight) {
		if (originalWidth / screenWidth > originalHeight / screenHeight) {
			zoomedImage.style.width = `${screenWidth * screenRatio}px`;
			zoomedImage.style.height = 'auto';
		} else {
			zoomedImage.style.height = `${screenHeight * screenRatio}px`;
			zoomedImage.style.width = 'auto';
		}
	} else {
		zoomedImage.style.width = `${originalWidth}px`;
		zoomedImage.style.height = `${originalHeight}px`;
	}
}

function handleZoomDragStart(e: MouseEvent, zoomedImage: HTMLImageElement) {
	// 事件处理的代码 ...
	// 阻止浏览器默认的拖动事件
	e.preventDefault();

	// 记录点击位置
	let clickX = e.clientX;
	let clickY = e.clientY;

	// 更新元素位置的回调函数
	const updatePosition = (moveEvt: MouseEvent) => {
		// 计算鼠标移动距离
		let moveX = moveEvt.clientX - clickX;
		let moveY = moveEvt.clientY - clickY;

		// 定位图片位置
		zoomedImage.style.left = `${zoomedImage.offsetLeft + moveX}px`;
		zoomedImage.style.top = `${zoomedImage.offsetTop + moveY}px`;

		// 更新点击位置
		clickX = moveEvt.clientX;
		clickY = moveEvt.clientY;
	}

	// 鼠标移动事件
	document.addEventListener('mousemove', updatePosition);

	// 鼠标松开事件
	document.addEventListener('mouseup', function listener() {
		// 移除鼠标移动和鼠标松开的监听器
		document.removeEventListener('mousemove', updatePosition);
		document.removeEventListener('mouseup', listener);
	}, { once: true });
}

function getExcalidrawBaseName(target: HTMLImageElement): string {
	let target_name = target.getAttribute('filesource') as string;
	let file_base_name = target_name
	if (file_base_name.includes('/')) {
		let temp_arr = file_base_name.split('/');
		file_base_name = temp_arr[temp_arr.length - 1]
	} else if (file_base_name.includes('\\')) {
		let temp_arr = file_base_name.split('\\');
		file_base_name = temp_arr[temp_arr.length - 1]
	}
	file_base_name = file_base_name.endsWith('.md') ?
		file_base_name.substring(0, file_base_name.length - 3) :
		file_base_name;
	return file_base_name;
}


class VideoObserver {
	private observer: MutationObserver;
	private widthObserver: MutationObserver;

	constructor(target: Node) {
		this.observerCallback = this.observerCallback.bind(this);
        this.widthObserverCallback = this.widthObserverCallback.bind(this);
        
        this.observer = new MutationObserver(this.observerCallback);
        this.widthObserver = new MutationObserver(this.widthObserverCallback);
        this.observer.observe(target, { childList: true, subtree: true });
	}

	private observerCallback(mutations: MutationRecord[], observer: MutationObserver) {
		for (let mutation of mutations) {
            // If the addedNodes property has one or more nodes
            if (mutation.addedNodes.length) {
                mutation.addedNodes.forEach(node => {
                    if (!(node instanceof Element)) return;

                    const videos = node.querySelectorAll('video');
                    videos.forEach(video => {
                        const parentDiv = video.closest('.internal-embed.media-embed.video-embed.is-loaded');
                        if (parentDiv) {
							print("Observed Video Element: ", parentDiv)
                            if (parentDiv.getAttribute('width')) video.style.width = parentDiv.getAttribute('width') + 'px';
							this.widthObserver.observe(parentDiv, { attributes: true, attributeFilter: ['width']})
                        }
                    });
                });
            }
        }
	}

	private widthObserverCallback(mutations: MutationRecord[], observer: MutationObserver) {
		for (const mutation of mutations) {
            if (mutation.type == 'attributes' && mutation.attributeName === 'width') {
                // console.log('width attribute modified on', mutation.target);
                // 在这里进行相应的操作，如调整元素样式等
                // 将父 div 元素的width同步到子video元素的style.width上
                const changedElement = mutation.target as HTMLElement;
				const divWidth = changedElement.getAttribute('width');
                const videoElement = changedElement.querySelector("video");
                if (!videoElement) return;
                if (divWidth) {
                    videoElement.style.width = divWidth + "px";
                }else {
					// 如果 width 属性被移除，也移除 video.style.width
                    videoElement.style.width = ""; 
                }
            }
        }
	}

	public disconnect() {
        this.observer.disconnect();
		this.widthObserver.disconnect();
    }

	public addTarget(target: Node) {
		this.observer.observe(target, { childList: true, subtree: true });
	}
}


class ExternalImageWrapper {
	private observer: MutationObserver;

	constructor(target: Node) {
		this.observerCallback = this.observerCallback.bind(this);
        this.observer = new MutationObserver(this.observerCallback);
        this.observer.observe(target, { childList: true, subtree: true });
	}

	private observerCallback(mutations: MutationRecord[], observer: MutationObserver) {
		for (let mutation of mutations) {
            // If the addedNodes property has one or more nodes
            if (mutation.addedNodes.length) {
                mutation.addedNodes.forEach(node => {
                    if (!(node instanceof Element)) return;

                    const images = node.querySelectorAll('img');
                    images.forEach(img => {
						// img.contentEditable = 'true'
						// print("Observed External Image Element: ", img)
						// let wrapper = img.closest(".af-image-wrapper");
						// if (!wrapper){
						// 	print("Observed External Image Element: ", img)
						// 	const imgClone = img.cloneNode(true) as HTMLImageElement;
						// 	const wrapper = document.createElement('div');
						// 	wrapper.classList.add('af-image-wrapper');
						// 	wrapper.appendChild(imgClone);
						// 	// img.replaceWith(wrapper);
						// 	// img.insertAdjacentElement('afterend', wrapper);
						// 	img.insertAdjacentHTML('afterend', wrapper.outerHTML);
						// 	print("Wrapper Element: ", wrapper)
						// }
						// img.setAttribute('caption', 'This is a caption'); //给img元素添加一个名为'caption'的属性，并赋值
                    });
                });
            }
        }
	}

	public disconnect() {
        this.observer.disconnect();
    }

	public addTarget(target: Node) {
		this.observer.observe(target, { childList: true, subtree: true });
	}
}