/**
 * Steam Account Service - Read local Steam accounts from Windows
 * Reads from Steam's loginusers.vdf file and registry
 */

import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { SteamAccount, SteamAccountsResponse } from '../models/SteamAccountModel';

const execAsync = promisify(exec);

export class SteamAccountService {
    private static steamPath: string | null = null;

    /**
     * Get Steam installation path from Windows Registry
     */
    static async getSteamPath(): Promise<string | null> {
        if (this.steamPath) return this.steamPath;

        try {
            // Try to get Steam path from registry
            const { stdout } = await execAsync(
                'reg query "HKEY_CURRENT_USER\\SOFTWARE\\Valve\\Steam" /v SteamPath'
            );

            const match = stdout.match(/SteamPath\s+REG_SZ\s+(.+)/);
            if (match && match[1]) {
                this.steamPath = match[1].trim();
                return this.steamPath;
            }
        } catch (error) {
            console.error('Failed to get Steam path from registry:', error);
        }

        // Fallback to common paths
        const commonPaths = [
            'C:\\Program Files (x86)\\Steam',
            'C:\\Program Files\\Steam',
            path.join(app.getPath('home'), 'Steam'),
        ];

        for (const p of commonPaths) {
            if (fs.existsSync(p)) {
                this.steamPath = p;
                return this.steamPath;
            }
        }

        return null;
    }

    /**
     * Parse VDF (Valve Data Format) file content
     */
    private static parseVDF(content: string): Record<string, any> {
        const result: Record<string, any> = {};
        const lines = content.split('\n');
        const stack: Record<string, any>[] = [result];
        let currentKey = '';

        for (const line of lines) {
            const trimmed = line.trim();

            // Skip empty lines and comments
            if (!trimmed || trimmed.startsWith('//')) continue;

            // Match key-value pairs: "key" "value"
            const kvMatch = trimmed.match(/^"([^"]+)"\s+"([^"]*)"$/);
            if (kvMatch) {
                const current = stack[stack.length - 1];
                current[kvMatch[1]] = kvMatch[2];
                continue;
            }

            // Match key only: "key"
            const keyMatch = trimmed.match(/^"([^"]+)"$/);
            if (keyMatch) {
                currentKey = keyMatch[1];
                continue;
            }

            // Match opening brace
            if (trimmed === '{') {
                const current = stack[stack.length - 1];
                const newObj: Record<string, any> = {};
                current[currentKey] = newObj;
                stack.push(newObj);
                continue;
            }

            // Match closing brace
            if (trimmed === '}') {
                stack.pop();
                continue;
            }
        }

        return result;
    }

    /**
     * Get all Steam accounts from loginusers.vdf
     */
    static async getAccounts(): Promise<SteamAccountsResponse> {
        try {
            const steamPath = await this.getSteamPath();

            if (!steamPath) {
                return {
                    success: false,
                    accounts: [],
                    error: 'Steam installation not found',
                };
            }

            const loginUsersPath = path.join(steamPath, 'config', 'loginusers.vdf');

            if (!fs.existsSync(loginUsersPath)) {
                return {
                    success: false,
                    accounts: [],
                    steamPath,
                    error: 'loginusers.vdf not found',
                };
            }

            const content = fs.readFileSync(loginUsersPath, 'utf-8');
            const parsed = this.parseVDF(content);

            const accounts: SteamAccount[] = [];
            const users = parsed['users'] || {};

            // Get last used account from registry
            let lastUsedAccount = '';
            try {
                const { stdout } = await execAsync(
                    'reg query "HKEY_CURRENT_USER\\SOFTWARE\\Valve\\Steam" /v AutoLoginUser'
                );
                const match = stdout.match(/AutoLoginUser\s+REG_SZ\s+(.+)/);
                if (match && match[1]) {
                    lastUsedAccount = match[1].trim();
                }
            } catch {
                // AutoLoginUser may not exist
            }

            for (const [steamId, userData] of Object.entries(users)) {
                if (typeof userData === 'object' && userData !== null) {
                    const user = userData as Record<string, string>;
                    const accountName = user['AccountName'] || '';

                    accounts.push({
                        steamId,
                        accountName,
                        personaName: user['PersonaName'] || accountName,
                        lastLogin: parseInt(user['Timestamp'] || '0', 10) * 1000,
                        isLastUsed: accountName.toLowerCase() === lastUsedAccount.toLowerCase(),
                    });
                }
            }

            // Sort by last login, most recent first
            accounts.sort((a, b) => (b.lastLogin || 0) - (a.lastLogin || 0));

            return {
                success: true,
                accounts,
                steamPath,
            };
        } catch (error) {
            console.error('SteamAccountService Error:', error);
            return {
                success: false,
                accounts: [],
                error: `Failed to read Steam accounts: ${(error as Error).message}`,
            };
        }
    }
}
