const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  register: (username, password) => ipcRenderer.invoke('register', username, password),
  login: (username, password) => ipcRenderer.invoke('login', username, password),
  uploadFile: () => ipcRenderer.invoke('upload-file'),
  createFile: (filename, content) => ipcRenderer.invoke('createFile', filename, content),
  protectFile: (filename, password) => ipcRenderer.invoke('protect-file', filename, password),
  unlockFile: (filename, password) => ipcRenderer.invoke('unlock-file', filename, password),
  getFileContent: (filename) => ipcRenderer.invoke('get-file-content', filename),
  saveFile: (filename, content) => ipcRenderer.invoke('save-file', filename, content),
  saveProtectedFile: (filename, content, password) => ipcRenderer.invoke('save-protected-file', filename, content, password),
  navigate: (page) => ipcRenderer.invoke('navigate', page),
  listFiles: () => ipcRenderer.invoke('listFiles'),
  deleteFile: (filename) => ipcRenderer.invoke('deleteFile', filename),
});