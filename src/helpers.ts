// This file is copied from repo: https://github.com/NomarCub/obsidian-copy-url-in-preview

// MIT License
// Copyright (c) 2022 NomarCub

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

import { App, Editor, EditorPosition, FileSystemAdapter } from "obsidian";

const loadImageBlobTimeout = 3000;

export interface ElectronWindow extends Window {
    WEBVIEW_SERVER_URL: string
}

export interface EditorInternalApi extends Editor {
    posAtMouse(event: MouseEvent): EditorPosition;
    getClickableTokenAt(position: EditorPosition): {
        text: string
    } | null;
}

export interface FileSystemAdapterWithInternalApi extends FileSystemAdapter {
    open(path: string): Promise<void>
}

export interface AppWithDesktopInternalApi extends App {
    openWithDefaultApp(path: string): Promise<void>;
    showInFolder(path: string): Promise<void>;
}

export interface Listener {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this: Document, ev: Event): any;
}

export function withTimeout<T>(ms: number, promise: Promise<T>): Promise<T> {
    const timeout = new Promise((resolve, reject) => {
        const id = setTimeout(() => {
            clearTimeout(id);
            reject(`timed out after ${ms} ms`)
        }, ms)
    })
    return Promise.race([
        promise,
        timeout
    ]) as Promise<T>
}

// https://developer.mozilla.org/en-US/docs/Web/HTML/CORS_enabled_image
// option?: https://www.npmjs.com/package/html-to-image
export async function loadImageBlob(imgSrc: string, retryCount = 0): Promise<Blob> {
    const loadImageBlobCore = () => {
        return new Promise<Blob>((resolve, reject) => {
            const image = new Image();
            image.crossOrigin = "anonymous";
            image.onload = () => {
                const canvas = document.createElement("canvas");
                canvas.width = image.width;
                canvas.height = image.height;
                const ctx = canvas.getContext("2d")!;
                ctx.drawImage(image, 0, 0);
                canvas.toBlob((blob: Blob) => {
                    resolve(blob);
                });
            };
            image.onerror = async () => {
                if (retryCount < 3) {
                    try {
                        await fetch(image.src, { "mode": "no-cors" });
                        const blob = await loadImageBlob(`https://api.allorigins.win/raw?url=${encodeURIComponent(imgSrc)}`, retryCount + 1);
                        resolve(blob);
                    } catch {
                        reject();
                    }
                } else {
                    reject(new Error('Unable to retrieve the image data after 3 retries.'));
                }
            };
            image.src = imgSrc;
        });
    };
    return withTimeout(loadImageBlobTimeout, loadImageBlobCore());
}

export function onElement(
    el: Document,
    event: keyof HTMLElementEventMap,
    selector: string,
    listener: Listener,
    options?: { capture?: boolean; }
) {
    el.on(event, selector, listener, options);
    return () => el.off(event, selector, listener, options);
}