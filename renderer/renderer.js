const status = document.getElementById('status');
const username = document.getElementById('username');
const password = document.getElementById('password');
const rememberMe = document.getElementById('rememberMe');
const staySignedIn = document.getElementById('staySignedIn');
const registerModal = document.getElementById('registerModal');
const regUsername = document.getElementById('regUsername');
const regPassword = document.getElementById('regPassword');
const regPassword2 = document.getElementById('regPassword2');
const registerStatus = document.getElementById('registerStatus');
const authView = document.getElementById('authView');
const mainView = document.getElementById('mainView');
const transition = document.getElementById('transition');
const header = document.getElementById('mainHeader');
const appTitle = document.getElementById('appTitle');
const mainActions = document.querySelector('.main-actions');
const profileBtn = document.getElementById('profileBtn');
const profileDrawer = document.getElementById('profileDrawer');
const profileName = document.getElementById('profileName');
const logoutBtn = document.getElementById('logoutBtn');
const container = document.querySelector('.container');
const mainStatus = document.getElementById('mainStatus');
const launchBtn = document.getElementById('launchBtn');
const settingsBtn = document.getElementById('settingsBtn');
// download modal removed — controls handled automatically
const settingsModal = document.getElementById('settingsModal');
const maxRam = document.getElementById('maxRam');
const ramInput = document.getElementById('ramInput');
const systemRam = document.getElementById('systemRam');

const saveSettingsBtn = document.getElementById('saveSettingsBtn');
const cancelSettingsBtn = document.getElementById('cancelSettingsBtn');
const checkUpdatesBtn = document.getElementById('checkUpdatesBtn');
const updateStatus = document.getElementById('updateStatus');
const updateProgress = document.getElementById('updateProgress');
const updateEta = document.getElementById('updateEta');
const autoCheckUpdatesCheckbox = document.getElementById('autoCheckUpdates');
const serverDot = document.getElementById('serverDot');
const playAux = document.getElementById('playAux');
let checkReleaseBtn = null;

// Track operation state to prevent double-clicks
let isOperationInProgress = false;

function setButtonsDisabled(disabled) {
    if (launchBtn) {
        launchBtn.disabled = disabled;
        if (disabled) {
            launchBtn.classList.add('disabled');
        } else {
            launchBtn.classList.remove('disabled');
        }
    }
    if (checkReleaseBtn) {
        checkReleaseBtn.disabled = disabled;
        if (disabled) {
            checkReleaseBtn.classList.add('disabled');
        } else {
            checkReleaseBtn.classList.remove('disabled');
        }
    }
}

function showCheckReleaseButton() {
    if (!playAux) return;
    if (checkReleaseBtn) return; // already shown
    checkReleaseBtn = document.createElement('button');
    checkReleaseBtn.className = 'btn ghost';
    checkReleaseBtn.textContent = 'Проверить релиз';
    if (isOperationInProgress) {
        checkReleaseBtn.disabled = true;
        checkReleaseBtn.classList.add('disabled');
    }
    checkReleaseBtn.addEventListener('click', async () => {
        if (isOperationInProgress) return;
        isOperationInProgress = true;
        setButtonsDisabled(true);
        setMainStatus('Проверка релиза…', true);
        try {
            const res = await window.clientUpdate.check();
            if (res?.ok && res.manifest) {
                setMainStatus('Релиз найден. Нажмите Обновить.', true);
                setLaunchButtonToUpdate(res.manifest);
            } else if (res?.ok && !res.manifest) {
                setMainStatus('Релиз не содержит манифеста client-manifest.json.', false);
            } else {
                setMainStatus(`Ошибка проверки релиза: ${res?.msg || 'неизвестно'}`, false);
            }
        } catch (e) {
            setMainStatus(`Ошибка проверки релиза: ${e?.message || e}`, false);
        } finally {
            isOperationInProgress = false;
            setButtonsDisabled(false);
        }
    });
    playAux.appendChild(checkReleaseBtn);
}

function hideCheckReleaseButton() {
    if (!playAux || !checkReleaseBtn) return;
    try { playAux.removeChild(checkReleaseBtn); } catch (e) { }
    checkReleaseBtn = null;
}

// Launcher update modal elements
const launcherUpdateModal = document.getElementById('launcherUpdateModal');
const launcherInstallBtn = document.getElementById('launcherInstallBtn');
const launcherCloseBtn = document.getElementById('launcherCloseBtn');
const launcherUpdateVersion = document.getElementById('launcherUpdateVersion');
const launcherUpdateStatusEl = document.getElementById('launcherUpdateStatus');

let _launcherUpdateState = 'idle'; // idle | downloading | downloaded

function showLauncherUpdateModal(version, msg) {
    if (!launcherUpdateModal) return;
    if (launcherUpdateVersion) launcherUpdateVersion.textContent = version || '—';
    if (launcherUpdateStatusEl) launcherUpdateStatusEl.textContent = msg || 'Доступно новое обновление лаунчера.';
    try { launcherUpdateModal.classList.remove('hidden'); setTimeout(() => launcherUpdateModal.classList.add('show'), 10); } catch (e) { }
}

function hideLauncherUpdateModal() {
    if (!launcherUpdateModal) return;
    try { launcherUpdateModal.classList.remove('show'); setTimeout(() => launcherUpdateModal.classList.add('hidden'), 160); } catch (e) { }
}

async function checkLauncherUpdateAndShowModal() {
    if (!window.updates?.check) return;
    try {
        // Trigger check; 'available' event will be emitted if update exists
        await window.updates.check();
    } catch (e) {
        // ignore
    }
}

// Modal button handlers
if (launcherInstallBtn) {
    launcherInstallBtn.addEventListener('click', async () => {
        try {
            if (_launcherUpdateState === 'downloaded') {
                try { window.updates.install(); } catch (e) { showLauncherUpdateModal(launcherUpdateVersion?.textContent, `Ошибка установки: ${e?.message || e}`); }
                return;
            }
            _launcherUpdateState = 'downloading';
            if (launcherInstallBtn) launcherInstallBtn.textContent = 'Загрузка...';
            await window.updates.download();
        } catch (e) {
            _launcherUpdateState = 'idle';
            if (launcherInstallBtn) launcherInstallBtn.textContent = 'Установить обновление';
            showLauncherUpdateModal(launcherUpdateVersion?.textContent, `Ошибка загрузки: ${e?.message || e}`);
        }
    });
}
if (launcherCloseBtn) {
    launcherCloseBtn.addEventListener('click', () => hideLauncherUpdateModal());
}
const serverState = document.getElementById('serverState');
const serverPlayers = document.getElementById('serverPlayers');
const authServerDot = document.getElementById('authServerDot');
const authServerState = document.getElementById('authServerState');
const authServerPlayers = document.getElementById('authServerPlayers');
let serverPollId = null;
let serverHost = 'stratcraft-server.ddns.net';
let serverPort = null;
let localAddress = null;

function setStatus(text, ok = true) {
    status.textContent = text;
    status.style.color = ok ? '#9aa4b2' : '#ff7b7b';
}

function setMainStatus(text, ok = true) {
    if (!mainStatus) return;
    mainStatus.textContent = text;
    mainStatus.style.color = ok ? '#9aa4b2' : '#ff7b7b';
}

// Синхронизация ползунка и ввода RAM
function updateRamSettings() {
    const maxVal = parseInt(maxRam.value);
    const inputVal = parseInt(ramInput.value);

    // Синхронизация с ползунком
    if (document.activeElement === maxRam) {
        ramInput.value = maxVal;
    } else if (document.activeElement === ramInput) {
        if (inputVal >= 2 && inputVal <= parseInt(maxRam.max)) {
            maxRam.value = inputVal;
        }
    }
}

maxRam.addEventListener('input', updateRamSettings);
ramInput.addEventListener('input', updateRamSettings);

async function loadSettings() {
    if (!window.launcher?.getSettings) return;

    // Получаем системную RAM
    const totalRAM = await window.launcher.getSystemRAM();
    systemRam.textContent = totalRAM;
    maxRam.max = totalRAM;

    const settings = await window.launcher.getSettings();
    const maxVal = Math.min(settings?.maxRamGb ?? 6, totalRAM);
    maxRam.value = String(maxVal);
    ramInput.value = String(maxVal);

    // auth UI: restore staySignedIn setting
    try {
        if (typeof staySignedIn !== 'undefined' && staySignedIn !== null) {
            staySignedIn.checked = !!settings?.authStaySignedIn;
        }
    } catch (e) { }

    if (autoCheckUpdatesCheckbox) {
        autoCheckUpdatesCheckbox.checked = settings?.autoCheckUpdates !== false;
    }
    if (updateProgress) {
        updateProgress.style.display = 'none';
        updateProgress.value = 0;
    }

    // Attempt to restore session if user chose to stay signed in
    try {
        // Prevent recursion: only attempt restore if mainView is hidden (we're still on auth screen)
        if (settings?.authStaySignedIn && mainView && mainView.classList.contains('hidden')) {
            const token = await window.auth.getToken();
            if (token) {
                // verify token and restore session
                const apiUrl = window.auth.getApiUrl?.();
                if (apiUrl) {
                    const res = await fetch(`${apiUrl}/api/me`, { headers: { Authorization: `Bearer ${token}` } });
                    const json = await res.json();
                    if (json?.ok && json.username) {
                        // show logged-in UI
                        playTransition(json.username);
                        setStatus(`Восстановлен сеанс: ${json.username}`, true);
                    }
                }
            }
        }
    } catch (e) {
        console.error('restore session error', e);
    }
}

async function saveStaySignedInPreference(value, options = {}) {
    const { clearTokenIfFalse = false } = options;
    try {
        const current = await window.launcher.getSettings();
        await window.launcher.saveSettings({ ...(current || {}), authStaySignedIn: !!value });
    } catch (e) {
        console.warn('Failed to save authStaySignedIn setting', e);
    }
    if (!value && clearTokenIfFalse) {
        try { window.auth?.deleteToken?.(); } catch (e) { }
    }
}

async function login() {
    const res = await window.auth.login({
        username: username.value.trim(),
        password: password.value
    });
    setStatus(res.msg, res.ok);
    if (res.ok) {
        if (rememberMe.checked) {
            localStorage.setItem('launcherUser', res.username || username.value.trim());
        } else {
            localStorage.removeItem('launcherUser');
        }
        // persist stay-signed-in preference in launcher settings
        await saveStaySignedInPreference(!!staySignedIn?.checked);
        // Persist token only if user elected to stay signed in; otherwise ensure any stored token is removed
        try {
            if (staySignedIn?.checked && res?.token) {
                await window.auth.saveToken(res.token);
            } else {
                // ensure we don't keep token around
                await window.auth.deleteToken();
            }
        } catch (e) { console.warn('Token persistence change failed', e); }
        playTransition(res.username || username.value.trim());
    }
}

// playTransition is implemented later to perform a non-blocking UI reveal on login

async function refreshServerStatus() {
    if (!window.launcher?.getServerStatus) return;
    const res = await window.launcher.getServerStatus();
    if (!serverDot || !serverState || !serverPlayers) return;
    if (res?.host) serverHost = res.host;
    if (res?.port) serverPort = res.port;
    if (res?.localAddress) localAddress = res.localAddress;
    if (res?.online) {
        serverDot.classList.add('online');
        serverState.textContent = 'Онлайн';
        serverPlayers.textContent = `${res.playersOnline}/${res.playersMax}`;
        if (authServerDot) {
            authServerDot.classList.add('online');
            authServerState.textContent = 'Онлайн';
            authServerPlayers.textContent = `${res.playersOnline}/${res.playersMax}`;
        }
    } else {
        serverDot.classList.remove('online');
        serverState.textContent = 'Оффлайн';
        serverPlayers.textContent = '0/0';
        if (authServerDot) {
            authServerDot.classList.remove('online');
            authServerState.textContent = 'Оффлайн';
            authServerPlayers.textContent = '0/0';
        }
    }
}

function startServerPolling() {
    if (serverPollId) return;
    refreshServerStatus();
    serverPollId = setInterval(() => {
        refreshServerStatus();
    }, 5000);
}

function stopServerPolling() {
    if (serverPollId) {
        clearInterval(serverPollId);
        serverPollId = null;
    }
}

async function register() {
    const user = regUsername.value.trim();
    const pass = regPassword.value;
    const pass2 = regPassword2.value;
    if (!user || !pass) {
        registerStatus.textContent = 'Введите ник и пароль.';
        registerStatus.style.color = '#ff7b7b';
        registerStatus.classList.remove('success');
        return;
    }
    if (pass !== pass2) {
        registerStatus.textContent = 'Пароли не совпадают.';
        registerStatus.style.color = '#ff7b7b';
        registerStatus.classList.remove('success');
        return;
    }

    // Visual feedback
    registerStatus.textContent = 'Создаём аккаунт...';
    registerStatus.style.color = '#9aa4b2';
    registerStatus.classList.remove('success');
    const btn = document.getElementById('registerConfirmBtn');
    if (btn) btn.disabled = true;

    try {
        const res = await window.auth.register({ username: user, password: pass });
        console.log('register() response:', res);
        registerStatus.textContent = res?.msg || 'Неизвестный ответ.';
        registerStatus.style.color = res?.ok ? '#7ddc8a' : '#ff7b7b';
        registerStatus.classList.toggle('success', !!res?.ok);
        if (res?.ok) {
            // Close modal and attempt auto-login (remote will provide token, local fallback logs in locally)
            registerModal.classList.add('pulse');
            setTimeout(async () => {
                registerModal.classList.remove('pulse');
                registerModal.classList.add('hidden');
                registerModal.classList.remove('show');
                username.value = user;
                password.value = '';
                setStatus('Аккаунт создан. Выполняем вход…', true);
                try {
                    const loginRes = await window.auth.login({ username: user, password: pass });
                    console.log('auto-login after register:', loginRes);
                    if (loginRes?.ok) {
                        // show logged-in UI
                        playTransition(loginRes.username || user);
                        setStatus(`Добро пожаловать, ${loginRes.username || user}!`, true);
                    } else {
                        setStatus(loginRes?.msg || 'Не удалось войти автоматически.', false);
                    }
                } catch (e) {
                    console.error('auto-login error', e);
                    setStatus('Ошибка при автоматическом входе.', false);
                }
            }, 450);
        }
    } catch (e) {
        console.error('register() error', e);
        registerStatus.textContent = `Ошибка: ${e?.message || e}`;
        registerStatus.style.color = '#ff7b7b';
        registerStatus.classList.remove('success');
    } finally {
        if (btn) btn.disabled = false;
    }
}

document.getElementById('loginBtn').addEventListener('click', login);
document.getElementById('registerBtn').addEventListener('click', () => {
    registerModal.classList.remove('hidden');
    requestAnimationFrame(() => registerModal.classList.add('show'));
    registerStatus.textContent = '';
    registerStatus.style.color = '#9aa4b2';
    registerStatus.classList.remove('success');
    regUsername.value = '';
    regPassword.value = '';
    regPassword2.value = '';
    regUsername.focus();
});
document.getElementById('registerConfirmBtn').addEventListener('click', register);
document.getElementById('registerCancelBtn').addEventListener('click', () => {
    registerModal.classList.remove('show');
    setTimeout(() => registerModal.classList.add('hidden'), 160);
});

password.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') login();
});

regPassword2.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') register();
});

// Global shortcut to open DevTools: Ctrl+Shift+I (or Cmd+Opt+I on mac)
document.addEventListener('keydown', (e) => {
    const isMac = navigator.platform.toLowerCase().includes('mac');
    const openHotkey = isMac ? (e.metaKey && e.altKey && (e.key === 'I' || e.key === 'i')) : (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'i'));
    if (openHotkey) {
        try {
            if (window.devtools && window.devtools.open) {
                window.devtools.open();
            } else {
                console.warn('DevTools API not available');
            }
        } catch (err) {
            console.error('Failed to open DevTools', err);
        }
    }
});

profileBtn.addEventListener('click', () => {
    profileDrawer.classList.remove('hidden');
    requestAnimationFrame(() => profileDrawer.classList.add('show'));
});

profileDrawer.addEventListener('click', (e) => {
    if (e.target === profileDrawer) {
        profileDrawer.classList.remove('show');
        setTimeout(() => profileDrawer.classList.add('hidden'), 200);
    }
});
// --- Auth check helper
async function checkAuth() {
    const statusEl = document.getElementById('authCheckStatus');
    try {
        const token = await window.auth.getToken();
        // If no token but there is a username in profile, assume local auth
        const currentUser = profileName?.textContent && profileName.textContent !== '—' ? profileName.textContent : null;
        if (!token) {
            if (currentUser) {
                statusEl.textContent = `Локальная авторизация: ${currentUser}`;
                statusEl.style.color = '#7ddc8a';
                return;
            }
            statusEl.textContent = 'Токен не найден. Выполните вход.';
            statusEl.style.color = '#ff7b7b';
            return;
        }
        const apiUrl = window.auth.getApiUrl?.();
        if (!apiUrl) {
            statusEl.textContent = 'Remote API URL не настроен.';
            statusEl.style.color = '#ff7b7b';
            return;
        }
        statusEl.textContent = 'Проверка авторизации…';
        statusEl.style.color = '#9aa4b2';
        const res = await fetch(`${apiUrl}/api/me`, { headers: { Authorization: `Bearer ${token}` } });
        const json = await res.json();
        console.log('checkAuth result', json);
        if (json?.ok) {
            statusEl.textContent = `Авторизован: ${json.username}`;
            statusEl.style.color = '#7ddc8a';
        } else {
            statusEl.textContent = `Не авторизован: ${json?.msg || res.status}`;
            statusEl.style.color = '#ff7b7b';
        }
    } catch (e) {
        console.error('checkAuth error', e);
        statusEl.textContent = `Ошибка проверки: ${e?.message || e}`;
        statusEl.style.color = '#ff7b7b';
    }
}

// Wire profile buttons
const checkAuthBtn = document.getElementById('checkAuthBtn');
const authCheckStatus = document.getElementById('authCheckStatus');
if (checkAuthBtn) checkAuthBtn.addEventListener('click', checkAuth);
if (logoutBtn) logoutBtn.addEventListener('click', () => {
    // clear saved token and show auth view
    // delete token (keytar or settings) and update UI
    (async () => {
        try { await window.auth.deleteToken(); } catch (e) { /* ignore */ }
        try { const cur = await window.launcher.getSettings(); await window.launcher.saveSettings({ ...(cur || {}), authToken: null, authStaySignedIn: false }); } catch (e) { /* ignore */ }
    })();
    profileDrawer.classList.remove('show');
    setTimeout(() => profileDrawer.classList.add('hidden'), 160);
    authView.classList.remove('hidden');
    mainView.classList.add('hidden');
    profileBtn.classList.add('hidden');
    setStatus('Выход выполнен.', true);
});
logoutBtn.addEventListener('click', () => {
    profileDrawer.classList.remove('show');
    setTimeout(() => profileDrawer.classList.add('hidden'), 200);
    stopServerPolling();
    // persist username on logout if remember checked
    try {
        if (rememberMe.checked && username.value.trim()) localStorage.setItem('launcherUser', username.value.trim());
        else localStorage.removeItem('launcherUser');
    } catch (e) { }
    (async () => {
        try { await window.auth.deleteToken(); } catch (e) { }
        try { const cur = await window.launcher.getSettings(); await window.launcher.saveSettings({ ...(cur || {}), authToken: null, authStaySignedIn: false }); } catch (e) { }
    })();
    authView.classList.remove('hidden');
    mainView.classList.add('hidden');
    profileBtn.classList.add('hidden');
    password.value = '';
    header.classList.remove('in-main');
    appTitle.classList.remove('slide-in');
    if (!container.contains(header)) {
        container.insertBefore(header, authView);
    }
    setStatus('Введите ник и пароль.');
});

if (settingsBtn) {
    settingsBtn.addEventListener('click', async () => {
        settingsModal.classList.remove('hidden');
        requestAnimationFrame(() => settingsModal.classList.add('show'));
        try {
            await loadSettings();
        } catch {
            console.error('Не удалось загрузить настройки');
        }
    });
}

if (staySignedIn) {
    staySignedIn.addEventListener('change', () => {
        saveStaySignedInPreference(!!staySignedIn.checked, { clearTokenIfFalse: !staySignedIn.checked });
    });
}

cancelSettingsBtn.addEventListener('click', () => {
    settingsModal.classList.remove('show');
    setTimeout(() => settingsModal.classList.add('hidden'), 160);
});



saveSettingsBtn.addEventListener('click', async () => {
    const maxVal = Number(maxRam.value);
    const autoCheck = !!(autoCheckUpdatesCheckbox && autoCheckUpdatesCheckbox.checked);
    const res = await window.launcher.saveSettings({ maxRamGb: maxVal, autoCheckUpdates: autoCheck });
    if (res?.ok !== false) {
        if (autoCheck) {
            if (window.updates?.check) window.updates.check();
        }
        setTimeout(() => {
            settingsModal.classList.remove('show');
            setTimeout(() => settingsModal.classList.add('hidden'), 160);
        }, 300);
    }
});

// Unified launch/update button behavior
async function setLaunchButtonToLaunch(preferredVersion) {
    // preferredVersion: folder name of the installed client (client.name)
    launchBtn.textContent = 'Запустить';
    launchBtn.classList.remove('danger');
    launchBtn.onclick = async () => {
        if (isOperationInProgress) return;
        isOperationInProgress = true;
        setButtonsDisabled(true);

        setMainStatus('Запуск клиента...', true);
        const targetHost = localAddress || serverHost;
        const address = serverPort ? `${targetHost}:${serverPort}` : targetHost;
        // choose version: prefer provided folder name, else try to pick first installed client folder
        let versionToUse = preferredVersion;
        try {
            if (!versionToUse && window.client?.installed) {
                const listRes = await window.client.installed();
                const clients = (listRes?.ok !== false) ? listRes.clients || [] : [];
                if (clients.length > 0) {
                    // Use folder name (client.name) not meta.version
                    versionToUse = clients[0].name;
                    console.log('[Launch] Using first installed client folder:', versionToUse);
                }
            }
        } catch (e) { console.error('[Launch] Error getting installed clients:', e); }
        if (!versionToUse) versionToUse = '1.20.1-forge-47.4.16'; // fallback

        console.log('[Launch] Launching with version:', versionToUse);
        
        const payload = {
            version: versionToUse,
            username: username.value.trim(),
            serverAddress: address
        };

        try {
            const res = await window.client.launch(payload);
            if (res?.ok !== false) {
                setMainStatus(res?.msg || 'Клиент запущен!', true);
                return;
            }
            const msg = String(res?.msg || '');
            // If assembled client not found - attempt to download release first
            if (msg.includes('Файлы собранного клиента не найдены')) {
                setMainStatus('Файлы клиента не найдены — скачиваю релиз...', true);
                try {
                    const chk = await window.clientUpdate.check();
                    if (chk?.ok && chk.manifest?.archive?.url) {
                        setMainStatus('Загрузка релиза клиента...', true);
                        const d = await window.clientUpdate.download(chk.manifest.archive.url);
                        if (d?.ok) {
                            setMainStatus('Установка релиза...', true);
                            const inst = await window.clientUpdate.install(d.path, chk.manifest.version || `client-${Date.now()}`);
                            if (inst?.ok) {
                                setMainStatus('Релиз установлен — запускаю...', true);
                                // try launching the installed manifest version
                                const res2 = await window.client.launch({ ...payload, version: chk.manifest.version });
                                setMainStatus(res2?.msg || 'Клиент запущен!', res2?.ok !== false);
                                return;
                            } else {
                                setMainStatus(`Ошибка установки: ${inst?.msg || 'неизвестно'}`, false);
                            }
                        } else {
                            setMainStatus(`Ошибка загрузки: ${d?.msg || 'неизвестно'}`, false);
                        }
                    } else {
                        setMainStatus('Релиз клиента не найден на GitHub.', false);
                    }
                } catch (e) {
                    setMainStatus(`Ошибка: ${e?.message || e}`, false);
                }

                // Локальная сборка отключена — если релиз не доступен, сообщаем об ошибке
                setMainStatus('Релиз клиента недоступен и локальная сборка отключена.', false);
                return;
            }
            // Generic error
            setMainStatus(res?.msg || 'Ошибка запуска', false);
        } finally {
            isOperationInProgress = false;
            setButtonsDisabled(false);
        }
    };
}

async function setLaunchButtonToUpdate(manifest) {
    launchBtn.textContent = 'Обновить';
    launchBtn.classList.add('danger');
    launchBtn.onclick = async () => {
        if (isOperationInProgress) return;
        isOperationInProgress = true;
        setButtonsDisabled(true);

        try {
            setMainStatus('Загрузка обновления...', true);
            const d = await window.clientUpdate.download(manifest.archive.url);
            if (d?.ok) {
                setMainStatus('Установка...', true);
                const baseName = manifest.version || `client-${Date.now()}`;
                const inst = await window.clientUpdate.install(d.path, baseName);
                if (inst?.ok) {
                    setMainStatus('Клиент обновлён.', true);
                    // hide progress bar
                    const progressEl = document.getElementById('updateProgress');
                    if (progressEl) progressEl.style.display = 'none';
                    setLaunchButtonToLaunch();
                } else {
                    setMainStatus(`Ошибка установки: ${inst?.msg || 'неизвестно'}`, false);
                }
            } else {
                setMainStatus(`Ошибка загрузки: ${d?.msg || 'неизвестно'}`, false);
            }
        } catch (e) {
            setMainStatus(`Ошибка: ${e?.message || e}`, false);
        } finally {
            isOperationInProgress = false;
            setButtonsDisabled(false);
        }
    };
}

// Automatic client check after login
async function checkClientUpdateAndApplyUI() {
    setMainStatus('');
    try {
        const r = await window.client.installed();
        const installed = (r?.ok !== false) ? r.clients : [];
        const res = await window.clientUpdate.check();
        if (res?.ok && res.manifest) {
            const manifest = res.manifest;
            // Determine if installed version matches manifest.version
            // Check all possible version fields in installed clients
            const isVersionInstalled = installed.some(client => {
                const meta = client.meta || {};
                const folderName = client.name;
                // Compare against folder name, version, and detectedVersion
                return folderName === manifest.version ||
                    meta.version === manifest.version ||
                    meta.detectedVersion === manifest.version;
            });

            if (!isVersionInstalled) {
                // update available
                hideCheckReleaseButton();
                setLaunchButtonToUpdate(manifest);
                const remoteEl = document.getElementById('clientRemoteVersion');
                if (remoteEl) remoteEl.textContent = manifest.version || '—';
                setMainStatus(`Доступна новая версия: ${manifest.version}`, true);
                return;
            }
        } else if (res?.ok === false) {
            // explicit error from check
            setMainStatus(`Ошибка получения релиза: ${res.msg || 'неизвестно'}`, false);
            showCheckReleaseButton();
            return;
        } else {
            // no manifest found
            setMainStatus('Релиз клиента недоступен и локальная сборка отключена.', false);
            showCheckReleaseButton();
            return;
        }
        // no update - client is up to date
        // Use folder name (client.name) for launch - this matches the actual directory structure
        // The detectedVersion is just metadata, but launch needs the actual folder name
        const preferredClient = (installed && installed.length > 0) ? installed[0] : null;
        const preferred = preferredClient ? preferredClient.name : undefined;
        console.log('[Client Check] Using installed client:', preferred, 'meta:', preferredClient?.meta);
        setLaunchButtonToLaunch(preferred);
        setMainStatus('Клиент актуален. Готово к запуску.', true);
        const remoteEl = document.getElementById('clientRemoteVersion');
        if (remoteEl) remoteEl.textContent = '—';
    } catch (e) {
        setMainStatus(`Ошибка проверки: ${e?.message || e}`, false);
        setLaunchButtonToLaunch();
    }
}

// call check on login transition
function playTransition(userName) {
    // Show a non-blocking transition overlay while revealing the main UI immediately
    transition.classList.remove('hidden');

    // Reveal the main UI right away so the user can interact while animation plays
    authView.classList.add('hidden');
    mainView.classList.remove('hidden');
    profileBtn.classList.remove('hidden');
    profileName.textContent = userName || '—';
    header.classList.add('in-main');
    if (!mainView.contains(header)) {
        mainView.insertBefore(header, mainView.firstChild);
    }

    // Prepare title and main actions animation (make actions appear shortly)
    appTitle.classList.remove('slide-in');
    if (mainActions) {
        mainActions.classList.remove('show');
        setTimeout(() => mainActions.classList.add('show'), 400);
    }
    requestAnimationFrame(() => appTitle.classList.add('slide-in'));

    // Start polling immediately (settings were loaded on startup)
    startServerPolling();

    // Start checks for client/launcher updates immediately
    try { checkClientUpdateAndApplyUI(); } catch (e) { console.warn('checkClientUpdate failed', e); }
    try { checkLauncherUpdateAndShowModal(); } catch (e) { /* non-critical */ }

    // Hide the visual overlay after the intro animation finishes
    setTimeout(() => transition.classList.add('hidden'), 1200);
}

// Persist username on window close if remember is checked (handles closing immediately after login)
try {
    window.addEventListener('beforeunload', () => {
        try {
            if (rememberMe?.checked && username?.value && username.value.trim()) {
                localStorage.setItem('launcherUser', username.value.trim());
            }
            if (!staySignedIn?.checked) {
                try { window.auth?.deleteToken?.(); } catch (e) { }
            }
        } catch (e) { }
    });
} catch (e) { }




// Download modal removed; client update is handled automatically via checkClientUpdateAndApplyUI


// Format bytes to human readable
function formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' Б';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' КБ';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' МБ';
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' ГБ';
}

// Format seconds to mm:ss
function formatEta(seconds) {
    if (!seconds || seconds <= 0) return '--:--';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// Global progress and events
if (window.clientUpdate?.onProgress) {
    window.clientUpdate.onProgress((d) => {
        try {
            const progressContainer = document.getElementById('clientProgressContainer');
            const progressBar = document.getElementById('clientProgressBar');
            const progressText = document.getElementById('clientProgressText');
            const progressSpeed = document.getElementById('clientProgressSpeed');
            const progressEta = document.getElementById('clientProgressEta');

            const percent = d?.percent || (d.total ? Math.round(d.transferred / d.total * 100) : 0);
            const bytesPerSec = d?.bytesPerSecond || 0;
            const transferred = d?.transferred || 0;
            const total = d?.total || 0;

            // Show progress container
            if (progressContainer) progressContainer.style.display = 'block';
            if (progressBar) progressBar.style.width = percent + '%';
            if (progressText) progressText.textContent = `${percent}% · ${formatBytes(transferred)} / ${formatBytes(total)}`;
            if (progressSpeed) progressSpeed.textContent = formatBytes(bytesPerSec) + '/с';

            // Calculate ETA
            if (progressEta && bytesPerSec > 0 && total > transferred) {
                const remaining = total - transferred;
                const etaSec = Math.floor(remaining / bytesPerSec);
                progressEta.textContent = 'ETA: ' + formatEta(etaSec);
            } else if (progressEta) {
                progressEta.textContent = '';
            }

            setMainStatus(`Загрузка клиента: ${percent}%`, true);
        } catch (e) { console.error('Progress error:', e); }
    });
}

if (window.clientUpdate?.onEvent) {
    window.clientUpdate.onEvent((ev) => {
        try {
            const progressContainer = document.getElementById('clientProgressContainer');
            const progressBar = document.getElementById('clientProgressBar');
            const progressText = document.getElementById('clientProgressText');
            const progressSpeed = document.getElementById('clientProgressSpeed');
            const progressEta = document.getElementById('clientProgressEta');

            if (ev?.type === 'install-started') {
                // Show progress bar for installation
                if (progressContainer) progressContainer.style.display = 'block';
                if (progressBar) progressBar.style.width = '0%';
                if (progressText) progressText.textContent = 'Начало установки...';
                if (progressSpeed) progressSpeed.textContent = '';
                if (progressEta) progressEta.textContent = '';
                setMainStatus('Установка клиента...', true);
            } else if (ev?.type === 'install-progress') {
                // Update installation progress
                const stepText = {
                    'extracting': 'Распаковка архива...',
                    'extracted': 'Файлы распакованы',
                    'finalizing': 'Завершение установки...',
                    'complete': 'Установка завершена!'
                };
                if (progressContainer) progressContainer.style.display = 'block';
                if (progressBar) progressBar.style.width = (ev.percent || 0) + '%';
                if (progressText) progressText.textContent = stepText[ev.step] || `${ev.percent}%`;
                if (progressSpeed) progressSpeed.textContent = '';
                if (progressEta) progressEta.textContent = '';
                setMainStatus(stepText[ev.step] || `Установка: ${ev.percent}%`, true);
            } else if (ev?.type === 'installed') {
                // Hide progress bar after successful install
                if (progressContainer) {
                    setTimeout(() => { progressContainer.style.display = 'none'; }, 1500);
                }
                setMainStatus(`Установлена версия ${ev.version}`, true);
                try { window.client.installed().then(r => { /* can update UI if needed */ }); } catch (e) { }
                // refresh UI to pick up installed version
                try { checkClientUpdateAndApplyUI(); } catch (e) { }
            } else if (ev?.type === 'download-failed') {
                if (progressContainer) progressContainer.style.display = 'none';
                setMainStatus(`Ошибка загрузки релиза: ${ev.msg || 'неизвестно'}`, false);
            } else if (ev?.type === 'install-failed') {
                if (progressContainer) progressContainer.style.display = 'none';
                setMainStatus(`Ошибка установки релиза: ${ev.msg || 'неизвестно'}`, false);
            }
        } catch (e) { console.error('Event handler error:', e); }
    });
}

setStatus('Введите ник и пароль.');
// Default single launch button behavior (may be overwritten later by update check)
try { (async () => { const list = await window.client?.installed?.(); const preferred = (list?.ok !== false && list.clients?.length > 0) ? (list.clients[0].meta?.detectedVersion || list.clients[0].meta?.version || list.clients[0].name) : undefined; setLaunchButtonToLaunch(preferred); })(); } catch (e) { /* client API may not be ready yet */ }

// Initial state
authView.classList.remove('hidden');
mainView.classList.add('hidden');
profileBtn.classList.add('hidden');
transition.classList.add('hidden');

// Load settings once at startup (handles stay-signed-in restore when enabled)
try { loadSettings(); } catch (e) { console.error('Initial settings load failed', e); }

// Basic remember-me behavior: restore username if previously saved; no settings toggle
const remembered = localStorage.getItem('launcherUser');
if (remembered) {
    username.value = remembered;
    // keep login checkbox checked when a remembered name exists
    try { rememberMe.checked = true; } catch (e) { }
}
// Cleanup legacy flag if present
try { localStorage.removeItem('rememberMe'); } catch (e) { }
function initAnimations() {
    if (!window.lottie) return;
    const settingsAnim = document.getElementById('settingsAnim');
    const basePath = '../Animations';
    if (settingsAnim) {
        // Avoid noisy console error if animation file missing
        (async () => {
            try {
                const pathUrl = `${basePath}/settingsV2.json`;
                const res = await fetch(pathUrl, { method: 'GET' });
                if (!res.ok) {
                    console.warn('Animation file not found:', pathUrl, res.status);
                    return;
                }
                const anim = window.lottie.loadAnimation({
                    container: settingsAnim,
                    renderer: 'svg',
                    loop: false,
                    autoplay: false,
                    path: pathUrl
                });
                anim.goToAndStop(0, true);
                if (settingsBtn) {
                    settingsBtn.addEventListener('mouseenter', () => {
                        anim.stop();
                        anim.play();
                    });
                    settingsBtn.addEventListener('mouseleave', () => {
                        anim.stop();
                        anim.goToAndStop(0, true);
                    });
                }
            } catch (e) {
                console.warn('Failed to load animation', e);
            }
        })();
    }
}

initAnimations();

// Обновления: UI и события
if (checkUpdatesBtn && updateStatus) {
    checkUpdatesBtn.addEventListener('click', async () => {
        if (!window.updates?.check) return;
        updateStatus.textContent = 'Проверка...';
        const res = await window.updates.check();
        if (res?.ok === false) updateStatus.textContent = `Ошибка: ${res.msg || 'неизвестная'}`;
    });

    if (window.updates?.onEvent) {
        window.updates.onEvent((data) => {
            const { type, payload } = data || {};
            switch (type) {
                case 'checking':
                    updateStatus.textContent = 'Проверка обновлений...';
                    break;
                case 'available':
                    updateStatus.textContent = `Доступна версия ${payload?.version || ''}`;
                    checkUpdatesBtn.textContent = 'Скачать обновление';
                    checkUpdatesBtn.onclick = async () => {
                        updateStatus.textContent = 'Загрузка...';
                        await window.updates.download();
                    };
                    // show modal to user for optional install
                    try { showLauncherUpdateModal(payload?.version || payload?.releaseName || payload?.name, `Вышло новое обновление! Версия ${payload?.version || ''}`); } catch (e) { }
                    break;
                case 'not-available':
                    updateStatus.textContent = 'Обновлений нет';
                    if (updateProgress) { updateProgress.style.display = 'none'; updateProgress.value = 0; }
                    checkUpdatesBtn.textContent = 'Проверить обновления лаунчера';
                    checkUpdatesBtn.onclick = () => window.updates.check();
                    break;
                case 'download-progress':
                    {
                        const percent = Math.round(payload?.percent || 0);
                        updateStatus.textContent = `Загрузка: ${percent}%`;
                        if (updateProgress) {
                            updateProgress.style.display = 'inline-block';
                            updateProgress.value = percent;
                        }
                        if (launcherUpdateStatusEl) launcherUpdateStatusEl.textContent = `Загрузка: ${percent}%`;
                        // Compute ETA if bytesPerSecond and remaining bytes available
                        try {
                            const bytesPerSecond = payload?.bytesPerSecond || 0;
                            const total = payload?.total || 0;
                            const transferred = payload?.transferred || 0;
                            if (bytesPerSecond > 0 && total > transferred) {
                                const remaining = total - transferred;
                                const etaSec = Math.max(0, Math.floor(remaining / bytesPerSecond));
                                const mm = String(Math.floor(etaSec / 60)).padStart(2, '0');
                                const ss = String(etaSec % 60).padStart(2, '0');
                                if (updateEta) updateEta.textContent = `ETA ${mm}:${ss}`;
                            } else if (updateEta) {
                                updateEta.textContent = '—';
                            }
                        } catch (e) {
                            if (updateEta) updateEta.textContent = '—';
                        }
                    }
                    break;
                case 'downloaded':
                    updateStatus.textContent = 'Загрузка завершена';
                    if (updateProgress) {
                        updateProgress.style.display = 'none';
                        updateProgress.value = 0;
                    }
                    checkUpdatesBtn.textContent = 'Установить и перезапустить';
                    checkUpdatesBtn.onclick = () => {
                        try { window.updates.install(); } catch (e) { }
                    };
                    try {
                        // browser notification
                        new Notification('StratCraftLauncher', { body: 'Обновление загружено. Установите и перезапустите приложение.' });
                    } catch (e) { }
                    // If modal open - change install button behavior
                    try {
                        _launcherUpdateState = 'downloaded';
                        if (launcherInstallBtn) launcherInstallBtn.textContent = 'Установить и перезапустить';
                    } catch (e) { }
                    break;
                case 'error':
                    updateStatus.textContent = `Ошибка: ${payload?.message || 'неизвестная'}`;
                    if (updateProgress) { updateProgress.style.display = 'none'; updateProgress.value = 0; }
                    try { new Notification('StratCraftLauncher', { body: `Ошибка обновлений: ${payload?.message || 'неизвестная'}` }); } catch (e) { }
                    break;
            }
        });
    }
}

// Одноразовая проверка статуса при загрузке (без автообновления)
if (authServerDot && authServerState) {
    refreshServerStatus();
}
