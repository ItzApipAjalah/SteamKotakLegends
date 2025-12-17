/**
 * Game Controller - IPC handlers for game data requests
 */

import { ipcMain } from 'electron';
import { SteamDBService } from '../services/SteamDBService';
import { SearchGameRequest, SearchGameResponse, SearchByNameRequest, SearchByNameResponse } from '../models/GameModel';

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

        // Handler for searching games by name
        ipcMain.handle('search-game-by-name', async (_event, request: SearchByNameRequest): Promise<SearchByNameResponse> => {
            try {
                const { query } = request;

                if (!query || query.trim().length < 2) {
                    return {
                        success: false,
                        error: 'Please enter at least 2 characters to search.',
                    };
                }

                const results = await SteamDBService.searchByName(query);

                return {
                    success: true,
                    results,
                };
            } catch (error) {
                console.error('GameController searchByName Error:', error);
                return {
                    success: false,
                    error: (error as Error).message || 'Failed to search games',
                };
            }
        });

        // Handler for getting popular games
        ipcMain.handle('get-popular-games', async (_event, category: 'most_played' | 'trending' = 'most_played') => {
            try {
                const results = await SteamDBService.getPopularGames(category);
                return { success: true, results };
            } catch (error) {
                console.error('GameController getPopularGames Error:', error);
                return { success: false, results: [], error: (error as Error).message };
            }
        });

        console.log('GameController: IPC handlers registered');
    }
}
