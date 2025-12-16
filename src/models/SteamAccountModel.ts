/**
 * Steam Account Model - Types for local Steam accounts
 */

export interface SteamAccount {
    accountName: string;
    personaName: string;
    steamId?: string;
    lastLogin?: number;
    avatarPath?: string;
    isLastUsed?: boolean;
}

export interface SteamAccountsResponse {
    success: boolean;
    accounts: SteamAccount[];
    steamPath?: string;
    error?: string;
}
