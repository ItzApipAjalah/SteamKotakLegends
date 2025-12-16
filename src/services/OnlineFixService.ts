/**
 * Online Fix Service - Check if game has online fix support
 * Scrapes online-fix.me to check for multiplayer/co-op fixes
 */

export interface OnlineFixResult {
    hasOnlineFix: boolean;
    coopSupported?: boolean;
    multiplayerSupported?: boolean;
    fixUrl?: string;
    lastUpdate?: string;
    error?: string;
}

export class OnlineFixService {
    private static readonly SEARCH_URL = 'https://online-fix.me/index.php?do=search&subaction=search&story=';

    /**
     * Extract 1-2 key words from game name for search
     */
    private static extractSearchTerms(gameName: string): string {
        // Remove common suffixes and special characters (including ? ! ' etc)
        let cleaned = gameName
            .replace(/[?!'".,;:™®©\-–—\(\)\[\]]/g, ' ')
            .replace(/\s*(Edition|Deluxe|Complete|GOTY|Ultimate|Definitive|Remastered|Enhanced|Anniversary|Collection)\s*/gi, '')
            .replace(/\s+/g, ' ')
            .trim();

        // Split into words and take first 2 significant words
        const words = cleaned.split(' ').filter(w => w.length > 2);
        const searchTerms = words.slice(0, 2).join('+');

        return encodeURIComponent(searchTerms.replace(/\+/g, ' ')).replace(/%20/g, '+');
    }

    /**
     * Check if game has online fix available
     * First searches by appId, then by name if not found
     */
    static async checkOnlineFix(appId: number, gameName: string): Promise<OnlineFixResult> {
        // First try searching by App ID
        console.log(`[OnlineFix] Searching by App ID: ${appId}`);
        let result = await this.searchOnlineFix(String(appId));

        if (result.hasOnlineFix) {
            return result;
        }

        // If not found, try searching by game name
        console.log(`[OnlineFix] Not found by ID, searching by name: ${gameName}`);
        const searchTerms = this.extractSearchTerms(gameName);
        result = await this.searchOnlineFix(searchTerms);

        return result;
    }

    /**
     * Perform search on online-fix.me
     */
    private static async searchOnlineFix(query: string): Promise<OnlineFixResult> {
        try {
            const searchUrl = `${this.SEARCH_URL}${query}`;

            console.log(`[OnlineFix] Searching: ${searchUrl}`);

            const response = await fetch(searchUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.5',
                },
            });

            if (!response.ok) {
                throw new Error(`HTTP error: ${response.status}`);
            }

            const html = await response.text();

            // Check if any results found
            if (!html.includes('news-search') && !html.includes('article clr')) {
                console.log('[OnlineFix] No results found');
                return { hasOnlineFix: false };
            }

            // Extract first result
            const articleMatch = html.match(/<div class="article clr">[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/);
            if (!articleMatch) {
                console.log('[OnlineFix] No article match');
                return { hasOnlineFix: false };
            }

            const article = articleMatch[0];

            // Extract URL from big-link
            const urlMatch = article.match(/href="(https:\/\/online-fix\.me\/games\/[^"]+)"/);
            const fixUrl = urlMatch ? urlMatch[1] : undefined;

            // Check for Coop support (fa-check after Кооператив)
            const coopSupported = article.includes('Кооператив <span class="fa fa-check">');

            // Check for Multiplayer support (fa-check after Мультиплеер)
            const multiplayerSupported = article.includes('Мультиплеер <span class="fa fa-check">');

            // Extract last update date
            const updateMatch = article.match(/Обновлено ([^\.]+)/);
            const lastUpdate = updateMatch ? updateMatch[1].trim() : undefined;

            console.log(`[OnlineFix] Found: coop=${coopSupported}, multiplayer=${multiplayerSupported}, url=${fixUrl}`);

            return {
                hasOnlineFix: true,
                coopSupported,
                multiplayerSupported,
                fixUrl,
                lastUpdate,
            };
        } catch (error) {
            console.error('[OnlineFix] Error:', error);
            return {
                hasOnlineFix: false,
                error: (error as Error).message,
            };
        }
    }
}
