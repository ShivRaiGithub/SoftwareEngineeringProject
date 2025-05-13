let allFiles = [];
let currentSearchTerm = '';
let currentProtectionFilter = 'all';
let currentSortBy = 'name';
let currentSortOrder = 'asc';
let currentFileToView = null;
let currentFileToProtect = null;
let currentFileToDelete = null;

window.onload = async () => {
  await loadFiles();
  setupModalHandlers();
  setupSearchAndFilterHandlers();
  
  // Add event listener for logout button
  document.getElementById('logoutBtn').addEventListener('click', logout);
};

function setupSearchAndFilterHandlers() {
  // Search functionality
  document.getElementById('searchBtn').addEventListener('click', function() {
    currentSearchTerm = document.getElementById('searchInput').value.toLowerCase();
    applyFiltersAndSort();
  });
  
  document.getElementById('searchInput').addEventListener('keyup', function(event) {
    if (event.key === 'Enter') {
      currentSearchTerm = this.value.toLowerCase();
      applyFiltersAndSort();
    }
  });
  
  document.getElementById('clearSearchBtn').addEventListener('click', function() {
    document.getElementById('searchInput').value = '';
    currentSearchTerm = '';
    applyFiltersAndSort();
  });
  
  // Protection filter
  document.getElementById('protectionFilter').addEventListener('change', function() {
    currentProtectionFilter = this.value;
    applyFiltersAndSort();
  });
  
  // Sorting
  document.getElementById('sortBy').addEventListener('change', function() {
    currentSortBy = this.value;
    applyFiltersAndSort();
  });
  
  document.getElementById('sortOrder').addEventListener('change', function() {
    currentSortOrder = this.value;
    applyFiltersAndSort();
  });
}

function applyFiltersAndSort() {
  let filteredFiles = [...allFiles];
  
  // Apply search filter
  if (currentSearchTerm) {
    filteredFiles = filteredFiles.filter(file => 
      file.name.toLowerCase().includes(currentSearchTerm)
    );
  }
  
  // Apply protection filter
  if (currentProtectionFilter !== 'all') {
    const isProtected = currentProtectionFilter === 'protected';
    filteredFiles = filteredFiles.filter(file => file.protected === isProtected);
  }
  
  // Apply sorting
  filteredFiles.sort((a, b) => {
    let comparison = 0;
    
    switch (currentSortBy) {
      case 'name':
        comparison = a.name.localeCompare(b.name);
        break;
      case 'size':
        comparison = a.size - b.size;
        break;
      case 'date':
        comparison = a.date - b.date;
        break;
    }
    
    return currentSortOrder === 'asc' ? comparison : -comparison;
  });
  
  displayFiles(filteredFiles);
}

// Function to help diagnose the file list and protection status
function displayFiles(files) {
  const list = document.getElementById('fileList');
  list.innerHTML = '';
  
  if (files.length === 0) {
    list.innerHTML = '<div class="empty-files-message">No files match your criteria</div>';
    return;
  }
  
  console.log("Displaying files with protection status:"); // Debug logging
  
  files.forEach(file => {
    console.log(`${file.name}: Protected = ${file.protected}, Type: ${typeof file.protected}`); // Debug
    
    const li = document.createElement('li');
    // Use data attributes to prevent issues with special characters in filenames
    li.setAttribute('data-filename', file.name);
    li.setAttribute('data-protected', file.protected);
    li.classList.add('file-item');
    
    // Format the date
    const fileDate = new Date(file.date);
    const formattedDate = fileDate.toLocaleString();
    
    li.innerHTML = `
      <div class="file-info">
        <span class="file-name">${file.name}</span>
        <span class="file-size">${file.size} bytes</span>
        <span class="file-date">${formattedDate}</span>
        <span class="file-status ${file.protected ? 'protected' : 'unprotected'}">
          ${file.protected ? '🔒 Protected' : '🔓 Unprotected'}
        </span>
      </div>
      <div class="file-actions">
        ${!file.protected ? `<button class="protect-btn">Protect</button>` : ''}
        <button class="view-btn">View/Edit</button>
        <button class="delete-btn">Delete</button>
      </div>
    `;
    
    list.appendChild(li);
  });
  
  // Add event listeners to buttons after DOM elements are created
  document.querySelectorAll('.protect-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      const filename = this.closest('.file-item').getAttribute('data-filename');
      protect(filename);
    });
  });

  document.querySelectorAll('.view-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      const fileItem = this.closest('.file-item');
      const filename = fileItem.getAttribute('data-filename');
      viewFile(filename); 
    });
  });

  document.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      const fileItem = this.closest('.file-item');
      const filename = fileItem.getAttribute('data-filename');
      const isProtected = fileItem.getAttribute('data-protected') === 'true';
      deleteFile(filename, isProtected);
    });
  });
}

async function loadFiles() {
  try {
    allFiles = await window.api.listFiles();
    // Set initial display with all files
    applyFiltersAndSort();
  } catch (error) {
    console.error('Error loading files:', error);
    document.getElementById('status').innerText = `Error loading files: ${error.message || 'Unknown error'}`;
  }
}

function setupModalHandlers() {
  document.getElementById('confirmPassword').addEventListener('click', async function() {
    const password = document.getElementById('passwordInput').value;
    
    if (!password) {
      document.getElementById('modalMessage').innerText = 'Please enter a password.';
      document.getElementById('modalMessage').style.color = 'red';
      return;
    }
    
    if (currentFileToProtect) {
      closeModal('passwordModal');
      await protectFileWithPassword(currentFileToProtect, password);
    }
  });
  
  document.getElementById('confirmDelete').addEventListener('click', async function() {
    const password = document.getElementById('deletePasswordInput').value;
    
    if (!password) {
      document.getElementById('deleteModalMessage').innerText = 'Please enter the password.';
      document.getElementById('deleteModalMessage').style.color = 'red';
      return;
    }
    
    if (currentFileToDelete) {
      closeModal('deleteModal');
      // Verify password before deletion
      await verifyPasswordAndDelete(currentFileToDelete, password);
    }
  });
  
  document.getElementById('proceedDelete').addEventListener('click', async function() {
    if (currentFileToDelete) {
      closeModal('confirmDeleteModal');
      await performDelete(currentFileToDelete);
    }
  });
  
  // Add handler for view password confirmation
  document.getElementById('confirmViewPassword').addEventListener('click', async function() {
    const password = document.getElementById('viewPasswordInput').value;
    
    if (!password) {
      document.getElementById('viewModalMessage').innerText = 'Please enter the password.';
      document.getElementById('viewModalMessage').style.color = 'red';
      return;
    }
    
    if (currentFileToView) {
      closeModal('viewPasswordModal');
      await verifyPasswordAndViewFile(currentFileToView, password);
    }
  });
  
  document.getElementById('passwordInput').addEventListener('keyup', function(event) {
    if (event.key === "Enter") {
      document.getElementById('confirmPassword').click();
    }
  });
  
  document.getElementById('deletePasswordInput').addEventListener('keyup', function(event) {
    if (event.key === "Enter") {
      document.getElementById('confirmDelete').click();
    }
  });
  
  // Add key event for view password input
  document.getElementById('viewPasswordInput').addEventListener('keyup', function(event) {
    if (event.key === "Enter") {
      document.getElementById('confirmViewPassword').click();
    }
  });
}

// Show view password modal
function showViewPasswordModal(filename) {
  currentFileToView = filename;
  document.getElementById('viewModalMessage').innerText = `Enter password to view/edit file: ${filename}`;
  document.getElementById('viewModalMessage').style.color = 'black';
  document.getElementById('viewPasswordInput').value = '';
  document.getElementById('viewPasswordModal').style.display = 'block';
}

// Verify password and view file
async function verifyPasswordAndViewFile(filename, password) {
  try {
    const unlockResult = await window.api.unlockFile(filename, password);
    
    if (unlockResult.success) {
      // Password is correct, proceed to view/edit
      localStorage.setItem('currentFile', filename);
      localStorage.setItem('fileContent', unlockResult.content);
      window.api.navigate('editor.html');
    } else {
      document.getElementById('status').innerText = 'Incorrect password. Access denied.';
    }
  } catch (error) {
    console.error('Password verification error:', error);
    document.getElementById('status').innerText = `Error: ${error.message || 'Unknown error occurred'}`;
  }
}
async function viewFile(filename) {
  try {
    // Always try to fetch the file content — let the backend handle protection
    const fileContent = await window.api.getFileContent(filename);

    if (!fileContent.success) {
      // If backend says it's protected, redirect to editor and let it prompt
      if (fileContent.msg && fileContent.msg.includes('password protected')) {
        localStorage.setItem('currentFile', filename);
        window.api.navigate('editor.html');
        return;
      }

      // Other failure cases
      document.getElementById('status').innerText = fileContent.msg || 'Error accessing file';
      return;
    }

    // If file is retrieved successfully, store data and navigate
    localStorage.setItem('currentFile', filename);
    localStorage.setItem('fileContent', fileContent.content);
    window.api.navigate('editor.html');
  } catch (error) {
    console.error('Error viewing file:', error);
    document.getElementById('status').innerText = `Error: ${error.message || 'Unknown error occurred'}`;
  }
}


// Debug function to help troubleshoot file protection status
function debugFileProtection() {
  console.log("All files with protection status:");
  allFiles.forEach(file => {
    console.log(`${file.name}: Protected = ${file.protected}`);
  });
}

function showPasswordModal(filename) {
  currentFileToProtect = filename;
  document.getElementById('modalMessage').innerText = `Enter password to protect the file: ${filename}`;
  document.getElementById('modalMessage').style.color = 'black';
  document.getElementById('passwordInput').value = '';
  document.getElementById('passwordModal').style.display = 'block';
}

function showDeleteModal(filename, isProtected) {
  currentFileToDelete = filename;
  currentFileIsProtected = isProtected;
  
  if (isProtected) {
    document.getElementById('deleteModalMessage').innerText = `Enter password to delete protected file: ${filename}`;
    document.getElementById('deleteModalMessage').style.color = 'black';
    document.getElementById('deletePasswordInput').value = '';
    document.getElementById('deleteModal').style.display = 'block';
  } else {
    document.getElementById('confirmDeleteMessage').innerText = `Are you sure you want to delete "${filename}"?`;
    document.getElementById('confirmDeleteModal').style.display = 'block';
  }
}

function closeModal(modalId) {
  document.getElementById(modalId).style.display = 'none';
}

async function upload() {
  const res = await window.api.uploadFile();
  if (res.success) {
    await loadFiles(); // Reload all files
    document.getElementById('status').innerText = 'File uploaded successfully';
  }
  else document.getElementById('status').innerText = 'Upload failed';
}

async function protect(filename) {
  console.log(`Protecting file: ${filename}`); // Debug log
  showPasswordModal(filename);
}

async function protectFileWithPassword(filename, password) {
  document.getElementById('status').innerText = 'Protecting file...';
  
  try {
    console.log('Calling protectFile API...'); // Debug log
    const res = await window.api.protectFile(filename, password);
    console.log('API response:', res); // Debug log
    
    if (res.success) {
      document.getElementById('status').innerText = `File "${filename}" has been protected! 🔒`;
      
      await loadFiles();
    } else {
      if (res.msg && res.msg.includes('Access denied')) {
        document.getElementById('status').innerText = '⛔ ' + res.msg;
      } else {
        document.getElementById('status').innerText = res.msg || 'Protection failed';
      }
    }
  } catch (error) {
    document.getElementById('status').innerText = `Error: ${error.message || 'Unknown error occurred'}`;
  }
}

function goToCreate() {
  window.api.navigate('create.html');
}

// Logout function
async function logout() {
  try {
    const result = await window.api.logout();
    if (result.success) {
      localStorage.removeItem('currentFile');
      localStorage.removeItem('fileContent');
      document.getElementById('status').innerText = 'Logging out...';
    }
  } catch (error) {
    console.error('Logout error:', error);
    document.getElementById('status').innerText = `Error during logout: ${error.message || 'Unknown error occurred'}`;
  }
}

async function deleteFile(filename, isProtected) {
  showDeleteModal(filename, isProtected);
}

async function verifyPasswordAndDelete(filename, password) {
  try {
    const unlockResult = await window.api.unlockFile(filename, password);
    
    if (unlockResult.success) {
      await performDelete(filename);
    } else {
      document.getElementById('status').innerText = 'Incorrect password. Deletion cancelled.';
    }
  } catch (error) {
    console.error('Password verification error:', error);
    document.getElementById('status').innerText = `Error: ${error.message || 'Unknown error occurred'}`;
  }
}

async function performDelete(filename) {
  document.getElementById('status').innerText = `Deleting ${filename}...`;
  
  try {
    const res = await window.api.deleteFile(filename);
    if (res.success) {
      document.getElementById('status').innerText = `File "${filename}" has been deleted!`;
      await loadFiles();
    } else {
      if (res.msg && res.msg.includes('Access denied')) {
        document.getElementById('status').innerText = '⛔ ' + res.msg;
      } else {
        document.getElementById('status').innerText = res.msg || 'Delete failed';
      }
    }
  } catch (error) {
    console.error('Delete error:', error);
    document.getElementById('status').innerText = `Error: ${error.message || 'Unknown error occurred'}`;
  }
}