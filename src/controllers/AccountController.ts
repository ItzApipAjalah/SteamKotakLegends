/**
 * Account Controller - IPC handlers for Steam account operations
 */

import { ipcMain } from 'electron';
import { SteamAccountService } from '../services/SteamAccountService';
import { SteamAccountsResponse } from '../models/SteamAccountModel';

export class AccountController {
    /**
     * Register all IPC handlers for account-related operations
     */
    static registerHandlers(): void {
        // Handler for getting local Steam accounts
        ipcMain.handle('get-steam-accounts', async (): Promise<SteamAccountsResponse> => {
            try {
                return await SteamAccountService.getAccounts();
            } catch (error) {
                console.error('AccountController Error:', error);
                return {
                    success: false,
                    accounts: [],
                    error: (error as Error).message || 'Failed to get Steam accounts',
                };
            }
        });

        console.log('AccountController: IPC handlers registered');
    }
}
