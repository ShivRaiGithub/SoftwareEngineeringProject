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
  fs.ensureDirSync('vfs_temp'); // For temporary VFS operations
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

// Helper function to execute VFS operations
async function executeVFSCommand(command) {
  const vfsPath = path.join('..','VFS', './vfs');
  const fullCommand = `"${vfsPath}" ${command}`;
  
  try {
    console.log(`Executing VFS: ${fullCommand}`);
    const { stdout, stderr } = await execAsync(fullCommand);
    console.log(`VFS output: ${stdout}`);
    if (stderr) console.log(`VFS stderr: ${stderr}`);
    return { success: true, output: stdout, error: stderr };
  } catch (error) {
    console.error(`VFS command failed: ${error.message}`);
    return { success: false, error: error.message };
  }
}

// VFS-specific helper functions
async function vfsCreateFile(filename) {
  return await executeVFSCommand(`create ${filename}`);
}

async function vfsWriteFile(filename, content) {
  // Write content to temp file first
  const tempPath = path.join('vfs_temp', `${filename}_temp.txt`);
  fs.writeFileSync(tempPath, content, 'utf8');
  
  // Use VFS to write the content
  const result = await executeVFSCommand(`write ${filename} ${content}`);
  
  // Clean up temp file
  if (fs.existsSync(tempPath)) {
    fs.unlinkSync(tempPath);
  }
  
  return result;
}

async function vfsReadFile(filename) {
  return await executeVFSCommand(`read ${filename}`);
}

async function vfsDeleteFile(filename) {
  return await executeVFSCommand(`delete ${filename}`);
}

async function vfsListFiles() {
  return await executeVFSCommand(`ls`);
}

async function vfsUpdateFile(filename, oldText, newText) {
  // This will require a custom approach since VFS update is interactive
  // We'll simulate the update process
  const readResult = await vfsReadFile(filename);
  if (!readResult.success) return readResult;
  
  // Extract content from read result
  const content = readResult.output.replace('Content: ', '').trim();
  const updatedContent = content.replace(oldText, newText);
  
  // Write the updated content back
  return await vfsWriteFile(filename, updatedContent);
}

// NEW FUNCTION: Load all user files from VFS to saved folder
async function loadUserFilesFromVFSToSaved(username) {
  const userFileList = userFiles[username] || [];
  console.log(`Loading ${userFileList.length} files from VFS to saved folder for user: ${username}`);
  
  for (const filename of userFileList) {
    try {
      // Read encrypted content from VFS
      const vfsReadResult = await vfsReadFile(filename);
      if (vfsReadResult.success) {
        // Extract content from VFS output
        const encryptedContent = vfsReadResult.output.replace('Content: ', '').trim();
        
        // Save to saved folder
        const savedFilePath = path.join(__dirname, 'saved', filename);
        fs.writeFileSync(savedFilePath, encryptedContent, 'utf8');
        console.log(`Loaded ${filename} to saved folder`);
      } else {
        console.error(`Failed to read ${filename} from VFS:`, vfsReadResult.error);
      }
    } catch (error) {
      console.error(`Error loading ${filename} from VFS:`, error.message);
    }
  }
}

// NEW FUNCTION: Clear saved folder (optional - for cleanup)
function clearSavedFolder() {
  try {
    const savedDir = path.join(__dirname, 'saved');
    const files = fs.readdirSync(savedDir);
    for (const file of files) {
      if (file !== '.gitkeep') { // Keep .gitkeep if you have one
        fs.unlinkSync(path.join(savedDir, file));
      }
    }
    console.log('Saved folder cleared');
  } catch (error) {
    console.error('Error clearing saved folder:', error.message);
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
    // LOAD ALL USER FILES FROM VFS TO SAVED FOLDER ON LOGIN
    await loadUserFilesFromVFSToSaved(username);
    console.log(`User ${username} logged in and files loaded to saved folder`);
    return { success: true };
  }
  
  return { success: false, msg: 'Wrong password' };
});

ipcMain.handle('logout', async () => {
  if (currentUser) {
    // Optional: Clear saved folder on logout for security
    clearSavedFolder();
    console.log(`User ${currentUser} logged out and saved folder cleared`);
  }
  currentUser = null;
  win.loadFile('renderer/login.html');
  return { success: true };
});

ipcMain.handle('navigate', (_, page) => {
  win.loadFile(`renderer/${page}`);
});

// Modify the upload-file handler
ipcMain.handle('upload-file', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({ properties: ['openFile'] });
  if (canceled || filePaths.length === 0) return { success: false };
  
  const file = filePaths[0];
  const filename = path.basename(file);
  const content = fs.readFileSync(file, 'utf8');
  
  // First encrypt the content
  const tempFilename = filename + '.tmp';
  const tempFilePath = path.join(__dirname, 'saved', tempFilename);
  fs.writeFileSync(tempFilePath, content, 'utf8');
  
  const encryptResult = await executeEncryptDecrypt(tempFilename, 'e');
  if (!encryptResult.success) {
    if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
    return { success: false, msg: 'Error encrypting file: ' + encryptResult.error };
  }
  
  // Read encrypted content
  const encryptedContent = fs.readFileSync(tempFilePath, 'utf8');
  
  // Execute VFS commands
  const vfsPath = path.join('..','VFS', './vfs');;
  
  // Create file in VFS
  const createCmd = `"${vfsPath}" create ${filename}`;
  try {
    await execAsync(createCmd);
  } catch (error) {
    return { success: false, msg: 'Error creating file in VFS: ' + error.message };
  }
  
  // Write content to VFS
  const writeCmd = `"${vfsPath}" write ${filename} "${encryptedContent}"`;
  try {
    await execAsync(writeCmd);
  } catch (error) {
    return { success: false, msg: 'Error writing to VFS: ' + error.message };
  }
  
  // Clean up temp file and rename encrypted file to final name
  if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
  
  // Save encrypted content to saved folder with original filename
  const finalSavedPath = path.join(__dirname, 'saved', filename);
  fs.writeFileSync(finalSavedPath, encryptedContent, 'utf8');
  
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

// Modify createFile handler
ipcMain.handle('createFile', async (_, filename, content) => {
  const tempFilename = filename + '.tmp';
  const tempFilePath = path.join(__dirname, 'saved', tempFilename);
  
  try {
    // First save content to temporary file and encrypt
    fs.writeFileSync(tempFilePath, content, 'utf8');
    const encryptResult = await executeEncryptDecrypt(tempFilename, 'e');
    if (!encryptResult.success) {
      return { success: false, msg: 'Error encrypting file: ' + encryptResult.error };
    }

    // Read encrypted content
    const encryptedContent = fs.readFileSync(tempFilePath, 'utf8');
    
    // Create file in VFS
    const createResult = await executeVFSCommand(`create ${filename}`);
    if (!createResult.success) {
      return { success: false, msg: 'Error creating file in VFS: ' + createResult.error };
    }
    
    // Write content to VFS
    const writeResult = await executeVFSCommand(`write ${filename} ${encryptedContent}`);
    if (!writeResult.success) {
      return { success: false, msg: 'Error writing to VFS: ' + writeResult.error };
    }
    
    // Save encrypted content to saved folder
    const finalSavedPath = path.join(__dirname, 'saved', filename);
    fs.writeFileSync(finalSavedPath, encryptedContent, 'utf8');
    
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
  } finally {
    // Clean up temp file
    if (fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath);
    }
  }
});

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
    if (line.includes('(size:')) {
      const match = line.match(/^(.+?)\s+\(size:\s+(\d+),\s+cursor:\s+(\d+)\)$/);
      if (match) {
        const [, name, size, cursor] = match;
        if (userFileList.includes(name.trim())) {
          vfsFiles.push({
            name: name.trim(),
            size: parseInt(size),
            protected: fileMetadata[name.trim()]?.protected || false,
            date: fileMetadata[name.trim()]?.uploadedAt || new Date(),
            createdAt: fileMetadata[name.trim()]?.createdAt || new Date(),
            owner: fileMetadata[name.trim()]?.owner || currentUser,
            storedInVFS: true
          });
        }
      }
    }
  }
  
  return vfsFiles;
});

ipcMain.handle('deleteFile', async (_, filename) => {
  const userFileList = userFiles[currentUser] || [];
  if (!userFileList.includes(filename)) {
    return { success: false, msg: 'Access denied: You do not own this file' };
  }
  
  // Delete from VFS
  const vfsDeleteResult = await vfsDeleteFile(filename);
  if (!vfsDeleteResult.success) {
    return { success: false, msg: 'Error deleting from VFS: ' + vfsDeleteResult.error };
  }
  
  // Delete from saved folder
  const savedFilePath = path.join(__dirname, 'saved', filename);
  if (fs.existsSync(savedFilePath)) {
    fs.unlinkSync(savedFilePath);
  }
  
  // Update user files and metadata
  userFiles[currentUser] = userFileList.filter(file => file !== filename);
  saveUserFiles(userFiles);
  
  if (fileMetadata[filename]) {
    delete fileMetadata[filename];
    saveFileMetadata(fileMetadata);
  }
  
  return { success: true };
});

ipcMain.handle('get-file-content', async (_, filename, password = null) => {
  const userFileList = userFiles[currentUser] || [];
  if (!userFileList.includes(filename)) {
    return { success: false, msg: 'Access denied: You do not own this file' };
  }
  
  try {
    // Check if password is needed
    if (fileMetadata[filename]?.protected && !password) {
      return { success: false, msg: 'File is password protected' };
    }

    // The encrypted file should already be in saved folder from login
    const savedFilePath = path.join(__dirname, 'saved', filename);
    if (!fs.existsSync(savedFilePath)) {
      return { success: false, msg: 'File not found in saved folder' };
    }
    
    // Decrypt with or without password based on protection status
    const result = await executeEncryptDecrypt(
      filename,
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
    const decryptedContent = fs.readFileSync(savedFilePath, 'utf8');
    return { success: true, content: decryptedContent };
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

  const tempFilename = filename + '.tmp';
  const tempFilePath = path.join(__dirname, 'saved', tempFilename);
  
  try {
    // Save content to temporary file and encrypt
    fs.writeFileSync(tempFilePath, content, 'utf8');
    
    // Encrypt without password
    const result = await executeEncryptDecrypt(tempFilename, 'e');
    if (!result.success) {
      return { success: false, msg: 'Error encrypting file: ' + result.error };
    }
    
    // Read encrypted content and save to VFS and saved folder
    const encryptedContent = fs.readFileSync(tempFilePath, 'utf8');
    
    const vfsWriteResult = await vfsWriteFile(filename, encryptedContent);
    if (!vfsWriteResult.success) {
      return { success: false, msg: 'Error writing to VFS: ' + vfsWriteResult.error };
    }
    
    // Clean up temp file and save encrypted content with original filename
    if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
    
    // Update the encrypted file in saved folder
    const savedFilePath = path.join(__dirname, 'saved', filename);
    fs.writeFileSync(savedFilePath, encryptedContent, 'utf8');
    
    // Update metadata
    if (fileMetadata[filename]) {
      fileMetadata[filename].size = content.length;
      saveFileMetadata(fileMetadata);
    }
    
    return { success: true };
  } catch (err) {
    return { success: false, msg: 'Error saving file: ' + err.message };
  } finally {
    // Clean up temp file
    if (fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath);
    }
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
      
      // Read encrypted content and save to VFS and saved folder
      const encryptedContent = fs.readFileSync(tempFilePath, 'utf8');
      
      const vfsWriteResult = await vfsWriteFile(filename, encryptedContent);
      if (!vfsWriteResult.success) {
        return { success: false, msg: 'Error writing to VFS: ' + vfsWriteResult.error };
      }
      
      // Update the encrypted file in saved folder
      const savedFilePath = path.join(__dirname, 'saved', filename);
      fs.writeFileSync(savedFilePath, encryptedContent, 'utf8');
      
      // Update file metadata
      if (fileMetadata[filename]) {
        fileMetadata[filename].size = content.length;
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
  
  try {
    // Check if file is already protected using metadata
    if (fileMetadata[filename] && fileMetadata[filename].protected) {
      return { success: false, msg: 'File is already protected' };
    }

    // File should already be in saved folder, decrypt it first
    const savedFilePath = path.join(__dirname, 'saved', filename);
    if (!fs.existsSync(savedFilePath)) {
      return { success: false, msg: 'File not found in saved folder' };
    }
    
    // First decrypt the current content (unprotected)
    const decryptResult = await executeEncryptDecrypt(filename, 'd');
    if (!decryptResult.success) {
      return { success: false, msg: 'Error decrypting current file: ' + decryptResult.error };
    }
    
    // Read decrypted content
    const originalContent = fs.readFileSync(savedFilePath, 'utf8');
    
    // Create temp file and re-encrypt with password
    const tempFilename = filename + '.tmp';
    const tempFilePath = path.join(__dirname, 'saved', tempFilename);
    
    fs.writeFileSync(tempFilePath, originalContent, 'utf8');
    const encryptResult = await executeEncryptDecrypt(tempFilename, 'e', password);
    if (!encryptResult.success) {
      if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
      return { success: false, msg: 'Error encrypting with password: ' + encryptResult.error };
    }
    
    // Read newly encrypted content and save back to VFS and saved folder
    const protectedContent = fs.readFileSync(tempFilePath, 'utf8');
    
    const vfsWriteResult = await vfsWriteFile(filename, protectedContent);
    if (!vfsWriteResult.success) {
      if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
      return { success: false, msg: 'Error writing protected file to VFS: ' + vfsWriteResult.error };
    }
    
    // Clean up temp file and update saved folder
    if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
    fs.writeFileSync(savedFilePath, protectedContent, 'utf8');
    
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
  
  try {
    // File should already be in saved folder
    const savedFilePath = path.join(__dirname, 'saved', filename);
    if (!fs.existsSync(savedFilePath)) {
      return { success: false, msg: 'File not found in saved folder' };
    }
    
    // Decrypt with password
    const result = await executeEncryptDecrypt(filename, 'd', password);
    if (!result.success) {
      return { success: false, msg: 'Wrong password or decryption failed' };
    }
    
    // Read the decrypted content
    const decryptedContent = fs.readFileSync(savedFilePath, 'utf8');
    console.log('Successfully decrypted file');
    
    return { success: true, content: decryptedContent };
  } catch (err) {
    console.error('Error unlocking file:', err);
    return { success: false, msg: `Error unlocking file: ${err.message}` };
  }
});