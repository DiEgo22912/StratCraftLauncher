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

contextBridge.exposeInMainWorld('updates', {
    check: () => ipcRenderer.invoke('update:check'),
    download: () => ipcRenderer.invoke('update:download'),
    install: () => ipcRenderer.invoke('update:install'),
    onEvent: (cb) => ipcRenderer.on('update:event', (e, data) => cb(data))
});

