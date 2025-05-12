window.onload = async () => {
  loadFiles();
  setupModalHandlers();
};

let currentFileToProtect = null;
let currentFileToDelete = null;
let currentFileIsProtected = false;

function setupModalHandlers() {
  // Setup confirm button handler for password protection modal
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
  
  // Setup confirm button handler for password deletion modal
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
  
  // Setup confirm button for regular deletion
  document.getElementById('proceedDelete').addEventListener('click', async function() {
    if (currentFileToDelete) {
      closeModal('confirmDeleteModal');
      // Delete unprotected file
      await performDelete(currentFileToDelete);
    }
  });
  
  // Allow pressing Enter in the password fields
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
    // Show password verification modal for protected files
    document.getElementById('deleteModalMessage').innerText = `Enter password to delete protected file: ${filename}`;
    document.getElementById('deleteModalMessage').style.color = 'black';
    document.getElementById('deletePasswordInput').value = '';
    document.getElementById('deleteModal').style.display = 'block';
  } else {
    // Show regular confirmation for unprotected files
    document.getElementById('confirmDeleteMessage').innerText = `Are you sure you want to delete "${filename}"?`;
    document.getElementById('confirmDeleteModal').style.display = 'block';
  }
}

function closeModal(modalId) {
  document.getElementById(modalId).style.display = 'none';
}

async function loadFiles() {
  const files = await window.api.listFiles();
  const list = document.getElementById('fileList');
  list.innerHTML = '';

  files.forEach(file => {
    const li = document.createElement('li');
    // Use data attributes to prevent issues with special characters in filenames
    li.setAttribute('data-filename', file.name);
    li.setAttribute('data-protected', file.protected);
    li.classList.add('file-item');
    
    li.innerHTML = `
      <div class="file-info">
        <span class="file-name">${file.name}</span>
        <span class="file-size">${file.size} bytes</span>
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
      const filename = this.closest('.file-item').getAttribute('data-filename');
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

async function upload() {
  const res = await window.api.uploadFile();
  if (res.success) loadFiles();
  else document.getElementById('status').innerText = 'Upload failed';
}

// Modified protect function to use modal instead of prompt
async function protect(filename) {
  console.log(`Protecting file: ${filename}`); // Debug log
  showPasswordModal(filename);
}

// New function that runs after getting password from modal
async function protectFileWithPassword(filename, password) {
  // Show loading status
  document.getElementById('status').innerText = 'Protecting file...';
  
  try {
    console.log('Calling protectFile API...'); // Debug log
    // Call the protectFile API
    const res = await window.api.protectFile(filename, password);
    console.log('API response:', res); // Debug log
    
    if (res.success) {
      // Success message
      document.getElementById('status').innerText = `File "${filename}" has been protected! 🔒`;
      
      // Refresh the file list after a short delay
      setTimeout(() => loadFiles(), 1000);
    } else {
      // Show specific error message
      document.getElementById('status').innerText = res.msg || 'Protection failed';
    }
  } catch (error) {
    // Handle unexpected errors
    console.error('Protection error:', error); // Debug log
    document.getElementById('status').innerText = `Error: ${error.message || 'Unknown error occurred'}`;
  }
}

function goToCreate() {
  window.api.navigate('create.html');
}

async function viewFile(filename) {
  // Store the filename in localStorage to access it in the editor page
  localStorage.setItem('currentFile', filename);
  window.api.navigate('editor.html');
}

// Modified delete function to handle protected files
async function deleteFile(filename, isProtected) {
  showDeleteModal(filename, isProtected);
}

// Verify password for protected file deletion
async function verifyPasswordAndDelete(filename, password) {
  try {
    // First verify the password by trying to unlock the file
    const unlockResult = await window.api.unlockFile(filename, password);
    
    if (unlockResult.success) {
      // Password is correct, proceed with deletion
      await performDelete(filename);
    } else {
      // Incorrect password
      document.getElementById('status').innerText = 'Incorrect password. Deletion cancelled.';
    }
  } catch (error) {
    console.error('Password verification error:', error);
    document.getElementById('status').innerText = `Error: ${error.message || 'Unknown error occurred'}`;
  }
}

// Perform the actual file deletion
async function performDelete(filename) {
  document.getElementById('status').innerText = `Deleting ${filename}...`;
  
  try {
    const res = await window.api.deleteFile(filename);
    if (res.success) {
      document.getElementById('status').innerText = `File "${filename}" has been deleted!`;
      setTimeout(() => loadFiles(), 1000);
    } else {
      document.getElementById('status').innerText = res.msg || 'Delete failed';
    }
  } catch (error) {
    console.error('Delete error:', error);
    document.getElementById('status').innerText = `Error: ${error.message || 'Unknown error occurred'}`;
  }
}