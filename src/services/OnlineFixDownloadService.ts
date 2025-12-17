/**
 * Online Fix Download Service - Download and install online fix for games
 * Uses browser automation with cookies for authenticated access
 */

import { BrowserWindow, app, session } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import * as https from 'https';

const STEAM_PATH = 'C:\\Program Files (x86)\\Steam';
const STEAMAPPS_COMMON = path.join(STEAM_PATH, 'steamapps', 'common');
const CACHE_PATH = path.join(app.getPath('userData'), 'onlinefix');

// API Configuration
const COOKIE_API_URL = process.env.COOKIE_API_URL || 'https://cookies.kotaklegend.my.id';
const COOKIE_API_TOKEN = process.env.COOKIE_API_TOKEN || '';

export interface OnlineFixDownloadResult {
    success: boolean;
    error?: string;
    needsManualPath?: boolean;
    downloadedFile?: string;
}

export interface OnlineFixProgress {
    step: string;
    percent: number;
}

export class OnlineFixDownloadService {
    private static downloadWindow: BrowserWindow | null = null;
    private static progressCallback: ((progress: OnlineFixProgress) => void) | null = null;

    /**
     * Send progress update to renderer
     */
    private static sendProgress(step: string, percent: number): void {
        if (this.progressCallback) {
            this.progressCallback({ step, percent });
        }
        console.log(`[OnlineFixDownload] ${step} (${percent}%)`);
    }

    /**
     * Initialize cache directory
     */
    static init(): void {
        if (!fs.existsSync(CACHE_PATH)) {
            fs.mkdirSync(CACHE_PATH, { recursive: true });
        }
        // Load environment variables from .env file
        this.loadEnv();
    }

    /**
     * Load environment variables from .env file
     */
    private static loadEnv(): void {
        const envPaths = [
            path.join(app.getAppPath(), '.env'),
            path.join(process.cwd(), '.env'),
            path.join(process.resourcesPath || '', '.env'),
        ];

        for (const envPath of envPaths) {
            if (fs.existsSync(envPath)) {
                const envContent = fs.readFileSync(envPath, 'utf8');
                const lines = envContent.split('\n');
                for (const line of lines) {
                    const trimmed = line.trim();
                    if (trimmed && !trimmed.startsWith('#')) {
                        const [key, ...valueParts] = trimmed.split('=');
                        const value = valueParts.join('=');
                        if (key && value) {
                            process.env[key.trim()] = value.trim();
                        }
                    }
                }
                console.log(`[OnlineFixDownload] Loaded env from: ${envPath}`);
                break;
            }
        }
    }

    /**
     * Fetch cookies from API endpoint
     */
    private static async fetchCookiesFromAPI(endpoint: string): Promise<any[]> {
        return new Promise((resolve, reject) => {
            const token = process.env.COOKIE_API_TOKEN || COOKIE_API_TOKEN;
            const apiUrl = process.env.COOKIE_API_URL || COOKIE_API_URL;
            const url = `${apiUrl}/${endpoint}`;

            const postData = `token=${encodeURIComponent(token)}`;

            const urlObj = new URL(url);
            const options = {
                hostname: urlObj.hostname,
                port: urlObj.port || 443,
                path: urlObj.pathname,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Content-Length': Buffer.byteLength(postData),
                },
            };

            console.log(`[OnlineFixDownload] Fetching cookies from: ${url}`);

            const req = https.request(options, (res) => {
                let data = '';
                res.on('data', (chunk) => { data += chunk; });
                res.on('end', () => {
                    try {
                        const json = JSON.parse(data);
                        // Handle both formats: { success, cookies } and { cookies } directly
                        if (json.cookies && Array.isArray(json.cookies)) {
                            console.log(`[OnlineFixDownload] Got ${json.cookies.length} cookies from API`);
                            resolve(json.cookies);
                        } else if (json.success && json.cookies) {
                            console.log(`[OnlineFixDownload] Got ${json.cookies.length} cookies from API`);
                            resolve(json.cookies);
                        } else {
                            console.error('[OnlineFixDownload] API response error:', json);
                            resolve([]);
                        }
                    } catch (e) {
                        console.error('[OnlineFixDownload] Failed to parse API response:', e);
                        resolve([]);
                    }
                });
            });

            req.on('error', (e) => {
                console.error('[OnlineFixDownload] API request error:', e);
                resolve([]);
            });

            req.write(postData);
            req.end();
        });
    }

    /**
     * Load cookies from API and set them in session
     */
    private static async loadCookies(windowSession: Electron.Session): Promise<void> {
        try {
            // Fetch main domain cookies from API
            const mainCookies = await this.fetchCookiesFromAPI('online-fix.me_cookies');
            if (mainCookies.length > 0) {
                await this.setCookiesForDomains(windowSession, mainCookies, ['online-fix.me']);
                console.log('[OnlineFixDownload] Main domain cookies loaded from API');
            }

            // Fetch upload subdomain cookies from API
            const uploadCookies = await this.fetchCookiesFromAPI('up_cookies');
            if (uploadCookies.length > 0) {
                for (const cookie of uploadCookies) {
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
                console.log('[OnlineFixDownload] Upload domain cookies loaded from API');
            }

            console.log('[OnlineFixDownload] All cookies loaded successfully from API');
        } catch (error) {
            console.error('[OnlineFixDownload] Failed to load cookies from API:', error);
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
        customPath?: string,
        onProgress?: (progress: OnlineFixProgress) => void
    ): Promise<OnlineFixDownloadResult> {
        this.init();
        this.progressCallback = onProgress || null;

        this.sendProgress('Initializing...', 0);
        console.log(`[OnlineFixDownload] Starting download for: ${gameName}`);
        console.log(`[OnlineFixDownload] Fix URL: ${fixUrl}`);

        // Determine game path
        const gamePath = customPath || this.getGamePath(gameName);
        if (!gamePath) {
            console.log('[OnlineFixDownload] Game path not found');
            return { success: false, needsManualPath: true, error: 'Game installation folder not found' };
        }

        console.log(`[OnlineFixDownload] Game path: ${gamePath}`);
        this.sendProgress('Loading cookies from API...', 10);

        return new Promise(async (resolve) => {
            // Create browser window (visible for debugging)
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

            // Load cookies into this window's session
            this.sendProgress('Loading cookies...', 15);
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
                this.sendProgress(`Downloading: ${filename}`, 75);
                console.log(`[OnlineFixDownload] Download started: ${filename}`);
                downloadStarted = true;

                const savePath = path.join(CACHE_PATH, filename);
                item.setSavePath(savePath);

                item.on('done', async (event, state) => {
                    if (resolved) return;
                    resolved = true;
                    clearTimeout(timeoutId);

                    if (state === 'completed') {
                        this.sendProgress('Download complete, extracting...', 90);
                        console.log(`[OnlineFixDownload] Download completed: ${savePath}`);

                        // Extract and install
                        const installResult = await this.extractAndInstall(savePath, gamePath);
                        this.sendProgress('Installation complete!', 100);
                        this.cleanup();
                        resolve(installResult);
                    } else {
                        console.log(`[OnlineFixDownload] Download failed: ${state}`);
                        this.cleanup();
                        resolve({ success: false, error: `Download failed: ${state}` });
                    }
                });
            });

            // Handle new window popup (when clicking target="_blank" links)
            win.webContents.setWindowOpenHandler(({ url }) => {
                console.log(`[OnlineFixDownload] Popup opened: ${url}`);
                if (url.includes('uploads.online-fix.me')) {
                    // Allow the popup and navigate main window to it after auth
                    setTimeout(async () => {
                        try {
                            await win.loadURL(url);
                        } catch (e) {
                            console.log('[OnlineFixDownload] Popup navigation handled');
                        }
                    }, 1000);
                }
                return { action: 'deny' }; // Deny popup, we'll handle it in main window
            });

            // Navigate to fix page and find download link
            this.sendProgress('Loading Online-Fix page...', 20);
            win.loadURL(fixUrl).then(async () => {
                this.sendProgress('Searching for download link...', 30);
                console.log('[OnlineFixDownload] Page loaded, searching for fix link...');

                // Wait for page to load
                await this.delay(3000);

                try {
                    // Find and CLICK the uploads button (Скачать фикс с сервера) instead of just navigating
                    const buttonClicked = await win.webContents.executeJavaScript(`
                        (() => {
                            const links = document.querySelectorAll('a.btn-success');
                            for (const link of links) {
                                if (link.href && link.href.includes('uploads.online-fix.me')) {
                                    console.log('Clicking uploads button:', link.href);
                                    link.click();
                                    return link.href;
                                }
                            }
                            return null;
                        })()
                    `);

                    if (!buttonClicked) {
                        if (!resolved) {
                            resolved = true;
                            clearTimeout(timeoutId);
                            this.cleanup();
                            resolve({ success: false, error: 'Fix download link not found' });
                        }
                        return;
                    }

                    this.sendProgress('Navigating to uploads server...', 40);
                    console.log(`[OnlineFixDownload] Clicked uploads button: ${buttonClicked}`);

                    // Wait for navigation/popup handling
                    await this.delay(3000);

                    // Now navigate to the uploads page (the click may have set auth cookies)
                    await win.loadURL(buttonClicked);
                    await this.delay(2000);

                    // Log all links on page for debugging
                    let allLinks = await win.webContents.executeJavaScript(`
                        (() => {
                            const links = [];
                            document.querySelectorAll('a').forEach(a => {
                                if (a.href) links.push(a.href);
                            });
                            return links;
                        })()
                    `);
                    console.log('[OnlineFixDownload] Links on page:', allLinks);

                    // If no links found (401 error), try fetching new cookies from up_fix endpoint
                    if (allLinks.length === 0) {
                        console.log('[OnlineFixDownload] No links found, retrying with up_fix cookies...');

                        // Fetch cookies from up_fix endpoint
                        const upFixCookies = await this.fetchCookiesFromAPI('up_fix');
                        if (upFixCookies.length > 0) {
                            // Set the new cookies
                            for (const cookie of upFixCookies) {
                                try {
                                    await win.webContents.session.cookies.set({
                                        url: 'https://uploads.online-fix.me:2053',
                                        name: cookie.name,
                                        value: cookie.value,
                                        domain: cookie.domain,
                                        path: cookie.path || '/',
                                        secure: true,
                                        httpOnly: cookie.httpOnly || false,
                                    });
                                } catch (e) { }
                            }
                            console.log('[OnlineFixDownload] up_fix cookies loaded, retrying...');

                            // Reload the page with new cookies
                            await win.loadURL(buttonClicked);
                            await this.delay(2000);

                            // Check links again
                            allLinks = await win.webContents.executeJavaScript(`
                                (() => {
                                    const links = [];
                                    document.querySelectorAll('a').forEach(a => {
                                        if (a.href) links.push(a.href);
                                    });
                                    return links;
                                })()
                            `);
                            console.log('[OnlineFixDownload] Links on page after retry:', allLinks);
                        }
                    }

                    this.sendProgress('Looking for Fix Repair folder...', 50);
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
                        this.sendProgress('Navigating to Fix Repair folder...', 55);
                        console.log('[OnlineFixDownload] Found Fix Repair folder, navigating...');
                        await win.loadURL(fixRepairLink);
                        await this.delay(2000);
                        this.sendProgress('Searching for archive...', 60);
                        console.log('[OnlineFixDownload] Now in Fix Repair folder');
                        archiveLink = await this.findArchiveOnPage(win);
                    }

                    // If no archive yet, try main page
                    if (!archiveLink) {
                        if (fixRepairLink) {
                            await win.loadURL(buttonClicked);
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

                    this.sendProgress('Starting download...', 70);
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
