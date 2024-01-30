import AttachFlowPlugin from "src/main";
import { deleteAllAttachs } from "src/options/deleleAllAttachsInTheNote";

export const addCommand = (myPlugin: AttachFlowPlugin) => {
	myPlugin.addCommand({
		id: "clear-all-attachments-in-current-file",
		name: "clear all attachments in current file",
		callback: async () => {
			deleteAllAttachs(myPlugin);
		},
	});
};
