const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs').promises;
const logger = require('./logger');

class MinecraftLauncher {
  constructor() {
    this.minecraftDir = this.getMinecraftDir();
    this.ensureDirectories();
  }

  getMinecraftDir() {
    switch (process.platform) {
      case 'win32':
        return path.join(process.env.APPDATA, '.minecraft');
      case 'darwin':
        return path.join(os.homedir(), 'Library', 'Application Support', 'minecraft');
      default:
        return path.join(os.homedir(), '.minecraft');
    }
  }

  async ensureDirectories() {
    const dirs = [
      this.minecraftDir,
      path.join(this.minecraftDir, 'versions'),
      path.join(this.minecraftDir, 'assets'),
      path.join(this.minecraftDir, 'libraries'),
      path.join(this.minecraftDir, 'natives')
    ];

    for (const dir of dirs) {
      await fs.mkdir(dir, { recursive: true });
    }
  }

  async launchGame(username, version, ram = '2G') {
    logger.info(`Launching Minecraft ${version} for user ${username}`);
    const versionsDir = path.join(this.minecraftDir, 'versions');
    const versionDir = path.join(versionsDir, version);
    const jarPath = path.join(versionDir, `${version}.jar`);
    const jsonPath = path.join(versionDir, `${version}.json`);
    logger.info(`Java path: ${javaPath}`);
    logger.info('Launch arguments:', args.join(' '));
    
    try {
      await fs.access(jarPath);
      await fs.access(jsonPath);
    } catch (error) {
      throw new Error('Version files not found. Please download the game first.');
    }
  
    const javaPath = await this.findJava();
    const versionData = JSON.parse(await fs.readFile(jsonPath, 'utf8'));
    const args = await this.buildLaunchArgs(username, version, versionData, ram);
  
    logger.info('Using Java path:', javaPath);
    logger.info('Launch arguments:', args);
  
    return new Promise((resolve, reject) => {
      const process = spawn(javaPath, args, {
        cwd: this.minecraftDir,
        detached: true,
        stdio: 'inherit'
      });
  
      process.unref();
  
      process.on('error', (error) => {
        logger.error('Failed to start game:', error);
        reject(error);
      });
  
      process.on('exit', (code) => {
        if (code === 0) {
          logger.info('Game exited successfully');
          resolve();
        } else {
          logger.error(`Game exited with code ${code}`);
          reject(new Error(`Game exited with code ${code}`));
        }
      });
    });
  }
  
  async findJava() {
    const javaHome = process.env.JAVA_HOME;
    if (javaHome) {
      const javaPath = path.join(javaHome, 'bin', 'java');
      try {
        await fs.access(javaPath);
        return javaPath;
      } catch (error) {
        logger.warn('JAVA_HOME path not accessible');
      }
    }

    return 'java';
  }

  async buildLaunchArgs(username, version, versionData, ram) {
    const natives = path.join(this.minecraftDir, 'natives', version);
    const classpath = await this.buildClasspath(version, versionData);

    return [
      `-Xmx${ram}`,
      '-XX:+UnlockExperimentalVMOptions',
      '-XX:+UseG1GC',
      '-XX:G1NewSizePercent=20',
      '-XX:G1ReservePercent=20',
      '-XX:MaxGCPauseMillis=50',
      '-XX:G1HeapRegionSize=32M',
      `-Djava.library.path=${natives}`,
      '-cp', classpath,
      versionData.mainClass,
      '--username', username,
      '--version', version,
      '--gameDir', this.minecraftDir,
      '--assetsDir', path.join(this.minecraftDir, 'assets'),
      '--assetIndex', versionData.assets,
      '--uuid', uuidv4(),
      '--accessToken', '0',
      '--userProperties', '{}',
      '--userType', 'legacy',
      '--versionType', 'release'
    ];
  }

  async buildClasspath(version, versionData) {
    const libraries = await this.getLibraries(versionData);
    const clientJar = path.join(this.minecraftDir, 'versions', version, `${version}.jar`);
    return [...libraries, clientJar].join(path.delimiter);
  }

  async getLibraries(versionData) {
    const libraries = [];
    const platform = this.getPlatform();

    for (const library of versionData.libraries) {
      if (this.isLibraryCompatible(library, platform)) {
        const libPath = path.join(this.minecraftDir, 'libraries', library.downloads.artifact.path);
        try {
          await fs.access(libPath);
          libraries.push(libPath);
        } catch (error) {
          logger.warn(`Library not found: ${libPath}`);
        }
      }
    }

    return libraries;
  }

  getPlatform() {
    switch (process.platform) {
      case 'win32': return 'windows';
      case 'darwin': return 'osx';
      default: return 'linux';
    }
  }

  isLibraryCompatible(library, platform) {
    if (!library.downloads?.artifact) return false;
    if (!library.rules) return true;

    let allowed = false;
    for (const rule of library.rules) {
      if (rule.os) {
        if (rule.os.name === platform) {
          allowed = rule.action === 'allow';
        }
      } else {
        allowed = rule.action === 'allow';
      }
    }

    return allowed;
  }
}

module.exports = { MinecraftLauncher };