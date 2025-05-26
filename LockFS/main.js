const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs-extra');
const bcrypt = require('bcryptjs');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

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


// Add metadata management functions
function loadFileMetadata() {
  try {
    return JSON.parse(fs.readFileSync('files_metadata.json'));
  } catch {
    return {};
  }
}

function saveFileMetadata(metadata) {
  fs.writeFileSync('files_metadata.json', JSON.stringify(metadata, null, 2));
}

let fileMetadata = {};
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
  fileMetadata = loadFileMetadata();
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

// Helper function to execute encryption/decryption
async function executeEncryptDecrypt(filename, operation, password = '') {
  const cryptionPath = path.join('..', 'Cryption', 'encrypt_decrypt');
  const filePath = path.join('.', 'saved', filename);
  const command = `"${cryptionPath}" "${filePath}" ${operation} ${password}`.trim();
  
  try {
    console.log(`Executing: ${command}`);
    const { stdout, stderr } = await execAsync(command);
    console.log(`Command output: ${stdout}`);
    if (stderr) console.log(`Command stderr: ${stderr}`);
    return { success: true, output: stdout, error: stderr };
  } catch (error) {
    console.error(`Command failed: ${error.message}`);
    return { success: false, error: error.message };
  }
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
  
  // Add metadata for the uploaded file
  const stats = fs.statSync(dest);
  fileMetadata[filename] = {
    size: stats.size,
    createdAt: stats.birthtime || new Date(),
    uploadedAt: new Date(),
    protected: false,
    owner: currentUser
  };
  saveFileMetadata(fileMetadata);
  
  return { success: true };
});

ipcMain.handle('createFile', async (_, filename, content) => {
  const filePath = path.join(__dirname, 'saved', filename);
  const tempFilename = filename + '.tmp';
  const tempFilePath = path.join(__dirname, 'saved', tempFilename);
  
  try {
    // First save content to temporary file
    fs.writeFileSync(tempFilePath, content, 'utf8');

    // Encrypt the file without password
    const encryptResult = await executeEncryptDecrypt(tempFilename, 'e');
    if (!encryptResult.success) {
      return { success: false, msg: 'Error encrypting file: ' + encryptResult.error };
    }

    // Move encrypted file to final location
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    fs.renameSync(tempFilePath, filePath);
    
    // Update metadata and user files
    if (!userFiles[currentUser]) {
      userFiles[currentUser] = [];
    }
    userFiles[currentUser].push(filename);
    saveUserFiles(userFiles);
    
    const stats = fs.statSync(filePath);
    fileMetadata[filename] = {
      size: stats.size,
      createdAt: stats.birthtime || new Date(),
      uploadedAt: new Date(),
      protected: false,
      owner: currentUser
    };
    saveFileMetadata(fileMetadata);
    
    return { success: true };
  } catch (err) {
    // Clean up temp file on error
    if (fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath);
    }
    return { success: false, msg: 'Error creating file: ' + err.message };
  }
});

ipcMain.handle('listFiles', async () => {
  const userFileList = userFiles[currentUser] || [];
  const files = fs.readdirSync('saved')
    .filter(name => userFileList.includes(name));
    return Promise.all(files.map(async name => {
    const filePath = path.join('saved', name);
    const stats = fs.statSync(filePath);
    
    // Update metadata for existing files
    if (!fileMetadata[name]) {
      fileMetadata[name] = {
        size: stats.size,
        createdAt: stats.birthtime || stats.mtime,
        uploadedAt: stats.mtime,
        protected: false,
        owner: currentUser
      };
      saveFileMetadata(fileMetadata);
    } else {      // Update existing metadata
      fileMetadata[name].size = stats.size;
      saveFileMetadata(fileMetadata);
    }
    
    return {
      name,
      size: stats.size,
      protected: fileMetadata[name].protected,
      date: fileMetadata[name].uploadedAt,
      createdAt: fileMetadata[name].createdAt,
      owner: fileMetadata[name].owner
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
    
    // Remove metadata for the deleted file
    if (fileMetadata[filename]) {
      delete fileMetadata[filename];
      saveFileMetadata(fileMetadata);
    }
    
    return { success: true };
  } else {
    return { success: false, msg: 'File not found' };
  }
});

ipcMain.handle('get-file-content', async (_, filename, password = null) => {
  const userFileList = userFiles[currentUser] || [];
  if (!userFileList.includes(filename)) {
    return { success: false, msg: 'Access denied: You do not own this file' };
  }
  
  const filePath = path.join(__dirname, 'saved', filename);
  
  if (!fs.existsSync(filePath)) {
    return { success: false, msg: 'File not found' };
  }
  
  try {
    // Check if password is needed
    if (fileMetadata[filename]?.protected && !password) {
      return { success: false, msg: 'File is password protected' };
    }

    // For both protected and unprotected files, we use a temp file
    const tempFilename = filename + '.decrypt_tmp';
    const tempFilePath = path.join(__dirname, 'saved', tempFilename);
    
    try {
      // Copy encrypted file to temp location
      fs.copyFileSync(filePath, tempFilePath);
      
      // Decrypt with or without password based on protection status
      const result = await executeEncryptDecrypt(
        tempFilename,
        'd',
        fileMetadata[filename]?.protected ? password : ''
      );
      
      if (!result.success) {
        return { 
          success: false, 
          msg: fileMetadata[filename]?.protected ? 
            'Wrong password or decryption failed' : 
            'Failed to decrypt file'
        };
      }
      
      // Read decrypted content
      const decryptedContent = fs.readFileSync(tempFilePath, 'utf8');
      return { success: true, content: decryptedContent };
    } finally {
      // Always clean up temp file
      if (fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
      }
    }
  } catch (err) {
    return { success: false, msg: 'Error reading file: ' + err.message };
  }
});

ipcMain.handle('save-file', async (_, filename, content) => {
  const userFileList = userFiles[currentUser] || [];
  if (!userFileList.includes(filename)) {
    return { success: false, msg: 'Access denied: You do not own this file' };
  }
  
  // Check if file is protected
  if (fileMetadata[filename] && fileMetadata[filename].protected) {
    return { success: false, msg: 'This is a protected file. Use save-protected-file instead.' };
  }

  const filePath = path.join(__dirname, 'saved', filename);
  const tempFilename = filename + '.tmp';
  const tempFilePath = path.join(__dirname, 'saved', tempFilename);
  
  try {
    // Save content to temporary file
    fs.writeFileSync(tempFilePath, content, 'utf8');
    
    // Encrypt without password
    const result = await executeEncryptDecrypt(tempFilename, 'e');
    if (!result.success) {
      return { success: false, msg: 'Error encrypting file: ' + result.error };
    }
    
    // Replace original file with encrypted version
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    fs.renameSync(tempFilePath, filePath);
    
    // Update metadata
    const stats = fs.statSync(filePath);
    if (fileMetadata[filename]) {
      fileMetadata[filename].size = stats.size;
      saveFileMetadata(fileMetadata);
    }
    
    return { success: true };
  } catch (err) {
    // Clean up temp file on error
    if (fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath);
    }
    return { success: false, msg: 'Error saving file: ' + err.message };
  }
});

ipcMain.handle('save-protected-file', async (_, filename, content, password) => {
  const userFileList = userFiles[currentUser] || [];
  if (!userFileList.includes(filename)) {
    return { success: false, msg: 'Access denied: You do not own this file' };
  }
  
  if (!fileMetadata[filename] || !fileMetadata[filename].protected) {
    return { success: false, msg: 'This file is not protected. Use save-file instead.' };
  }
  
  if (!password) {
    return { success: false, msg: 'Password is required for protected files' };
  }
  
  const filePath = path.join(__dirname, 'saved', filename);
  
  try {
    // Create a temporary file for the content
    const tempFilename = filename + '.tmp';
    const tempFilePath = path.join(__dirname, 'saved', tempFilename);
    
    try {
      // First save the content to temporary file
      fs.writeFileSync(tempFilePath, content, 'utf8');
      
      // Encrypt the temporary file
      const result = await executeEncryptDecrypt(tempFilename, 'e', password);
      if (!result.success) {
        return { success: false, msg: 'Error encrypting file: ' + result.error };
      }
      
      // If encryption succeeded, replace the original file
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      fs.renameSync(tempFilePath, filePath);
      
      // Update file metadata
      const stats = fs.statSync(filePath);
      if (fileMetadata[filename]) {
        fileMetadata[filename].size = stats.size;
        saveFileMetadata(fileMetadata);
      }
      
      return { success: true };
    } finally {
      // Clean up temp file if it exists
      if (fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
      }
    }
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

  try {    // Check if file is already protected using metadata
    if (fileMetadata[filename] && fileMetadata[filename].protected) {
      return { success: false, msg: 'File is already protected' };
    }
      // Encrypt the file with the external tool
    const result = await executeEncryptDecrypt(filename, 'e', password);
    if (!result.success) {
      return { success: false, msg: 'Error protecting file: ' + result.error };
    }
    
    // Update metadata to reflect protected status
    if (fileMetadata[filename]) {
      fileMetadata[filename].protected = true;
      saveFileMetadata(fileMetadata);
    }
    
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
  
  const filePath = path.join(__dirname, 'saved', filename);
  
  if (!fs.existsSync(filePath)) {
    return { success: false, msg: 'File not found' };
  }

  try {
    // Create a temporary copy of the encrypted file for decryption
    const tempFilename = filename + '.decrypt_tmp';
    const tempFilePath = path.join(__dirname, 'saved', tempFilename);
    
    // Copy the encrypted file to temp location
    fs.copyFileSync(filePath, tempFilePath);
    
    // Decrypt the temporary file
    const result = await executeEncryptDecrypt(tempFilename, 'd', password);
    if (!result.success) {
      // Clean up temp file on failure
      if (fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
      }
      return { success: false, msg: 'Wrong password or decryption failed' };
    }
    
    // Read the decrypted content
    const decryptedContent = fs.readFileSync(tempFilePath, 'utf8');
    console.log('Successfully decrypted file');
    
    // Clean up the temporary decrypted file
    fs.unlinkSync(tempFilePath);
    
    return { success: true, content: decryptedContent };
  } catch (err) {
    console.error('Error unlocking file:', err);
    // Clean up any temp files on error
    const tempFilePath = path.join(__dirname, 'saved', filename + '.decrypt_tmp');
    if (fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath);
    }
    return { success: false, msg: `Error unlocking file: ${err.message}` };
  }
});