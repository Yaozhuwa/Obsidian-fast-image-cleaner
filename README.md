# AttachFlow

【[中文](./ZH.md) / EN】

This is a plugin for [Obsidian](https://obsidian.md).

This nifty plugin enables seamless management of attachments and referenced links directly from your documents. Taking advantage of an intuitive **right-click menu**, you can efficiently handle resources in both LIVE and READ modes.

## Showcase

(1) In live preview mode

<img src="assets/SourceModeMenu.png" width="600">

(2)In reading mode

<img src="assets/ReadingModeMenu.png" width="600">

## Details for clear file feature

Feature intro:

1. Right-click image to delete attachment and links, and folder as appropriate.

2. Right-click file list to delete notes and referenced attachments, and folder  as appropriate.

Feature Details:

1. Support `markdown ` and `wiki ` link style image link removal

2. Supports three different formats of **Internal link types** ([Details](https://help.obsidian.md/Linking+notes+and+files/Internal+links))

   1. Shortest path when possible
   2. Relative path to file
   3. Absolute path to vault

3. Support processing approach after deleting image

   1. Move to system trash

   2. Move to Obsidian trash (.trash folder)

   3. Permanently delete

4. In addition to supporting `img` type attachments, there are other types of attachment files such as images, videos, audio recordings, documents... (currently PDF attachments cannot be deleted by right-clicking).

   1. img type: img、gif、png、jpeg，svg， bmp...

   1. file type: docx、pptx、html、epub...

   1. media type: mp4、mkv...



> Explanation of image attachment and reference link deletion:
>
> 1. If the image/file is only referenced **once** in the current note, it will be deleted directly along with its link.
> 2. If the image/file is referenced **multiple times**, only the link to the current image/file is removed, not the actual file.

> Explanation of automatic deletion of referenced attachments when deleting a note:
>
> 1. If the attachment is referenced by other notes, it will not be deleted.
> 2. If the attachment is only referenced in the **note to be deleted**, it will be deleted.
> 3. Deletion method: using the provided command of the plugin, or by right-clicking on the file list.

> Explanation of automatic deletion of attachment folder depending on the situation:
>
> - The parent directory of an attachment (usually an attachment folder) will be deleted only if the attachment is referenced once in the note to be deleted, and the attachment folder is empty after the attachment is deleted.

## Install


### Install from BRAT

Add `https://github.com/Yaozhuwa/AttachFlow` to [BRAT](https://github.com/TfTHacker/obsidian42-brat).
### Manual installation

Go to the latest release page and download the `main.js`, `manifest.json`, `style.css`, and put them to `<your_vault>/.obsidian/plugins/AttachFlow/`.

## Usage

1. Install and enable this plug-in
2. In LIVE MODE OR READ MODE ,right-click on image/media/file-embed will open context-menu, where you can delete file,copy file, open file with default app, open file in finder or reveal file in navigation.

### Deleted File Destination

Please make sure that you select the destination for the deleted files under this plugin's setting tab. You have 3 options:

1. **Move to Obsidian Trash** - Files are going to be moved to the `.trash` under the Obsidian Vault.
2. **Move to System Trash** - Files are going to be moved to the Operating System trash.
3. **Permanently Delete** - Files are going to be destroyed permanently. You won't beable to revert back.


## Development

This plugin follows the structure of the [Obsidian Sample Plugin](https://github.com/obsidianmd/obsidian-sample-plugin) plugin, please see further details there.

## Credits
This plugin is a modification based on the [Fast-Image-Clear plugin v0.8.1](https://github.com/martinniee/Obsidian-fast-image-cleaner). I've added functionality to copy files to the clipboard. Furthermore, the features of opening in the default app, showing in finder, and listing in the file list were all inspired by the [obsidian-copy-url-in-preview plugin](https://github.com/NomarCub/obsidian-copy-url-in-preview). Feature of "Drag to Reesize" is modified from https://github.com/xRyul/obsidian-image-converter/.

References for these projects can be found at:
- https://github.com/martinniee/Obsidian-fast-image-cleaner
- https://github.com/NomarCub/obsidian-copy-url-in-preview
- https://github.com/xRyul/obsidian-image-converter