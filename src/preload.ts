/**
 * Preload Script - Secure bridge between main and renderer process
 */

import { contextBridge, ipcRenderer } from 'electron';
import { SearchGameResponse } from './models/GameModel';
import { SteamAccountsResponse } from './models/SteamAccountModel';

// Types for SteamTools
interface SteamToolsStatus {
    installed: boolean;
    path: string;
    hasCached: boolean;
}

interface DownloadProgress {
    percent: number;
    downloaded: number;
    total: number;
}

interface DownloadResult {
    success: boolean;
    filePath?: string;
    error?: string;
}

// Types for Manifest
interface InstalledGame {
    appId: string;
    name: string;
    files: { path: string; type: string }[];
    installedAt: string;
}

interface ManifestResult {
    success: boolean;
    appId?: string;
    name?: string;
    error?: string;
}

// Expose API to renderer process
contextBridge.exposeInMainWorld('steamAPI', {
    /**
     * Search for a game by Steam App ID
     */
    searchGame: (gameId: number, region?: string): Promise<SearchGameResponse> => {
        return ipcRenderer.invoke('search-game', { gameId, region });
    },

    /**
     * Get local Steam accounts from the system
     */
    getAccounts: (): Promise<SteamAccountsResponse> => {
        return ipcRenderer.invoke('get-steam-accounts');
    },

    /**
     * Check if SteamTools is installed
     */
    checkSteamTools: (): Promise<SteamToolsStatus> => {
        return ipcRenderer.invoke('check-steamtools');
    },

    /**
     * Download and install SteamTools
     */
    downloadSteamTools: (): Promise<DownloadResult> => {
        return ipcRenderer.invoke('download-steamtools');
    },

    /**
     * Listen for download progress
     */
    onDownloadProgress: (callback: (progress: DownloadProgress) => void): void => {
        ipcRenderer.on('steamtools-download-progress', (_event, progress) => {
            callback(progress);
        });
    },

    /**
     * Open Steam (via SteamTools if available)
     */
    openSteam: (): Promise<{ success: boolean; method: string; error?: string }> => {
        return ipcRenderer.invoke('open-steam');
    },

    /**
     * Check if SteamTools is currently running
     */
    isSteamToolsRunning: (): Promise<boolean> => {
        return ipcRenderer.invoke('is-steamtools-running');
    },

    // ========================================
    // MANIFEST API
    // ========================================

    /**
     * Download and install manifest for a game
     */
    downloadManifest: (appId: string): Promise<ManifestResult> => {
        return ipcRenderer.invoke('download-manifest', appId);
    },

    /**
     * Get list of installed games
     */
    getInstalledGames: (): Promise<InstalledGame[]> => {
        return ipcRenderer.invoke('get-installed-games');
    },

    /**
     * Remove a game and its files
     */
    removeGame: (appId: string): Promise<{ success: boolean; error?: string }> => {
        return ipcRenderer.invoke('remove-game', appId);
    },

    /**
     * Restart Steam
     */
    restartSteam: (): Promise<{ success: boolean; error?: string }> => {
        return ipcRenderer.invoke('restart-steam');
    },

    // ========================================
    // ONLINE FIX API
    // ========================================

    /**
     * Download and install online fix for a game
     */
    downloadOnlineFix: (fixUrl: string, gameName: string, customPath?: string): Promise<OnlineFixDownloadResult> => {
        return ipcRenderer.invoke('download-onlinefix', fixUrl, gameName, customPath);
    },

    /**
     * Get game installation path
     */
    getGamePath: (gameName: string): Promise<string | null> => {
        return ipcRenderer.invoke('get-game-path', gameName);
    },

    /**
     * Open folder picker dialog
     */
    selectFolder: (): Promise<string | null> => {
        return ipcRenderer.invoke('select-folder');
    },
});

// Online Fix download result interface
interface OnlineFixDownloadResult {
    success: boolean;
    error?: string;
    needsManualPath?: boolean;
    downloadedFile?: string;
}

// Type declaration for renderer process
export interface SteamAPI {
    searchGame: (gameId: number, region?: string) => Promise<SearchGameResponse>;
    getAccounts: () => Promise<SteamAccountsResponse>;
    checkSteamTools: () => Promise<SteamToolsStatus>;
    downloadSteamTools: () => Promise<DownloadResult>;
    onDownloadProgress: (callback: (progress: DownloadProgress) => void) => void;
    openSteam: () => Promise<{ success: boolean; method: string; error?: string }>;
    isSteamToolsRunning: () => Promise<boolean>;
    downloadManifest: (appId: string) => Promise<ManifestResult>;
    getInstalledGames: () => Promise<InstalledGame[]>;
    removeGame: (appId: string) => Promise<{ success: boolean; error?: string }>;
    restartSteam: () => Promise<{ success: boolean; error?: string }>;
    downloadOnlineFix: (fixUrl: string, gameName: string, customPath?: string) => Promise<OnlineFixDownloadResult>;
    getGamePath: (gameName: string) => Promise<string | null>;
    selectFolder: () => Promise<string | null>;
}

declare global {
    interface Window {
        steamAPI: SteamAPI;
    }
}
