const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const logger = require('./logger');

class VersionManager {
  constructor(minecraftDir) {
    this.minecraftDir = minecraftDir;
    this.versionsDir = path.join(minecraftDir, 'versions');
    this.assetsDir = path.join(minecraftDir, 'assets');
    this.librariesDir = path.join(minecraftDir, 'libraries');
    this.ensureDirectories();
  }

  async ensureDirectories() {
    const dirs = [this.versionsDir, this.assetsDir, this.librariesDir];
    for (const dir of dirs) {
      await fs.mkdir(dir, { recursive: true });
    }
  }

  async getAvailableVersions() {
    try {
      const response = await axios.get('https://launchermeta.mojang.com/mc/game/version_manifest.json');
      return response.data.versions
        .filter(version => version.type === 'release')
        .map(version => [version.id, version.url]);
    } catch (error) {
      logger.error('Failed to fetch version list:', error);
      throw new Error(`Failed to fetch version list: ${error.message}`);
    }
  }

  async getInstalledVersions() {
    try {
      const versions = await fs.readdir(this.versionsDir);
      const installed = [];

      for (const version of versions) {
        const jarPath = path.join(this.versionsDir, version, `${version}.jar`);
        const jsonPath = path.join(this.versionsDir, version, `${version}.json`);
        try {
          await fs.access(jarPath);
          await fs.access(jsonPath);
          installed.push(version);
        } catch (error) {
          // Skip if files don't exist
        }
      }

      return installed;
    } catch (error) {
      logger.error('Failed to get installed versions:', error);
      return [];
    }
  }

  async isVersionInstalled(versionId) {
    try {
      const versionDir = path.join(this.versionsDir, versionId);
      const jarPath = path.join(versionDir, `${versionId}.jar`);
      const jsonPath = path.join(versionDir, `${versionId}.json`);

      await fs.access(jarPath);
      await fs.access(jsonPath);
      return true;
    } catch (error) {
      return false;
    }
  }

  async downloadVersion(versionId, versionUrl, progressCallback = null, uiUpdateCallback = null) {
    try {
      logger.info(`Starting download for version ${versionId}`);
      const versionDir = path.join(this.versionsDir, versionId);
      await fs.mkdir(versionDir, { recursive: true });

      // Download version JSON
      const versionData = await this.downloadJson(versionUrl);
      await fs.writeFile(
        path.join(versionDir, `${versionId}.json`),
        JSON.stringify(versionData, null, 2)
      );

      // Download client JAR
      const clientUrl = versionData.downloads.client.url;
      await this.downloadFile(
        clientUrl,
        path.join(versionDir, `${versionId}.jar`),
        progressCallback,
        uiUpdateCallback,
        'game'
      );

      // Download libraries
      await this.downloadLibraries(versionData, progressCallback, uiUpdateCallback);

      // Download assets
      await this.downloadAssets(versionData, progressCallback, uiUpdateCallback);

      logger.info(`Version ${versionId} downloaded successfully`);
      return true;
    } catch (error) {
      logger.error(`Failed to download version ${versionId}:`, error);
      throw error;
    }
  }

  async downloadJson(url) {
    try {
      const response = await axios.get(url);
      return response.data;
    } catch (error) {
      throw new Error(`Failed to download JSON from ${url}: ${error.message}`);
    }
  }

  async downloadFile(url, filePath, progressCallback, uiUpdateCallback, phase) {
    try {
      const response = await axios({
        url,
        method: 'GET',
        responseType: 'stream'
      });

      const totalLength = parseInt(response.headers['content-length'], 10);
      let downloadedLength = 0;

      await fs.mkdir(path.dirname(filePath), { recursive: true });
      const writer = fs.createWriteStream(filePath);

      return new Promise((resolve, reject) => {
        response.data.on('data', (chunk) => {
          downloadedLength += chunk.length;
          if (progressCallback) {
            progressCallback(downloadedLength, totalLength, phase);
          }
          if (uiUpdateCallback) {
            uiUpdateCallback(downloadedLength, totalLength, phase); // Update UI
          }
        });

        response.data.pipe(writer);

        writer.on('finish', resolve);
        writer.on('error', reject);
      });
    } catch (error) {
      throw new Error(`Failed to download file from ${url}: ${error.message}`);
    }
  }

  async downloadLibraries(versionData, progressCallback, uiUpdateCallback) {
    const libraries = versionData.libraries || [];
    let downloaded = 0;

    for (const library of libraries) {
      if (library.downloads?.artifact) {
        const { path: libPath, url } = library.downloads.artifact;
        const targetPath = path.join(this.librariesDir, libPath);

        try {
          await fs.access(targetPath);
        } catch {
          await this.downloadFile(
            url,
            targetPath,
            progressCallback,
            uiUpdateCallback,
            'libraries'
          );
        }

        downloaded++;
        if (progressCallback) {
          progressCallback(downloaded, libraries.length, 'libraries');
        }
        if (uiUpdateCallback) {
          uiUpdateCallback(downloaded, libraries.length, 'libraries'); // Update UI
        }
      }
    }
  }

  async downloadAssets(versionData, progressCallback, uiUpdateCallback) {
    const assetsIndexUrl = versionData.assetIndex.url;
    const assetsData = await this.downloadJson(assetsIndexUrl);
    const objects = assetsData.objects;
    let downloaded = 0;

    for (const [assetId, assetInfo] of Object.entries(objects)) {
      const hash = assetInfo.hash;
      const hashPrefix = hash.substring(0, 2);
      const assetUrl = `https://resources.download.minecraft.net/${hashPrefix}/${hash}`;
      const assetPath = path.join(this.assetsDir, 'objects', hashPrefix, hash);

      try {
        await fs.access(assetPath);
      } catch {
        await this.downloadFile(
          assetUrl,
          assetPath,
          progressCallback,
          uiUpdateCallback,
          'assets'
        );
      }

      downloaded++;
      if (progressCallback) {
        progressCallback(downloaded, Object.keys(objects).length, 'assets');
      }
      if (uiUpdateCallback) {
        uiUpdateCallback(downloaded, Object.keys(objects).length, 'assets'); // Update UI
      }
    }
  }
}

module.exports = { VersionManager };