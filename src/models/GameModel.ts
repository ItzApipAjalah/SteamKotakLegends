/**
 * Game Model - TypeScript interfaces for SteamDB game data
 */

// Main game info interface matching steamdb-js getGameInfo() output
export interface GameInfo {
    id: number;
    type: string;
    name: string;
    developer: string;
    publisher: string;
    os?: string[];
    lastUpdate: number;
    releaseDate: number;
    description: string;
    logoUrl: string;
    isMultiplayer?: boolean;
    multiplayerTypes?: string[]; // e.g. ['Multi-player', 'Online Co-op']
}

// Price info interface matching steamdb-js getPrices() output
export interface PriceInfo {
    countryCode: string;
    currency: string;
    price: string;
    convertedPrice: string;
}

// Online Fix info from online-fix.me
export interface OnlineFixInfo {
    hasOnlineFix: boolean;
    coopSupported?: boolean;
    multiplayerSupported?: boolean;
    fixUrl?: string;
    lastUpdate?: string;
}

// Full game data combining all available info
export interface FullGameData {
    info: GameInfo;
    prices: PriceInfo[];
    screenshots: string[];
    onlineFix?: OnlineFixInfo;
}

// IPC Request/Response types
export interface SearchGameRequest {
    gameId: number;
    region?: string;
}

export interface SearchGameResponse {
    success: boolean;
    data?: FullGameData;
    error?: string;
}

// Search by name types
export interface GameSearchResult {
    appId: number;
    name: string;
    imageUrl?: string;
    type?: string;
}

export interface SearchByNameRequest {
    query: string;
}

export interface SearchByNameResponse {
    success: boolean;
    results?: GameSearchResult[];
    error?: string;
}
