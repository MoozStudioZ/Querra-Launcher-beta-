const { ipcRenderer } = require('electron');
const logger = require('../minecraft/logger');

// DOM Elements
const loadingScreen = document.getElementById('loading-screen');
const mainContent = document.getElementById('main-content');
const minimizeBtn = document.getElementById('minimize');
const maximizeBtn = document.getElementById('maximize');
const closeBtn = document.getElementById('close');
const versionSelect = document.getElementById('version-select');
const usernameInput = document.getElementById('username-input');
const usernameDisplay = document.getElementById('username-display');
const ramSelect = document.getElementById('ram-select');
const launchButton = document.getElementById('launch-button');
const progressOverlay = document.querySelector('.progress-overlay');
const progress = document.querySelector('.progress');
const statusText = document.querySelector('.status-text');
const installedVersionsList = document.getElementById('installed-versions-list');
const devLogContent = document.getElementById('dev-log-content');

// Initialize loading sequence
document.addEventListener('DOMContentLoaded', async () => {
  try {
    await initializeLauncher();
    setTimeout(() => {
      loadingScreen.style.opacity = '0';
      mainContent.classList.remove('hidden');
      setTimeout(() => {
        loadingScreen.style.display = 'none';
      }, 500);
    }, 2000);
  } catch (error) {
    logError('Failed to initialize launcher:', error);
  }
});

async function initializeLauncher() {
  await loadVersions();
  setupEventListeners();
  loadSavedUsername();
  updateInstalledVersions();
}

// Logging functions
function logInfo(message) {
  const entry = document.createElement('div');
  entry.className = 'log-entry';
  entry.textContent = `[INFO] ${message}`;
  devLogContent.appendChild(entry);
  devLogContent.scrollTop = devLogContent.scrollHeight;
  logger.info(message);
}

function logError(message, error) {
  const entry = document.createElement('div');
  entry.className = 'log-entry error';
  entry.textContent = `[ERROR] ${message} ${error?.message || ''}`;
  devLogContent.appendChild(entry);
  devLogContent.scrollTop = devLogContent.scrollHeight;
  logger.error(message, error);
}

function logWarning(message) {
  const entry = document.createElement('div');
  entry.className = 'log-entry warning';
  entry.textContent = `[WARN] ${message}`;
  devLogContent.appendChild(entry);
  devLogContent.scrollTop = devLogContent.scrollHeight;
  logger.warn(message);
}

// Window controls
function setupEventListeners() {
  minimizeBtn.addEventListener('click', () => ipcRenderer.send('minimize-window'));
  maximizeBtn.addEventListener('click', () => ipcRenderer.send('maximize-window'));
  closeBtn.addEventListener('click', () => ipcRenderer.send('close-window'));
  
  versionSelect.addEventListener('change', updateLaunchButton);
  launchButton.addEventListener('click', handleLaunchButton);
  
  usernameInput.addEventListener('input', () => {
    const username = usernameInput.value.trim();
    usernameDisplay.textContent = username || 'Player';
    localStorage.setItem('minecraft-username', username);
  });
}

// Username handling
function loadSavedUsername() {
  const savedUsername = localStorage.getItem('minecraft-username');
  if (savedUsername) {
    usernameInput.value = savedUsername;
    usernameDisplay.textContent = savedUsername;
    logInfo(`Loaded saved username: ${savedUsername}`);
  }
}

// Version management
async function loadVersions() {
  try {
    logInfo('Loading available versions...');
    showProgress('Loading versions...', 0);
    const versions = await ipcRenderer.invoke('get-versions');
    
    versionSelect.innerHTML = '';
    versions.forEach(([id, url]) => {
      const option = document.createElement('option');
      option.value = JSON.stringify({ id, url });
      option.textContent = id;
      versionSelect.appendChild(option);
    });

    hideProgress();
    updateLaunchButton();
    logInfo(`Loaded ${versions.length} versions`);
  } catch (error) {
    logError('Failed to load versions:', error);
    showError('Failed to load versions');
  }
}

// Version management
async function updateInstalledVersions() {
  try {
    const versions = await ipcRenderer.invoke('get-installed-versions');
    installedVersionsList.innerHTML = '';

    versions.forEach(version => {
      const versionItem = document.createElement('div');
      versionItem.className = 'version-item';
      versionItem.innerHTML = `
        <span class="version-name">${version}</span>
        <span class="version-type">Release</span>
      `;

      // Launch game directly when an installed version is clicked
      versionItem.addEventListener('click', async () => {
        const username = usernameInput.value.trim();
        if (!username) {
          logWarning('Username is required');
          alert('Please enter a username');
          return;
        }

        const ram = `${ramSelect.value}G` || '2G';  // Default to 2G if no RAM selected
        try {
          await ipcRenderer.invoke('launch-game', { username, version, ram });
          logInfo(`Game launched: ${version} with username ${username}`);
        } catch (error) {
          logError('Failed to launch game:', error);
          alert('Failed to launch game. Please check the logs for details.');
        }
      });

      installedVersionsList.appendChild(versionItem);
    });

    logInfo(`Updated installed versions list: ${versions.length} versions found`);
  } catch (error) {
    logError('Failed to update installed versions:', error);
  }
}



function selectVersion(version) {
  const options = versionSelect.options;
  for (let i = 0; i < options.length; i++) {
    const data = JSON.parse(options[i].value);
    if (data.id === version) {
      versionSelect.selectedIndex = i;
      updateLaunchButton();
      break;
    }
  }
}

// Progress handling
function showProgress(message, value = 0) {
  progressOverlay.classList.add('visible');
  progress.style.width = `${value}%`;
  statusText.textContent = message;
  logInfo(message);
}

function hideProgress() {
  progressOverlay.classList.remove('visible');
  progress.style.width = '0%';
  statusText.textContent = 'Ready to play';
}

function showError(message) {
  statusText.textContent = message;
  logError(message);
  setTimeout(hideProgress, 3000);
}

// Launch button handling
async function updateLaunchButton() {
  const versionData = JSON.parse(versionSelect.value || '{"id":""}');
  const versionId = versionData.id;

  if (!versionId) {
    launchButton.disabled = true;
    return;
  }

  const isInstalled = await ipcRenderer.invoke('check-version', versionId);
  launchButton.textContent = isInstalled ? 'Play' : 'Download';
  launchButton.disabled = false;
  logInfo(`Version ${versionId} status: ${isInstalled ? 'installed' : 'not installed'}`);
}

async function handleLaunchButton() {
  const versionData = JSON.parse(versionSelect.value);
  const username = usernameInput.value.trim();

  if (!username) {
    logWarning('Username is required');
    alert('Please enter a username');
    return;
  }

  if (!versionData.id) {
    logWarning('Version selection is required');
    alert('Please select a version');
    return;
  }

  const isInstalled = await ipcRenderer.invoke('check-version', versionData.id);

  if (isInstalled) {
    await launchGame(username, versionData.id);
  } else {
    await downloadVersion(versionData);
  }
}

async function launchGame(username, version) {
  try {
    logInfo(`Launching game: ${version} with username ${username}`);
    showProgress('Launching game...', 50);
    
    await ipcRenderer.invoke('launch-game', {
      username,
      version,
      ram: `${ramSelect.value}G`
    });

    showProgress('Game launched!', 100);
    logInfo('Game launched successfully');
    setTimeout(hideProgress, 2000);
  } catch (error) {
    logError('Failed to launch game:', error);
    showError('Failed to launch game');
  }
}

async function downloadVersion(versionData) {
  try {
    logInfo(`Starting download for version ${versionData.id}`);
    showProgress('Starting download...', 0);
    
    await ipcRenderer.invoke('download-version', {
      versionId: versionData.id,
      versionUrl: versionData.url
    });

    showProgress('Download complete!', 100);
    logInfo(`Version ${versionData.id} downloaded successfully`);
    setTimeout(() => {
      hideProgress();
      updateLaunchButton();
      updateInstalledVersions();
    }, 2000);
  } catch (error) {
    logError('Download failed:', error);
    showError('Download failed');
  }
}

// Download progress updates
ipcRenderer.on('download-progress', (event, { current, total, phase }) => {
  const percentage = (current / total) * 100;
  showProgress(`Downloading ${phase}: ${percentage.toFixed(1)}%`, percentage);
});