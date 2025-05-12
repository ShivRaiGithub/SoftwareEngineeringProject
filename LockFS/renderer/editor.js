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
  
  // Get file list to check if file is protected
  const files = await window.api.listFiles();
  const fileInfo = files.find(file => file.name === filename);
  
  if (!fileInfo) {
    showStatus('File not found', 'error');
    return;
  }
  
  isProtected = fileInfo.protected;
  document.getElementById('protectionStatus').textContent = 
    isProtected ? '🔒 This file is password protected' : '🔓 This file is not protected';
    
  if (isProtected) {
    // Show password form for protected files
    document.getElementById('passwordForm').style.display = 'block';
    document.getElementById('unlockBtn').addEventListener('click', unlockFile);
  } else {
    // Load content directly for unprotected files
    loadFileContent();
  }
  
  // Add event listeners
  document.getElementById('backBtn').addEventListener('click', goBack);
  document.getElementById('saveBtn').addEventListener('click', saveChanges);
  document.getElementById('revertBtn').addEventListener('click', revertChanges);
};

async function unlockFile() {
  const password = document.getElementById('filePassword').value;
  if (!password) {
    showStatus('Please enter a password', 'error');
    return;
  }
  
  const result = await window.api.unlockFile(currentFile, password);
  if (result.success) {
    currentPassword = password;
    document.getElementById('passwordForm').style.display = 'none';
    document.getElementById('fileContent').value = result.content;
    originalContent = result.content;
    document.getElementById('editorContainer').style.display = 'block';
    showStatus('File unlocked successfully', 'success');
  } else {
    showStatus(result.msg || 'Failed to unlock file', 'error');
  }
}

async function loadFileContent() {
  try {
    // For unprotected files, we'll read the file and display content
    const result = await window.api.getFileContent(currentFile);
    if (result.success) {
      document.getElementById('fileContent').value = result.content;
      originalContent = result.content;
      document.getElementById('editorContainer').style.display = 'block';
    } else {
      showStatus(result.msg || 'Failed to load file content', 'error');
    }
  } catch (error) {
    showStatus('Error loading file: ' + error.message, 'error');
  }
}

async function saveChanges() {
  const newContent = document.getElementById('fileContent').value;
  
  try {
    let result;
    
    if (isProtected && currentPassword) {
      // For protected files, we need to re-encrypt with the same password
      result = await window.api.saveProtectedFile(currentFile, newContent, currentPassword);
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
    showStatus('Error saving changes: ' + error.message, 'error');
  }
}

function revertChanges() {
  document.getElementById('fileContent').value = originalContent;
  showStatus('Changes reverted', 'success');
}

function goBack() {
  window.api.navigate('profile.html');
}

function showStatus(message, type) {
  const statusElement = document.getElementById('status');
  statusElement.textContent = message;
  statusElement.className = type;
  
  // Clear the status after 3 seconds
  setTimeout(() => {
    statusElement.textContent = '';
    statusElement.className = '';
  }, 3000);
}