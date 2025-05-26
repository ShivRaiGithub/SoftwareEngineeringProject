let currentFile = null;
let isProtected = false;
let originalContent = '';
let currentPassword = null;

window.onload = async () => {
  // Get the filename from localStorage
  const filename = localStorage.getItem('currentFile');
  if (!filename) {
    showStatus('No file selected', 'error');
    setTimeout(() => {
      window.api.navigate('profile.html');
    }, 1500);
    return;
  }
  
  currentFile = filename;
  document.getElementById('filename').textContent = filename;
  
  // Try to load content from localStorage first (for unprotected files navigated from profile)
  const storedContent = localStorage.getItem('fileContent');
  if (storedContent !== null) {
    // Content was already loaded and stored, use it
    document.getElementById('fileContent').value = storedContent;
    originalContent = storedContent;
    document.getElementById('editorContainer').style.display = 'block';
    
    // Clear the stored content
    localStorage.removeItem('fileContent');
    
    // Still need to check if file is protected for save operations
    const files = await window.api.listFiles();
    const fileInfo = files.find(file => file.name === filename);
    if (fileInfo) {
      isProtected = fileInfo.protected;
      document.getElementById('protectionStatus').textContent = 
        isProtected ? ' This file is password protected' : ' This file is not protected';
    }
  } else {
    // No stored content, need to load from file
    await loadFileFromServer();
  }
  
  // Add event listeners
  document.getElementById('backBtn').addEventListener('click', goBack);
  document.getElementById('saveBtn').addEventListener('click', saveChanges);
  document.getElementById('revertBtn').addEventListener('click', revertChanges);
};

async function loadFileFromServer() {
  try {
    // Get file list to check if file is protected
    const files = await window.api.listFiles();
    const fileInfo = files.find(file => file.name === currentFile);
    
    if (!fileInfo) {
      showStatus('File not found', 'error');
      return;
    }
    
    isProtected = fileInfo.protected;
    document.getElementById('protectionStatus').textContent = 
      isProtected ? ' This file is password protected' : ' This file is not protected';
      
    if (isProtected) {
      // Show password form for protected files
      document.getElementById('passwordForm').style.display = 'block';
      document.getElementById('unlockBtn').addEventListener('click', unlockFile);
    } else {
      // Load content directly for unprotected files
      await loadFileContent();
    }
  } catch (error) {
    console.error('Error loading file info:', error);
    showStatus('Error loading file information', 'error');
  }
}

async function unlockFile() {
  const password = document.getElementById('filePassword').value;
  if (!password) {
    showStatus('Please enter a password', 'error');
    return;
  }
  
  try {
    showStatus('Decrypting file...', 'info');
    
    // Use unlockFile handler to decrypt the file
    const result = await window.api.unlockFile(currentFile, password);
    
    if (result.success) {
      currentPassword = password;  // Save password for later use (e.g., saving changes)
      document.getElementById('passwordForm').style.display = 'none';
      document.getElementById('fileContent').value = result.content;
      originalContent = result.content;
      document.getElementById('editorContainer').style.display = 'block';
      showStatus('File unlocked successfully', 'success');
    } else {
      document.getElementById('filePassword').value = '';  // Clear password on failure
      showStatus(result.msg || 'Failed to unlock file', 'error');
    }
  } catch (error) {
    console.error('Error unlocking file:', error);
    showStatus('Error unlocking file: ' + error.message, 'error');
  }
}

async function loadFileContent() {
  try {
    // For unprotected files, load content directly
    const result = await window.api.getFileContent(currentFile);
    if (result.success) {
      document.getElementById('fileContent').value = result.content;
      originalContent = result.content;
      document.getElementById('editorContainer').style.display = 'block';
    } else {
      showStatus(result.msg || 'Failed to load file content', 'error');
    }
  } catch (error) {
    console.error('Error loading file content:', error);
    showStatus('Error loading file: ' + error.message, 'error');
  }
}

async function saveChanges() {
  const newContent = document.getElementById('fileContent').value;
  
  if (newContent === originalContent) {
    showStatus('No changes to save', 'info');
    return;
  }
  
  try {
    showStatus('Saving changes...', 'info');
    let result;
    
    if (isProtected && currentPassword) {
      // For protected files, save and re-encrypt with the same password
      result = await window.api.saveProtectedFile(currentFile, newContent, currentPassword);
    } else if (isProtected && !currentPassword) {
      // This shouldn't happen, but handle it gracefully
      showStatus('Cannot save protected file without password', 'error');
      return;
    } else {
      // For unprotected files
      result = await window.api.saveFile(currentFile, newContent);
    }
    
    if (result.success) {
      originalContent = newContent;
      showStatus('Changes saved successfully', 'success');
    } else {
      showStatus(result.msg || 'Failed to save changes', 'error');
    }
  } catch (error) {
    console.error('Error saving changes:', error);
    showStatus('Error saving changes: ' + error.message, 'error');
  }
}

function revertChanges() {
  document.getElementById('fileContent').value = originalContent;
  showStatus('Changes reverted', 'success');
}

function goBack() {
  // Clear any stored content when going back
  localStorage.removeItem('fileContent');
  localStorage.removeItem('currentFile');
  window.api.navigate('profile.html');
}

function showStatus(message, type) {
  const statusElement = document.getElementById('status');
  statusElement.textContent = message;
  statusElement.className = type;
  
  // Clear the status after 3 seconds for success/info messages
  // Keep error messages longer (5 seconds)
  const duration = type === 'error' ? 5000 : 3000;
  
  setTimeout(() => {
    statusElement.textContent = '';
    statusElement.className = '';
  }, duration);
}