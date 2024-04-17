# AttachFlow
<div align="center">

![GitHub Downloads (specific asset, all releases)|150](https://img.shields.io/github/downloads/Yaozhuwa/AttachFlow/main.js) ![GitHub Downloads (specific asset, latest release)](https://img.shields.io/github/downloads/Yaozhuwa/AttachFlow/latest/main.js)

【[中文](./ZH.md) / EN】
</div>

This is a plugin for [Obsidian](https://obsidian.md).

This nifty plugin enables seamless management of attachments and referenced links directly from your documents. Taking advantage of an intuitive **right-click menu**, you can efficiently handle resources in both LIVE and READ modes. Additionally, the plugin offers intuitive resizing and click-to-expand features for images in the document.

## Showcase / Feature

(1) Handy Context Menu

<img src="assets/AttachFlow-ContextMenu.gif" width="600">

For local images/attachments, the right-click menu includes:
- Copy File (utilizes system API, allowing any file/image to be copied and pasted to any location/app, compatible with MacOS and Windows)
- Open with Default Application
- Show in Finder/File Explorer
- Show in File List
- Open with Default Application
- Rename Attachment (only in Live Preview Mode)
- Move File to Folder (only in Live Preview Mode)
- Delete Link and Corresponding Attachment (only in Live Preview Mode)

Aside from these, any renaming or moving of files will automatically update all corresponding file links.

For online images, the right-click menu includes:
- Copy Image to Clipboard
- Copy Link
- Copy Markdown Link
- Open in External Browser
- Remove Image Link (only in Live Preview Mode)

(2) Drag to Resize Images

<img src="assets/AttachFlow-GragResize.gif" width="600">

Functional details:
- Holding down the left mouse button on the edge of an image allows for drag-to-resize
- Supports Markdown links, WIKI links, and all three types of internal links in Obsidian
- Compatibility with Excalidraw plugin and PDF++ plugin's embeds for resizable rectangular areas.  
- Enables resizing of images within tables and Callouts.
- Allows setting a minimum adjustment interval (default is 0); following a resize, the dimensions automatically align to the nearest marking. For example, if set to 10, the adjusted image size automatically aligns to the nearest multiple of ten.

(3) Click to View Images

<img src="assets/click-view-demo.gif" width="600">

Feature Description:
- Clicking on the right half of an image allows for viewing the image in larger size
- Displays at 100% of the image's size by default; if the original image size exceeds the screen size, it will display at 90% of the screen size (this ratio can be adjusted in the settings)
- Holding down the left mouse button enables drag-and-move of the image
- Using the mouse scroll wheel allows for resizing the image, with the scaling centered on the mouse position
Right-clicking the image quickly resets it to 100% of its size
- Double-clicking an image quickly resets it to its original size (either 100% or fit-to-screen)
- Clicking outside of the image or pressing ESC exits the view mode

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


## Support
If you like this plugin and want to say thanks, you can buy me a coffee here!

<img src="assets/donate.png" width="400">

<a href="https://www.buymeacoffee.com/yaozhuwa"><img src="https://img.buymeacoffee.com/button-api/?text=Buy me a coffee&emoji=&slug=yaozhuwa&button_colour=FFDD00&font_colour=000000&font_family=Cookie&outline_colour=000000&coffee_colour=ffffff" /></a>