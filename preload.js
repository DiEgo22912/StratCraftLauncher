const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('auth', {
    register: (payload) => ipcRenderer.invoke('auth:register', payload),
    login: (payload) => ipcRenderer.invoke('auth:login', payload)
});

contextBridge.exposeInMainWorld('launcher', {
    getSettings: () => ipcRenderer.invoke('launcher:getSettings'),
    saveSettings: (payload) => ipcRenderer.invoke('launcher:saveSettings', payload),
    launch: (payload) => ipcRenderer.invoke('launcher:launch', payload),
    getServerStatus: () => ipcRenderer.invoke('server:status'),
    getSystemRAM: () => ipcRenderer.invoke('launcher:getSystemRAM'),
    selectDirectory: () => ipcRenderer.invoke('launcher:selectDirectory')
});

contextBridge.exposeInMainWorld('client', {
    assemble: (opts) => ipcRenderer.invoke('client:assemble', opts),
    list: () => ipcRenderer.invoke('client:list'),
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

