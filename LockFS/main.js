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

// Helper function to execute VFS operations (for show only)
async function executeVFSCommand(command) {
  const vfsPath = path.join('..', 'VFS', './vfs');
  const fullCommand = `"${vfsPath}" ${command}`;
  
  try {
    console.log(`Executing VFS: ${fullCommand}`);
    const { stdout, stderr } = await execAsync(fullCommand, { 
      cwd: path.join('..', 'VFS'),
      timeout: 30000 // 30 second timeout
    });
    console.log(`VFS output: ${stdout}`);
    if (stderr) console.log(`VFS stderr: ${stderr}`);
    return { success: true, output: stdout, error: stderr };
  } catch (error) {
    console.error(`VFS command failed: ${error.message}`);
    return { success: false, error: error.message };
  }
}

// VFS-specific helper functions (for show only)
async function vfsCreateFile(filename) {
  return await executeVFSCommand(`create "${filename}"`);
}

async function vfsWriteFile(filename, content) {
  // Escape quotes in content for command line
  const escapedContent = content.replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r');
  return await executeVFSCommand(`write "${filename}" "${escapedContent}"`);
}

async function vfsReadFile(filename) {
  return await executeVFSCommand(`read "${filename}"`);
}

async function vfsDeleteFile(filename) {
  return await executeVFSCommand(`delete "${filename}"`);
}

async function vfsListFiles() {
  return await executeVFSCommand(`ls`);
}

async function vfsUpdateFile(filename, oldText, newText) {
  // Escape quotes for command line
  const escapedOldText = oldText.replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r');
  const escapedNewText = newText.replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r');
  return await executeVFSCommand(`update "${filename}" "${escapedOldText}" "${escapedNewText}"`);
}

// Helper function to encrypt file content and save to disk
async function encryptAndSaveFile(filename, content, password = '') {
  const localFilePath = path.join(__dirname, 'saved', filename);
  
  try {
    // First write the plain content to the file
    fs.writeFileSync(localFilePath, content, 'utf8');
    
    // Then encrypt the file in place using the external tool
    const result = await executeEncryptDecrypt(filename, 'e', password);
    if (!result.success) {
      // If encryption fails, remove the plain text file
      if (fs.existsSync(localFilePath)) {
        fs.unlinkSync(localFilePath);
      }
      return { success: false, error: result.error };
    }
    
    console.log(`File ${filename} encrypted and saved successfully`);
    return { success: true };
  } catch (error) {
    // Clean up on error
    if (fs.existsSync(localFilePath)) {
      fs.unlinkSync(localFilePath);
    }
    return { success: false, error: error.message };
  }
}

// Helper function to decrypt file content from disk
async function decryptAndReadFile(filename, password = '') {
  const localFilePath = path.join(__dirname, 'saved', filename);
  
  try {
    if (!fs.existsSync(localFilePath)) {
      return { success: false, error: 'File not found' };
    }
    
    // Decrypt the file in place using the external tool
    const result = await executeEncryptDecrypt(filename, 'd', password);
    if (!result.success) {
      return { success: false, error: result.error };
    }
    
    // Read the decrypted content
    const content = fs.readFileSync(localFilePath, 'utf8');
    
    // Re-encrypt the file to maintain security
    const reEncryptResult = await executeEncryptDecrypt(filename, 'e', password);
    if (!reEncryptResult.success) {
      console.warn(`Warning: Failed to re-encrypt file ${filename} after reading`);
    }
    
    console.log(`File ${filename} decrypted and read successfully`);
    return { success: true, content: content };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Helper function to save plain text files (non-protected)
function savePlainTextFile(filename, content) {
  const localFilePath = path.join(__dirname, 'saved', filename);
  try {
    fs.writeFileSync(localFilePath, content, 'utf8');
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Helper function to read plain text files (non-protected)
function readPlainTextFile(filename) {
  const localFilePath = path.join(__dirname, 'saved', filename);
  try {
    if (!fs.existsSync(localFilePath)) {
      return { success: false, error: 'File not found' };
    }
    const content = fs.readFileSync(localFilePath, 'utf8');
    return { success: true, content: content };
  } catch (error) {
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
  
  if (match) {
    currentUser = username;
    console.log(`User ${username} logged in`);
    return { success: true };
  }
  
  return { success: false, msg: 'Wrong password' };
});

ipcMain.handle('logout', async () => {
  if (currentUser) {
    console.log(`User ${currentUser} logged out`);
  }
  currentUser = null;
  win.loadFile('renderer/login.html');
  return { success: true };
});

ipcMain.handle('navigate', (_, page) => {
  win.loadFile(`renderer/${page}`);
});

// Upload file handler - Store with encryption always
ipcMain.handle('upload-file', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({ properties: ['openFile'] });
  if (canceled || filePaths.length === 0) return { success: false };
  
  const file = filePaths[0];
  const filename = path.basename(file);
  const content = fs.readFileSync(file, 'utf8');
  
  // Always encrypt files when saving (using default empty password for non-protected)
  const encryptResult = await encryptAndSaveFile(filename, content, '');
  if (!encryptResult.success) {
    return { success: false, msg: 'Error encrypting and saving file: ' + encryptResult.error };
  }
  
  // Store original content in VFS for demonstration (always plain text)
  const createResult = await vfsCreateFile(filename);
  if (!createResult.success) {
    return { success: false, msg: 'Error creating file in VFS: ' + createResult.error };
  }
  
  const writeResult = await vfsWriteFile(filename, content);
  if (!writeResult.success) {
    console.log('Warning: VFS write failed, but local storage succeeded');
  }
  
  // Update user files and metadata
  if (!userFiles[currentUser]) {
    userFiles[currentUser] = [];
  }
  userFiles[currentUser].push(filename);
  saveUserFiles(userFiles);
  
  fileMetadata[filename] = {
    size: content.length,
    createdAt: new Date(),
    uploadedAt: new Date(),
    protected: false,
    owner: currentUser,
    storedInVFS: true
  };
  saveFileMetadata(fileMetadata);
  
  return { success: true };
});

// Create file handler - Store with encryption always
ipcMain.handle('createFile', async (_, filename, content) => {
  try {
    // Always encrypt files when saving (using default empty password for non-protected)
    const encryptResult = await encryptAndSaveFile(filename, content, '');
    if (!encryptResult.success) {
      return { success: false, msg: 'Error encrypting and saving file: ' + encryptResult.error };
    }
    
    // Create file in VFS for demonstration (always plain text)
    const createResult = await vfsCreateFile(filename);
    if (!createResult.success) {
      return { success: false, msg: 'Error creating file in VFS: ' + createResult.error };
    }
    
    // Write original content to VFS
    const writeResult = await vfsWriteFile(filename, content);
    if (!writeResult.success) {
      console.log('Warning: VFS write failed, but local storage succeeded');
    }
    
    // Update metadata and user files
    if (!userFiles[currentUser]) {
      userFiles[currentUser] = [];
    }
    userFiles[currentUser].push(filename);
    saveUserFiles(userFiles);
    
    fileMetadata[filename] = {
      size: content.length,
      createdAt: new Date(),
      uploadedAt: new Date(),
      protected: false,
      owner: currentUser,
      storedInVFS: true
    };
    saveFileMetadata(fileMetadata);
    
    return { success: true };
  } catch (err) {
    return { success: false, msg: 'Error creating file: ' + err.message };
  }
});

// List files handler with VFS integration
ipcMain.handle('listFiles', async () => {
  const userFileList = userFiles[currentUser] || [];
  
  // Get files from VFS (for show)
  const vfsListResult = await vfsListFiles();
  if (!vfsListResult.success) {
    return { success: false, msg: 'Error listing VFS files: ' + vfsListResult.error };
  }
  
  // Parse VFS output to get file info
  const vfsFiles = [];
  const lines = vfsListResult.output.split('\n');
  for (const line of lines) {
    if (line.trim() && line.includes('(size:')) {
      const match = line.match(/^(.+?)\s+\(size:\s+(\d+),\s+cursor:\s+(\d+)\)$/);
      if (match) {
        const [, name, size, cursor] = match;
        const fileName = name.trim();
        if (userFileList.includes(fileName)) {
          vfsFiles.push({
            name: fileName,
            size: parseInt(size),
            protected: fileMetadata[fileName]?.protected || false,
            date: fileMetadata[fileName]?.uploadedAt || new Date(),
            createdAt: fileMetadata[fileName]?.createdAt || new Date(),
            owner: fileMetadata[fileName]?.owner || currentUser,
            storedInVFS: true
          });
        }
      }
    }
  }
  
  // If no files found in VFS output but user has files, return from metadata
  if (vfsFiles.length === 0 && userFileList.length > 0) {
    return userFileList.map(filename => ({
      name: filename,
      size: fileMetadata[filename]?.size || 0,
      protected: fileMetadata[filename]?.protected || false,
      date: fileMetadata[filename]?.uploadedAt || new Date(),
      createdAt: fileMetadata[filename]?.createdAt || new Date(),
      owner: fileMetadata[filename]?.owner || currentUser,
      storedInVFS: true
    }));
  }
  
  return vfsFiles;
});

// Delete file handler with VFS integration - Delete from both locations
ipcMain.handle('deleteFile', async (_, filename) => {
  const userFileList = userFiles[currentUser] || [];
  if (!userFileList.includes(filename)) {
    return { success: false, msg: 'Access denied: You do not own this file' };
  }
  
  try {
    // Delete from local storage
    const localFilePath = path.join(__dirname, 'saved', filename);
    if (fs.existsSync(localFilePath)) {
      fs.unlinkSync(localFilePath);
    }
    
    // Delete from VFS (for show)
    const vfsDeleteResult = await vfsDeleteFile(filename);
    if (!vfsDeleteResult.success) {
      console.log('Warning: Failed to delete from VFS, but local deletion succeeded');
    }
    
    // Update user files and metadata
    userFiles[currentUser] = userFileList.filter(file => file !== filename);
    saveUserFiles(userFiles);
    
    if (fileMetadata[filename]) {
      delete fileMetadata[filename];
      saveFileMetadata(fileMetadata);
    }
    
    return { success: true };
  } catch (err) {
    return { success: false, msg: 'Error deleting file: ' + err.message };
  }
});

// Get file content handler - Always decrypt from saved folder
ipcMain.handle('get-file-content', async (_, filename, password = null) => {
  const userFileList = userFiles[currentUser] || [];
  if (!userFileList.includes(filename)) {
    return { success: false, msg: 'Access denied: You do not own this file' };
  }
  
  try {
    const isProtected = fileMetadata[filename]?.protected || false;
    
    if (isProtected) {
      if (!password) {
        return { success: false, msg: 'File is password protected' };
      }
      
      // Verify password against stored hash
      if (fileMetadata[filename].password && !bcrypt.compareSync(password, fileMetadata[filename].password)) {
        return { success: false, msg: 'Invalid password' };
      }
      
      // Decrypt using the user's password
      const decryptResult = await decryptAndReadFile(filename, password);
      if (!decryptResult.success) {
        return { success: false, msg: 'Error decrypting protected file: ' + decryptResult.error };
      }
      
      return { success: true, content: decryptResult.content, encrypted: false };
    } else {
      // For non-protected files, decrypt using empty password
      const decryptResult = await decryptAndReadFile(filename, '');
      if (!decryptResult.success) {
        return { success: false, msg: 'Error decrypting file: ' + decryptResult.error };
      }
      
      return { success: true, content: decryptResult.content, encrypted: false };
    }
  } catch (err) {
    return { success: false, msg: 'Error reading file: ' + err.message };
  }
});

// Save file handler - Always encrypt when saving
ipcMain.handle('save-file', async (_, filename, content) => {
  const userFileList = userFiles[currentUser] || [];
  if (!userFileList.includes(filename)) {
    return { success: false, msg: 'Access denied: You do not own this file' };
  }
  
  // Check if file is protected
  if (fileMetadata[filename] && fileMetadata[filename].protected) {
    return { success: false, msg: 'This is a protected file. Use save-protected-file instead.' };
  }

  try {
    // Always encrypt when saving (using empty password for non-protected files)
    const encryptResult = await encryptAndSaveFile(filename, content, '');
    if (!encryptResult.success) {
      return { success: false, msg: 'Error encrypting and saving file: ' + encryptResult.error };
    }
    
    // Also update VFS to keep it in sync (for show)
    const vfsWriteResult = await vfsWriteFile(filename, content);
    if (!vfsWriteResult.success) {
      console.log('Warning: Failed to update VFS, but local save succeeded');
    }
    
    // Update metadata
    if (fileMetadata[filename]) {
      fileMetadata[filename].size = content.length;
      saveFileMetadata(fileMetadata);
    }
    
    return { success: true };
  } catch (err) {
    return { success: false, msg: 'Error saving file: ' + err.message };
  }
});

// Save protected file handler - Save to saved folder with proper encryption
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
  
  try {
    // Encrypt and save the content to saved folder
    const encryptResult = await encryptAndSaveFile(filename, content, password);
    if (!encryptResult.success) {
      return { success: false, msg: 'Error encrypting and saving file: ' + encryptResult.error };
    }
    
    // Also update VFS to keep it in sync (for show - always plain text)
    const vfsWriteResult = await vfsWriteFile(filename, content);
    if (!vfsWriteResult.success) {
      console.log('Warning: Failed to update VFS, but local save succeeded');
    }
    
    // Update file metadata
    if (fileMetadata[filename]) {
      fileMetadata[filename].size = content.length;
      saveFileMetadata(fileMetadata);
    }
    
    return { success: true };
  } catch (err) {
    return { success: false, msg: 'Error saving protected file: ' + err.message };
  }
});

// Protect file handler - Encrypt existing file with password
// Protect file handler - Encrypt existing file with password
ipcMain.handle('protect-file', async (event, filename, password) => {
  const userFileList = userFiles[currentUser] || [];
  if (!userFileList.includes(filename)) {
    return { success: false, msg: 'Access denied: You do not own this file' };
  }
  
  try {
    // Check if file is already protected
    if (fileMetadata[filename] && fileMetadata[filename].protected) {
      return { success: false, msg: 'File is already protected' };
    }

    // First decrypt the file using empty password (since non-protected files use empty password)
    const decryptResult = await decryptAndReadFile(filename, '');
    if (!decryptResult.success) {
      return { success: false, msg: 'Error reading file to protect: ' + decryptResult.error };
    }
    
    // Now encrypt and save the file with the user's password
    const encryptResult = await encryptAndSaveFile(filename, decryptResult.content, password);
    if (!encryptResult.success) {
      return { success: false, msg: 'Error encrypting file: ' + encryptResult.error };
    }
    
    // Update metadata to reflect protected status
    if (fileMetadata[filename]) {
      fileMetadata[filename].protected = true;
      fileMetadata[filename].password = bcrypt.hashSync(password, 10); // Store password hash for verification
      saveFileMetadata(fileMetadata);
    }
    
    console.log(`File ${filename} has been protected and encrypted`);
    return { success: true };
  } catch (err) {
    return { success: false, msg: `Error protecting file: ${err.message}` };
  }
});

// Unlock file handler - Decrypt and read from saved folder
ipcMain.handle('unlock-file', async (_, filename, password) => {
  const userFileList = userFiles[currentUser] || [];
  if (!userFileList.includes(filename)) {
    return { success: false, msg: 'Access denied: You do not own this file' };
  }
  
  try {
    // Verify the file is protected
    if (!fileMetadata[filename]?.protected) {
      return { success: false, msg: 'File is not protected' };
    }

    // Verify password against stored hash
    if (fileMetadata[filename].password && !bcrypt.compareSync(password, fileMetadata[filename].password)) {
      return { success: false, msg: 'Invalid password' };
    }

    // Decrypt and read the file from saved folder
    const decryptResult = await decryptAndReadFile(filename, password);
    if (!decryptResult.success) {
      return { success: false, msg: 'Error decrypting file: ' + decryptResult.error };
    }
    
    console.log('Successfully unlocked and decrypted file');
    return { success: true, content: decryptResult.content };
  } catch (err) {
    console.error('Error unlocking file:', err);
    return { success: false, msg: `Error unlocking file: ${err.message}` };
  }
});