const status = document.getElementById('status');
const username = document.getElementById('username');
const password = document.getElementById('password');
const rememberMe = document.getElementById('rememberMe');
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


    if (autoCheckUpdatesCheckbox) {
        autoCheckUpdatesCheckbox.checked = settings?.autoCheckUpdates !== false;
    }
    if (updateProgress) {
        updateProgress.style.display = 'none';
        updateProgress.value = 0;
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
        playTransition(res.username || username.value.trim());
    }
}

function playTransition(userName) {
    transition.classList.remove('hidden');
    setTimeout(() => {
        transition.classList.add('hidden');
        authView.classList.add('hidden');
        mainView.classList.remove('hidden');
        profileBtn.classList.remove('hidden');
        profileName.textContent = userName || '—';
        header.classList.add('in-main');
        if (!mainView.contains(header)) {
            mainView.insertBefore(header, mainView.firstChild);
        }
        appTitle.classList.remove('slide-in');
        if (mainActions) {
            mainActions.classList.remove('show');
        }
        requestAnimationFrame(() => {
            appTitle.classList.add('slide-in');
            if (mainActions) {
                setTimeout(() => mainActions.classList.add('show'), 400);
            }
        });
        loadSettings();
        startServerPolling();
    }, 1200);
}

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
    const res = await window.auth.register({
        username: user,
        password: pass
    });
    registerStatus.textContent = res.msg;
    registerStatus.style.color = res.ok ? '#7ddc8a' : '#ff7b7b';
    registerStatus.classList.toggle('success', !!res.ok);
    if (res.ok) {
        registerModal.classList.add('pulse');
        setTimeout(() => {
            registerModal.classList.remove('pulse');
            registerModal.classList.add('hidden');
            registerModal.classList.remove('show');
            username.value = user;
            password.value = '';
            setStatus('Аккаунт создан. Войдите.', true);
        }, 450);
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

logoutBtn.addEventListener('click', () => {
    profileDrawer.classList.remove('show');
    setTimeout(() => profileDrawer.classList.add('hidden'), 200);
    stopServerPolling();
    // persist username on logout if remember checked
    try {
        if (rememberMe.checked && username.value.trim()) localStorage.setItem('launcherUser', username.value.trim());
        else localStorage.removeItem('launcherUser');
    } catch (e) { }
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
async function setLaunchButtonToLaunch() {
    launchBtn.textContent = 'Запустить';
    launchBtn.classList.remove('danger');
    launchBtn.onclick = async () => {
        setMainStatus('Запуск клиента...', true);
        const targetHost = localAddress || serverHost;
        const address = serverPort ? `${targetHost}:${serverPort}` : targetHost;
        const payload = {
            version: '1.20.1-forge-47.4.16',
            username: username.value.trim(),
            serverAddress: address
        };
        const res = await window.client.launch(payload);
        if (res?.ok !== false) {
            setMainStatus(res?.msg || 'Команда запуска отправлена.', true);
            return;
        }
        const msg = String(res?.msg || '');
        // If assembled client not found - attempt to download release first, then assemble as fallback
        if (msg.includes('Файлы собранного клиента не найдены')) {
            setMainStatus('Файлы клиента не найдены — пробую скачать релиз с GitHub...', true);
            try {
                const chk = await window.clientUpdate.check();
                if (chk?.ok && chk.manifest?.archive?.url) {
                    setMainStatus('Скачиваю релиз клиента...', true);
                    const d = await window.clientUpdate.download(chk.manifest.archive.url);
                    if (d?.ok) {
                        setMainStatus('Устанавливаю релиз...', true);
                        const inst = await window.clientUpdate.install(d.path, chk.manifest.version || `client-${Date.now()}`);
                        if (inst?.ok) {
                            setMainStatus('Релиз установлен — пробую запустить...', true);
                            const res2 = await window.client.launch(payload);
                            setMainStatus(res2?.msg || 'Команда запуска отправлена.', res2?.ok !== false);
                            return;
                        } else {
                            setMainStatus(`Установка релиза не удалась: ${inst?.msg || 'неизвестно'}`, false);
                        }
                    } else {
                        setMainStatus(`Ошибка загрузки релиза: ${d?.msg || 'неизвестно'}`, false);
                    }
                } else {
                    setMainStatus('Релиз клиента не найден в GitHub.', false);
                }
            } catch (e) {
                setMainStatus(`Ошибка загрузки релиза: ${e?.message || e}`, false);
            }

            // Локальная сборка отключена — если релиз не доступен, сообщаем об ошибке
            setMainStatus('Релиз клиента недоступен и локальная сборка отключена.', false);
            return;
        }
        // Generic error
        setMainStatus(res?.msg || 'Ошибка запуска', false);
    };
}

async function setLaunchButtonToUpdate(manifest) {
    launchBtn.textContent = 'Обновить';
    launchBtn.classList.add('danger');
    launchBtn.onclick = async () => {
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
            // determine if installed version matches manifest.version
            const installedNames = installed.map(x => x.meta?.version || x.name);
            if (!installedNames.includes(manifest.version)) {
                // update available
                setLaunchButtonToUpdate(manifest);
                const remoteEl = document.getElementById('clientRemoteVersion');
                if (remoteEl) remoteEl.textContent = manifest.version || '—';
                return;
            }
        }
        // no update
        setLaunchButtonToLaunch();
        const remoteEl = document.getElementById('clientRemoteVersion');
        if (remoteEl) remoteEl.textContent = '—';
    } catch (e) {
        setMainStatus(`Ошибка проверки: ${e?.message || e}`, false);
        setLaunchButtonToLaunch();
    }
}

// call check on login transition
function playTransition(userName) {
    transition.classList.remove('hidden');
    setTimeout(() => {
        transition.classList.add('hidden');
        authView.classList.add('hidden');
        mainView.classList.remove('hidden');
        profileBtn.classList.remove('hidden');
        profileName.textContent = userName || '—';
        header.classList.add('in-main');
        if (!mainView.contains(header)) {
            mainView.insertBefore(header, mainView.firstChild);
        }
        appTitle.classList.remove('slide-in');
        if (mainActions) {
            mainActions.classList.remove('show');
        }
        requestAnimationFrame(() => {
            appTitle.classList.add('slide-in');
            if (mainActions) {
                setTimeout(() => mainActions.classList.add('show'), 400);
            }
        });
        loadSettings();
        startServerPolling();
        checkClientUpdateAndApplyUI();
        // also check launcher updates and show modal if available
        try { checkLauncherUpdateAndShowModal(); } catch (e) { }
    }, 1200);
}

// Persist username on window close if remember is checked (handles closing immediately after login)
try {
    window.addEventListener('beforeunload', () => {
        try {
            if (rememberMe?.checked && username?.value && username.value.trim()) {
                localStorage.setItem('launcherUser', username.value.trim());
            }
        } catch (e) { }
    });
} catch (e) { }




// Download modal removed; client update is handled automatically via checkClientUpdateAndApplyUI


// Global progress and events
if (window.clientUpdate?.onProgress) {
    window.clientUpdate.onProgress((d) => {
        try {
            const progressEl = document.getElementById('updateProgress');
            const percent = d?.percent || (d.total ? Math.round(d.transferred / d.total * 100) : 0);
            if (progressEl) {
                progressEl.style.display = 'inline-block';
                progressEl.value = percent;
            }
            setMainStatus(`Загрузка клиента: ${percent}%`, true);
        } catch (e) { }
    });
}

if (window.clientUpdate?.onEvent) {
    window.clientUpdate.onEvent((ev) => {
        try {
            if (ev?.type === 'installed') {
                setMainStatus(`Установлена версия ${ev.version}`, true);
                try { window.client.installed().then(r => { /* can update UI if needed */ }); } catch (e) { }
            }
        } catch (e) { }
    });
}

setStatus('Введите ник и пароль.');
// Default single launch button behavior (may be overwritten later by update check)
try { setLaunchButtonToLaunch(); } catch (e) { /* client API may not be ready yet */ }

// Initial state
authView.classList.remove('hidden');
mainView.classList.add('hidden');
profileBtn.classList.add('hidden');
transition.classList.add('hidden');

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
        const anim = window.lottie.loadAnimation({
            container: settingsAnim,
            renderer: 'svg',
            loop: false,
            autoplay: false,
            path: `${basePath}/settingsV2.json`
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
