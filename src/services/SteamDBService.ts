/**
 * Steam Service - Using official Steam Storefront API
 * More reliable than web scraping approach
 */

import { FullGameData, GameInfo, PriceInfo, OnlineFixInfo } from '../models/GameModel';
import { OnlineFixService } from './OnlineFixService';

interface SteamAppDetails {
    success: boolean;
    data?: {
        type: string;
        name: string;
        steam_appid: number;
        required_age: number;
        is_free: boolean;
        detailed_description: string;
        about_the_game: string;
        short_description: string;
        header_image: string;
        website: string;
        developers?: string[];
        publishers?: string[];
        price_overview?: {
            currency: string;
            initial: number;
            final: number;
            discount_percent: number;
            final_formatted: string;
        };
        platforms: {
            windows: boolean;
            mac: boolean;
            linux: boolean;
        };
        release_date: {
            coming_soon: boolean;
            date: string;
        };
        categories?: Array<{
            id: number;
            description: string;
        }>;
        genres?: Array<{
            id: string;
            description: string;
        }>;
        screenshots?: Array<{
            id: number;
            path_thumbnail: string;
            path_full: string;
        }>;
    };
}

export class SteamDBService {
    private static readonly API_BASE = 'https://store.steampowered.com/api/appdetails';

    /**
     * Fetch complete game data from Steam Store API
     * @param gameId - Steam App ID
     * @param region - Optional region/country code (default: 'us')
     * @returns Full game data including info, prices, and screenshots
     */
    static async getGameData(gameId: number, region: string = 'us'): Promise<FullGameData> {
        try {
            const url = `${this.API_BASE}?appids=${gameId}&cc=${region}&l=english`;

            const response = await fetch(url);

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const json = await response.json();
            const appData: SteamAppDetails = json[gameId.toString()];

            if (!appData || !appData.success || !appData.data) {
                throw new Error('Game not found or data unavailable');
            }

            const data = appData.data;

            // Detect multiplayer from categories
            // Common multiplayer category IDs: 1=Multi-player, 36=Online Multi-Player, 
            // 37=Local Multi-Player, 38=Online Co-op, 39=Local Co-op, 9=Co-op
            const MULTIPLAYER_CATEGORY_IDS = [1, 9, 36, 37, 38, 39];
            const categories = data.categories || [];
            const multiplayerCategories = categories.filter(c => MULTIPLAYER_CATEGORY_IDS.includes(c.id));
            const isMultiplayer = multiplayerCategories.length > 0;
            const multiplayerTypes = multiplayerCategories.map(c => c.description);

            // Build game info
            const info: GameInfo = {
                id: data.steam_appid,
                type: data.type || 'Game',
                name: data.name,
                developer: data.developers?.[0] || 'Unknown',
                publisher: data.publishers?.[0] || 'Unknown',
                os: this.getPlatforms(data.platforms),
                lastUpdate: Date.now(), // Steam API doesn't provide this directly
                releaseDate: this.parseReleaseDate(data.release_date?.date),
                description: data.short_description || data.about_the_game || '',
                logoUrl: data.header_image || '',
                isMultiplayer,
                multiplayerTypes,
            };

            // Build prices
            const prices: PriceInfo[] = [];
            if (data.price_overview) {
                prices.push({
                    countryCode: region.toUpperCase(),
                    currency: data.price_overview.currency,
                    price: data.price_overview.final_formatted,
                    convertedPrice: data.price_overview.final_formatted,
                });
            } else if (data.is_free) {
                prices.push({
                    countryCode: region.toUpperCase(),
                    currency: 'USD',
                    price: 'Free to Play',
                    convertedPrice: 'Free to Play',
                });
            }

            // Build screenshots
            const screenshots: string[] = data.screenshots?.map(s => s.path_full) || [];

            // Check for online fix if multiplayer game
            let onlineFix: OnlineFixInfo | undefined;
            if (isMultiplayer) {
                try {
                    const fixResult = await OnlineFixService.checkOnlineFix(data.steam_appid, data.name);
                    onlineFix = {
                        hasOnlineFix: fixResult.hasOnlineFix,
                        coopSupported: fixResult.coopSupported,
                        multiplayerSupported: fixResult.multiplayerSupported,
                        fixUrl: fixResult.fixUrl,
                        lastUpdate: fixResult.lastUpdate,
                    };
                } catch (err) {
                    console.error('OnlineFix check failed:', err);
                }
            }

            return { info, prices, screenshots, onlineFix };
        } catch (error) {
            console.error('SteamDBService Error:', error);
            throw new Error(`Failed to fetch game data: ${(error as Error).message}`);
        }
    }

    /**
     * Get basic game info only
     */
    static async getGameInfo(gameId: number, region: string = 'us'): Promise<GameInfo> {
        const data = await this.getGameData(gameId, region);
        return data.info;
    }

    /**
     * Convert platforms object to array of OS names
     */
    private static getPlatforms(platforms: { windows: boolean; mac: boolean; linux: boolean }): string[] {
        const result: string[] = [];
        if (platforms.windows) result.push('Windows');
        if (platforms.mac) result.push('Mac');
        if (platforms.linux) result.push('Linux');
        return result;
    }

    /**
     * Parse release date string to timestamp
     */
    private static parseReleaseDate(dateStr?: string): number {
        if (!dateStr) return 0;
        try {
            const date = new Date(dateStr);
            return isNaN(date.getTime()) ? 0 : date.getTime();
        } catch {
            return 0;
        }
    }
}
