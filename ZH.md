# AttachFlow
<div align="center">

![GitHub Downloads (specific asset, all releases)|150](https://img.shields.io/github/downloads/Yaozhuwa/AttachFlow/main.js) ![GitHub Downloads (specific asset, latest release)](https://img.shields.io/github/downloads/Yaozhuwa/AttachFlow/latest/main.js)

【中文 / [EN](./README.md)】

</div>

这是一个 [Obsidian](https://obsidian.md) 的插件。

利用这个插件，您可以在 [Obsidian](https://obsidian.md) 实时编辑或阅读模式下，通过简单的**右键菜单**，轻松管理文档中的附件（图片、视频，录音，文件...）。此外，插件还针对文档中的图片，提供了丝滑的拖拽调节图片大小和点击查看大图的功能。

## 插件主要功能
(1) 便捷的右键菜单

<img src="assets/AttachFlow-ContextMenu.gif" width="600">

对于本地图片/附件，右键菜单包含：
- 拷贝文件（调用系统API，可拷贝任意文件/图片，粘贴到任意位置/APP，支持 MacOS、Windows）
- 默认应用打开
- 在 Finder/资源管理器 显示
- 在文件列表中显示
- 默认应用打开
- 附件重命名（only in Live Preview Mode）
- 移动文件到文件夹（only in Live Preview Mode）
- 删除链接及对应附件（only in Live Preview Mode）

其中，文件重命名和移动文件的操作会自动更新对应文件的所有链接。

对于网络图片，右键菜单包含：
- 拷贝图片到剪贴板
- 拷贝链接
- 拷贝 Markdown 链接
- 在外部浏览器中打开
- 删除图片链接（only in Live Preview Mode）


(2) 拖拽调整图片大小

<img src="assets/AttachFlow-GragResize.gif" width="600">

功能细节：
- 在图像边缘按住左键可以拖拽调节图片大小
- 支持 Markdown 链接和 WIKI 链接及 Obsidian 的三种内部链接类型
  - 支持 Excalidraw、PDF++ 嵌入的矩形区域调节大小。
  - 支持表格内、Callout内图片调节大小。
- 可以设置最小调节间隔（默认为0），拖拽调节大小后，会自动对齐到最近刻度，如设置为 10，可以让调节后的图片大小自动对齐到整十的大小。

(3) 点击查看大图

<img src="assets/click-view-demo.gif" width="600">

功能描述：
- 点击图片右半区域可以查看大图
- 默认显示100%图片大小，若原图大小超过屏幕，则按屏幕90%大小显示（该比例可在设置中修改）
- 按住左键可以拖拽图片
- 鼠标滚轮可以调节图片大小，以鼠标位置为中心点缩放
- 右键点击图片快速将图片显示为100%大小
- 双击图片快速显示图片的初始大小（100%大小或者自适应屏幕显示）
- 点击图片外区域/ESC 退出查看

## 删除文件功能详细介绍

特性简介：

1. 右键图片删除图片附件及引用链接，视情况自动删除附件文件夹

2. 文件列表中右键删除笔记同时自动删除引用的附件，视情况自动删除附件文件夹

特性详情：

- 删除图片支持 `markdown `和 `wiki `链接风格的链接
- 支持 三种不同格式的**内部链接类型** （[详情](https://help.obsidian.md/Linking+notes+and+files/Internal+links)）
  1. 尽可能简短的形式
  2. 基于当前笔记的相对路径
  3. 基于仓库根目录的绝对路径
- 支持设置图片删除后的处理方式：① 移动到系统回收站 ； ② 移动到 obsidian trash ; ③ 永久删除

- 除了支持 img 类型的附件，更多类型附件文件，如图片，视频，录音，文件.....（目前不支持右键删除`PDF`附件）

  1. img 类型: img、gif、png、jpeg，svg， bmp...

  1. file 类型: docx、pptx、html、epub...

  1. media 类型: mp4、mkv...



> 删除图片附件及引用链接情况说明：
>
> 1. 该附件**仅被当前链接引用**，则会直接删除该链接，同时删除附件文件。
> 2. 该附件除了当前链接**还有其他地方对其有引用**，则只会删除当前的链接文本，并不会删除该附件文件。

> 删除笔记同时自动删除引用的附件说明：
>
> 1. 如果附件被其他笔记也引用，则不删除。
> 2. 如果附件仅被当前**需被删除的笔记**引用一次或多次，则删除。
> 3. 删除方式：通过插件提供的命令删除 ; 文件列表右键菜单删除

> 视情况自动删除附件文件夹说明：
>
> - 当且仅当被删除的笔记中引用的（图片）附件被当前笔记引用一次，且删除附件文件后，附件文件夹下没有内容时删除附件的父级目录（一般为附件文件夹）



## 安装

### 从插件市场安装


### 从 BRAT 安装

添加 `https://github.com/Yaozhuwa/AttachFlow` 到 [BRAT](https://github.com/TfTHacker/obsidian42-brat).

### 手动安装

进入本插件最新的 release 页面，下载 `main.js`, `manifest.json`, `style.css`, 把他们放到 `<your_vault>/.obsidian/plugins/AttachFlow/` 文件夹下.


## 使用

1. 安装并启用插件
2. 在**阅读模式**或者**实时预览模式**鼠标右键图片，在弹出的菜单项目中，点击删除选项

### 删除目的设置

请确保你在本插件的设置界面下选择了被删除图片的目的地。你有 3 个选项。

1. **移动到黑曜石垃圾桶** - 文件将被移动到黑曜石保险库下的`.trash`。
2. **移动到系统垃圾箱** - 文件将被移动到操作系统垃圾箱。
3. **永久删除** - 文件将被永久销毁。你将不能再恢复了


## 开发

这个插件遵循 [Obsidian Sample Plugin](https://github.com/obsidianmd/obsidian-sample-plugin) 插件的结构，请看那里的进一步细节。


## 项目说明

本插件是在 [Fast-Image-Clear 插件](https://github.com/martinniee/Obsidian-fast-image-cleaner)v0.8.1 的基础上修改得到。我在其基础上增加了拷贝文件到剪贴板的功能。此外，在默认app打开，在finder中显示，在文件列表显示这三个功能我是参考了 [obsidian-copy-url-in-preview 插件](https://github.com/NomarCub/obsidian-copy-url-in-preview)。拖拽调整图片大小的功能修改自 [Image Converter 插件](https://github.com/xRyul/obsidian-image-converter)。

参考项目地址：
- https://github.com/martinniee/Obsidian-fast-image-cleaner
- https://github.com/NomarCub/obsidian-copy-url-in-preview
- https://github.com/xRyul/obsidian-image-converter


## 赞助
如果你喜欢这个插件，并对我表示感谢，你可以在这里请我喝一杯奶茶！

<img src="assets/donate.png" width="400">
