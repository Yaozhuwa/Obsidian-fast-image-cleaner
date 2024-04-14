import { Menu, MenuItem, Notice, Plugin, TFile, MarkdownView, Platform } from "obsidian";
import { addCommand } from "./config/addCommand-config";
import { AttachFlowSettingsTab } from "./settings";
import { AttachFlowSettings, DEFAULT_SETTINGS } from "./settings";
import * as Util from "./util";
import { print, setDebug } from './util'
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

	async onload() {
		console.log("AttachFlow plugin loaded...");
		this.edgeSize = 20;

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

		this.registerDomEvent(document, 'click', (evt: MouseEvent) => {
			if (!this.settings.clickView) return;
			const target = evt.target as HTMLElement;
			if (target.tagName === 'IMG') {
				// 计算图像的左边界的位置及中心的位置
				const rect = target.getBoundingClientRect();
				const imageCenter = rect.left + rect.width / 2;
				if (evt.clientX > imageCenter && !document.getElementById('af-zoomed-image')) {
					// evt.preventDefault();
					const mask = document.createElement('div');
					mask.id = 'af-mask';
					mask.style.position = 'fixed';
					mask.style.top = '0';
					mask.style.left = '0';
					mask.style.width = '100%';
					mask.style.height = '100%';
					mask.style.background = 'rgba(0, 0, 0, 0.5)';  // 半透明黑色背景
					mask.style.zIndex = '9998';  // 使遮罩位于其他内容之下，但在大图之上
					document.body.appendChild(mask);

					// 图片显示大小百分比
					const scaleDiv = document.createElement('div');
					scaleDiv.id = 'af-scale-div';
					scaleDiv.style.position = 'fixed';
					scaleDiv.style.zIndex = '10000';  // 确保它在 zoomedImage 的上方
					scaleDiv.style.bottom = '0';
					scaleDiv.style.left = '50%';
					scaleDiv.style.transform = 'translateX(-50%)';
					scaleDiv.style.color = '#fff';
					scaleDiv.style.fontSize = '20px';
					scaleDiv.style.background = 'rgba(0, 0, 0, 0.5)';  // 半透明背景使其在各种图像上都清晰可见
					scaleDiv.style.padding = '5px';
					scaleDiv.innerText = '100%';  // 初始化为 100%
					document.body.appendChild(scaleDiv);

					const zoomedImage = document.createElement('img');
					zoomedImage.id = 'af-zoomed-image';
					zoomedImage.src = (evt.target as HTMLImageElement).src;
					const realImage = new Image();
					realImage.onload = () => {
						zoomedImage.style.width = `${realImage.naturalWidth}px`;
						zoomedImage.style.height = `${realImage.naturalHeight}px`;
					
						// 如果图片的尺寸大于屏幕尺寸，使其初始大小为屏幕尺寸的 75%
						let screenRatio = 0.75;   // 屏幕尺寸比例
						let screenWidth = window.innerWidth || document.documentElement.clientWidth || document.body.clientWidth;
						let screenHeight = window.innerHeight || document.documentElement.clientHeight || document.body.clientHeight;
					
						if (realImage.naturalWidth > screenWidth || realImage.naturalHeight > screenHeight) {
							if (realImage.naturalWidth / screenWidth > realImage.naturalHeight / screenHeight) {
								zoomedImage.style.width = `${screenWidth * screenRatio}px`;
								zoomedImage.style.height = 'auto';
								let scalePercent = screenWidth * screenRatio / realImage.naturalWidth * 100;
								scaleDiv.innerText = `${scalePercent.toFixed(1)}%`;
							} else {
								zoomedImage.style.height = `${screenHeight * screenRatio}px`;
								zoomedImage.style.width = 'auto';
								let scalePercent = screenHeight * screenRatio / realImage.naturalHeight * 100;
								scaleDiv.innerText = `${scalePercent.toFixed(1)}%`;
							}
						}
					}
					realImage.src = (evt.target as HTMLImageElement).src;
					zoomedImage.style.position = 'fixed';
					zoomedImage.style.zIndex = '9999';
					zoomedImage.style.top = '50%';
					zoomedImage.style.left = '50%';
					zoomedImage.style.transform = 'translate(-50%, -50%)';
					document.body.appendChild(zoomedImage);
					const originalWidth = zoomedImage.offsetWidth;
					const originalHeight = zoomedImage.offsetHeight;

					zoomedImage.addEventListener('wheel', function (e) {
						e.preventDefault();
					
						// 获取鼠标的位置
						const mouseX = e.clientX;
						const mouseY = e.clientY;
					
						// 计算缩放的中心点（相对于元素的位置）
						const centerX = mouseX - zoomedImage.offsetLeft;
						const centerY = mouseY - zoomedImage.offsetTop;
					
						// 计算缩放比例，这里我们设定为每次滚动时放大或缩小5%
						const scale = e.deltaY > 0 ? 0.95 : 1.05;
					
						// 获取当前的宽度和高度
						const width = zoomedImage.offsetWidth;
						const height = zoomedImage.offsetHeight;
					
						// 计算新的宽度和高度
						const newWidth = width * scale;
						const newHeight = height * scale;
					
						// 根据缩放的中心点调整元素的位置
						const newLeft = mouseX - centerX * scale;
						const newTop = mouseY - centerY * scale;
					
						// 设置新的宽度和高度
						zoomedImage.style.width = `${newWidth}px`;
						zoomedImage.style.height = `${newHeight}px`;
					
						// 设置新的位置
						zoomedImage.style.left = `${newLeft}px`;
						zoomedImage.style.top = `${newTop}px`;
					
						// 更新缩放百分比的显示
						const scalePercent = (newWidth / originalWidth) * 100;
						scaleDiv.innerText = `${scalePercent.toFixed(1)}%`;
					});

					zoomedImage.addEventListener('contextmenu', function (e) {
						e.preventDefault();  // 阻止右键菜单显示

						// 恢复原来的尺寸
						zoomedImage.style.width = `${originalWidth}px`;
						zoomedImage.style.height = `${originalHeight}px`;
						scaleDiv.innerText = `100%`;
					});

					zoomedImage.addEventListener('mousedown', function (evt) {
						// 阻止浏览器默认的拖动事件
						evt.preventDefault();
					
						// 记录点击位置
						let clickX = evt.clientX;
						let clickY = evt.clientY;
					
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
					});
				}
			} else {
				this.removeZoomedImage();
			}
		});

		this.registerDomEvent(document, 'keydown', (evt: KeyboardEvent) => {
			if (evt.key === 'Escape') {
				this.removeZoomedImage();
			}
		});

		setDebug(this.settings.debug);
	}

	onunload() {
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
				this.onClick.bind(this)
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
					let preventClickEvent = function(event: MouseEvent) {
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
						const updateThreshold = 5; // The mouse must move at least 5 pixels before an update

						const onMouseMove = (event: MouseEvent) => {
							// this.AllowZoom = false;
							img.addEventListener('click', preventClickEvent);
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
								if (img.parentElement) {
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
									if (imageName?.startsWith('http')) {
										updateExternalLink(activeView, img, target_pos, newWidth, newHeight, inTable, inCallout);
									}
									else if (isExcalidraw) {
										let target_name = img.getAttribute('filesource') as string;
										let draw_base_name = target_name
										if (draw_base_name.includes('/')) {
											let temp_arr = draw_base_name.split('/');
											draw_base_name = temp_arr[temp_arr.length - 1]
										} else if (draw_base_name.includes('\\')) {
											let temp_arr = draw_base_name.split('\\');
											draw_base_name = temp_arr[temp_arr.length - 1]
										}
										draw_base_name = draw_base_name.endsWith('.md') ?
											draw_base_name.substring(0, draw_base_name.length - 3) :
											draw_base_name;
										print(target_name)
										print('excalidraw file:', draw_base_name)
										img.style.maxWidth = 'none';
										updateInternalLink(activeView, img, target_pos, draw_base_name, newWidth, newHeight, inTable, inCallout);
									}
									else {
										imageName = img.parentElement?.getAttribute('src') as string;
										updateInternalLink(activeView, img, target_pos, imageName, newWidth, newHeight, inTable, inCallout);
									}
								}

								// Update the last update coordinates
								lastUpdateX = event.clientX;
								lastUpdateY = event.clientY;
							}
						}

						const allowClickEvent = () => {
							img.removeEventListener('click', preventClickEvent);
						}

						const onMouseUp = (event: MouseEvent) => {
							setTimeout(allowClickEvent, 100);
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
					const currentMd = app.workspace.getActiveFile() as TFile;
					if (currentMd.name.endsWith('.canvas')) return;
					const inPreview: boolean = this.app.workspace.getActiveViewOfType(MarkdownView)?.getMode() == "preview";
					if (inPreview) return;

					const img = event.target as HTMLImageElement | HTMLVideoElement;
					const rect = img.getBoundingClientRect(); // Cache this
					const edgeSize = this.edgeSize; // size of the edge in pixels

					if (img.id == 'af-zoomed-image') return;

					const isExcalidraw = img.classList.contains('excalidraw-embedded-img');

					// Throttle mousemove events
					let lastMove = 0;
					const mouseOverHandler = (event: MouseEvent) => {
						if (!this.settings.dragResize) return;
						const now = Date.now();
						if (now - lastMove < 100) return; // Only execute once every 100ms
						lastMove = now;

						const x = event.clientX - rect.left;
						const y = event.clientY - rect.top;

						if ((x >= rect.width - edgeSize || x <= edgeSize) || (y >= rect.height - edgeSize || y <= edgeSize)) {
							if (this.settings.dragResize){
								img.style.cursor = 'nwse-resize';
								img.style.outline = 'solid';
								img.style.outlineWidth = '6px';
								img.style.outlineColor = '#dfb0f283';
							}
						}
						else if (x > rect.width / 2 && this.settings.clickView) {
							img.style.cursor = 'zoom-in';
						}
						else {
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
					if (!this.settings.dragResize) return;
					const currentMd = app.workspace.getActiveFile() as TFile;
					if (currentMd.name.endsWith('.canvas')) return;
					const inPreview: boolean = this.app.workspace.getActiveViewOfType(MarkdownView)?.getMode() == "preview";
					if (inPreview) return;
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


	/**
	 * 鼠标右键菜单事件
	 */
	onClick(event: MouseEvent) {
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

		if (isExcalidraw) {
			target_name = target.getAttribute('filesource') as string;
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
			target_name = file_base_name;
		}
		else {
			target_name = target.parentElement?.getAttribute("src") as string;
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
	//  @ts-expect-error, not typed
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
	// print("imageName", imageName)

	const start_reg = startReg[mode];
	let start_line_number = target_line.number;
	let matched_results: MatchedLinkInLine[] = [];
	let matched_lines: number[] = [];  //1-based
	for (let i = start_line_number; i <= editor.lineCount(); i++) {
		let line = editorView.state.doc.line(i);
		// console.log('line.text', line.text)
		// console.log('start_reg', start_reg)
		// console.log('start_reg.test(line.text)', start_reg.test(line.text))
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
	//  @ts-expect-error, not typed
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
	let regMdLink = /\!\[[^\[\]]*?\]\([^\s\)\(\[\]\{\}']*\)/g;
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
	let regMdLink = /\!\[[^\[\]]*?\]\([^\s\)\(\[\]\{\}']*\)/g;
	if (!line_text.includes(link) || !line_text.includes(alt_text)) return [];
	let newExternalLink = intable ?
		`![${alt_text}\\|${new_width}](${link})` :
		`![${alt_text}|${new_width}](${link})`;
	if (/^\d*$/.test(alt_text) || /^\s*$/.test(alt_text)) {
		newExternalLink = `![${new_width}](${link})`;
	}
	while (true) {
		let match = regMdLink.exec(line_text);
		if (!match) break;
		let matched_link = match[0];
		if (matched_link.includes(link) && matched_link.includes(alt_text)) {
			// let newLineText = line_text.substring(0, match.index) + 
			// 					newExternalLink + 
			// 					line_text.substring(match.index+matched_link.length);
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

