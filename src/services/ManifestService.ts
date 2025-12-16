/**
 * Manifest Service - Download and manage game manifests from ManifestHub
 */

import * as fs from 'fs';
import * as path from 'path';
import { app, shell } from 'electron';
import https from 'https';
import { exec } from 'child_process';
import AdmZip from 'adm-zip';

const STEAM_PATH = 'C:\\Program Files (x86)\\Steam';
const STPLUGIN_PATH = path.join(STEAM_PATH, 'config', 'stplug-in');
const DEPOTCACHE_PATH = path.join(STEAM_PATH, 'config', 'depotcache');
const MANIFEST_CACHE_PATH = path.join(app.getPath('userData'), 'manifests');

export interface InstalledGame {
    appId: string;
    name: string;
    files: { path: string; type: string }[];
    installedAt: string;
}

export interface ManifestResult {
    success: boolean;
    appId?: string;
    name?: string;
    error?: string;
}

export class ManifestService {
    /**
     * Initialize directories
     */
    static init(): void {
        // Create directories if they don't exist
        [STPLUGIN_PATH, DEPOTCACHE_PATH, MANIFEST_CACHE_PATH].forEach(dir => {
            if (!fs.existsSync(dir)) {
                try {
                    fs.mkdirSync(dir, { recursive: true });
                } catch (err) {
                    console.error(`Failed to create directory ${dir}:`, err);
                }
            }
        });
    }

    /**
     * Download manifest ZIP from ManifestHub
     */
    static async downloadManifest(appId: string): Promise<ManifestResult> {
        const url = `https://codeload.github.com/SteamAutoCracks/ManifestHub/zip/refs/heads/${appId}`;
        const zipPath = path.join(MANIFEST_CACHE_PATH, `${appId}.zip`);
        const extractPath = path.join(MANIFEST_CACHE_PATH, appId);

        this.init();

        return new Promise((resolve) => {
            console.log(`Downloading manifest for App ID: ${appId}`);
            console.log(`URL: ${url}`);

            const file = fs.createWriteStream(zipPath);

            https.get(url, (response) => {
                // Handle redirects
                if (response.statusCode === 301 || response.statusCode === 302) {
                    const redirectUrl = response.headers.location;
                    if (redirectUrl) {
                        file.close();
                        https.get(redirectUrl, (redirectResponse) => {
                            if (redirectResponse.statusCode === 404) {
                                // Try Kernelos fallback
                                console.log('ManifestHub 404 - trying Kernelos fallback...');
                                this.tryKernelosFallback(appId, extractPath).then(resolve);
                                return;
                            }
                            redirectResponse.pipe(file);
                            file.on('finish', () => {
                                file.close();
                                this.extractAndInstall(zipPath, extractPath, appId).then(resolve);
                            });
                        }).on('error', (err) => {
                            resolve({ success: false, error: err.message });
                        });
                        return;
                    }
                }

                if (response.statusCode === 404) {
                    file.close();
                    try { fs.unlinkSync(zipPath); } catch (e) { }
                    // Try Kernelos fallback
                    console.log('ManifestHub 404 - trying Kernelos fallback...');
                    this.tryKernelosFallback(appId, extractPath).then(resolve);
                    return;
                }

                response.pipe(file);

                file.on('finish', () => {
                    file.close();
                    this.extractAndInstall(zipPath, extractPath, appId).then(resolve);
                });

                file.on('error', (err) => {
                    fs.unlink(zipPath, () => { });
                    resolve({ success: false, error: err.message });
                });
            }).on('error', (err) => {
                resolve({ success: false, error: err.message });
            });
        });
    }

    /**
     * Try Kernelos.org as fallback source
     */
    private static async tryKernelosFallback(appId: string, extractPath: string): Promise<ManifestResult> {
        try {
            const { KernelosService } = await import('./KernelosService');
            const result = await KernelosService.downloadFromKernelos(appId);

            if (result.success && result.zipPath) {
                console.log('Kernelos download successful, processing...');

                // Check if it's a direct file (not ZIP) based on filename
                const filename = result.filename || '';
                const ext = path.extname(filename).toLowerCase();

                if (ext === '.lua' || ext === '.manifest' || ext === '.vdf') {
                    // Direct file - install directly
                    return this.installDirectFile(result.zipPath, filename, appId);
                } else {
                    // Try as ZIP
                    return this.extractAndInstallKernelos(result.zipPath, extractPath, appId);
                }
            } else {
                // Kernelos failed, try Manifestor
                console.log('Kernelos failed, trying Manifestor fallback...');
                return this.tryManifestorFallback(appId, extractPath);
            }
        } catch (err) {
            console.error('Kernelos fallback failed:', err);
            // Try Manifestor as last resort
            return this.tryManifestorFallback(appId, extractPath);
        }
    }

    /**
     * Try Manifestor.cc as final fallback source (has Cloudflare Turnstile)
     */
    private static async tryManifestorFallback(appId: string, extractPath: string): Promise<ManifestResult> {
        try {
            const { ManifestorService } = await import('./ManifestorService');
            const result = await ManifestorService.downloadFromManifestor(appId);

            if (result.success && result.zipPath) {
                console.log('Manifestor download successful, processing...');

                // Check if it's a direct file (not ZIP) based on filename
                const filename = result.filename || '';
                const ext = path.extname(filename).toLowerCase();

                if (ext === '.lua' || ext === '.manifest' || ext === '.vdf') {
                    // Direct file - install directly
                    return this.installDirectFile(result.zipPath, filename, appId);
                } else {
                    // Try as ZIP
                    return this.extractAndInstallKernelos(result.zipPath, extractPath, appId);
                }
            } else {
                return { success: false, error: result.error || `No manifest found for App ID: ${appId}` };
            }
        } catch (err) {
            console.error('Manifestor fallback failed:', err);
            return { success: false, error: `No manifest found for App ID: ${appId}` };
        }
    }

    /**
     * Install a direct file (not ZIP) - like .lua or .manifest
     */
    private static async installDirectFile(filePath: string, filename: string, appId: string): Promise<ManifestResult> {
        console.log(`Installing direct file: ${filename}`);

        try {
            const ext = path.extname(filename).toLowerCase();
            let destPath: string;
            let fileType: string;

            if (ext === '.lua' || ext === '.vdf') {
                destPath = path.join(STPLUGIN_PATH, filename);
                fileType = ext === '.lua' ? 'lua' : 'vdf';
            } else if (ext === '.manifest') {
                destPath = path.join(DEPOTCACHE_PATH, filename);
                fileType = 'manifest';
            } else {
                return { success: false, error: `Unknown file type: ${filename}` };
            }

            fs.copyFileSync(filePath, destPath);
            console.log(`Copied: ${filename} -> ${destPath}`);

            // Clean up source file
            try { fs.unlinkSync(filePath); } catch (e) { }

            // Save to installed games list
            const game: InstalledGame = {
                appId,
                name: appId,
                files: [{ path: destPath, type: fileType }],
                installedAt: new Date().toISOString(),
            };

            this.addToInstalledGames(game);

            // Disable auto-update for this game
            this.disableAutoUpdate(appId);

            return { success: true, appId, name: appId };
        } catch (err) {
            console.error('Direct file install error:', err);
            return { success: false, error: `Failed to install: ${(err as Error).message}` };
        }
    }

    /**
     * Disable auto-update for a game by modifying appmanifest file
     * Sets AutoUpdateBehavior to 1 (Only update when launched)
     */
    private static disableAutoUpdate(appId: string): void {
        const steamappsPath = path.join(STEAM_PATH, 'steamapps');
        const manifestPath = path.join(steamappsPath, `appmanifest_${appId}.acf`);

        try {
            if (fs.existsSync(manifestPath)) {
                let content = fs.readFileSync(manifestPath, 'utf8');

                // Replace AutoUpdateBehavior value to 1 (Only update on launch)
                if (content.includes('"AutoUpdateBehavior"')) {
                    content = content.replace(
                        /"AutoUpdateBehavior"\s*"\d+"/g,
                        '"AutoUpdateBehavior"\t\t"1"'
                    );
                } else {
                    // If AutoUpdateBehavior doesn't exist, add it before the closing brace
                    const lastBraceIndex = content.lastIndexOf('}');
                    if (lastBraceIndex !== -1) {
                        const before = content.substring(0, lastBraceIndex);
                        const after = content.substring(lastBraceIndex);
                        content = before + '\t"AutoUpdateBehavior"\t\t"1"\n' + after;
                    }
                }

                fs.writeFileSync(manifestPath, content, 'utf8');
                console.log(`Disabled auto-update for App ID: ${appId}`);
            } else {
                console.log(`No appmanifest found for ${appId}, skipping auto-update disable`);
            }
        } catch (err) {
            console.error(`Failed to disable auto-update for ${appId}:`, err);
        }
    }

    /**
     * Extract and install from Kernelos ZIP (different structure)
     */
    private static async extractAndInstallKernelos(
        zipPath: string,
        extractPath: string,
        appId: string
    ): Promise<ManifestResult> {
        console.log(`Extracting Kernelos ZIP: ${zipPath}`);

        try {
            // Validate ZIP file first
            if (!fs.existsSync(zipPath)) {
                return { success: false, error: `ZIP file not found: ${zipPath}` };
            }

            // Check if file is a valid ZIP (magic bytes: PK)
            const buffer = Buffer.alloc(4);
            const fd = fs.openSync(zipPath, 'r');
            fs.readSync(fd, buffer, 0, 4, 0);
            fs.closeSync(fd);

            if (buffer[0] !== 0x50 || buffer[1] !== 0x4B) {
                console.error('Invalid ZIP file - not a valid ZIP format');
                try { fs.unlinkSync(zipPath); } catch (e) { }
                return { success: false, error: `No manifest found for App ID: ${appId}` };
            }

            // const AdmZip = require('adm-zip');
            const zip = new AdmZip(zipPath);

            if (!fs.existsSync(extractPath)) {
                fs.mkdirSync(extractPath, { recursive: true });
            }

            zip.extractAllTo(extractPath, true);
            console.log('Kernelos ZIP extracted successfully');

            // Find files in extracted folder (may have different structure)
            const installedFiles: { path: string; type: string }[] = [];
            let gameName = appId;

            // Recursively find all relevant files
            const findFiles = (dir: string): void => {
                const items = fs.readdirSync(dir);
                for (const item of items) {
                    const fullPath = path.join(dir, item);
                    const stat = fs.statSync(fullPath);

                    if (stat.isDirectory()) {
                        findFiles(fullPath);
                    } else {
                        const ext = path.extname(item).toLowerCase();
                        let destPath: string | null = null;
                        let fileType = '';

                        if (ext === '.lua' || ext === '.vdf') {
                            destPath = path.join(STPLUGIN_PATH, item);
                            fileType = ext === '.lua' ? 'lua' : 'vdf';
                        } else if (ext === '.manifest') {
                            destPath = path.join(DEPOTCACHE_PATH, item);
                            fileType = 'manifest';
                        }

                        if (destPath) {
                            try {
                                fs.copyFileSync(fullPath, destPath);
                                installedFiles.push({ path: destPath, type: fileType });
                                console.log(`Copied: ${item} -> ${destPath}`);
                            } catch (err) {
                                console.error(`Failed to copy ${item}:`, err);
                            }
                        }
                    }
                }
            };

            findFiles(extractPath);

            if (installedFiles.length === 0) {
                return { success: false, error: 'No valid manifest files found in download' };
            }

            // Save to installed games list
            const game: InstalledGame = {
                appId,
                name: gameName,
                files: installedFiles,
                installedAt: new Date().toISOString(),
            };

            this.addToInstalledGames(game);

            // Disable auto-update for this game
            this.disableAutoUpdate(appId);

            // Clean up ZIP file
            try { fs.unlinkSync(zipPath); } catch (e) { }

            return { success: true, appId, name: gameName };
        } catch (err) {
            console.error('Kernelos extract error:', err);
            return { success: false, error: `Failed to extract: ${(err as Error).message}` };
        }
    }

    /**
     * Extract ZIP and install files to Steam folders
     */
    private static async extractAndInstall(
        zipPath: string,
        extractPath: string,
        appId: string
    ): Promise<ManifestResult> {
        console.log(`Extracting ZIP: ${zipPath}`);

        try {
            // Use adm-zip for extraction
            // const AdmZip = require('adm-zip');
            const zip = new AdmZip(zipPath);

            // Create extract directory if not exists
            if (!fs.existsSync(extractPath)) {
                fs.mkdirSync(extractPath, { recursive: true });
            }

            // Extract all files
            zip.extractAllTo(extractPath, true);
            console.log('ZIP extracted successfully');

            // Find the extracted folder (ManifestHub-{appId})
            const extractedFolder = path.join(extractPath, `ManifestHub-${appId}`);

            if (!fs.existsSync(extractedFolder)) {
                return { success: false, error: 'Extracted folder not found' };
            }

            // Get all files
            const files = fs.readdirSync(extractedFolder);
            const installedFiles: { path: string; type: string }[] = [];
            let gameName = appId;

            for (const file of files) {
                const srcPath = path.join(extractedFolder, file);
                const ext = path.extname(file).toLowerCase();

                // Read game info from JSON
                if (ext === '.json') {
                    try {
                        const jsonContent = fs.readFileSync(srcPath, 'utf-8');
                        const gameInfo = JSON.parse(jsonContent);
                        if (gameInfo.name) {
                            gameName = gameInfo.name;
                        }
                    } catch {
                        // Ignore JSON parse errors
                    }
                }

                // Distribute files to appropriate folders
                let destPath: string | null = null;
                let fileType = '';

                if (ext === '.lua' || ext === '.vdf') {
                    destPath = path.join(STPLUGIN_PATH, file);
                    fileType = ext === '.lua' ? 'lua' : 'vdf';
                } else if (ext === '.manifest') {
                    destPath = path.join(DEPOTCACHE_PATH, file);
                    fileType = 'manifest';
                }

                if (destPath) {
                    try {
                        fs.copyFileSync(srcPath, destPath);
                        installedFiles.push({ path: destPath, type: fileType });
                        console.log(`Copied: ${file} -> ${destPath}`);
                    } catch (err) {
                        console.error(`Failed to copy ${file}:`, err);
                    }
                }
            }

            // Save to installed games list
            const game: InstalledGame = {
                appId,
                name: gameName,
                files: installedFiles,
                installedAt: new Date().toISOString(),
            };

            this.addToInstalledGames(game);

            // Disable auto-update for this game
            this.disableAutoUpdate(appId);

            // Clean up ZIP file
            fs.unlinkSync(zipPath);

            return { success: true, appId, name: gameName };
        } catch (err) {
            console.error('Extract error:', err);
            return { success: false, error: `Failed to extract: ${(err as Error).message}` };
        }
    }

    /**
     * Get installed games from local storage file
     */
    static getInstalledGames(): InstalledGame[] {
        const storagePath = path.join(MANIFEST_CACHE_PATH, 'installed.json');

        if (!fs.existsSync(storagePath)) {
            return [];
        }

        try {
            const data = fs.readFileSync(storagePath, 'utf-8');
            return JSON.parse(data);
        } catch {
            return [];
        }
    }

    /**
     * Add game to installed games list
     */
    private static addToInstalledGames(game: InstalledGame): void {
        const games = this.getInstalledGames();

        // Remove if already exists
        const filtered = games.filter(g => g.appId !== game.appId);
        filtered.push(game);

        const storagePath = path.join(MANIFEST_CACHE_PATH, 'installed.json');
        fs.writeFileSync(storagePath, JSON.stringify(filtered, null, 2));
    }

    /**
     * Remove game and delete all associated files
     */
    static removeGame(appId: string): { success: boolean; error?: string } {
        const games = this.getInstalledGames();
        const game = games.find(g => g.appId === appId);

        if (!game) {
            return { success: false, error: 'Game not found in installed list' };
        }

        // Delete all installed files
        for (const file of game.files) {
            try {
                if (fs.existsSync(file.path)) {
                    fs.unlinkSync(file.path);
                    console.log(`Deleted: ${file.path}`);
                }
            } catch (err) {
                console.error(`Failed to delete ${file.path}:`, err);
            }
        }

        // Remove from installed games list
        const filtered = games.filter(g => g.appId !== appId);
        const storagePath = path.join(MANIFEST_CACHE_PATH, 'installed.json');
        fs.writeFileSync(storagePath, JSON.stringify(filtered, null, 2));

        // Clean up extracted folder
        const extractPath = path.join(MANIFEST_CACHE_PATH, appId);
        if (fs.existsSync(extractPath)) {
            fs.rmSync(extractPath, { recursive: true, force: true });
        }

        return { success: true };
    }

    /**
     * Restart Steam
     */
    static async restartSteam(): Promise<{ success: boolean; error?: string }> {
        return new Promise((resolve) => {
            // Kill Steam
            exec('taskkill /F /IM steam.exe /T', () => {
                console.log('Steam closed');

                // Wait then reopen
                setTimeout(() => {
                    const steamExe = path.join(STEAM_PATH, 'steam.exe');

                    if (fs.existsSync(steamExe)) {
                        shell.openPath(steamExe).then((error) => {
                            if (error) {
                                resolve({ success: false, error });
                            } else {
                                resolve({ success: true });
                            }
                        });
                    } else {
                        shell.openExternal('steam://open/main').then(() => {
                            resolve({ success: true });
                        }).catch(() => {
                            resolve({ success: false, error: 'Could not restart Steam' });
                        });
                    }
                }, 2000);
            });
        });
    }
}
