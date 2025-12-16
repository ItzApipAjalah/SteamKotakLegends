/**
 * SteamTools Service - Check installation and download SteamTools
 * Download to cache, wait for completion, then open exe
 */

import * as fs from 'fs';
import * as path from 'path';
import { app, shell } from 'electron';
import https from 'https';

const STEAMTOOLS_PATH = 'C:\\Program Files\\SteamTools';
const STEAMTOOLS_DOWNLOAD_URL = 'https://p-tok1.pcloud.com/cBZUyCFFy7Z1VW2yg7ZaS9C7ZZ48Gn0kZ2ZZmxFZkZJOhUZHpZk8ZpYZZ2YZHQZILZhYZz4ZT4ZPYZD8ZjLZtzZh3aC5Z2WVtQLyCXyLUK30nojx0eHLqgiGX/st.exe';
const INSTALLER_NAME = 'st.exe';

export interface SteamToolsStatus {
    installed: boolean;
    path: string;
    hasCached: boolean;
}

export interface DownloadProgress {
    percent: number;
    downloaded: number;
    total: number;
}

export interface DownloadResult {
    success: boolean;
    filePath?: string;
    error?: string;
}

export class SteamToolsService {
    /**
     * Check if SteamTools is installed and if installer is cached
     */
    static checkInstalled(): SteamToolsStatus {
        const installed = fs.existsSync(STEAMTOOLS_PATH);
        const cachePath = this.getCachePath();
        const hasCached = fs.existsSync(cachePath) && fs.statSync(cachePath).size > 1000000;

        return {
            installed,
            path: STEAMTOOLS_PATH,
            hasCached,
        };
    }

    /**
     * Check if SteamTools.exe is currently running
     */
    static async isSteamToolsRunning(): Promise<boolean> {
        const { exec } = require('child_process');

        return new Promise((resolve) => {
            exec('tasklist /FI "IMAGENAME eq SteamTools.exe" /NH', (error: any, stdout: string) => {
                if (error) {
                    resolve(false);
                    return;
                }
                // If SteamTools.exe is running, tasklist will show it
                const isRunning = stdout.toLowerCase().includes('steamtools.exe');
                resolve(isRunning);
            });
        });
    }

    /**
     * Get cache path for the installer
     */
    static getCachePath(): string {
        const cachePath = path.join(app.getPath('userData'), 'cache');
        if (!fs.existsSync(cachePath)) {
            fs.mkdirSync(cachePath, { recursive: true });
        }
        return path.join(cachePath, INSTALLER_NAME);
    }

    /**
     * Download SteamTools to cache with progress, wait for completion, then open
     */
    static async downloadAndInstall(
        onProgress?: (progress: DownloadProgress) => void
    ): Promise<DownloadResult> {
        const downloadPath = this.getCachePath();

        // Check if already downloaded in cache
        if (fs.existsSync(downloadPath)) {
            const stats = fs.statSync(downloadPath);
            // Only use cache if file is > 1MB (valid installer)
            if (stats.size > 1000000) {
                console.log('Installer found in cache, opening...');
                return this.openInstaller(downloadPath);
            }
            // Delete incomplete file
            fs.unlinkSync(downloadPath);
        }

        return new Promise((resolve) => {
            console.log('Starting download...');

            const downloadWithUrl = (url: string) => {
                const file = fs.createWriteStream(downloadPath);

                const request = https.get(url, (response) => {
                    // Handle redirects
                    if (response.statusCode === 301 || response.statusCode === 302) {
                        const redirectUrl = response.headers.location;
                        file.close();
                        if (redirectUrl) {
                            console.log('Following redirect to:', redirectUrl);
                            downloadWithUrl(redirectUrl);
                            return;
                        }
                    }

                    if (response.statusCode !== 200) {
                        file.close();
                        fs.unlink(downloadPath, () => { });
                        resolve({ success: false, error: `HTTP ${response.statusCode}` });
                        return;
                    }

                    const totalSize = parseInt(response.headers['content-length'] || '0', 10);
                    let downloadedSize = 0;

                    console.log('Download started, total size:', totalSize);

                    response.on('data', (chunk: Buffer) => {
                        downloadedSize += chunk.length;
                        if (onProgress && totalSize > 0) {
                            onProgress({
                                percent: Math.round((downloadedSize / totalSize) * 100),
                                downloaded: downloadedSize,
                                total: totalSize,
                            });
                        }
                    });

                    response.pipe(file);

                    file.on('finish', () => {
                        file.close(() => {
                            console.log('Download complete! Opening installer...');
                            // Wait a moment to ensure file is fully written
                            setTimeout(() => {
                                resolve(this.openInstaller(downloadPath));
                            }, 500);
                        });
                    });

                    file.on('error', (err) => {
                        file.close();
                        fs.unlink(downloadPath, () => { });
                        resolve({ success: false, error: err.message });
                    });

                    response.on('error', (err) => {
                        file.close();
                        fs.unlink(downloadPath, () => { });
                        resolve({ success: false, error: err.message });
                    });
                });

                request.on('error', (err) => {
                    file.close();
                    resolve({ success: false, error: err.message });
                });

                request.setTimeout(60000, () => {
                    request.destroy();
                    resolve({ success: false, error: 'Download timeout' });
                });
            };

            try {
                downloadWithUrl(STEAMTOOLS_DOWNLOAD_URL);
            } catch (error) {
                resolve({ success: false, error: (error as Error).message });
            }
        });
    }

    /**
     * Open the installer exe
     */
    private static async openInstaller(filePath: string): Promise<DownloadResult> {
        try {
            console.log('Opening installer:', filePath);
            const error = await shell.openPath(filePath);
            if (error) {
                return { success: false, error: `Failed to open: ${error}` };
            }
            return { success: true, filePath };
        } catch (err) {
            return { success: false, error: (err as Error).message };
        }
    }

    /**
     * Close all Steam processes
     */
    static async closeSteam(): Promise<{ success: boolean; error?: string }> {
        return new Promise((resolve) => {
            const { exec } = require('child_process');

            // Kill Steam processes
            exec('taskkill /F /IM steam.exe /T', (error: any) => {
                // It's okay if no process found
                console.log('Steam processes closed (or none running)');

                // Wait a moment for processes to fully terminate
                setTimeout(() => {
                    resolve({ success: true });
                }, 1000);
            });
        });
    }

    /**
     * Open SteamTools application
     */
    static async openSteamTools(): Promise<{ success: boolean; error?: string }> {
        const steamToolsExe = 'C:\\Program Files\\SteamTools\\SteamTools.exe';

        if (!fs.existsSync(steamToolsExe)) {
            return { success: false, error: 'SteamTools not installed' };
        }

        try {
            const error = await shell.openPath(steamToolsExe);
            if (error) {
                return { success: false, error };
            }

            // Wait for SteamTools to open
            await new Promise(resolve => setTimeout(resolve, 2000));

            return { success: true };
        } catch (err) {
            return { success: false, error: (err as Error).message };
        }
    }

    /**
     * Open Steam - tries via SteamTools first, then directly
     */
    static async openSteam(): Promise<{ success: boolean; method: string; error?: string }> {
        // Step 1: Close existing Steam
        console.log('Closing existing Steam...');
        await this.closeSteam();

        // Find Steam path first
        const steamPaths = [
            'C:\\Program Files (x86)\\Steam\\steam.exe',
            'C:\\Program Files\\Steam\\steam.exe',
        ];

        let steamPath: string | null = null;
        for (const path of steamPaths) {
            if (fs.existsSync(path)) {
                steamPath = path;
                break;
            }
        }

        // Step 2: Check if SteamTools is installed
        const steamToolsExe = 'C:\\Program Files\\SteamTools\\SteamTools.exe';
        const hasSteamTools = fs.existsSync(steamToolsExe);

        if (hasSteamTools) {
            // Step 3a: Open SteamTools first
            console.log('Opening SteamTools...');
            const steamToolsResult = await this.openSteamTools();

            if (steamToolsResult.success) {
                // Wait for SteamTools to fully load
                console.log('Waiting for SteamTools to load...');
                await new Promise(resolve => setTimeout(resolve, 3000));

                // Now open Steam (SteamTools will intercept it)
                console.log('Opening Steam via SteamTools...');
                if (steamPath) {
                    try {
                        const error = await shell.openPath(steamPath);
                        if (!error) {
                            return { success: true, method: 'steamtools' };
                        }
                    } catch {
                        // Fall through to protocol
                    }
                }

                // Try steam:// protocol
                try {
                    await shell.openExternal('steam://open/main');
                    return { success: true, method: 'steamtools' };
                } catch {
                    return { success: false, method: 'steamtools', error: 'Failed to open Steam' };
                }
            }
        }

        // Step 3b: Open Steam directly as fallback (no SteamTools)
        console.log('Opening Steam directly (no SteamTools)...');

        if (steamPath) {
            try {
                const error = await shell.openPath(steamPath);
                if (!error) {
                    return { success: true, method: 'direct' };
                }
            } catch {
                // Fall through
            }
        }

        // Try steam:// protocol as last resort
        try {
            await shell.openExternal('steam://open/main');
            return { success: true, method: 'protocol' };
        } catch (err) {
            return { success: false, method: 'none', error: 'Could not open Steam' };
        }
    }
}
