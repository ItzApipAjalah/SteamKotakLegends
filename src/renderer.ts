/**
 * Renderer - UI logic for SteamDB Explorer
 */

import './index.css';
import type { FullGameData, SearchGameResponse, SearchByNameResponse, GameSearchResult } from './models/GameModel';

// DOM Elements
const gameIdInput = document.getElementById('gameIdInput') as HTMLInputElement;
const searchBtn = document.getElementById('searchBtn') as HTMLButtonElement;
const loadingSection = document.getElementById('loadingSection') as HTMLElement;
const errorSection = document.getElementById('errorSection') as HTMLElement;
const errorMessage = document.getElementById('errorMessage') as HTMLElement;
const retryBtn = document.getElementById('retryBtn') as HTMLButtonElement;
const resultSection = document.getElementById('resultSection') as HTMLElement;
const searchResultsSection = document.getElementById('searchResultsSection') as HTMLElement;
const searchResultsList = document.getElementById('searchResultsList') as HTMLElement;
const closeSearchResults = document.getElementById('closeSearchResults') as HTMLButtonElement;

// Game info elements
const gameLogo = document.getElementById('gameLogo') as HTMLImageElement;
const gameType = document.getElementById('gameType') as HTMLElement;
const gameName = document.getElementById('gameName') as HTMLElement;
const gameDeveloper = document.getElementById('gameDeveloper') as HTMLElement;
const gamePublisher = document.getElementById('gamePublisher') as HTMLElement;
const gameDescription = document.getElementById('gameDescription') as HTMLElement;
const gameReleaseDate = document.getElementById('gameReleaseDate') as HTMLElement;
const gameLastUpdate = document.getElementById('gameLastUpdate') as HTMLElement;
const gameId = document.getElementById('gameId') as HTMLElement;
const screenshotsSection = document.getElementById('screenshotsSection') as HTMLElement;
const screenshotsGrid = document.getElementById('screenshotsGrid') as HTMLElement;
const pricesSection = document.getElementById('pricesSection') as HTMLElement;
const pricesGrid = document.getElementById('pricesGrid') as HTMLElement;

// Hint buttons
const hintButtons = document.querySelectorAll('.hint-btn');

// Sidebar toggle elements
const sidebarToggle = document.getElementById('sidebarToggle') as HTMLButtonElement;
const sidebar = document.getElementById('sidebar') as HTMLElement;
const mainContent = document.querySelector('.main-content') as HTMLElement;

/**
 * Format timestamp to readable date
 */
function formatDate(timestamp: number): string {
  if (!timestamp) return 'N/A';
  const date = new Date(timestamp);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/**
 * Country code to flag emoji
 */
function getCountryFlag(countryCode: string): string {
  const codePoints = countryCode
    .toUpperCase()
    .split('')
    .map((char) => 127397 + char.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
}

/**
 * Show loading state
 */
function showLoading(): void {
  loadingSection.classList.remove('hidden');
  errorSection.classList.add('hidden');
  resultSection.classList.add('hidden');
  searchResultsSection?.classList.add('hidden');
  searchBtn.disabled = true;

  // Reset Online Fix UI when switching games
  const onlineFixDownloadBtn = document.getElementById('onlineFixDownloadBtn');
  const onlineFixStatus = document.getElementById('onlineFixStatus');
  if (onlineFixDownloadBtn) onlineFixDownloadBtn.classList.add('hidden');
  if (onlineFixStatus) onlineFixStatus.classList.add('hidden');
  (window as any).currentOnlineFix = null;
}

/**
 * Hide loading state
 */
function hideLoading(): void {
  loadingSection.classList.add('hidden');
  searchBtn.disabled = false;
}

/**
 * Show error state
 */
function showError(message: string): void {
  hideLoading();
  errorSection.classList.remove('hidden');
  resultSection.classList.add('hidden');
  searchResultsSection?.classList.add('hidden');
  errorMessage.textContent = message;
}

/**
 * Display game data
 */
function displayGameData(data: FullGameData): void {
  hideLoading();
  errorSection.classList.add('hidden');
  resultSection.classList.remove('hidden');

  const { info, prices, screenshots } = data;

  // Set game info
  gameLogo.src = info.logoUrl || '';
  gameLogo.alt = info.name || 'Game Logo';
  gameType.textContent = info.type || 'Game';
  gameName.textContent = info.name || 'Unknown Game';

  // Add multiplayer badge if applicable
  const multiplayerBadge = document.getElementById('multiplayerBadge');
  if (multiplayerBadge) {
    if (info.isMultiplayer) {
      multiplayerBadge.classList.remove('hidden');
      multiplayerBadge.title = info.multiplayerTypes?.join(', ') || 'Multiplayer';
    } else {
      multiplayerBadge.classList.add('hidden');
    }
  }

  // Add Online Fix badge if applicable
  const onlineFixBadge = document.getElementById('onlineFixBadge');
  const onlineFixDownloadBtn = document.getElementById('onlineFixDownloadBtn');

  if (onlineFixBadge) {
    if (data.onlineFix?.hasOnlineFix) {
      onlineFixBadge.classList.remove('hidden');

      // Set badge text based on support type
      const coopText = data.onlineFix.coopSupported ? '✓ Co-op' : '✗ Co-op';
      const mpText = data.onlineFix.multiplayerSupported ? '✓ MP' : '✗ MP';
      onlineFixBadge.title = `Online Fix: ${coopText}, ${mpText}`;

      // Add click handler to open fix URL
      if (data.onlineFix.fixUrl) {
        onlineFixBadge.style.cursor = 'pointer';
        onlineFixBadge.onclick = () => {
          window.open(data.onlineFix?.fixUrl, '_blank');
        };
      }

      // Store fix data for download (button will be shown by updateLibraryButton if in library)
      if (onlineFixDownloadBtn && data.onlineFix.fixUrl) {
        (window as any).currentOnlineFix = {
          fixUrl: data.onlineFix.fixUrl,
          gameName: info.name,
        };
        // Hide for now - will show via updateLibraryButton if in library
        onlineFixDownloadBtn.classList.add('hidden');
      }
    } else {
      onlineFixBadge.classList.add('hidden');
      if (onlineFixDownloadBtn) onlineFixDownloadBtn.classList.add('hidden');
      (window as any).currentOnlineFix = null;
    }
  }

  // Set developer and publisher
  const developerValue = gameDeveloper.querySelector('.meta-value');
  const publisherValue = gamePublisher.querySelector('.meta-value');
  if (developerValue) developerValue.textContent = info.developer || 'Unknown';
  if (publisherValue) publisherValue.textContent = info.publisher || 'Unknown';

  // Set description
  gameDescription.textContent = info.description || 'No description available.';

  // Set dates
  gameReleaseDate.textContent = formatDate(info.releaseDate);
  gameLastUpdate.textContent = formatDate(info.lastUpdate);

  // Set App ID
  gameId.textContent = String(info.id);

  // Display screenshots
  if (screenshots && screenshots.length > 0) {
    screenshotsSection.classList.remove('hidden');
    screenshotsGrid.innerHTML = screenshots
      .slice(0, 6)
      .map(
        (url) => `
        <div class="screenshot-item">
          <img src="${url}" alt="Screenshot" loading="lazy" />
          <div class="screenshot-overlay"></div>
        </div>
      `
      )
      .join('');
  } else {
    screenshotsSection.classList.add('hidden');
  }

  // Display prices
  if (prices && prices.length > 0) {
    pricesSection.classList.remove('hidden');
    pricesGrid.innerHTML = prices
      .slice(0, 12)
      .map(
        (price) => `
        <div class="price-item">
          <div class="price-country">
            <span class="country-flag">${getCountryFlag(price.countryCode)}</span>
            <span class="country-code">${price.countryCode}</span>
          </div>
          <span class="price-value">${price.price}</span>
        </div>
      `
      )
      .join('');
  } else {
    pricesSection.classList.add('hidden');
  }
}

/**
 * Display search results for name search
 */
function displaySearchResults(results: GameSearchResult[]): void {
  hideLoading();
  searchResultsSection.classList.remove('hidden');
  resultSection.classList.add('hidden');
  errorSection.classList.add('hidden');

  if (results.length === 0) {
    searchResultsList.innerHTML = `
      <div class="search-no-results">
        No games found. Try a different search term or use an App ID.
      </div>
    `;
    return;
  }

  searchResultsList.innerHTML = results
    .map(
      (game) => `
      <div class="search-result-item" data-appid="${game.appId}">
        <img class="search-result-image" src="${game.imageUrl || ''}" alt="${game.name}" onerror="this.style.display='none'">
        <div class="search-result-info">
          <div class="search-result-name">${game.name}</div>
          <div class="search-result-appid">App ID: ${game.appId}</div>
        </div>
      </div>
    `
    )
    .join('');

  // Add click handlers
  searchResultsList.querySelectorAll('.search-result-item').forEach((item) => {
    item.addEventListener('click', () => {
      const appId = (item as HTMLElement).dataset.appid;
      if (appId) {
        loadGameById(parseInt(appId, 10));
      }
    });
  });
}

/**
 * Load game by App ID (used after selecting from search results)
 */
async function loadGameById(appId: number): Promise<void> {
  showLoading();
  searchResultsSection?.classList.add('hidden');

  try {
    const response: SearchGameResponse = await window.steamAPI.searchGame(appId);

    if (response.success && response.data) {
      displayGameData(response.data);

      const gameIdStr = String(appId);
      (window as any).currentSearchedGameId = gameIdStr;

      libraryStatus.classList.add('hidden');
      const sidebarNotification = document.getElementById('sidebarNotification');
      if (sidebarNotification) {
        sidebarNotification.classList.add('hidden');
      }

      await updateLibraryButton(gameIdStr);
    } else {
      showError(response.error || 'Failed to fetch game data.');
    }
  } catch (error) {
    console.error('Load game error:', error);
    showError('An unexpected error occurred.');
  }
}

/**
 * Search for game by ID or Name
 */
async function searchGame(): Promise<void> {
  const inputValue = gameIdInput.value.trim();

  if (!inputValue) {
    showError('Please enter a game name or App ID.');
    return;
  }

  // Check if input is a number (App ID) or text (game name)
  const isAppId = /^\d+$/.test(inputValue);

  if (isAppId) {
    // Direct App ID search
    const gameIdNumber = parseInt(inputValue, 10);
    if (gameIdNumber <= 0) {
      showError('Please enter a valid App ID.');
      return;
    }
    await loadGameById(gameIdNumber);
  } else {
    // Name search - show results list
    if (inputValue.length < 2) {
      showError('Please enter at least 2 characters to search by name.');
      return;
    }

    showLoading();

    try {
      const response: SearchByNameResponse = await window.steamAPI.searchGameByName(inputValue);

      if (response.success && response.results) {
        displaySearchResults(response.results);
      } else {
        showError(response.error || 'Failed to search games.');
      }
    } catch (error) {
      console.error('Name search error:', error);
      showError('An unexpected error occurred while searching.');
    }
  }
}

// Event Listeners
searchBtn.addEventListener('click', searchGame);

gameIdInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    searchGame();
  }
});

retryBtn.addEventListener('click', () => {
  errorSection.classList.add('hidden');
  gameIdInput.focus();
});

// Close search results button
if (closeSearchResults) {
  closeSearchResults.addEventListener('click', () => {
    searchResultsSection.classList.add('hidden');
  });
}

// Hint button click handlers
hintButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    const id = (btn as HTMLElement).dataset.id;
    if (id) {
      gameIdInput.value = id;
      searchGame();
    }
  });
});

// ========================================
// SIDEBAR TOGGLE
// ========================================

let sidebarCollapsed = localStorage.getItem('sidebarCollapsed') === 'true';

/**
 * Toggle sidebar visibility
 */
function toggleSidebar(): void {
  sidebarCollapsed = !sidebarCollapsed;

  if (sidebarCollapsed) {
    sidebar.classList.add('collapsed');
    mainContent.classList.add('expanded');
  } else {
    sidebar.classList.remove('collapsed');
    mainContent.classList.remove('expanded');
  }

  // Persist state
  localStorage.setItem('sidebarCollapsed', String(sidebarCollapsed));
}

// Initialize sidebar state
if (sidebarCollapsed) {
  sidebar.classList.add('collapsed');
  mainContent.classList.add('expanded');
}

// Sidebar toggle button
sidebarToggle.addEventListener('click', toggleSidebar);

// ========================================
// SIDEBAR - Steam Accounts
// ========================================

// Sidebar DOM Elements
const accountsLoading = document.getElementById('accountsLoading') as HTMLElement;
const accountsError = document.getElementById('accountsError') as HTMLElement;
const accountsErrorMsg = document.getElementById('accountsErrorMsg') as HTMLElement;
const accountsList = document.getElementById('accountsList') as HTMLElement;
const refreshAccountsBtn = document.getElementById('refreshAccountsBtn') as HTMLButtonElement;

/**
 * Get initials from persona name for avatar
 */
function getInitials(name: string): string {
  if (!name) return '?';
  const parts = name.split(' ');
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.substring(0, 2).toUpperCase();
}

/**
 * Format last login timestamp
 */
function formatLastLogin(timestamp: number | undefined): string {
  if (!timestamp) return 'Unknown';
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  return date.toLocaleDateString();
}

/**
 * Load and display Steam accounts
 */
async function loadAccounts(): Promise<void> {
  // Show loading
  accountsLoading.classList.remove('hidden');
  accountsError.classList.add('hidden');
  accountsList.classList.add('hidden');

  try {
    const response = await window.steamAPI.getAccounts();

    accountsLoading.classList.add('hidden');

    if (response.success && response.accounts.length > 0) {
      accountsList.classList.remove('hidden');

      accountsList.innerHTML = response.accounts.map(account => `
        <div class="account-card ${account.isLastUsed ? 'active' : ''}" data-steam-id="${account.steamId || ''}">
          <div class="account-avatar">${getInitials(account.personaName)}</div>
          <div class="account-info">
            <div class="account-name">${account.personaName}</div>
            <div class="account-username">@${account.accountName}</div>
          </div>
          ${account.isLastUsed ? '<span class="account-badge">Active</span>' : ''}
        </div>
      `).join('');

      // Add click listeners to account cards
      const accountCards = accountsList.querySelectorAll('.account-card');
      accountCards.forEach(card => {
        card.addEventListener('click', () => {
          const steamId = (card as HTMLElement).dataset.steamId;
          if (steamId) {
            console.log('Selected account:', steamId);
            // Could add functionality here like opening Steam profile
          }
        });
      });

    } else {
      accountsError.classList.remove('hidden');
      accountsErrorMsg.textContent = response.error || 'No Steam accounts found on this system';
    }
  } catch (error) {
    console.error('Failed to load accounts:', error);
    accountsLoading.classList.add('hidden');
    accountsError.classList.remove('hidden');
    accountsErrorMsg.textContent = 'Failed to load accounts';
  }
}

// Refresh accounts button
refreshAccountsBtn.addEventListener('click', loadAccounts);

// Load accounts on startup
loadAccounts();

// ========================================
// STEAMTOOLS CHECK & DOWNLOAD
// ========================================

const steamtoolsStatus = document.getElementById('steamtoolsStatus') as HTMLElement;
const steamtoolsInstalled = document.getElementById('steamtoolsInstalled') as HTMLElement;
const steamtoolsDownload = document.getElementById('steamtoolsDownload') as HTMLElement;
const downloadSteamToolsBtn = document.getElementById('downloadSteamToolsBtn') as HTMLButtonElement;
const downloadProgress = document.getElementById('downloadProgress') as HTMLElement;
const progressBar = document.getElementById('progressBar') as HTMLElement;
const progressText = document.getElementById('progressText') as HTMLElement;

/**
 * Check if SteamTools is installed
 */
async function checkSteamTools(): Promise<void> {
  try {
    const result = await window.steamAPI.checkSteamTools();

    steamtoolsStatus.classList.add('hidden');

    if (result.installed) {
      steamtoolsInstalled.classList.remove('hidden');
      steamtoolsDownload.classList.add('hidden');
    } else {
      steamtoolsInstalled.classList.add('hidden');
      steamtoolsDownload.classList.remove('hidden');

      // If cached, show "Open Installer" instead of "Download"
      if (result.hasCached) {
        downloadSteamToolsBtn.innerHTML = `
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/>
          </svg>
          Open Installer
        `;
        downloadProgress.classList.add('hidden');
      } else {
        downloadSteamToolsBtn.innerHTML = `
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
            <polyline points="7,10 12,15 17,10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          Download SteamTools
        `;
      }
    }
  } catch (error) {
    console.error('Failed to check SteamTools:', error);
    steamtoolsStatus.innerHTML = '<div class="status-loading">Error checking</div>';
  }
}

/**
 * Download and install SteamTools
 */
async function downloadSteamTools(): Promise<void> {
  downloadSteamToolsBtn.disabled = true;
  downloadSteamToolsBtn.innerHTML = `
    <svg class="animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="12" cy="12" r="10" stroke-dasharray="32" stroke-dashoffset="32"/>
    </svg>
    Downloading...
  `;
  downloadProgress.classList.remove('hidden');

  // Listen for progress
  window.steamAPI.onDownloadProgress((progress) => {
    progressBar.style.setProperty('--progress', `${progress.percent}%`);
    progressText.textContent = `${progress.percent}%`;
  });

  try {
    const result = await window.steamAPI.downloadSteamTools();

    if (result.success) {
      downloadSteamToolsBtn.disabled = false;
      downloadSteamToolsBtn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M23 4v6h-6M1 20v-6h6"/>
          <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
        </svg>
        Check Again
      `;
      progressText.textContent = 'Installer opened! Click to check if installed.';

      // Change button to refresh/check function
      downloadSteamToolsBtn.onclick = async () => {
        downloadSteamToolsBtn.disabled = true;
        downloadSteamToolsBtn.innerHTML = 'Checking...';
        await checkSteamTools();
        // Reset button if still showing download section
        if (!steamtoolsDownload.classList.contains('hidden')) {
          downloadSteamToolsBtn.disabled = false;
          downloadSteamToolsBtn.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M23 4v6h-6M1 20v-6h6"/>
              <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
            </svg>
            Check Again
          `;
        }
      };
    } else {
      downloadSteamToolsBtn.disabled = false;
      downloadSteamToolsBtn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
          <polyline points="7,10 12,15 17,10"/>
          <line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
        Retry Download
      `;
      progressText.textContent = result.error || 'Download failed';
    }
  } catch (error) {
    console.error('Download failed:', error);
    downloadSteamToolsBtn.disabled = false;
    downloadSteamToolsBtn.innerHTML = 'Retry Download';
    progressText.textContent = 'Download failed';
  }
}

// Download button click handler
downloadSteamToolsBtn.addEventListener('click', downloadSteamTools);

// Check SteamTools on startup
checkSteamTools();

// ========================================
// OPEN STEAM BUTTON
// ========================================

const openSteamBtn = document.getElementById('openSteamBtn') as HTMLButtonElement;

/**
 * Open Steam via SteamTools
 */
async function openSteam(): Promise<void> {
  openSteamBtn.disabled = true;
  const originalText = openSteamBtn.innerHTML;
  openSteamBtn.innerHTML = `
    <svg class="animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="12" cy="12" r="10" stroke-dasharray="32" stroke-dashoffset="32"/>
    </svg>
    Opening...
  `;

  try {
    const result = await window.steamAPI.openSteam();

    if (result.success) {
      openSteamBtn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
        </svg>
        Steam Opened!
      `;

      // Reset button after 3 seconds
      setTimeout(() => {
        openSteamBtn.disabled = false;
        openSteamBtn.innerHTML = originalText;
      }, 3000);
    } else {
      openSteamBtn.disabled = false;
      openSteamBtn.innerHTML = originalText;
      console.error('Failed to open Steam:', result.error);
    }
  } catch (error) {
    console.error('Error opening Steam:', error);
    openSteamBtn.disabled = false;
    openSteamBtn.innerHTML = originalText;
  }
}

// Open Steam button click handler
openSteamBtn.addEventListener('click', openSteam);

// ========================================
// ADD TO LIBRARY & MY LIBRARY
// ========================================

const addToLibraryBtn = document.getElementById('addToLibraryBtn') as HTMLButtonElement;
const libraryStatus = document.getElementById('libraryStatus') as HTMLElement;
const libraryList = document.getElementById('libraryList') as HTMLElement;

// Current game ID for library operations
let currentGameId: string | null = null;
let currentGameName: string = '';

/**
 * Load and display installed games in sidebar
 */
async function loadLibraryList(): Promise<void> {
  try {
    const games = await window.steamAPI.getInstalledGames();

    if (games.length === 0) {
      libraryList.innerHTML = '<div class="library-empty">No games installed</div>';
      return;
    }

    libraryList.innerHTML = games.map(game => `
      <div class="library-game" data-app-id="${game.appId}">
        <div class="library-game-info">
          <span class="library-game-name">${game.name}</span>
          <span class="library-game-id">ID: ${game.appId}</span>
        </div>
        <button class="library-game-delete" data-app-id="${game.appId}" title="Remove">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3,6 5,6 21,6"/>
            <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
          </svg>
        </button>
      </div>
    `).join('');

    // Add click handlers for delete buttons
    const deleteButtons = libraryList.querySelectorAll('.library-game-delete');
    deleteButtons.forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const appId = (btn as HTMLElement).dataset.appId;
        if (appId && confirm(`Remove ${appId} and all its files?`)) {
          await removeGameWithRestart(appId);
        }
      });
    });
  } catch (error) {
    console.error('Failed to load library:', error);
    libraryList.innerHTML = '<div class="library-empty">Error loading library</div>';
  }
}

/**
 * Remove a game from library with restart Steam prompt
 */
async function removeGameWithRestart(appId: string): Promise<void> {
  const sidebarNotification = document.getElementById('sidebarNotification') as HTMLElement;

  // Check if SteamTools is installed
  const steamToolsStatus = await window.steamAPI.checkSteamTools();
  if (!steamToolsStatus.installed) {
    sidebarNotification.classList.remove('hidden');
    sidebarNotification.innerHTML = '⚠️ SteamTools not installed.';
    return;
  }

  // Check if SteamTools is running
  const isRunning = await window.steamAPI.isSteamToolsRunning();
  if (!isRunning) {
    sidebarNotification.classList.remove('hidden');
    sidebarNotification.innerHTML = '⚠️ SteamTools not running.';
    return;
  }

  try {
    const result = await window.steamAPI.removeGame(appId);
    if (result.success) {
      await loadLibraryList();

      // Update main content button if viewing this game
      const currentGameId = (window as any).currentSearchedGameId;
      if (currentGameId === appId) {
        await updateLibraryButton(appId);
      }

      // Show restart Steam prompt in sidebar
      sidebarNotification.classList.remove('hidden');
      sidebarNotification.innerHTML = `
        ✅ Removed! Restart Steam.
        <br>
        <button class="restart-btn" onclick="window.restartSteamHandler()">
          🔄 Restart Steam
        </button>
      `;
    } else {
      console.error('Failed to remove game:', result.error);
    }
  } catch (error) {
    console.error('Error removing game:', error);
  }
}

/**
 * Remove a game from library (simple, no prompt)
 */
async function removeGame(appId: string): Promise<void> {
  try {
    const result = await window.steamAPI.removeGame(appId);
    if (result.success) {
      await loadLibraryList();
    } else {
      console.error('Failed to remove game:', result.error);
    }
  } catch (error) {
    console.error('Error removing game:', error);
  }
}

/**
 * Add current game to library
 */
async function addToLibrary(): Promise<void> {
  // Check if SteamTools is installed
  const steamToolsStatus = await window.steamAPI.checkSteamTools();
  if (!steamToolsStatus.installed) {
    libraryStatus.classList.remove('hidden');
    libraryStatus.className = 'library-status error';
    libraryStatus.innerHTML = '⚠️ SteamTools not installed. Please install SteamTools first.';
    return;
  }

  // Check if SteamTools is running
  const isRunning = await window.steamAPI.isSteamToolsRunning();
  if (!isRunning) {
    libraryStatus.classList.remove('hidden');
    libraryStatus.className = 'library-status error';
    libraryStatus.innerHTML = '⚠️ SteamTools not running. Please open SteamTools first.';
    return;
  }

  const gameId = (window as any).currentSearchedGameId;
  if (!gameId) {
    libraryStatus.classList.remove('hidden');
    libraryStatus.className = 'library-status error';
    libraryStatus.textContent = 'Search for a game first';
    return;
  }

  addToLibraryBtn.disabled = true;
  addToLibraryBtn.innerHTML = `
    <svg class="animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="12" cy="12" r="10" stroke-dasharray="32" stroke-dashoffset="32"/>
    </svg>
    Downloading...
  `;
  libraryStatus.classList.add('hidden');

  try {
    const result = await window.steamAPI.downloadManifest(gameId);

    if (result.success) {
      // Success - show restart prompt
      libraryStatus.classList.remove('hidden');
      libraryStatus.className = 'library-status success';
      libraryStatus.innerHTML = `
        ✅ Added to library! Restart Steam to apply changes.
        <br>
        <button class="restart-btn" onclick="window.restartSteamHandler()">
          🔄 Restart Steam
        </button>
      `;

      // Reload library list and update button to Remove mode
      await loadLibraryList();
      await updateLibraryButton(gameId);
    } else {
      // Error
      libraryStatus.classList.remove('hidden');
      libraryStatus.className = 'library-status error';
      libraryStatus.textContent = result.error || 'Failed to add to library';

      addToLibraryBtn.disabled = false;
      addToLibraryBtn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 5v14M5 12h14"/>
        </svg>
        Retry
      `;
    }
  } catch (error) {
    console.error('Add to library error:', error);
    libraryStatus.classList.remove('hidden');
    libraryStatus.className = 'library-status error';
    libraryStatus.textContent = 'An error occurred';

    addToLibraryBtn.disabled = false;
    addToLibraryBtn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M12 5v14M5 12h14"/>
      </svg>
      Retry
    `;
  }
}

/**
 * Restart Steam handler (exposed globally for inline onclick)
 */
(window as any).restartSteamHandler = async () => {
  try {
    await window.steamAPI.restartSteam();
  } catch (error) {
    console.error('Failed to restart Steam:', error);
  }
};

/**
 * Check if game is in library
 */
async function isGameInLibrary(appId: string): Promise<boolean> {
  const games = await window.steamAPI.getInstalledGames();
  return games.some(game => game.appId === appId);
}

/**
 * Update button based on library status
 */
async function updateLibraryButton(appId: string): Promise<void> {
  const inLibrary = await isGameInLibrary(appId);
  const onlineFixDownloadBtn = document.getElementById('onlineFixDownloadBtn');
  const onlineFixStatus = document.getElementById('onlineFixStatus');

  // Show/hide Online Fix download button based on library status
  if (onlineFixDownloadBtn) {
    if (inLibrary && (window as any).currentOnlineFix) {
      onlineFixDownloadBtn.classList.remove('hidden');
    } else {
      onlineFixDownloadBtn.classList.add('hidden');
    }
  }
  // Reset Online Fix status
  if (onlineFixStatus) {
    onlineFixStatus.classList.add('hidden');
  }

  if (inLibrary) {
    addToLibraryBtn.className = 'add-library-btn remove-mode';
    addToLibraryBtn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="3,6 5,6 21,6"/>
        <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
      </svg>
      Remove from Library
    `;
    addToLibraryBtn.onclick = async () => {
      // Check if SteamTools is installed
      const steamToolsStatus = await window.steamAPI.checkSteamTools();
      if (!steamToolsStatus.installed) {
        libraryStatus.classList.remove('hidden');
        libraryStatus.className = 'library-status error';
        libraryStatus.innerHTML = '⚠️ SteamTools not installed. Please install SteamTools first.';
        return;
      }

      // Check if SteamTools is running
      const isRunning = await window.steamAPI.isSteamToolsRunning();
      if (!isRunning) {
        libraryStatus.classList.remove('hidden');
        libraryStatus.className = 'library-status error';
        libraryStatus.innerHTML = '⚠️ SteamTools not running. Please open SteamTools first.';
        return;
      }

      if (confirm('Remove this game from library? All manifest files will be deleted.')) {
        addToLibraryBtn.disabled = true;
        await removeGame(appId);
        await loadLibraryList();
        await updateLibraryButton(appId);

        // Show restart Steam prompt
        libraryStatus.classList.remove('hidden');
        libraryStatus.className = 'library-status success';
        libraryStatus.innerHTML = `
          ✅ Removed from library. Restart Steam to apply changes.
          <br>
          <button class="restart-btn" onclick="window.restartSteamHandler()">
            🔄 Restart Steam
          </button>
        `;
      }
    };
  } else {
    addToLibraryBtn.className = 'add-library-btn';
    addToLibraryBtn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M12 5v14M5 12h14"/>
      </svg>
      Add to Library
    `;
    addToLibraryBtn.onclick = addToLibrary;
  }

  addToLibraryBtn.disabled = false;
}

// Note: No addEventListener here - onclick is set by updateLibraryButton

// Note: Button update logic is now inline in searchGame function

// Load library on startup
loadLibraryList();

// ========================================
// ONLINE FIX DOWNLOAD
// ========================================

/**
 * Download and install Online Fix
 */
async function downloadOnlineFix(): Promise<void> {
  const fixData = (window as any).currentOnlineFix;
  if (!fixData) {
    alert('No Online Fix data available');
    return;
  }

  const onlineFixDownloadBtn = document.getElementById('onlineFixDownloadBtn') as HTMLButtonElement;
  const onlineFixStatus = document.getElementById('onlineFixStatus') as HTMLElement;

  // Get current game ID from window
  const gameId = (window as any).currentSearchedGameId;

  // Check if game is in library
  const inLibrary = gameId ? await isGameInLibrary(gameId) : false;
  if (!inLibrary) {
    if (onlineFixStatus) {
      onlineFixStatus.classList.remove('hidden');
      onlineFixStatus.className = 'library-status error';
      onlineFixStatus.textContent = '⚠️ Game must be in library first. Add to Library first!';
    }
    return;
  }

  // Disable button and show loading
  if (onlineFixDownloadBtn) {
    onlineFixDownloadBtn.disabled = true;
    onlineFixDownloadBtn.innerHTML = `
      <svg class="animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10" stroke-dasharray="32" stroke-dashoffset="32"/>
      </svg>
      Downloading...
    `;
  }

  if (onlineFixStatus) {
    onlineFixStatus.classList.remove('hidden');
    onlineFixStatus.className = 'library-status';
    onlineFixStatus.textContent = '⏳ Downloading Online Fix... This may take a while.';
  }

  // Show progress section and listen for progress updates
  const onlineFixProgress = document.getElementById('onlineFixProgress');
  const onlineFixProgressFill = document.getElementById('onlineFixProgressFill');
  const onlineFixProgressText = document.getElementById('onlineFixProgressText');

  if (onlineFixProgress) {
    onlineFixProgress.classList.remove('hidden');
  }

  // Listen for progress updates
  window.steamAPI.onOnlineFixProgress((progress) => {
    if (onlineFixProgressFill) {
      onlineFixProgressFill.style.width = `${progress.percent}%`;
    }
    if (onlineFixProgressText) {
      onlineFixProgressText.textContent = progress.step;
    }
  });

  try {
    // First try auto-detect game path
    let gamePath = await window.steamAPI.getGamePath(fixData.gameName);

    // If not found, ask user to select folder manually
    if (!gamePath) {
      if (onlineFixStatus) {
        onlineFixStatus.className = 'library-status';
        onlineFixStatus.textContent = '📁 Game folder not found. Please select manually...';
      }

      // Open folder picker dialog
      gamePath = await window.steamAPI.selectFolder();

      if (!gamePath) {
        if (onlineFixStatus) {
          onlineFixStatus.className = 'library-status error';
          onlineFixStatus.textContent = '❌ Cancelled - no folder selected.';
        }
        resetOnlineFixButton(onlineFixDownloadBtn);
        return;
      }

      // Continue with download status
      if (onlineFixStatus) {
        onlineFixStatus.className = 'library-status';
        onlineFixStatus.textContent = '⏳ Downloading Online Fix... This may take a while.';
      }
    }

    const result = await window.steamAPI.downloadOnlineFix(fixData.fixUrl, fixData.gameName, gamePath);

    if (result.success) {
      if (onlineFixStatus) {
        onlineFixStatus.className = 'library-status success';
        onlineFixStatus.innerHTML = '✅ Online Fix installed successfully!';
      }
    } else if (result.needsManualPath) {
      if (onlineFixStatus) {
        onlineFixStatus.className = 'library-status error';
        onlineFixStatus.textContent = '❌ Game folder not found. Install the game first.';
      }
    } else {
      if (onlineFixStatus) {
        onlineFixStatus.className = 'library-status error';
        onlineFixStatus.textContent = `❌ ${result.error || 'Download failed'}`;
      }
    }
  } catch (error) {
    console.error('Online Fix download error:', error);
    if (onlineFixStatus) {
      onlineFixStatus.className = 'library-status error';
      onlineFixStatus.textContent = '❌ An error occurred during download';
    }
  }

  // Hide progress section after completion
  if (onlineFixProgress) {
    setTimeout(() => {
      onlineFixProgress.classList.add('hidden');
    }, 2000);
  }

  resetOnlineFixButton(onlineFixDownloadBtn);
}

/**
 * Reset Online Fix button to default state
 */
function resetOnlineFixButton(btn: HTMLButtonElement | null): void {
  if (btn) {
    btn.disabled = false;
    btn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
        <polyline points="7,10 12,15 17,10"/>
        <line x1="12" y1="15" x2="12" y2="3"/>
      </svg>
      Download Online Fix
    `;
  }
}

// Online Fix download button handler
const onlineFixDownloadBtn = document.getElementById('onlineFixDownloadBtn');
if (onlineFixDownloadBtn) {
  onlineFixDownloadBtn.addEventListener('click', downloadOnlineFix);
}

// Initial focus
gameIdInput.focus();

console.log('🎮 SteamDB Explorer loaded successfully!');
