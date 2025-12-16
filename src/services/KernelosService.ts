/**
 * Kernelos Service - Fallback web scraping for manifest downloads
 * Uses hidden BrowserWindow to automate kernelos.org
 */

import * as fs from 'fs';
import * as path from 'path';
import { BrowserWindow, app, session } from 'electron';

const KERNELOS_URL = 'https://kernelos.org/games/';
const MANIFEST_CACHE_PATH = path.join(app.getPath('userData'), 'manifests');

export interface KernelosResult {
    success: boolean;
    zipPath?: string;
    filename?: string;
    error?: string;
}

export class KernelosService {
    private static downloadWindow: BrowserWindow | null = null;

    /**
     * Initialize cache directory
     */
    static init(): void {
        if (!fs.existsSync(MANIFEST_CACHE_PATH)) {
            fs.mkdirSync(MANIFEST_CACHE_PATH, { recursive: true });
        }
    }

    /**
     * Download manifest from kernelos.org using browser automation
     */
    static async downloadFromKernelos(appId: string): Promise<KernelosResult> {
        this.init();

        const zipPath = path.join(MANIFEST_CACHE_PATH, `${appId}.zip`);

        console.log(`[Kernelos] Starting fallback download for App ID: ${appId}`);

        return new Promise((resolve) => {
            // Create hidden browser window
            this.downloadWindow = new BrowserWindow({
                width: 1024,
                height: 768,
                show: false, // Hidden window
                webPreferences: {
                    nodeIntegration: false,
                    contextIsolation: true,
                },
            });

            const win = this.downloadWindow;
            let downloadStarted = false;
            let timeoutId: NodeJS.Timeout;

            // Set up download handler
            const ses = win.webContents.session;

            ses.on('will-download', (event, item) => {
                const actualFilename = item.getFilename();
                console.log(`[Kernelos] Download started: ${actualFilename}`);
                downloadStarted = true;

                // Save with actual filename to preserve extension
                const actualPath = path.join(MANIFEST_CACHE_PATH, actualFilename);
                item.setSavePath(actualPath);

                item.on('done', (event, state) => {
                    clearTimeout(timeoutId);

                    if (state === 'completed') {
                        console.log(`[Kernelos] Download completed: ${actualPath}`);
                        this.cleanup();
                        // Return actual path and filename so caller knows the file type
                        resolve({ success: true, zipPath: actualPath, filename: actualFilename });
                    } else {
                        console.log(`[Kernelos] Download failed: ${state}`);
                        this.cleanup();
                        resolve({ success: false, error: `Download failed: ${state}` });
                    }
                });
            });

            // Set timeout (60 seconds)
            timeoutId = setTimeout(() => {
                console.log('[Kernelos] Timeout - operation took too long');
                this.cleanup();
                resolve({ success: false, error: 'Timeout: Download took too long' });
            }, 60000);

            // Load the page
            win.loadURL(KERNELOS_URL).then(async () => {
                console.log('[Kernelos] Page loaded, starting automation...');

                try {
                    // Wait for page to be ready
                    await this.delay(2000);

                    // Input the AppID
                    await win.webContents.executeJavaScript(`
                        document.getElementById('gid').value = '${appId}';
                        document.getElementById('gid').dispatchEvent(new Event('input', { bubbles: true }));
                    `);
                    console.log('[Kernelos] AppID entered');

                    await this.delay(500);

                    // Click "Get link" button
                    await win.webContents.executeJavaScript(`
                        document.getElementById('go').click();
                    `);
                    console.log('[Kernelos] Clicked Get link button');

                    // Wait for download button to appear (poll every 500ms, max 30 seconds)
                    let attempts = 0;
                    const maxAttempts = 60;

                    const checkForDownloadButton = async () => {
                        if (downloadStarted) return; // Already downloading

                        attempts++;
                        if (attempts > maxAttempts) {
                            clearTimeout(timeoutId);
                            console.log('[Kernelos] Download button did not appear - game not available');
                            this.cleanup();
                            resolve({ success: false, error: `No manifest found for App ID: ${appId}` });
                            return;
                        }

                        try {
                            const buttonExists = await win.webContents.executeJavaScript(`
                                (() => {
                                    const dlBtn = document.getElementById('dl');
                                    return dlBtn && !dlBtn.disabled && dlBtn.offsetParent !== null;
                                })()
                            `);

                            if (buttonExists) {
                                console.log('[Kernelos] Download button found, clicking...');
                                await win.webContents.executeJavaScript(`
                                    document.getElementById('dl').click();
                                `);
                                console.log('[Kernelos] Clicked Download button');
                            } else {
                                // Check for error text directly on page
                                const pageHasError = await win.webContents.executeJavaScript(`
                                    document.body.innerText.includes('Not found or error.')
                                `);

                                if (pageHasError) {
                                    clearTimeout(timeoutId);
                                    console.log('[Kernelos] Game not found on Kernelos');
                                    this.cleanup();
                                    resolve({ success: false, error: `No manifest found for App ID: ${appId}` });
                                    return;
                                }

                                // Keep checking
                                setTimeout(checkForDownloadButton, 500);
                            }
                        } catch (err) {
                            setTimeout(checkForDownloadButton, 500);
                        }
                    };

                    // Start checking for download button
                    await this.delay(1000);
                    checkForDownloadButton();

                } catch (err) {
                    clearTimeout(timeoutId);
                    console.error('[Kernelos] Automation error:', err);
                    this.cleanup();
                    resolve({ success: false, error: (err as Error).message });
                }
            }).catch((err) => {
                clearTimeout(timeoutId);
                console.error('[Kernelos] Failed to load page:', err);
                this.cleanup();
                resolve({ success: false, error: `Failed to load Kernelos: ${err.message}` });
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
