/**
 * Online Fix Download Service - Download and install online fix for games
 * Uses browser automation with cookies for authenticated access
 */

import { BrowserWindow, app, session } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';

const STEAM_PATH = 'C:\\Program Files (x86)\\Steam';
const STEAMAPPS_COMMON = path.join(STEAM_PATH, 'steamapps', 'common');
const CACHE_PATH = path.join(app.getPath('userData'), 'onlinefix');
const COOKIE_PATH = path.join(__dirname, '../cookie/online-fix.me_cookies.json');

export interface OnlineFixDownloadResult {
    success: boolean;
    error?: string;
    needsManualPath?: boolean;
    downloadedFile?: string;
}

export class OnlineFixDownloadService {
    private static downloadWindow: BrowserWindow | null = null;

    /**
     * Initialize cache directory
     */
    static init(): void {
        if (!fs.existsSync(CACHE_PATH)) {
            fs.mkdirSync(CACHE_PATH, { recursive: true });
        }
    }

    /**
     * Load cookies from JSON files and set them in session
     */
    private static async loadCookies(windowSession: Electron.Session): Promise<void> {
        try {
            // Cookie file paths
            const mainCookiePaths = [
                COOKIE_PATH,
                path.join(app.getAppPath(), 'src/cookie/online-fix.me_cookies.json'),
                path.join(process.cwd(), 'src/cookie/online-fix.me_cookies.json'),
            ];

            const uploadCookiePaths = [
                path.join(__dirname, '../cookie/up_cookies.json'),
                path.join(app.getAppPath(), 'src/cookie/up_cookies.json'),
                path.join(process.cwd(), 'src/cookie/up_cookies.json'),
            ];

            // Load main domain cookies
            for (const p of mainCookiePaths) {
                if (fs.existsSync(p)) {
                    console.log(`[OnlineFixDownload] Loading main cookies from: ${p}`);
                    const cookies = JSON.parse(fs.readFileSync(p, 'utf8'));
                    await this.setCookiesForDomains(windowSession, cookies, ['online-fix.me']);
                    break;
                }
            }

            // Load upload subdomain cookies
            for (const p of uploadCookiePaths) {
                if (fs.existsSync(p)) {
                    console.log(`[OnlineFixDownload] Loading upload cookies from: ${p}`);
                    const cookies = JSON.parse(fs.readFileSync(p, 'utf8'));

                    // Set cookies for uploads subdomain with port
                    for (const cookie of cookies) {
                        try {
                            // For uploads.online-fix.me:2053
                            await windowSession.cookies.set({
                                url: 'https://uploads.online-fix.me:2053',
                                name: cookie.name,
                                value: cookie.value,
                                domain: cookie.domain,
                                path: cookie.path || '/',
                                secure: true,
                                httpOnly: cookie.httpOnly || false,
                            });

                            // Also try without port
                            await windowSession.cookies.set({
                                url: 'https://uploads.online-fix.me',
                                name: cookie.name,
                                value: cookie.value,
                                domain: cookie.domain,
                                path: '/',
                                secure: true,
                            });
                        } catch (e) { }
                    }
                    break;
                }
            }

            console.log('[OnlineFixDownload] Cookies loaded successfully for all domains');
        } catch (error) {
            console.error('[OnlineFixDownload] Failed to load cookies:', error);
        }
    }

    /**
     * Set cookies for multiple domains
     */
    private static async setCookiesForDomains(
        windowSession: Electron.Session,
        cookies: any[],
        domains: string[]
    ): Promise<void> {
        for (const cookie of cookies) {
            for (const domain of domains) {
                try {
                    await windowSession.cookies.set({
                        url: `https://${domain}`,
                        name: cookie.name,
                        value: cookie.value,
                        domain: cookie.domain || `.${domain}`,
                        path: cookie.path || '/',
                        secure: true,
                        httpOnly: cookie.httpOnly || false,
                        expirationDate: cookie.expirationDate,
                    });
                } catch (e) { }
            }
        }
    }


    /**
     * Get game installation path from Steam
     */
    static getGamePath(gameName: string): string | null {
        // Clean game name for folder matching
        const cleanName = gameName
            .replace(/[™®©:]/g, '')
            .replace(/\s+/g, ' ')
            .trim();

        // Try to find in steamapps/common
        if (fs.existsSync(STEAMAPPS_COMMON)) {
            const folders = fs.readdirSync(STEAMAPPS_COMMON);

            // Exact match first
            for (const folder of folders) {
                if (folder.toLowerCase() === cleanName.toLowerCase()) {
                    return path.join(STEAMAPPS_COMMON, folder);
                }
            }

            // Partial match
            for (const folder of folders) {
                if (folder.toLowerCase().includes(cleanName.toLowerCase().split(' ')[0])) {
                    return path.join(STEAMAPPS_COMMON, folder);
                }
            }
        }

        return null;
    }

    /**
     * Download and install online fix
     */
    static async downloadOnlineFix(
        fixUrl: string,
        gameName: string,
        customPath?: string
    ): Promise<OnlineFixDownloadResult> {
        this.init();

        console.log(`[OnlineFixDownload] Starting download for: ${gameName}`);
        console.log(`[OnlineFixDownload] Fix URL: ${fixUrl}`);

        // Determine game path
        const gamePath = customPath || this.getGamePath(gameName);
        if (!gamePath) {
            console.log('[OnlineFixDownload] Game path not found');
            return { success: false, needsManualPath: true, error: 'Game installation folder not found' };
        }

        console.log(`[OnlineFixDownload] Game path: ${gamePath}`);

        return new Promise(async (resolve) => {
            // Create browser window (visible for debugging)
            this.downloadWindow = new BrowserWindow({
                width: 1024,
                height: 768,
                show: true, // Show for debugging
                webPreferences: {
                    nodeIntegration: false,
                    contextIsolation: true,
                },
            });

            const win = this.downloadWindow;

            // Load cookies into this window's session
            await this.loadCookies(win.webContents.session);
            let downloadStarted = false;
            let resolved = false;
            let timeoutId: NodeJS.Timeout;

            // Set timeout (5 minutes for download)
            timeoutId = setTimeout(() => {
                if (!resolved) {
                    resolved = true;
                    this.cleanup();
                    resolve({ success: false, error: 'Download timeout' });
                }
            }, 300000);

            // Setup download handler
            const ses = win.webContents.session;
            ses.on('will-download', (event, item) => {
                const filename = item.getFilename();
                console.log(`[OnlineFixDownload] Download started: ${filename}`);
                downloadStarted = true;

                const savePath = path.join(CACHE_PATH, filename);
                item.setSavePath(savePath);

                item.on('done', async (event, state) => {
                    if (resolved) return;
                    resolved = true;
                    clearTimeout(timeoutId);

                    if (state === 'completed') {
                        console.log(`[OnlineFixDownload] Download completed: ${savePath}`);

                        // Extract and install
                        const installResult = await this.extractAndInstall(savePath, gamePath);
                        this.cleanup();
                        resolve(installResult);
                    } else {
                        console.log(`[OnlineFixDownload] Download failed: ${state}`);
                        this.cleanup();
                        resolve({ success: false, error: `Download failed: ${state}` });
                    }
                });
            });

            // Navigate to fix page and find download link
            win.loadURL(fixUrl).then(async () => {
                console.log('[OnlineFixDownload] Page loaded, searching for fix link...');

                // Wait for page to load
                await this.delay(3000);

                try {
                    // Find the uploads link (Скачать фикс с сервера)
                    const uploadsLink = await win.webContents.executeJavaScript(`
                        (() => {
                            const links = document.querySelectorAll('a.btn-success');
                            for (const link of links) {
                                if (link.href && link.href.includes('uploads.online-fix.me')) {
                                    return link.href;
                                }
                            }
                            return null;
                        })()
                    `);

                    if (!uploadsLink) {
                        if (!resolved) {
                            resolved = true;
                            clearTimeout(timeoutId);
                            this.cleanup();
                            resolve({ success: false, error: 'Fix download link not found' });
                        }
                        return;
                    }

                    console.log(`[OnlineFixDownload] Found uploads link: ${uploadsLink}`);

                    // Navigate to uploads page
                    await win.loadURL(uploadsLink);
                    await this.delay(2000);

                    // Log all links on page for debugging
                    const allLinks = await win.webContents.executeJavaScript(`
                        (() => {
                            const links = [];
                            document.querySelectorAll('a').forEach(a => {
                                if (a.href) links.push(a.href);
                            });
                            return links;
                        })()
                    `);
                    console.log('[OnlineFixDownload] Links on page:', allLinks);

                    // FIRST: Look for Fix Repair folder and navigate to it
                    const fixRepairLink = await win.webContents.executeJavaScript(`
                        (() => {
                            const links = document.querySelectorAll('a');
                            for (const link of links) {
                                const href = link.href || '';
                                const text = link.textContent || '';
                                if ((href.includes('Fix') && href.includes('Repair')) ||
                                    (text.includes('Fix') && text.includes('Repair'))) {
                                    return link.href;
                                }
                            }
                            return null;
                        })()
                    `);

                    let archiveLink: string | null = null;

                    if (fixRepairLink) {
                        console.log('[OnlineFixDownload] Found Fix Repair folder, navigating...');
                        await win.loadURL(fixRepairLink);
                        await this.delay(2000);
                        console.log('[OnlineFixDownload] Now in Fix Repair folder');
                        archiveLink = await this.findArchiveOnPage(win);
                    }

                    // If no archive yet, try main page
                    if (!archiveLink) {
                        if (fixRepairLink) {
                            await win.loadURL(uploadsLink);
                            await this.delay(1000);
                        }
                        archiveLink = await this.findArchiveOnPage(win);
                    }

                    if (!archiveLink) {
                        if (!resolved) {
                            resolved = true;
                            clearTimeout(timeoutId);
                            this.cleanup();
                            resolve({ success: false, error: 'Archive file not found. Check the website manually.' });
                        }
                        return;
                    }

                    console.log(`[OnlineFixDownload] Found archive: ${archiveLink}`);

                    // Click the archive link to trigger download (don't use loadURL which errors on downloads)
                    await win.webContents.executeJavaScript(`
                        (() => {
                            const links = document.querySelectorAll('a');
                            for (const link of links) {
                                const href = link.href || '';
                                const lowerHref = href.toLowerCase();
                                if (lowerHref.endsWith('.rar') || lowerHref.endsWith('.zip') || lowerHref.endsWith('.7z')) {
                                    link.click();
                                    return true;
                                }
                            }
                            return false;
                        })()
                    `);

                    console.log('[OnlineFixDownload] Archive link clicked, waiting for download...');

                } catch (error) {
                    // Ignore download navigation errors (they happen when will-download intercepts)
                    const errorCode = (error as any).code;
                    if (errorCode === 'ERR_FAILED' || errorCode === 'ERR_ABORTED') {
                        // This is expected when downloading a file - ignore it
                        console.log('[OnlineFixDownload] Navigation intercepted for download (expected)');
                        return;
                    }

                    console.error('[OnlineFixDownload] Error:', error);
                    if (!resolved) {
                        resolved = true;
                        clearTimeout(timeoutId);
                        this.cleanup();
                        resolve({ success: false, error: (error as Error).message });
                    }
                }
            }).catch((error) => {
                if (!resolved) {
                    resolved = true;
                    clearTimeout(timeoutId);
                    this.cleanup();
                    resolve({ success: false, error: `Failed to load page: ${error.message}` });
                }
            });
        });
    }

    /**
     * Extract archive and install to game folder
     */
    private static async extractAndInstall(
        archivePath: string,
        gamePath: string
    ): Promise<OnlineFixDownloadResult> {
        console.log(`[OnlineFixDownload] Extracting: ${archivePath} to ${gamePath}`);

        const ext = path.extname(archivePath).toLowerCase();
        const password = 'online-fix.me';

        return new Promise((resolve) => {
            let command: string;

            if (ext === '.rar') {
                // Use WinRAR or 7-Zip for RAR
                command = `"C:\\Program Files\\WinRAR\\UnRAR.exe" x -p${password} -o+ "${archivePath}" "${gamePath}\\"`;
            } else if (ext === '.zip') {
                // Use 7-Zip for ZIP with password
                command = `"C:\\Program Files\\7-Zip\\7z.exe" x -p${password} -o"${gamePath}" -y "${archivePath}"`;
            } else if (ext === '.7z') {
                command = `"C:\\Program Files\\7-Zip\\7z.exe" x -p${password} -o"${gamePath}" -y "${archivePath}"`;
            } else {
                resolve({ success: false, error: `Unsupported archive format: ${ext}` });
                return;
            }

            console.log(`[OnlineFixDownload] Running: ${command}`);

            exec(command, (error, stdout, stderr) => {
                // Clean up archive
                try { fs.unlinkSync(archivePath); } catch (e) { }

                if (error) {
                    console.error('[OnlineFixDownload] Extract error:', error);
                    // Try alternative extraction
                    this.tryAlternativeExtract(archivePath, gamePath, password)
                        .then(resolve)
                        .catch(() => resolve({ success: false, error: `Extraction failed: ${error.message}` }));
                    return;
                }

                console.log('[OnlineFixDownload] Extraction successful');
                resolve({ success: true, downloadedFile: archivePath });
            });
        });
    }

    /**
     * Try alternative extraction methods
     */
    private static async tryAlternativeExtract(
        archivePath: string,
        gamePath: string,
        password: string
    ): Promise<OnlineFixDownloadResult> {
        // Try 7-Zip in different locations
        const sevenZipPaths = [
            'C:\\Program Files\\7-Zip\\7z.exe',
            'C:\\Program Files (x86)\\7-Zip\\7z.exe',
        ];

        for (const szPath of sevenZipPaths) {
            if (fs.existsSync(szPath)) {
                return new Promise((resolve) => {
                    const command = `"${szPath}" x -p${password} -o"${gamePath}" -y "${archivePath}"`;
                    exec(command, (error) => {
                        if (error) {
                            resolve({ success: false, error: 'Extraction failed with all methods' });
                        } else {
                            resolve({ success: true });
                        }
                    });
                });
            }
        }

        return { success: false, error: '7-Zip or WinRAR not found. Please install one of them.' };
    }

    /**
     * Cleanup browser window
     */
    private static cleanup(): void {
        if (this.downloadWindow) {
            try {
                this.downloadWindow.close();
            } catch (e) { }
            this.downloadWindow = null;
        }
    }

    /**
     * Delay helper
     */
    private static delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Find archive file on current page
     */
    private static async findArchiveOnPage(win: BrowserWindow): Promise<string | null> {
        return win.webContents.executeJavaScript(`
            (() => {
                const links = document.querySelectorAll('a');
                for (const link of links) {
                    const href = link.href || '';
                    const lowerHref = href.toLowerCase();
                    if (lowerHref.endsWith('.rar') || lowerHref.endsWith('.zip') || lowerHref.endsWith('.7z')) {
                        return link.href;
                    }
                }
                return null;
            })()
        `);
    }
}
