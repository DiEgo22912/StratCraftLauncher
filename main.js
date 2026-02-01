const { app, BrowserWindow, ipcMain, Menu, dialog, Notification } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { spawn, spawnSync } = require('child_process');
const net = require('net');
const os = require('os');
const { autoUpdater } = require('electron-updater');

let mainWindow = null;

// Use userData for writable data (works both in dev and packaged mode)
// In packaged mode, __dirname points inside app.asar (read-only)
// app.getPath('userData') points to %APPDATA%/StratCraftLauncher (writable)
const USER_DATA_DIR = app.getPath('userData');
const DATA_DIR = path.join(USER_DATA_DIR, 'data');
const USERS_PATH = path.join(DATA_DIR, 'users.json');
const SETTINGS_PATH = path.join(DATA_DIR, 'launcher-settings.json');

// Game/client files also need to be in writable location
const GAME_DIR = path.join(USER_DATA_DIR, 'StratCraftClient');
const INSTANCE_DIR = GAME_DIR;
const INSTANCE_JAR = path.join(GAME_DIR, 'StratCraft 1.24.1.jar');
const INSTANCE_JSON = path.join(GAME_DIR, 'StratCraft 1.24.1.json');
const DEFAULT_MC_DIR = path.join(app.getPath('appData'), '.minecraft');
const VERSION_ID = 'StratCraft 1.24.1';
const SERVER_HOST = 'wad-sb.gl.joinmc.link';
const SERVER_PROPERTIES = path.join(__dirname, '..', 'server.properties');
const DEFAULT_PORT = 25565;

// Optional secure token storage using OS credential store (keytar)
let keytar = null;
let hasKeytar = false;
const KEYTAR_SERVICE = 'StratCraftLauncher';
const KEYTAR_ACCOUNT = 'auth-token';
try {
    keytar = require('keytar');
    hasKeytar = true;
} catch (e) {
    console.warn('Keytar not available; falling back to settings file for token storage. To enable, install keytar and rebuild native modules.');
}

async function migrateTokenToKeytar() {
    if (!hasKeytar) return;
    try {
        const s = loadSettings() || {};
        if (s.authToken) {
            await keytar.setPassword(KEYTAR_SERVICE, KEYTAR_ACCOUNT, s.authToken);
            delete s.authToken;
            saveSettings(s);
            console.log('Migrated auth token to keytar');
        }
    } catch (e) {
        console.warn('Token migration failed', e);
    }
}

// Migrate data from old location (__dirname) to new location (userData)
async function migrateOldDataToUserData() {
    try {
        // Old paths (before v1.1.4) - inside installation directory
        const oldDataDir = path.join(__dirname, 'data');
        const oldClientsDir = path.join(oldDataDir, 'clients');

        // New paths (v1.1.4+) - in %APPDATA%
        const newClientsDir = path.join(DATA_DIR, 'clients');

        // Check if old clients directory exists and new one doesn't have the same data
        if (fs.existsSync(oldClientsDir) && fs.statSync(oldClientsDir).isDirectory()) {
            console.log('[Migration] Found old clients directory:', oldClientsDir);

            // Ensure new clients directory exists
            if (!fs.existsSync(newClientsDir)) {
                fs.mkdirSync(newClientsDir, { recursive: true });
            }

            // Get list of installed clients in old location
            const oldClients = fs.readdirSync(oldClientsDir, { withFileTypes: true })
                .filter(d => d.isDirectory())
                .map(d => d.name);

            console.log('[Migration] Found old clients:', oldClients);

            // Copy each client to new location if it doesn't exist there
            for (const clientName of oldClients) {
                const oldClientPath = path.join(oldClientsDir, clientName);
                const newClientPath = path.join(newClientsDir, clientName);

                if (!fs.existsSync(newClientPath)) {
                    console.log(`[Migration] Migrating client ${clientName}...`);
                    try {
                        // Copy directory recursively
                        fs.cpSync(oldClientPath, newClientPath, { recursive: true });
                        console.log(`[Migration] Successfully migrated ${clientName}`);
                    } catch (err) {
                        console.error(`[Migration] Failed to migrate ${clientName}:`, err);
                    }
                } else {
                    console.log(`[Migration] Client ${clientName} already exists in new location, skipping`);
                }
            }

            console.log('[Migration] Client migration completed');
        }

        // Migrate user data and settings if they exist in old location
        const oldUsersPath = path.join(oldDataDir, 'users.json');
        const oldSettingsPath = path.join(oldDataDir, 'launcher-settings.json');

        if (fs.existsSync(oldUsersPath) && !fs.existsSync(USERS_PATH)) {
            console.log('[Migration] Migrating users.json...');
            fs.copyFileSync(oldUsersPath, USERS_PATH);
        }

        if (fs.existsSync(oldSettingsPath) && !fs.existsSync(SETTINGS_PATH)) {
            console.log('[Migration] Migrating launcher-settings.json...');
            fs.copyFileSync(oldSettingsPath, SETTINGS_PATH);
        }
    } catch (e) {
        console.error('[Migration] Data migration failed:', e);
        // Don't throw - migration is optional, app should work even if it fails
    }
}

function ensureDataFiles() {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(USERS_PATH)) fs.writeFileSync(USERS_PATH, JSON.stringify([]), 'utf8');
    if (!fs.existsSync(SETTINGS_PATH)) {
        fs.writeFileSync(SETTINGS_PATH, JSON.stringify({ maxRamGb: 6, authStaySignedIn: false }, null, 2), 'utf8');
    }
}

function loadUsers() {
    try {
        const raw = fs.readFileSync(USERS_PATH, 'utf8');
        return JSON.parse(raw);
    } catch {
        return [];
    }
}

function saveUsers(users) {
    fs.writeFileSync(USERS_PATH, JSON.stringify(users, null, 2), 'utf8');
}

function loadSettings() {
    try {
        const raw = fs.readFileSync(SETTINGS_PATH, 'utf8');
        return JSON.parse(raw);
    } catch {
        return { minRamGb: 2, maxRamGb: 6 };
    }
}

function saveSettings(settings) {
    fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2), 'utf8');
}

function resolveJavaCommand() {
    const isWin = process.platform === 'win32';
    const javaHome = process.env.JAVA_HOME;
    if (javaHome) {
        const candidate = path.join(javaHome, 'bin', isWin ? 'javaw.exe' : 'java');
        if (fs.existsSync(candidate)) return candidate;
    }
    return isWin ? 'javaw' : 'java';
}

function readServerPort() {
    try {
        const raw = fs.readFileSync(SERVER_PROPERTIES, 'utf8');
        const lines = raw.split(/\r?\n/);
        for (const line of lines) {
            if (!line || line.startsWith('#')) continue;
            const [key, value] = line.split('=');
            if (key?.trim() === 'server-port') {
                const port = Number(value?.trim());
                if (Number.isFinite(port)) return port;
            }
        }
    } catch { }
    return DEFAULT_PORT;
}

function writeVarInt(value) {
    const bytes = [];
    let val = value >>> 0;
    do {
        let temp = val & 0x7f;
        val >>>= 7;
        if (val !== 0) temp |= 0x80;
        bytes.push(temp);
    } while (val !== 0);
    return Buffer.from(bytes);
}

function readVarInt(buffer, offset) {
    let num = 0;
    let shift = 0;
    let pos = offset;
    while (pos < buffer.length) {
        const byte = buffer[pos++];
        num |= (byte & 0x7f) << shift;
        if ((byte & 0x80) === 0) return { value: num, size: pos - offset };
        shift += 7;
        if (shift > 35) break;
    }
    return null;
}

function writeString(value) {
    const str = Buffer.from(String(value), 'utf8');
    return Buffer.concat([writeVarInt(str.length), str]);
}

function createPacket(parts) {
    const data = Buffer.concat(parts);
    return Buffer.concat([writeVarInt(data.length), data]);
}

function pingServer(host, port, timeoutMs = 3000) {
    return new Promise((resolve, reject) => {
        const socket = new net.Socket();
        let dataBuffer = Buffer.alloc(0);
        const protocol = 767;

        let settled = false;
        const finish = (err, val) => {
            if (settled) return;
            settled = true;
            try { socket.destroy(); } catch (e) { }
            if (err) return reject(err);
            return resolve(val);
        };

        const onError = (err) => finish(err);

        socket.setTimeout(timeoutMs, () => onError(new Error('timeout')));
        socket.once('error', onError);
        socket.once('close', () => { if (!settled) finish(new Error('closed without data')); });

        socket.connect(port, host, () => {
            const handshake = createPacket([
                writeVarInt(0),
                writeVarInt(protocol),
                writeString(host),
                Buffer.from([(port >> 8) & 0xff, port & 0xff]),
                writeVarInt(1)
            ]);
            const statusRequest = createPacket([writeVarInt(0)]);
            socket.write(handshake);
            socket.write(statusRequest);
        });

        socket.on('data', (chunk) => {
            dataBuffer = Buffer.concat([dataBuffer, chunk]);
            const lengthInfo = readVarInt(dataBuffer, 0);
            if (!lengthInfo) return;
            const packetLength = lengthInfo.value;
            const packetStart = lengthInfo.size;
            if (dataBuffer.length < packetStart + packetLength) return;
            const packet = dataBuffer.slice(packetStart, packetStart + packetLength);
            const idInfo = readVarInt(packet, 0);
            if (!idInfo || idInfo.value !== 0) return;
            const strInfo = readVarInt(packet, idInfo.size);
            if (!strInfo) return;
            const strStart = idInfo.size + strInfo.size;
            const jsonStr = packet.slice(strStart, strStart + strInfo.value).toString('utf8');
            try {
                finish(null, JSON.parse(jsonStr));
            } catch (err) {
                finish(err);
            }
        });

        // safety: absolute timeout
        setTimeout(() => { if (!settled) finish(new Error('absolute timeout')); }, timeoutMs + 500);
    });
}

function getLocalIps() {
    const nets = os.networkInterfaces();
    const ips = new Set();
    for (const name of Object.keys(nets)) {
        for (const netInfo of nets[name] || []) {
            if (netInfo.family !== 'IPv4' || netInfo.internal) continue;
            const ip = netInfo.address;
            if (
                ip.startsWith('192.168.') ||
                ip.startsWith('10.') ||
                /^172\.(1[6-9]|2\d|3[0-1])\./.test(ip)
            ) {
                ips.add(ip);
            }
        }
    }
    return Array.from(ips);
}

function readJson(filePath) {
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch {
        return null;
    }
}

function isWindows() {
    return process.platform === 'win32';
}

function ruleMatchesOS(rule) {
    if (!rule?.os?.name) return true;
    return rule.os.name === (isWindows() ? 'windows' : process.platform);
}

function isAllowedByRules(rules) {
    if (!Array.isArray(rules) || rules.length === 0) return true;
    let allowed = false;
    let matched = false;
    for (const rule of rules) {
        if (!ruleMatchesOS(rule)) continue;
        if (rule.features) continue;
        matched = true;
        if (rule.action === 'allow') allowed = true;
        if (rule.action === 'disallow') allowed = false;
    }
    return matched ? allowed : false;
}

function offlineUuid(username) {
    const base = `OfflinePlayer:${username}`;
    const hash = crypto.createHash('md5').update(base, 'utf8').digest();
    hash[6] = (hash[6] & 0x0f) | 0x30;
    hash[8] = (hash[8] & 0x3f) | 0x80;
    const hex = hash.toString('hex');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function flattenArgs(items) {
    const out = [];
    if (!Array.isArray(items)) return out;
    for (const item of items) {
        if (typeof item === 'string') {
            out.push(item);
            continue;
        }
        if (item?.rules && !isAllowedByRules(item.rules)) continue;
        if (Array.isArray(item?.values)) out.push(...item.values);
        else if (Array.isArray(item?.value)) out.push(...item.value);
        else if (typeof item?.value === 'string') out.push(item.value);
    }
    return out;
}

function substituteArgs(args, vars) {
    return args
        .map((arg) => {
            let replaced = arg;
            for (const [key, value] of Object.entries(vars)) {
                replaced = replaced.replaceAll(`\${${key}}`, String(value));
            }
            return replaced;
        })
        .filter((arg) => !/\$\{[^}]+\}/.test(arg));
}

function resolveVersionFiles() {
    const altJson = path.join(DEFAULT_MC_DIR, 'versions', VERSION_ID, `${VERSION_ID}.json`);
    const altJar = path.join(DEFAULT_MC_DIR, 'versions', VERSION_ID, `${VERSION_ID}.jar`);
    const versionJsonPath = fs.existsSync(INSTANCE_JSON) ? INSTANCE_JSON : altJson;
    const versionJarPath = fs.existsSync(INSTANCE_JAR) ? INSTANCE_JAR : altJar;
    return { versionJsonPath, versionJarPath };
}

function buildClasspath(version, versionJarPath, mcDir) {
    const libs = version?.libraries || [];
    const classpath = [];
    const missing = [];
    const libBase = path.join(mcDir, 'libraries');
    for (const lib of libs) {
        if (lib?.rules && !isAllowedByRules(lib.rules)) continue;
        const relPath = lib?.downloads?.artifact?.path || lib?.artifact?.path;
        if (!relPath) continue;
        const usesPrefix = relPath.startsWith('libraries/') || relPath.startsWith('libraries\\');
        const fullPath = usesPrefix ? path.join(mcDir, relPath) : path.join(libBase, relPath);
        if (fs.existsSync(fullPath)) classpath.push(fullPath);
        else missing.push(relPath);
    }
    if (versionJarPath && fs.existsSync(versionJarPath)) classpath.push(versionJarPath);
    return { classpath, missing };
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
    const iterations = 120000;
    const keylen = 32;
    const digest = 'sha256';
    const hash = crypto.pbkdf2Sync(password, salt, iterations, keylen, digest).toString('hex');
    return { salt, hash, iterations, keylen, digest };
}

function verifyPassword(password, record) {
    const hash = crypto.pbkdf2Sync(password, record.salt, record.iterations, record.keylen, record.digest).toString('hex');
    return hash === record.hash;
}

function createWindow() {
    const win = new BrowserWindow({
        width: 1000,
        height: 850,
        minWidth: 800,
        minHeight: 700,
        autoHideMenuBar: true,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        }
    });

    mainWindow = win;
    win.on('closed', () => { mainWindow = null; });

    win.setMenuBarVisibility(false);

    win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

app.whenReady().then(async () => {
    ensureDataFiles();
    // Migrate data from old location to new location (v1.1.4+ migration)
    await migrateOldDataToUserData();
    // Try to migrate any token saved in settings to keytar
    migrateTokenToKeytar().catch(() => { });
    Menu.setApplicationMenu(null);
    createWindow();

    // Auto-updater setup
    autoUpdater.autoDownload = false;

    function sendUpdateEvent(type, payload) {
        if (mainWindow && mainWindow.webContents) {
            mainWindow.webContents.send('update:event', { type, payload });
        }
    }

    autoUpdater.on('checking-for-update', () => sendUpdateEvent('checking'));
    autoUpdater.on('update-available', info => {
        sendUpdateEvent('available', info);
        try { new Notification({ title: 'StratCraftLauncher', body: 'Доступно обновление' }).show(); } catch (e) { }
    });
    autoUpdater.on('update-not-available', info => sendUpdateEvent('not-available', info));
    autoUpdater.on('error', err => sendUpdateEvent('error', { message: err?.message || String(err) }));
    autoUpdater.on('download-progress', progressObj => sendUpdateEvent('download-progress', progressObj));
    autoUpdater.on('update-downloaded', info => {
        sendUpdateEvent('downloaded', info);
        try { new Notification({ title: 'StratCraftLauncher', body: 'Обновление загружено — установите и перезапустите' }).show(); } catch (e) { }
    });

    ipcMain.handle('update:check', async () => {
        try {
            await autoUpdater.checkForUpdates();
            return { ok: true };
        } catch (err) {
            return { ok: false, msg: err?.message || String(err) };
        }
    });

    ipcMain.handle('update:download', async () => {
        try {
            await autoUpdater.downloadUpdate();
            return { ok: true };
        } catch (err) {
            return { ok: false, msg: err?.message || String(err) };
        }
    });

    ipcMain.handle('update:install', () => {
        try {
            autoUpdater.quitAndInstall();
            return { ok: true };
        } catch (err) {
            return { ok: false, msg: err?.message || String(err) };
        }
    });

    // Client update helpers: fetch manifest from GitHub Releases, download, verify and install
    const GITHUB_CLIENT_OWNER = 'DiEgo22912';
    const GITHUB_CLIENT_REPO = 'StratCraftClient';
    const GITHUB_CLIENT_API = `https://api.github.com/repos/${GITHUB_CLIENT_OWNER}/${GITHUB_CLIENT_REPO}`;

    function fetchJson(url, redirectsLeft = 10, isAssetDownload = false) {
        return new Promise((resolve, reject) => {
            const https = require('https');
            const http = require('http');
            try {
                const parsedUrl = new URL(url);
                const client = (parsedUrl.protocol === 'http:') ? http : https;
                // For asset downloads (browser_download_url), don't send GitHub API headers
                const headers = isAssetDownload
                    ? { 'User-Agent': 'StratCraftLauncher' }
                    : { 'User-Agent': 'StratCraftLauncher', 'Accept': 'application/vnd.github+json' };
                const opts = {
                    hostname: parsedUrl.hostname,
                    port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
                    path: parsedUrl.pathname + parsedUrl.search,
                    method: 'GET',
                    headers: headers
                };
                const req = client.request(opts, (res) => {
                    // follow redirects
                    if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                        if (redirectsLeft > 0) {
                            try { req.destroy(); } catch (e) { }
                            const newUrl = new URL(res.headers.location, url).toString();
                            // Mark as asset download for subsequent redirects (they go to Azure Blob)
                            return resolve(fetchJson(newUrl, redirectsLeft - 1, true));
                        } else {
                            return reject(new Error('Too many redirects'));
                        }
                    }
                    let buf = '';
                    res.setEncoding('utf8');
                    res.on('data', d => buf += d);
                    res.on('end', () => {
                        if (res.statusCode >= 200 && res.statusCode < 300) {
                            try { resolve(JSON.parse(buf)); } catch (e) { reject(new Error(`Invalid JSON: ${e.message}`)); }
                        } else {
                            reject(new Error(`HTTP ${res.statusCode} for ${url}`));
                        }
                    });
                });
                req.on('error', reject);
                req.end();
            } catch (err) {
                reject(err);
            }
        });
    }

    async function fetchLatestClientManifest() {
        console.log('[Client Update] Fetching latest release info...');
        const rel = await fetchJson(`${GITHUB_CLIENT_API}/releases/latest`);
        console.log('[Client Update] Found release:', rel?.tag_name);
        const manifestAsset = (rel?.assets || []).find(a => a.name === 'client-manifest.json');
        if (!manifestAsset) throw new Error('client-manifest.json asset not found in latest release');
        console.log('[Client Update] Fetching manifest from:', manifestAsset.browser_download_url);
        // browser_download_url will redirect (302) to Azure Blob - mark as asset download
        const manifest = await fetchJson(manifestAsset.browser_download_url, 10, true);
        console.log('[Client Update] Manifest loaded, version:', manifest?.version);
        return { manifest, release: rel };
    }

    function downloadFile(url, destPath, onProgress, redirectsLeft = 5) {
        return new Promise((resolve, reject) => {
            const https = require('https');
            const http = require('http');
            const fs = require('fs');
            const parsed = new URL(url);
            const client = parsed.protocol === 'http:' ? http : https;
            const req = client.get(url, { headers: { 'User-Agent': 'StratCraftLauncher' } }, (res) => {
                // Handle redirects
                if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                    if (redirectsLeft > 0) {
                        try { req.destroy(); } catch (e) { }
                        return resolve(downloadFile(new URL(res.headers.location, url).toString(), destPath, onProgress, redirectsLeft - 1));
                    } else {
                        return reject(new Error('Too many redirects'));
                    }
                }
                if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) return reject(new Error(`HTTP ${res.statusCode}`));
                const total = parseInt(res.headers['content-length'] || '0', 10);
                let transferred = 0;
                // ensure destination directory exists
                try { fs.mkdirSync(require('path').dirname(destPath), { recursive: true }); } catch (e) { }
                const out = fs.createWriteStream(destPath);
                let lastTime = Date.now();
                let lastTransferred = 0;
                res.on('data', (chunk) => {
                    transferred += chunk.length;
                    out.write(chunk);
                    const now = Date.now();
                    if (now - lastTime >= 500) {
                        const bytesPerSec = Math.max(1, Math.floor((transferred - lastTransferred) / ((now - lastTime) / 1000)));
                        lastTime = now; lastTransferred = transferred;
                        try { mainWindow?.webContents?.send('client:update:progress', { transferred, total, bytesPerSecond: bytesPerSec, percent: total ? Math.round(transferred / total * 100) : 0 }); } catch (e) { }
                        if (typeof onProgress === 'function') onProgress({ transferred, total });
                    }
                });
                res.on('end', () => { out.end(); resolve(); });
                res.on('error', (err) => { try { out.close(); } catch (e) { } reject(err); });
            });
            req.on('error', reject);
        });
    }

    function computeSha512(filePath) {
        return new Promise((resolve, reject) => {
            const fs = require('fs');
            const crypto = require('crypto');
            const h = crypto.createHash('sha512');
            const s = fs.createReadStream(filePath);
            s.on('data', d => h.update(d));
            s.on('end', () => resolve(h.digest('base64')));
            s.on('error', reject);
        });
    }

    async function extractZip(zipPath, destDir) {
        if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
        if (process.platform === 'win32') {
            // Hide PowerShell window by using 'pipe' instead of 'inherit' and windowsHide
            const ps = spawnSync('powershell', ['-NoProfile', '-WindowStyle', 'Hidden', '-Command', `Expand-Archive -Path "${zipPath}" -DestinationPath "${destDir}" -Force`], {
                stdio: 'pipe',
                windowsHide: true
            });
            if (ps.status !== 0) {
                const stderr = ps.stderr?.toString() || '';
                throw new Error(`Expand-Archive failed: ${stderr}`);
            }
        } else {
            const z = spawnSync('unzip', ['-o', zipPath, '-d', destDir], { stdio: 'pipe' });
            if (z.status !== 0) {
                const stderr = z.stderr?.toString() || '';
                throw new Error(`unzip failed: ${stderr}`);
            }
        }
    }

    ipcMain.handle('client:update:check', async () => {
        try {
            const { manifest, release } = await fetchLatestClientManifest();
            return { ok: true, manifest, release };
        } catch (err) {
            return { ok: false, msg: err?.message || String(err) };
        }
    });

    ipcMain.handle('client:update:download', async (_, { url }) => {
        try {
            const downloadsDir = path.join(DATA_DIR, 'downloads');
            if (!fs.existsSync(downloadsDir)) fs.mkdirSync(downloadsDir, { recursive: true });
            const fileName = path.basename(new URL(url).pathname);
            const dest = path.join(downloadsDir, fileName);
            await downloadFile(url, dest);
            return { ok: true, path: dest };
        } catch (err) {
            try { mainWindow?.webContents?.send('client:update:event', { type: 'download-failed', msg: err?.message || String(err) }); } catch (e) { }
            return { ok: false, msg: err?.message || String(err) };
        }
    });

    ipcMain.handle('client:update:install', async (_, { zipPath, version }) => {
        try {
            const clientsRoot = path.join(DATA_DIR, 'clients');
            if (!fs.existsSync(clientsRoot)) fs.mkdirSync(clientsRoot, { recursive: true });
            const tmp = path.join(clientsRoot, `${version}.tmp`);
            const final = path.join(clientsRoot, version);
            if (fs.existsSync(tmp)) fs.rmSync(tmp, { recursive: true, force: true });

            // Send install-started event
            mainWindow?.webContents?.send('client:update:event', { type: 'install-started', version });

            // Extract to temp directory
            mainWindow?.webContents?.send('client:update:event', { type: 'install-progress', step: 'extracting', percent: 20 });
            await extractZip(zipPath, tmp);
            mainWindow?.webContents?.send('client:update:event', { type: 'install-progress', step: 'extracted', percent: 60 });

            // Detect actual version ID from extracted structure
            let detectedVersion = version;
            try {
                const versionsDir = path.join(tmp, 'versions');
                if (fs.existsSync(versionsDir)) {
                    const dirs = fs.readdirSync(versionsDir, { withFileTypes: true })
                        .filter(d => d.isDirectory())
                        .map(d => d.name);
                    if (dirs.length > 0) {
                        detectedVersion = dirs[0];
                        console.log('[Client Update] Detected inner version:', detectedVersion);
                    }
                }
            } catch (e) {
                console.error('[Client Update] Failed to detect version:', e);
            }

            mainWindow?.webContents?.send('client:update:event', { type: 'install-progress', step: 'finalizing', percent: 80 });

            // Atomically replace
            if (fs.existsSync(final)) {
                try {
                    fs.rmSync(final, { recursive: true, force: true });
                } catch (e) {
                    console.error('[Client Update] Failed to remove old version:', e);
                }
            }
            fs.renameSync(tmp, final);

            // Write metadata
            const meta = {
                installed: new Date().toISOString(),
                version,
                detectedVersion
            };
            fs.writeFileSync(path.join(final, 'installed.json'), JSON.stringify(meta, null, 2), 'utf8');
            mainWindow?.webContents?.send('client:update:event', { type: 'install-progress', step: 'complete', percent: 100 });
            mainWindow?.webContents?.send('client:update:event', { type: 'installed', version: detectedVersion });
            return { ok: true, detectedVersion };
        } catch (err) {
            console.error('[Client Update] Install error:', err);
            try { mainWindow?.webContents?.send('client:update:event', { type: 'install-failed', msg: err?.message || String(err) }); } catch (e) { }
            return { ok: false, msg: err?.message || String(err) };
        }
    });

    // Return installed clients from DATA_DIR/clients (installed.json)
    ipcMain.handle('client:installed', async () => {
        try {
            const clientsRoot = path.join(DATA_DIR, 'clients');
            if (!fs.existsSync(clientsRoot)) return { ok: true, clients: [] };
            const entries = fs.readdirSync(clientsRoot, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name);
            const result = [];
            for (const name of entries) {
                const metaPath = path.join(clientsRoot, name, 'installed.json');
                let meta = { version: name };
                try {
                    if (fs.existsSync(metaPath)) meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
                } catch (e) { /* ignore */ }
                result.push({ name, meta });
            }
            return { ok: true, clients: result };
        } catch (err) {
            return { ok: false, msg: err?.message || String(err) };
        }
    });

    // Auto-check schedule: check shortly after startup and then once per day (honors saved setting)
    try {
        const startSettings = loadSettings() || {};
        const shouldAutoCheck = startSettings.autoCheckUpdates !== false; // default true
        if (shouldAutoCheck) {
            setTimeout(() => { autoUpdater.checkForUpdates().catch(() => { }); }, 30 * 1000);
        }
        const AUTO_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
        setInterval(() => {
            try {
                const s = loadSettings() || {};
                if (s.autoCheckUpdates !== false) {
                    autoUpdater.checkForUpdates().catch(() => { });
                }
            } catch (e) { /* ignore */ }
        }, AUTO_CHECK_INTERVAL_MS);
    } catch (e) { /* ignore schedule errors */ }
});

ipcMain.handle('auth:register', (_, payload) => {
    const username = String(payload?.username || '').trim();
    const password = String(payload?.password || '');
    if (username.length < 3) return { ok: false, msg: 'Ник слишком короткий.' };
    if (password.length < 4) return { ok: false, msg: 'Пароль слишком короткий.' };

    const users = loadUsers();
    if (users.some(u => u.username.toLowerCase() === username.toLowerCase())) {
        return { ok: false, msg: 'Ник уже занят.' };
    }

    const pwd = hashPassword(password);
    users.push({ username, ...pwd, createdAt: new Date().toISOString() });
    saveUsers(users);
    return { ok: true, msg: 'Аккаунт создан.' };
});

ipcMain.handle('auth:login', (_, payload) => {
    const username = String(payload?.username || '').trim();
    const password = String(payload?.password || '');
    if (!username || !password) return { ok: false, msg: 'Введите ник и пароль.' };

    const users = loadUsers();
    const user = users.find(u => u.username.toLowerCase() === username.toLowerCase());
    if (!user) return { ok: false, msg: 'Неверный ник или пароль.' };

    if (!verifyPassword(password, user)) {
        return { ok: false, msg: 'Неверный ник или пароль.' };
    }

    return { ok: true, msg: `Добро пожаловать, ${user.username}!`, username: user.username };
});

// Secure token storage using keytar when available, fallback to settings file
ipcMain.handle('auth:saveToken', async (_, token) => {
    try {
        if (hasKeytar) {
            await keytar.setPassword(KEYTAR_SERVICE, KEYTAR_ACCOUNT, token);
            return { ok: true };
        }
        const s = loadSettings() || {};
        s.authToken = token;
        saveSettings(s);
        return { ok: true };
    } catch (e) {
        console.error('auth:saveToken error', e);
        return { ok: false, msg: 'Не удалось сохранить токен.' };
    }
});

ipcMain.handle('auth:getToken', async () => {
    try {
        if (hasKeytar) {
            const t = await keytar.getPassword(KEYTAR_SERVICE, KEYTAR_ACCOUNT);
            return t || null;
        }
        const s = loadSettings() || {};
        return s.authToken || null;
    } catch (e) {
        console.error('auth:getToken error', e);
        return null;
    }
});

ipcMain.handle('auth:deleteToken', async () => {
    try {
        if (hasKeytar) {
            await keytar.deletePassword(KEYTAR_SERVICE, KEYTAR_ACCOUNT);
            return { ok: true };
        }
        const s = loadSettings() || {};
        delete s.authToken;
        saveSettings(s);
        return { ok: true };
    } catch (e) {
        console.error('auth:deleteToken error', e);
        return { ok: false, msg: 'Не удалось удалить токен.' };
    }
});

// DevTools opener (allows renderer to request DevTools be opened when needed)
ipcMain.handle('devtools:open', () => {
    try {
        if (mainWindow && mainWindow.webContents) {
            mainWindow.webContents.openDevTools({ mode: 'undocked' });
            return { ok: true };
        }
        return { ok: false, msg: 'Main window not available' };
    } catch (e) {
        return { ok: false, msg: String(e) };
    }
});

ipcMain.handle('launcher:getSettings', () => {
    return loadSettings();
});

ipcMain.handle('launcher:saveSettings', (_, payload) => {
    const maxRamGb = Number(payload?.maxRamGb ?? 6);
    const gameDir = payload?.gameDir || null;
    const autoCheckUpdates = payload?.autoCheckUpdates !== undefined ? !!payload.autoCheckUpdates : true;
    const authStaySignedIn = payload?.authStaySignedIn !== undefined ? !!payload.authStaySignedIn : undefined;
    if (!Number.isFinite(maxRamGb)) {
        return { ok: false, msg: 'Некорректное значение RAM.' };
    }
    if (maxRamGb < 2 || maxRamGb > 64) {
        return { ok: false, msg: 'RAM должно быть от 2 до 64 ГБ.' };
    }
    const current = loadSettings() || {};
    current.maxRamGb = maxRamGb;
    current.gameDir = gameDir;
    current.autoCheckUpdates = autoCheckUpdates;
    if (authStaySignedIn !== undefined) current.authStaySignedIn = authStaySignedIn;
    saveSettings(current);
    return { ok: true, msg: 'Сохранено.' };
});

ipcMain.handle('launcher:getSystemRAM', () => {
    const totalBytes = os.totalmem();
    const totalGB = Math.floor(totalBytes / (1024 ** 3));
    return totalGB;
});

ipcMain.handle('launcher:selectDirectory', async () => {
    const result = await dialog.showOpenDialog({
        properties: ['openDirectory']
    });
    return result.filePaths[0] || null;
});

ipcMain.handle('launcher:launch', (_, payload) => {
    const { versionJsonPath, versionJarPath } = resolveVersionFiles();
    if (!fs.existsSync(versionJsonPath)) {
        return { ok: false, msg: 'Не найден файл версии StratCraft 1.24.1.json.' };
    }
    if (!fs.existsSync(versionJarPath)) {
        return { ok: false, msg: 'Не найден файл StratCraft 1.24.1.jar.' };
    }
    const version = readJson(versionJsonPath);
    if (!version) {
        return { ok: false, msg: 'Не удалось прочитать файл версии.' };
    }

    const settings = loadSettings();
    const minRamGb = Number(settings.minRamGb ?? 2);
    const maxRamGb = Number(settings.maxRamGb ?? 6);
    const javaCmd = resolveJavaCommand();
    const username = String(payload?.username || '').trim() || 'Player';
    const uuid = offlineUuid(username);
    const mcDir = fs.existsSync(GAME_DIR) ? GAME_DIR : DEFAULT_MC_DIR;
    const assetsIndex = version.assets || version.assetIndex?.id || 'legacy';
    const assetsIndexPath = path.join(mcDir, 'assets', 'indexes', `${assetsIndex}.json`);
    if (!fs.existsSync(assetsIndexPath)) {
        return { ok: false, msg: 'Не найден индекс ассетов. Добавьте папку assets в Minecraft.' };
    }
    const classpathSeparator = isWindows() ? ';' : ':';
    const { classpath, missing } = buildClasspath(version, versionJarPath, mcDir);
    if (missing.length > 0) {
        return { ok: false, msg: `Не найдены библиотеки (${missing.length}). Добавьте libraries в Minecraft.` };
    }
    const vars = {
        auth_player_name: username,
        version_name: version.id || VERSION_ID,
        game_directory: INSTANCE_DIR,
        assets_root: path.join(mcDir, 'assets'),
        assets_index_name: assetsIndex,
        auth_uuid: uuid,
        auth_access_token: '0',
        clientid: '0',
        auth_xuid: '0',
        user_type: 'mojang',
        version_type: version.type || 'release',
        natives_directory: path.join(INSTANCE_DIR, 'natives'),
        classpath: classpath.join(classpathSeparator),
        classpath_separator: classpathSeparator,
        library_directory: path.join(mcDir, 'libraries'),
        launcher_name: 'StratCraftLauncher',
        launcher_version: app.getVersion()
    };

    const jvmArgs = substituteArgs(flattenArgs(version?.arguments?.jvm), vars);
    const gameArgs = substituteArgs(flattenArgs(version?.arguments?.game), vars);
    const serverAddress = String(payload?.serverAddress || '').trim();
    if (serverAddress) {
        gameArgs.push('--quickPlayMultiplayer', serverAddress);
    }
    const args = [
        `-Xms${minRamGb}G`,
        `-Xmx${maxRamGb}G`,
        ...jvmArgs,
        '-Djava.library.path=' + path.join(INSTANCE_DIR, 'natives'),
        version.mainClass,
        ...gameArgs
    ];

    try {
        const child = spawn(javaCmd, args, {
            cwd: INSTANCE_DIR,
            detached: true,
            stdio: 'ignore',
            windowsHide: true
        });
        child.unref();
        return { ok: true, msg: 'Игра запускается.' };
    } catch (err) {
        return { ok: false, msg: `Ошибка запуска: ${err.message}` };
    }
});

ipcMain.handle('client:assemble', async (_, opts) => {
    // Assemble client from a local Minecraft directory. opts: { mcDir, versionPattern }
    const mcDir = String(opts?.mcDir || path.join(app.getPath('appData'), '.minecraft'));
    const versionPattern = String(opts?.versionPattern || '1.20.1.*forge.*47.4.16');
    const script = path.join(__dirname, 'StratCraftClient', 'assemble-from-local.js');
    if (!fs.existsSync(script)) return { ok: false, msg: 'assemble script not found' };
    try {
        const res = spawn(process.execPath, [script, mcDir, versionPattern], { cwd: __dirname, stdio: 'inherit' });
        return await new Promise((resolve) => {
            res.on('close', (code) => {
                if (code === 0) resolve({ ok: true, msg: 'Assembled client' });
                else resolve({ ok: false, msg: `assemble script exited ${code}` });
            });
        });
    } catch (err) {
        return { ok: false, msg: String(err) };
    }
});

ipcMain.handle('client:list', async () => {
    const root = path.join(USER_DATA_DIR, 'StratCraftClient', 'client-files');
    if (!fs.existsSync(root)) return { ok: true, versions: [] };
    const entries = fs.readdirSync(root, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name);
    return { ok: true, versions: entries };
});

ipcMain.handle('client:launch', async (_, payload) => {
    const versionId = String(payload?.version || '').trim();
    if (!versionId) return { ok: false, msg: 'Version not specified' };

    // Try multiple locations/fallbacks for assembled client:
    // 1) Built-in assembled copy under StratCraftClient/client-files/<version>
    // 2) Installed clients under DATA_DIR/clients/<version>
    // 3) Attempt to download & install client release from GitHub
    let assembledRoot = path.join(USER_DATA_DIR, 'StratCraftClient', 'client-files', versionId);
    let versionJsonPath = path.join(assembledRoot, 'versions', versionId, `${versionId}.json`);
    let versionJarPath = path.join(assembledRoot, 'versions', versionId, `${versionId}.jar`);
    let actualVersionId = versionId;

    const installedCandidate = path.join(DATA_DIR, 'clients', versionId);

    // Helper function to find version files in a directory
    const findVersionFiles = (rootDir) => {
        try {
            const versionsDir = path.join(rootDir, 'versions');
            if (fs.existsSync(versionsDir)) {
                const dirs = fs.readdirSync(versionsDir, { withFileTypes: true })
                    .filter(d => d.isDirectory())
                    .map(d => d.name);
                for (const innerVer of dirs) {
                    const candJson = path.join(versionsDir, innerVer, `${innerVer}.json`);
                    const candJar = path.join(versionsDir, innerVer, `${innerVer}.jar`);
                    if (fs.existsSync(candJson) && fs.existsSync(candJar)) {
                        return { json: candJson, jar: candJar, id: innerVer };
                    }
                }
            }
        } catch (e) {
            console.error('[Client Launch] Error finding version files:', e);
        }
        return null;
    };

    // If not present in built-in path, check installed clients
    if (!fs.existsSync(versionJsonPath) || !fs.existsSync(versionJarPath)) {
        if (fs.existsSync(installedCandidate)) {
            const found = findVersionFiles(installedCandidate);
            if (found) {
                assembledRoot = installedCandidate;
                versionJsonPath = found.json;
                versionJarPath = found.jar;
                actualVersionId = found.id;
                console.log('[Client Launch] Using installed version:', actualVersionId);
            }
        }
    }

    // If still not found, try built-in path again with version detection
    if (!fs.existsSync(versionJsonPath) || !fs.existsSync(versionJarPath)) {
        if (fs.existsSync(assembledRoot)) {
            const found = findVersionFiles(assembledRoot);
            if (found) {
                versionJsonPath = found.json;
                versionJarPath = found.jar;
                actualVersionId = found.id;
                console.log('[Client Launch] Using built-in version:', actualVersionId);
            }
        }
    }

    // If still missing, try to download the client release (latest release manifest)
    if (!fs.existsSync(versionJsonPath) || !fs.existsSync(versionJarPath)) {
        try {
            console.log('[Client Launch] Attempting to download client release...');
            const { manifest } = await fetchLatestClientManifest();
            if (manifest?.archive?.url) {
                const fileName = path.basename(new URL(manifest.archive.url).pathname);
                const downloadsDir = path.join(DATA_DIR, 'downloads');
                if (!fs.existsSync(downloadsDir)) fs.mkdirSync(downloadsDir, { recursive: true });
                const dest = path.join(downloadsDir, fileName);
                await downloadFile(manifest.archive.url, dest, (p) => { });

                // Install to DATA_DIR/clients/<manifest.version>
                const clientsRoot = path.join(DATA_DIR, 'clients');
                if (!fs.existsSync(clientsRoot)) fs.mkdirSync(clientsRoot, { recursive: true });
                const tmp = path.join(clientsRoot, `${manifest.version}.tmp`);
                const final = path.join(clientsRoot, manifest.version);

                try { if (fs.existsSync(tmp)) fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) { }
                await extractZip(dest, tmp);
                if (fs.existsSync(final)) fs.rmSync(final, { recursive: true, force: true });
                fs.renameSync(tmp, final);
                fs.writeFileSync(path.join(final, 'installed.json'), JSON.stringify({ installed: new Date().toISOString(), version: manifest.version }, null, 2), 'utf8');

                assembledRoot = final;
                const found = findVersionFiles(final);
                if (found) {
                    versionJsonPath = found.json;
                    versionJarPath = found.jar;
                    actualVersionId = found.id;
                    console.log('[Client Launch] Downloaded and installed version:', actualVersionId);
                } else {
                    return { ok: false, msg: 'Downloaded client но не удалось найти файлы версии' };
                }
            }
        } catch (err) {
            console.error('[Client Launch] Download error:', err);
            /* ignore download failures */
        }
    }

    if (!fs.existsSync(versionJsonPath) || !fs.existsSync(versionJarPath)) {
        return { ok: false, msg: 'Файлы собранного клиента не найдены. Пожалуйста, убедитесь, что релиз клиента доступен в GitHub Releases.' };
    }

    const version = readJson(versionJsonPath);
    if (!version) return { ok: false, msg: 'Failed to read version json' };

    const settings = loadSettings();
    const minRamGb = Number(settings.minRamGb ?? 2);
    const maxRamGb = Number(settings.maxRamGb ?? 6);
    const javaCmd = resolveJavaCommand();

    const username = String(payload?.username || 'Player');
    const uuid = String(payload?.uuid || offlineUuid(username));
    const accessToken = String(payload?.accessToken || '0');

    const mcDir = assembledRoot; // treat assembled root as mc directory

    const assetsIndex = version.assets || version.assetIndex?.id || 'legacy';
    const assetsIndexPath = path.join(mcDir, 'assets', 'indexes', `${assetsIndex}.json`);
    if (!fs.existsSync(assetsIndexPath)) {
        return { ok: false, msg: 'Assets index not found in assembled client.' };
    }

    const classpathSeparator = isWindows() ? ';' : ':';
    const { classpath, missing } = buildClasspath(version, versionJarPath, mcDir);
    if (missing.length > 0) return { ok: false, msg: `Missing libraries: ${missing.join(', ')}` };

    const instanceDir = path.join(USER_DATA_DIR, 'StratCraftClient', 'instances', actualVersionId);
    const nativesDir = path.join(instanceDir, 'natives');

    const vars = {
        auth_player_name: username,
        version_name: version.id || actualVersionId,
        game_directory: instanceDir,
        assets_root: path.join(mcDir, 'assets'),
        assets_index_name: assetsIndex,
        auth_uuid: uuid,
        auth_access_token: accessToken,
        clientid: '0',
        auth_xuid: '0',
        user_type: 'mojang',
        version_type: version.type || 'release',
        natives_directory: nativesDir,
        classpath: classpath.join(classpathSeparator),
        classpath_separator: classpathSeparator,
        library_directory: path.join(mcDir, 'libraries'),
        launcher_name: 'StratCraftLauncher',
        launcher_version: app.getVersion()
    };

    const jvmArgs = substituteArgs(flattenArgs(version?.arguments?.jvm), vars);
    const gameArgs = substituteArgs(flattenArgs(version?.arguments?.game), vars);
    const serverAddress = String(payload?.serverAddress || '').trim();
    if (serverAddress) gameArgs.push('--quickPlayMultiplayer', serverAddress);

    const args = [
        `-Xms${minRamGb}G`,
        `-Xmx${maxRamGb}G`,
        ...jvmArgs,
        '-Djava.library.path=' + nativesDir,
        version.mainClass,
        ...gameArgs
    ];

    // Ensure instance dir exists
    try {
        if (!fs.existsSync(instanceDir)) fs.mkdirSync(instanceDir, { recursive: true });
        if (!fs.existsSync(nativesDir)) fs.mkdirSync(nativesDir, { recursive: true });
    } catch (e) {
        console.error('[Client Launch] Failed to create instance directories:', e);
    }

    try {
        const child = spawn(javaCmd, args, {
            cwd: instanceDir,
            detached: false, // Keep attached to monitor process
            stdio: 'ignore',
            windowsHide: true
        });

        // Hide launcher window when client starts
        if (mainWindow) {
            mainWindow.hide();
            console.log('[Client Launch] Launcher window hidden');
        }

        // Monitor client process and restore launcher when it exits
        child.on('exit', (code, signal) => {
            console.log(`[Client Launch] Client exited with code ${code}, signal ${signal}`);
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.show();
                mainWindow.focus();
                console.log('[Client Launch] Launcher window restored');
            }
        });

        child.on('error', (err) => {
            console.error('[Client Launch] Client process error:', err);
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.show();
                mainWindow.focus();
            }
        });

        return { ok: true, msg: 'Client launching.' };
    } catch (err) {
        console.error('[Client Launch] Spawn error:', err);
        return { ok: false, msg: `Launch error: ${err.message}` };
    }
});

ipcMain.handle('server:status', async () => {
    const port = readServerPort();
    try {
        const status = await pingServer(SERVER_HOST, port);
        const players = status?.players || {};
        return {
            ok: true,
            online: true,
            host: SERVER_HOST,
            port,
            localAddress: null,
            playersOnline: players.online ?? 0,
            playersMax: players.max ?? 0
        };
    } catch {
        try {
            const fallbackHosts = ['127.0.0.1', ...getLocalIps()];
            for (const host of fallbackHosts) {
                const status = await pingServer(host, port);
                const players = status?.players || {};
                return {
                    ok: true,
                    online: true,
                    host: SERVER_HOST,
                    port,
                    localAddress: host,
                    playersOnline: players.online ?? 0,
                    playersMax: players.max ?? 0
                };
            }
        } catch { }
        return {
            ok: true,
            online: false,
            host: SERVER_HOST,
            port,
            localAddress: null,
            playersOnline: 0,
            playersMax: 0
        };
    }
});
