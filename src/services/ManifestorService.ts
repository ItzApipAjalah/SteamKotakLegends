/**
 * Manifestor Service - Fallback web scraping for manifest downloads
 * Uses visible BrowserWindow due to Cloudflare Turnstile
 */

import * as fs from 'fs';
import * as path from 'path';
import { BrowserWindow, app } from 'electron';

const MANIFESTOR_URL = 'https://manifestor.cc/';
const MANIFEST_CACHE_PATH = path.join(app.getPath('userData'), 'manifests');

export interface ManifestorResult {
    success: boolean;
    zipPath?: string;
    filename?: string;
    error?: string;
}

export class ManifestorService {
    private static downloadWindow: BrowserWindow | null = null;

    /**
     * Initialize cache directory
     */
    static init(): void {
        if (!fs.existsSync(MANIFEST_CACHE_PATH)) {
            fs.mkdirSync(MANIFEST_CACHE_PATH, { recursive: true });
        }
    }

    static async downloadFromManifestor(appId: string): Promise<ManifestorResult> {
        this.init();

        const zipPath = path.join(MANIFEST_CACHE_PATH, `${appId}.zip`);

        console.log(`[Manifestor] Starting fallback download for App ID: ${appId}`);

        return new Promise((resolve) => {
            this.downloadWindow = new BrowserWindow({
                width: 1024,
                height: 768,
                show: false,
                webPreferences: {
                    nodeIntegration: false,
                    contextIsolation: true,
                },
            });

            const win = this.downloadWindow;
            let downloadStarted = false;
            let timeoutId: NodeJS.Timeout;
            let resolved = false;

            win.on('closed', () => {
                if (!resolved) {
                    resolved = true;
                    clearTimeout(timeoutId);
                    resolve({ success: false, error: 'Window closed by user' });
                }
            });

            // Set up download handler
            const ses = win.webContents.session;

            ses.on('will-download', (event, item) => {
                const actualFilename = item.getFilename();
                console.log(`[Manifestor] Download started: ${actualFilename}`);
                downloadStarted = true;

                // Save with actual filename to preserve extension
                const actualPath = path.join(MANIFEST_CACHE_PATH, actualFilename);
                item.setSavePath(actualPath);

                item.on('done', (event, state) => {
                    if (resolved) return;
                    resolved = true;
                    clearTimeout(timeoutId);

                    if (state === 'completed') {
                        console.log(`[Manifestor] Download completed: ${actualPath}`);
                        this.cleanup();
                        resolve({ success: true, zipPath: actualPath, filename: actualFilename });
                    } else {
                        console.log(`[Manifestor] Download failed: ${state}`);
                        this.cleanup();
                        resolve({ success: false, error: `Download failed: ${state}` });
                    }
                });
            });

            // Set timeout (120 seconds - longer for user to solve Turnstile)
            timeoutId = setTimeout(() => {
                if (resolved) return;
                resolved = true;
                console.log('[Manifestor] Timeout - operation took too long');
                this.cleanup();
                resolve({ success: false, error: `No manifest found for App ID: ${appId}` });
            }, 120000);

            // Load the page
            win.loadURL(MANIFESTOR_URL).then(async () => {
                console.log('[Manifestor] Page loaded, starting automation...');

                try {
                    // Wait for page to be ready
                    await this.delay(2000);

                    // Input the AppID
                    await win.webContents.executeJavaScript(`
                        document.getElementById('appIdInput').value = '${appId}';
                        document.getElementById('appIdInput').dispatchEvent(new Event('input', { bubbles: true }));
                    `);
                    console.log('[Manifestor] AppID entered');

                    // Poll for download button to become enabled
                    let attempts = 0;
                    const maxAttempts = 240; // 2 minutes at 500ms intervals

                    const checkForEnabledButton = async () => {
                        if (resolved || downloadStarted) return;

                        attempts++;
                        if (attempts > maxAttempts) {
                            if (resolved) return;
                            resolved = true;
                            clearTimeout(timeoutId);
                            console.log('[Manifestor] Download button never became enabled');
                            this.cleanup();
                            resolve({ success: false, error: `No manifest found for App ID: ${appId}` });
                            return;
                        }

                        try {
                            const buttonEnabled = await win.webContents.executeJavaScript(`
                                (() => {
                                    const btn = document.getElementById('downloadButton');
                                    return btn && !btn.disabled;
                                })()
                            `);

                            if (buttonEnabled) {
                                console.log('[Manifestor] Download button enabled, clicking...');
                                await win.webContents.executeJavaScript(`
                                    document.getElementById('downloadButton').click();
                                `);
                                console.log('[Manifestor] Clicked Download button');
                                // Download should start soon
                            } else {
                                // Keep checking
                                setTimeout(checkForEnabledButton, 500);
                            }
                        } catch (err) {
                            setTimeout(checkForEnabledButton, 500);
                        }
                    };

                    // Start checking for enabled button
                    await this.delay(1000);
                    checkForEnabledButton();

                } catch (err) {
                    if (resolved) return;
                    resolved = true;
                    clearTimeout(timeoutId);
                    console.error('[Manifestor] Automation error:', err);
                    this.cleanup();
                    resolve({ success: false, error: (err as Error).message });
                }
            }).catch((err) => {
                if (resolved) return;
                resolved = true;
                clearTimeout(timeoutId);
                console.error('[Manifestor] Failed to load page:', err);
                this.cleanup();
                resolve({ success: false, error: `Failed to load Manifestor: ${err.message}` });
            });
        });
    }

    /**
     * Cleanup browser window
     */
    private static cleanup(): void {
        if (this.downloadWindow) {
            try {
                this.downloadWindow.close();
            } catch (e) {
                // Ignore errors during cleanup
            }
            this.downloadWindow = null;
        }
    }

    /**
     * Delay helper
     */
    private static delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
