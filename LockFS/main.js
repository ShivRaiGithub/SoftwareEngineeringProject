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

app.whenReady().then(() => {
  fs.ensureDirSync('saved');
  createWindow('login.html');
});


const USERS_FILE = 'users.json';

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

ipcMain.handle('navigate', (_, page) => {
  win.loadFile(`renderer/${page}`);
});


ipcMain.handle('upload-file', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({ properties: ['openFile'] });
  if (canceled || filePaths.length === 0) return { success: false };
  const file = filePaths[0];
  const dest = path.join(__dirname, 'saved', path.basename(file));
  await fs.copy(file, dest);
  return { success: true };
});

ipcMain.handle('createFile', async (_, filename, content) => {
  const filePath = path.join(__dirname, 'saved', filename);
  fs.writeFileSync(filePath, content, 'utf8');
  return { success: true };
});


ipcMain.handle('listFiles', async () => {
  const files = fs.readdirSync('saved');
  return Promise.all(files.map(async name => {
    const filePath = path.join('saved', name);
    const stats = fs.statSync(filePath);
    const content = fs.readFileSync(filePath, 'utf8');
    
    // Improved detection of protected files
    let isProtected = false;
    try {
      const decoded = Buffer.from(content, 'base64').toString('utf8');
      // Check if the decoded content contains a password pattern
      isProtected = decoded.includes(':');
    } catch (err) {
      // Not base64 encoded, so not protected
      isProtected = false;
    }
    
    return {
      name,
      size: stats.size,
      protected: isProtected
    };
  }));
});

ipcMain.handle('deleteFile', async (_, filename) => {
  const filePath = path.join(__dirname, 'saved', filename);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    return { success: true };
  } else {
    return { success: false, msg: 'File not found' };
  }
});

// Add these new handlers to your main.js file

// Handler to get file content
ipcMain.handle('get-file-content', async (_, filename) => {
  const filePath = path.join(__dirname, 'saved', filename);
  
  if (!fs.existsSync(filePath)) {
    return { success: false, msg: 'File not found' };
  }
  
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    
    // Check if file is protected
    try {
      const decoded = Buffer.from(content, 'base64').toString('utf8');
      if (decoded.includes(':')) {
        // File is protected, need password
        return { success: false, msg: 'File is password protected' };
      }
    } catch (err) {
      // Not base64 encoded, continue
    }
    
    return { success: true, content };
  } catch (err) {
    return { success: false, msg: 'Error reading file: ' + err.message };
  }
});

// Handler to save file content
ipcMain.handle('save-file', async (_, filename, content) => {
  const filePath = path.join(__dirname, 'saved', filename);
  
  try {
    fs.writeFileSync(filePath, content, 'utf8');
    return { success: true };
  } catch (err) {
    return { success: false, msg: 'Error saving file: ' + err.message };
  }
});

// Handler to save protected file content
ipcMain.handle('save-protected-file', async (_, filename, content, password) => {
  const filePath = path.join(__dirname, 'saved', filename);
  
  try {
    // Re-encrypt with same password
    const encrypted = Buffer.from(`${password}:${content}`).toString('base64');
    fs.writeFileSync(filePath, encrypted, 'utf8');
    return { success: true };
  } catch (err) {
    return { success: false, msg: 'Error saving protected file: ' + err.message };
  }
});

// This is the corrected protect-file handler for your main.js file
// Replace the existing protect-file handler with this one

ipcMain.handle('protect-file', async (event, filename, password) => {
  console.log(`Protecting file: ${filename} with password`); // Debug log
  
  const filePath = path.join(__dirname, 'saved', filename);
  
  if (!fs.existsSync(filePath)) {
    console.log('File not found:', filePath); // Debug log
    return { success: false, msg: 'File not found' };
  }

  try {
    // Read the file content
    const data = fs.readFileSync(filePath, 'utf8');
    console.log('File read successfully'); // Debug log
    
    // Check if the file is already protected
    let isAlreadyProtected = false;
    try {
      const decoded = Buffer.from(data, 'base64').toString('utf8');
      if (decoded.includes(':')) {
        isAlreadyProtected = true;
        console.log('File appears to be already protected'); // Debug log
      }
    } catch (err) {
      // Not base64 encoded, so not protected
      console.log('File is not already protected'); // Debug log
    }
    
    if (isAlreadyProtected) {
      return { success: false, msg: 'File is already protected' };
    }
    
    // Encrypt the file with password
    console.log('Encrypting file...'); // Debug log
    const encrypted = Buffer.from(`${password}:${data}`).toString('base64');
    
    // Write the encrypted content back to the file
    fs.writeFileSync(filePath, encrypted, 'utf8');
    console.log('File encrypted and saved successfully'); // Debug log
    
    return { success: true };
  } catch (err) {
    console.error('Error protecting file:', err); // Debug log
    return { success: false, msg: `Error protecting file: ${err.message}` };
  }
});


ipcMain.handle('unlock-file', async (_, filename, password) => {
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
      const content = contentParts.join(':'); // Handles cases where ":" appears in content

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