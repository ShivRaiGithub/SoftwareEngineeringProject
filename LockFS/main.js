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

// Helper function to execute encryption/decryption (for frontend display only)
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

// Helper function to execute VFS operations
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

// VFS-specific helper functions (for plain content only)
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

// Helper function to encrypt content in memory (for frontend display only)
async function encryptContentInMemory(content, password = '') {
  const tempFilename = `temp_${Date.now()}.tmp`;
  const tempFilePath = path.join(__dirname, 'saved', tempFilename);
  
  try {
    // Write content to temp file
    fs.writeFileSync(tempFilePath, content, 'utf8');
    
    // Encrypt the temp file
    const result = await executeEncryptDecrypt(tempFilename, 'e', password);
    if (!result.success) {
      return { success: false, error: result.error };
    }
    
    // Read encrypted content
    const encryptedContent = fs.readFileSync(tempFilePath, 'utf8');
    return { success: true, content: encryptedContent };
  } catch (error) {
    return { success: false, error: error.message };
  } finally {
    // Clean up temp file
    if (fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath);
    }
  }
}

// Helper function to decrypt content in memory (for frontend display only)
async function decryptContentInMemory(encryptedContent, password = '') {
  const tempFilename = `temp_${Date.now()}.tmp`;
  const tempFilePath = path.join(__dirname, 'saved', tempFilename);
  
  try {
    // Write encrypted content to temp file
    fs.writeFileSync(tempFilePath, encryptedContent, 'utf8');
    
    // Decrypt the temp file
    const result = await executeEncryptDecrypt(tempFilename, 'd', password);
    if (!result.success) {
      return { success: false, error: result.error };
    }
    
    // Read decrypted content
    const decryptedContent = fs.readFileSync(tempFilePath, 'utf8');
    return { success: true, content: decryptedContent };
  } catch (error) {
    return { success: false, error: error.message };
  } finally {
    // Clean up temp file
    if (fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath);
    }
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

// Upload file handler - Store in both local storage and VFS
ipcMain.handle('upload-file', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({ properties: ['openFile'] });
  if (canceled || filePaths.length === 0) return { success: false };
  
  const file = filePaths[0];
  const filename = path.basename(file);
  const content = fs.readFileSync(file, 'utf8');
  
  // Save to local storage for reading
  const localFilePath = path.join(__dirname, 'saved', filename);
  fs.writeFileSync(localFilePath, content, 'utf8');
  
  // Store original content in VFS for demonstration
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

// Create file handler - Store in both local storage and VFS
ipcMain.handle('createFile', async (_, filename, content) => {
  try {
    // Save to local storage for reading
    const localFilePath = path.join(__dirname, 'saved', filename);
    fs.writeFileSync(localFilePath, content, 'utf8');
    
    // Create file in VFS for demonstration
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
  
  // Get files from VFS
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
    
    // Delete from VFS
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

// Get file content handler - Read from local storage, not VFS
ipcMain.handle('get-file-content', async (_, filename, password = null) => {
  const userFileList = userFiles[currentUser] || [];
  if (!userFileList.includes(filename)) {
    return { success: false, msg: 'Access denied: You do not own this file' };
  }
  
  try {
    // Read content from local saved directory instead of VFS
    const localFilePath = path.join(__dirname, 'saved', filename);
    
    if (!fs.existsSync(localFilePath)) {
      return { success: false, msg: 'File not found in local storage' };
    }

    const originalContent = fs.readFileSync(localFilePath, 'utf8');

    // If file is protected, encrypt for frontend display
    if (fileMetadata[filename]?.protected) {
      if (!password) {
        return { success: false, msg: 'File is password protected' };
      }
      
      // Encrypt content for frontend display
      const encryptResult = await encryptContentInMemory(originalContent, password);
      if (!encryptResult.success) {
        return { success: false, msg: 'Error encrypting content for display: ' + encryptResult.error };
      }
      
      return { success: true, content: encryptResult.content, encrypted: true };
    }
    
    // Return original content for non-protected files
    return { success: true, content: originalContent, encrypted: false };
  } catch (err) {
    return { success: false, msg: 'Error reading file: ' + err.message };
  }
});

// Save file handler - Save to both local storage and VFS
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
    // Save to local storage for reading
    const localFilePath = path.join(__dirname, 'saved', filename);
    fs.writeFileSync(localFilePath, content, 'utf8');
    
    // Also update VFS to keep it in sync
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

// Save protected file handler - Save to both local storage and VFS
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
    // Decrypt content first if it's encrypted (from frontend)
    let plainContent = content;
    try {
      const decryptResult = await decryptContentInMemory(content, password);
      if (decryptResult.success) {
        plainContent = decryptResult.content;
      }
    } catch (e) {
      // If decryption fails, assume content is already plain
      console.log('Content appears to be plain text, saving as-is');
    }
    
    // Save to local storage for reading
    const localFilePath = path.join(__dirname, 'saved', filename);
    fs.writeFileSync(localFilePath, plainContent, 'utf8');
    
    // Also update VFS to keep it in sync
    const vfsWriteResult = await vfsWriteFile(filename, plainContent);
    if (!vfsWriteResult.success) {
      console.log('Warning: Failed to update VFS, but local save succeeded');
    }
    
    // Update file metadata
    if (fileMetadata[filename]) {
      fileMetadata[filename].size = plainContent.length;
      saveFileMetadata(fileMetadata);
    }
    
    return { success: true };
  } catch (err) {
    return { success: false, msg: 'Error saving protected file: ' + err.message };
  }
});

// Protect file handler - Just update metadata (VFS content remains unchanged)
ipcMain.handle('protect-file', async (event, filename, password) => {
  const userFileList = userFiles[currentUser] || [];
  if (!userFileList.includes(filename)) {
    return { success: false, msg: 'Access denied: You do not own this file' };
  }
  
  try {
    // Check if file is already protected using metadata
    if (fileMetadata[filename] && fileMetadata[filename].protected) {
      return { success: false, msg: 'File is already protected' };
    }

    // Just update metadata to reflect protected status
    // VFS content remains as original plain text
    if (fileMetadata[filename]) {
      fileMetadata[filename].protected = true;
      fileMetadata[filename].password = password; // Store password hash for verification
      saveFileMetadata(fileMetadata);
    }
    
    return { success: true };
  } catch (err) {
    return { success: false, msg: `Error protecting file: ${err.message}` };
  }
});

// Unlock file handler - Read from local storage
ipcMain.handle('unlock-file', async (_, filename, password) => {
  const userFileList = userFiles[currentUser] || [];
  if (!userFileList.includes(filename)) {
    return { success: false, msg: 'Access denied: You do not own this file' };
  }
  
  try {
    // Verify password (you might want to store password hash in metadata)
    if (!fileMetadata[filename]?.protected) {
      return { success: false, msg: 'File is not protected' };
    }

    // Read original content from local storage
    const localFilePath = path.join(__dirname, 'saved', filename);
    
    if (!fs.existsSync(localFilePath)) {
      return { success: false, msg: 'File not found in local storage' };
    }

    const originalContent = fs.readFileSync(localFilePath, 'utf8');
    
    console.log('Successfully read file from local storage');
    return { success: true, content: originalContent };
  } catch (err) {
    console.error('Error unlocking file:', err);
    return { success: false, msg: `Error unlocking file: ${err.message}` };
  }
});