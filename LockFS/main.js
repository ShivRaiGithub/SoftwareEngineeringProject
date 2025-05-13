const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs-extra');
const bcrypt = require('bcryptjs');
let win;
let currentUser = null;

function createWindow(htmlFile) {
  win = new BrowserWindow({
    width: 900,
    height: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.loadFile(`renderer/${htmlFile}`);
}

let userFiles = {};

function loadUserFiles() {
  try {
    return JSON.parse(fs.readFileSync('userFiles.json'));
  } catch {
    return {};
  }
}


app.whenReady().then(() => {
  fs.ensureDirSync('saved');
  userFiles = loadUserFiles();
  createWindow('login.html');
});


const USERS_FILE = 'users.json';

function saveUserFiles(files) {
  fs.writeFileSync('userFiles.json', JSON.stringify(files));
}

function loadUsers() {
  try {
    return JSON.parse(fs.readFileSync(USERS_FILE));
  } catch {
    return {};
  }
}

function saveUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users));
}
ipcMain.handle('register', async (_, username, password) => {
  const users = loadUsers();
  if (users[username]) return { success: false, msg: 'User exists' };
  users[username] = bcrypt.hashSync(password, 10);
  saveUsers(users);
  return { success: true };
});

ipcMain.handle('login', async (_, username, password) => {
  const users = loadUsers();
  if (!users[username]) return { success: false, msg: 'No such user' };
  const match = bcrypt.compareSync(password, users[username]);
  if (match) currentUser = username;
  return match ? { success: true } : { success: false, msg: 'Wrong password' };
});


ipcMain.handle('logout', async () => {
  currentUser = null;
  win.loadFile('renderer/login.html');
  return { success: true };
});

ipcMain.handle('navigate', (_, page) => {
  win.loadFile(`renderer/${page}`);
});


ipcMain.handle('upload-file', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({ properties: ['openFile'] });
  if (canceled || filePaths.length === 0) return { success: false };
  
  const file = filePaths[0];
  const filename = path.basename(file);
  const dest = path.join(__dirname, 'saved', filename);
  
  await fs.copy(file, dest);
  
  if (!userFiles[currentUser]) {
    userFiles[currentUser] = [];
  }
  userFiles[currentUser].push(filename);
  saveUserFiles(userFiles);
  
  return { success: true };
});


ipcMain.handle('createFile', async (_, filename, content) => {
  const filePath = path.join(__dirname, 'saved', filename);
  fs.writeFileSync(filePath, content, 'utf8');
  
  if (!userFiles[currentUser]) {
    userFiles[currentUser] = [];
  }
  userFiles[currentUser].push(filename);
  saveUserFiles(userFiles);
  
  return { success: true };
});


ipcMain.handle('listFiles', async () => {
  const userFileList = userFiles[currentUser] || [];
  const files = fs.readdirSync('saved')
    .filter(name => userFileList.includes(name));
  
  return Promise.all(files.map(async name => {
    const filePath = path.join('saved', name);
    const stats = fs.statSync(filePath);
    const content = fs.readFileSync(filePath, 'utf8');
    
    let isProtected = false;
    try {
      const decoded = Buffer.from(content, 'base64').toString('utf8');
      isProtected = decoded.includes(':');
    } catch (err) {
      isProtected = false;
    }
    
    return {
      name,
      size: stats.size,
      protected: isProtected,
      date: stats.mtime.getTime()
    };
  }));
});

ipcMain.handle('deleteFile', async (_, filename) => {
  const userFileList = userFiles[currentUser] || [];
  if (!userFileList.includes(filename)) {
    return { success: false, msg: 'Access denied: You do not own this file' };
  }
  
  const filePath = path.join(__dirname, 'saved', filename);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    
    userFiles[currentUser] = userFileList.filter(file => file !== filename);
    saveUserFiles(userFiles);
    
    return { success: true };
  } else {
    return { success: false, msg: 'File not found' };
  }
});


ipcMain.handle('get-file-content', async (_, filename) => {
  const userFileList = userFiles[currentUser] || [];
  if (!userFileList.includes(filename)) {
    return { success: false, msg: 'Access denied: You do not own this file' };
  }
  
  const filePath = path.join(__dirname, 'saved', filename);
  
  if (!fs.existsSync(filePath)) {
    return { success: false, msg: 'File not found' };
  }
  
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    
    try {
      const decoded = Buffer.from(content, 'base64').toString('utf8');
      if (decoded.includes(':')) {
        return { success: false, msg: 'File is password protected' };
      }
    } catch (err) {
    }
    
    return { success: true, content };
  } catch (err) {
    return { success: false, msg: 'Error reading file: ' + err.message };
  }
});


ipcMain.handle('save-file', async (_, filename, content) => {
  const userFileList = userFiles[currentUser] || [];
  if (!userFileList.includes(filename)) {
    return { success: false, msg: 'Access denied: You do not own this file' };
  }
  
  const filePath = path.join(__dirname, 'saved', filename);
  
  try {
    fs.writeFileSync(filePath, content, 'utf8');
    return { success: true };
  } catch (err) {
    return { success: false, msg: 'Error saving file: ' + err.message };
  }
});

ipcMain.handle('save-protected-file', async (_, filename, content, password) => {
  const userFileList = userFiles[currentUser] || [];
  if (!userFileList.includes(filename)) {
    return { success: false, msg: 'Access denied: You do not own this file' };
  }
  
  const filePath = path.join(__dirname, 'saved', filename);
  
  try {
    const encrypted = Buffer.from(`${password}:${content}`).toString('base64');
    fs.writeFileSync(filePath, encrypted, 'utf8');
    return { success: true };
  } catch (err) {
    return { success: false, msg: 'Error saving protected file: ' + err.message };
  }
});

ipcMain.handle('protect-file', async (event, filename, password) => {

  const userFileList = userFiles[currentUser] || [];
  if (!userFileList.includes(filename)) {
    return { success: false, msg: 'Access denied: You do not own this file' };
  }
  
  
  const filePath = path.join(__dirname, 'saved', filename);
  
  if (!fs.existsSync(filePath)) {
    return { success: false, msg: 'File not found' };
  }

  try {
    const data = fs.readFileSync(filePath, 'utf8');
    
    let isAlreadyProtected = false;
    try {
      const decoded = Buffer.from(data, 'base64').toString('utf8');
      if (decoded.includes(':')) {
        isAlreadyProtected = true;
      }
    } catch (err) {
      console.log(err);
    }
    
    if (isAlreadyProtected) {
      return { success: false, msg: 'File is already protected' };
    }
    
    const encrypted = Buffer.from(`${password}:${data}`).toString('base64');
    
    fs.writeFileSync(filePath, encrypted, 'utf8');
    
    return { success: true };
  } catch (err) {
    return { success: false, msg: `Error protecting file: ${err.message}` };
  }
});

ipcMain.handle('unlock-file', async (_, filename, password) => {
  const userFileList = userFiles[currentUser] || [];
  if (!userFileList.includes(filename)) {
    return { success: false, msg: 'Access denied: You do not own this file' };
  }
  
  console.log(`Attempting to unlock file: ${filename}`);
  const filePath = path.join(__dirname, 'saved', filename);
  
  if (!fs.existsSync(filePath)) {
    console.log('File not found:', filePath);
    return { success: false, msg: 'File not found' };
  }

  try {
    const encrypted = fs.readFileSync(filePath, 'utf8');
    
    try {
      const decoded = Buffer.from(encrypted, 'base64').toString('utf8');
      const [storedPassword, ...contentParts] = decoded.split(':');
      const content = contentParts.join(':');

      if (storedPassword !== password) {
        console.log('Wrong password provided');
        return { success: false, msg: 'Wrong password' };
      }

      console.log('Password verified successfully');
      return { success: true, content };
    } catch (err) {
      console.log('Error decoding file:', err);
      return { success: false, msg: 'Invalid file format' };
    }
  } catch (err) {
    console.error('Error reading file:', err);
    return { success: false, msg: `Error reading file: ${err.message}` };
  }
});