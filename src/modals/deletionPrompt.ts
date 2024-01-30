import { Modal, TFile } from "obsidian";
import AttachFlowPlugin from "src/main";
import {
	deleteAllAttachs,
	getRefencedLinkCount,
} from "src/options/deleleAllAttachsInTheNote";
import { deleteFile } from "src/utils/deleteFile";

export class DeleteAllLogsModal extends Modal {
	note: TFile;
	myPlugin: AttachFlowPlugin;
	constructor(note: TFile, myPlugin: AttachFlowPlugin) {
		super(app);
		this.note = note;
		this.myPlugin = myPlugin;
	}
	getLog(): string {
		const referenceMessage = `Are you sure you want to delete "${this.note.basename}.md"?\n\nIt will be moved to your ${this.myPlugin.settings.deleteOption}.`;
		return referenceMessage;
	}
	showLogs() {
		const logs = this.contentEl.createEl("div");
		logs.addClass("attachment-flow-log");
		logs.setText(this.getLog());
	}
	onOpen() {
		const { contentEl } = this;
		const myModal = this;
		const headerWrapper = contentEl.createEl("div");
		headerWrapper.addClass("attachment-flow-center-wrapper");
		this.showLogs();
		const referencedMessageWrapper = contentEl.createEl("span");
		referencedMessageWrapper.style.color = "red";
		const referencedMessage = `There are(is) currently  [${getRefencedLinkCount()}]  non-multi-referenced link(s) pointing to this note.`;
		referencedMessageWrapper.append(referencedMessage);
		// ------------------------
		const buttonWrapper = this.contentEl.createEl("div") as HTMLDivElement;
		buttonWrapper.addClass("attachment-flow-center-wrapper");
		const headerEl = headerWrapper.createEl("h1", {
			text: "Delete the file and its all attachments - logs ",
		});
		headerEl.addClass("modal-title");
		this.showConfirmButton(buttonWrapper, myModal);
		this.showCancelBtn(buttonWrapper, myModal);
	}
	// ----------------------
	showCancelBtn(buttonWrapper: HTMLDivElement, myModal: Modal) {
		// --------closeButton--------
		const closeButton = buttonWrapper.createEl("button", {
			text: "Cancel",
		});
		closeButton.setAttribute("aria-label", "Cancel the operation");
		closeButton.addEventListener("click", () => {
			myModal.close();
		});
	}
	showConfirmButton(buttonWrapper: HTMLDivElement, myModal: Modal) {
		const removeLinkButton = buttonWrapper.createEl("button", {
			text: "Confirm",
		});
		removeLinkButton.setAttribute(
			"aria-label",
			"Continue to delete current file and its all non-multi-referenced attachments"
		);
		removeLinkButton.addClass("mod-warning");
		removeLinkButton.addEventListener("click", async () => {
			deleteFile(this.note, this.myPlugin);
			deleteAllAttachs(this.myPlugin);
			myModal.close();
		});
	}
}
