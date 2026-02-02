const { contextBridge, ipcRenderer } = require('electron');

const AUTH_API_URL = 'https://tarcraft.cloudpub.ru';

async function callRemoteApi(path, payload) {
    try {
        const url = `${AUTH_API_URL}${path}`;
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        let text = await res.text();
        try { text = text ? JSON.parse(text) : null; } catch (e) { /* leave as text */ }
        console.log('callRemoteApi', { url, status: res.status, body: text });
        if (!res.ok) return { ok: false, msg: (text && text.msg) ? text.msg : `HTTP ${res.status}` };
        return text;
    } catch (e) {
        console.error('callRemoteApi error', e);
        return { ok: false, msg: 'Сеть недоступна.' };
    }
}

contextBridge.exposeInMainWorld('auth', {
    register: async (payload) => {
        const r = await callRemoteApi('/api/register', payload);
        return r;
    },
    login: async (payload) => {
        const r = await callRemoteApi('/api/login', payload);
        return r;
    },
    getToken: () => ipcRenderer.invoke('auth:getToken'),
    saveToken: (token) => ipcRenderer.invoke('auth:saveToken', token),
    deleteToken: () => ipcRenderer.invoke('auth:deleteToken'),
    getApiUrl: () => AUTH_API_URL
});

contextBridge.exposeInMainWorld('devtools', {
    open: () => ipcRenderer.invoke('devtools:open')
});

contextBridge.exposeInMainWorld('launcher', {
    getSettings: () => ipcRenderer.invoke('launcher:getSettings'),
    saveSettings: (payload) => ipcRenderer.invoke('launcher:saveSettings', payload),
    launch: (payload) => ipcRenderer.invoke('launcher:launch', payload),
    getServerStatus: () => ipcRenderer.invoke('server:status'),
    getSystemRAM: () => ipcRenderer.invoke('launcher:getSystemRAM'),
    selectDirectory: () => ipcRenderer.invoke('launcher:selectDirectory'),
    onClientClosed: (cb) => ipcRenderer.on('client-closed', () => cb())
});

contextBridge.exposeInMainWorld('client', {
    assemble: (opts) => ipcRenderer.invoke('client:assemble', opts),
    list: () => ipcRenderer.invoke('client:list'),
    installed: () => ipcRenderer.invoke('client:installed'),
    launch: (opts) => ipcRenderer.invoke('client:launch', opts)
});

contextBridge.exposeInMainWorld('clientUpdate', {
    check: () => ipcRenderer.invoke('client:update:check'),
    download: (url) => ipcRenderer.invoke('client:update:download', { url }),
    install: (zipPath, version) => ipcRenderer.invoke('client:update:install', { zipPath, version }),
    onProgress: (cb) => ipcRenderer.on('client:update:progress', (e, d) => cb(d)),
    onEvent: (cb) => ipcRenderer.on('client:update:event', (e, d) => cb(d))
});

contextBridge.exposeInMainWorld('updates', {
    check: () => ipcRenderer.invoke('update:check'),
    download: () => ipcRenderer.invoke('update:download'),
    install: () => ipcRenderer.invoke('update:install'),
    onEvent: (cb) => ipcRenderer.on('update:event', (e, data) => cb(data))
});

