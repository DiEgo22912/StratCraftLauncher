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
const downloadBtn = document.getElementById('downloadBtn');
const downloadModal = document.getElementById('downloadModal');
const downloadOkBtn = document.getElementById('downloadOkBtn');
const settingsModal = document.getElementById('settingsModal');
const maxRam = document.getElementById('maxRam');
const ramInput = document.getElementById('ramInput');
const systemRam = document.getElementById('systemRam');
const gameDirectory = document.getElementById('gameDirectory');
const browseDirectoryBtn = document.getElementById('browseDirectoryBtn');
const saveSettingsBtn = document.getElementById('saveSettingsBtn');
const cancelSettingsBtn = document.getElementById('cancelSettingsBtn');
const checkUpdatesBtn = document.getElementById('checkUpdatesBtn');
const updateStatus = document.getElementById('updateStatus');
const updateProgress = document.getElementById('updateProgress');
const autoCheckUpdatesCheckbox = document.getElementById('autoCheckUpdates');
const serverDot = document.getElementById('serverDot');
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

    if (settings?.gameDir) {
        gameDirectory.value = settings.gameDir;
    }
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

// Обработчик выбора директории
browseDirectoryBtn.addEventListener('click', async () => {
    const dir = await window.launcher.selectDirectory();
    if (dir) {
        gameDirectory.value = dir;
    }
});

saveSettingsBtn.addEventListener('click', async () => {
    const maxVal = Number(maxRam.value);
    const gameDir = gameDirectory.value.trim() || null;
    const autoCheck = !!(autoCheckUpdatesCheckbox && autoCheckUpdatesCheckbox.checked);
    const res = await window.launcher.saveSettings({ maxRamGb: maxVal, gameDir, autoCheckUpdates: autoCheck });
    if (res?.ok !== false) {
        if (autoCheck) {
            // trigger a check immediately when enabling auto-check
            if (window.updates?.check) window.updates.check();
        }
        setTimeout(() => {
            settingsModal.classList.remove('show');
            setTimeout(() => settingsModal.classList.add('hidden'), 160);
        }, 300);
    }
});

launchBtn.addEventListener('click', async () => {
    setMainStatus('Запуск игры...', true);
    const targetHost = localAddress || serverHost;
    const address = serverPort ? `${targetHost}:${serverPort}` : targetHost;
    const res = await window.launcher.launch({
        username: username.value.trim(),
        serverAddress: address
    });
    setMainStatus(res?.msg || 'Команда запуска отправлена.', res?.ok !== false);
});

downloadBtn.addEventListener('click', () => {
    downloadModal.classList.remove('hidden');
    requestAnimationFrame(() => downloadModal.classList.add('show'));
});

downloadOkBtn.addEventListener('click', () => {
    downloadModal.classList.remove('show');
    setTimeout(() => downloadModal.classList.add('hidden'), 160);
});

downloadModal.addEventListener('click', (e) => {
    if (e.target === downloadModal) {
        downloadModal.classList.remove('show');
        setTimeout(() => downloadModal.classList.add('hidden'), 160);
    }
});

setStatus('Введите ник и пароль.');

// Initial state
authView.classList.remove('hidden');
mainView.classList.add('hidden');
profileBtn.classList.add('hidden');
transition.classList.add('hidden');

const remembered = localStorage.getItem('launcherUser');
if (remembered) {
    username.value = remembered;
    rememberMe.checked = true;
}

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
                    break;
                case 'not-available':
                    updateStatus.textContent = 'Обновлений нет';
                    if (updateProgress) { updateProgress.style.display = 'none'; updateProgress.value = 0; }
                    checkUpdatesBtn.textContent = 'Проверить обновления';
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
