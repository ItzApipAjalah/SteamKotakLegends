/**
 * Game Controller - IPC handlers for game data requests
 */

import { ipcMain } from 'electron';
import { SteamDBService } from '../services/SteamDBService';
import { SearchGameRequest, SearchGameResponse } from '../models/GameModel';

export class GameController {
    /**
     * Register all IPC handlers for game-related operations
     */
    static registerHandlers(): void {
        // Handler for searching game by ID
        ipcMain.handle('search-game', async (_event, request: SearchGameRequest): Promise<SearchGameResponse> => {
            try {
                const { gameId, region } = request;

                if (!gameId || isNaN(gameId)) {
                    return {
                        success: false,
                        error: 'Invalid Game ID. Please enter a valid Steam App ID.',
                    };
                }

                const data = await SteamDBService.getGameData(gameId, region);

                return {
                    success: true,
                    data,
                };
            } catch (error) {
                console.error('GameController Error:', error);
                return {
                    success: false,
                    error: (error as Error).message || 'Failed to fetch game data',
                };
            }
        });

        console.log('GameController: IPC handlers registered');
    }
}
