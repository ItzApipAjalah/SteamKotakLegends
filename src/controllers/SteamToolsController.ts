/**
 * SteamTools Controller - IPC handlers for SteamTools operations
 */

import { ipcMain, BrowserWindow } from 'electron';
import { SteamToolsService, SteamToolsStatus, DownloadResult } from '../services/SteamToolsService';
import { ManifestService, InstalledGame, ManifestResult } from '../services/ManifestService';
import { OnlineFixDownloadService, OnlineFixDownloadResult } from '../services/OnlineFixDownloadService';

export class SteamToolsController {
    /**
     * Register all IPC handlers for SteamTools operations
     */
    static registerHandlers(): void {
        // Check if SteamTools is installed
        ipcMain.handle('check-steamtools', (): SteamToolsStatus => {
            return SteamToolsService.checkInstalled();
        });

        // Download and install SteamTools
        ipcMain.handle('download-steamtools', async (event): Promise<DownloadResult> => {
            const window = BrowserWindow.fromWebContents(event.sender);

            return SteamToolsService.downloadAndInstall((progress) => {
                // Send progress to renderer
                if (window) {
                    window.webContents.send('steamtools-download-progress', progress);
                }
            });
        });

        // Open Steam (via SteamTools if available)
        ipcMain.handle('open-steam', async () => {
            return SteamToolsService.openSteam();
        });

        // Check if SteamTools is running
        ipcMain.handle('is-steamtools-running', async (): Promise<boolean> => {
            return SteamToolsService.isSteamToolsRunning();
        });

        // ========================================
        // MANIFEST HANDLERS
        // ========================================

        // Download and install manifest for a game
        ipcMain.handle('download-manifest', async (_event, appId: string): Promise<ManifestResult> => {
            return ManifestService.downloadManifest(appId);
        });

        // Get list of installed games
        ipcMain.handle('get-installed-games', (): InstalledGame[] => {
            return ManifestService.getInstalledGames();
        });

        // Remove a game and its files
        ipcMain.handle('remove-game', async (_event, appId: string) => {
            return ManifestService.removeGame(appId);
        });

        // Restart Steam
        ipcMain.handle('restart-steam', async () => {
            return ManifestService.restartSteam();
        });

        // ========================================
        // ONLINE FIX HANDLERS
        // ========================================

        // Download and install online fix
        ipcMain.handle('download-onlinefix', async (
            _event,
            fixUrl: string,
            gameName: string,
            customPath?: string
        ): Promise<OnlineFixDownloadResult> => {
            return OnlineFixDownloadService.downloadOnlineFix(fixUrl, gameName, customPath);
        });

        // Get game installation path
        ipcMain.handle('get-game-path', async (_event, gameName: string): Promise<string | null> => {
            return OnlineFixDownloadService.getGamePath(gameName);
        });

        // Open folder picker dialog
        ipcMain.handle('select-folder', async (): Promise<string | null> => {
            const { dialog } = require('electron');
            const result = await dialog.showOpenDialog({
                properties: ['openDirectory'],
                title: 'Select Game Installation Folder',
            });
            if (result.canceled || result.filePaths.length === 0) {
                return null;
            }
            return result.filePaths[0];
        });

        console.log('SteamToolsController: IPC handlers registered');
    }
}

