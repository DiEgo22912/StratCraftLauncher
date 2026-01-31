const { app, BrowserWindow, ipcMain, Menu, dialog, Notification } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { spawn } = require('child_process');
const net = require('net');
const os = require('os');
const { autoUpdater } = require('electron-updater');

let mainWindow = null;

const DATA_DIR = path.join(__dirname, 'data');
const USERS_PATH = path.join(DATA_DIR, 'users.json');
const SETTINGS_PATH = path.join(DATA_DIR, 'launcher-settings.json');
const GAME_DIR = path.join(__dirname, 'StratCraftClient');
const INSTANCE_DIR = GAME_DIR;
const INSTANCE_JAR = path.join(GAME_DIR, 'StratCraft 1.24.1.jar');
const INSTANCE_JSON = path.join(GAME_DIR, 'StratCraft 1.24.1.json');
const DEFAULT_MC_DIR = path.join(app.getPath('appData'), '.minecraft');
const VERSION_ID = 'StratCraft 1.24.1';
const SERVER_HOST = 'wad-sb.gl.joinmc.link';
const SERVER_PROPERTIES = path.join(__dirname, '..', 'server.properties');
const DEFAULT_PORT = 25565;

function ensureDataFiles() {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(USERS_PATH)) fs.writeFileSync(USERS_PATH, JSON.stringify([]), 'utf8');
    if (!fs.existsSync(SETTINGS_PATH)) {
        fs.writeFileSync(SETTINGS_PATH, JSON.stringify({ maxRamGb: 6 }, null, 2), 'utf8');
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

        const onError = (err) => {
            socket.destroy();
            reject(err);
        };

        socket.setTimeout(timeoutMs, () => onError(new Error('timeout')));
        socket.once('error', onError);

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
            socket.end();
            try {
                resolve(JSON.parse(jsonStr));
            } catch (err) {
                reject(err);
            }
        });
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

app.whenReady().then(() => {
    ensureDataFiles();
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

ipcMain.handle('launcher:getSettings', () => {
    return loadSettings();
});

ipcMain.handle('launcher:saveSettings', (_, payload) => {
    const maxRamGb = Number(payload?.maxRamGb ?? 6);
    const gameDir = payload?.gameDir || null;
    const autoCheckUpdates = payload?.autoCheckUpdates !== undefined ? !!payload.autoCheckUpdates : true;
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
    const root = path.join(__dirname, 'StratCraftClient', 'client-files');
    if (!fs.existsSync(root)) return { ok: true, versions: [] };
    const entries = fs.readdirSync(root, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name);
    return { ok: true, versions: entries };
});

ipcMain.handle('client:launch', async (_, payload) => {
    const versionId = String(payload?.version || '').trim();
    if (!versionId) return { ok: false, msg: 'Version not specified' };
    const assembledRoot = path.join(__dirname, 'StratCraftClient', 'client-files', versionId);
    const versionJsonPath = path.join(assembledRoot, 'versions', versionId, `${versionId}.json`);
    const versionJarPath = path.join(assembledRoot, 'versions', versionId, `${versionId}.jar`);
    if (!fs.existsSync(versionJsonPath) || !fs.existsSync(versionJarPath)) {
        return { ok: false, msg: 'Assembled client files not found. Please run assemble first.' };
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

    const vars = {
        auth_player_name: username,
        version_name: version.id || versionId,
        game_directory: path.join(__dirname, 'StratCraftClient', 'instances', versionId),
        assets_root: path.join(mcDir, 'assets'),
        assets_index_name: assetsIndex,
        auth_uuid: uuid,
        auth_access_token: accessToken,
        clientid: '0',
        auth_xuid: '0',
        user_type: 'mojang',
        version_type: version.type || 'release',
        natives_directory: path.join(__dirname, 'StratCraftClient', 'instances', versionId, 'natives'),
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
        '-Djava.library.path=' + vars.natives_directory,
        version.mainClass,
        ...gameArgs
    ];

    // Ensure instance dir exists
    const instanceDir = vars.game_directory;
    try {
        if (!fs.existsSync(instanceDir)) fs.mkdirSync(instanceDir, { recursive: true });
    } catch (e) { /* ignore */ }

    try {
        const child = spawn(javaCmd, args, {
            cwd: instanceDir,
            detached: true,
            stdio: 'ignore',
            windowsHide: true
        });
        child.unref();
        return { ok: true, msg: 'Client launching.' };
    } catch (err) {
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
