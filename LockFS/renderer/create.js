async function save() {
  const name = document.getElementById('filename').value;
  const content = document.getElementById('content').value;
  const password = document.getElementById('filePassword').value;
  
  if (!name || !content) {
    document.getElementById('status').innerText = "Filename and content are required.";
    return;
  }
  
  try {
    let result;
    
    if (password) {
      // If password is provided, create and immediately encrypt the file
      result = await window.api.createFile(name, content);
      
      if (result.success) {
        // Protect the file with the external encryption tool
        const protectResult = await window.api.protectFile(name, password);
        if (!protectResult.success) {
          document.getElementById('status').innerText = `File created but encryption failed: ${protectResult.msg}`;
          return;
        }
        document.getElementById('status').innerText = "Protected file created successfully!";
      } else {
        document.getElementById('status').innerText = `Failed to create file: ${result.msg || 'Unknown error'}`;
        return;
      }
    } else {
      // Create unprotected file
      result = await window.api.createFile(name, content);
      
      if (result.success) {
        document.getElementById('status').innerText = "File created successfully!";
      } else {
        document.getElementById('status').innerText = `Failed to create file: ${result.msg || 'Unknown error'}`;
        return;
      }
    }
    
    // Navigate back to profile after successful creation
    setTimeout(() => {
      window.api.navigate('profile.html');
    }, 1500);
    
  } catch (error) {
    console.error('Error creating file:', error);
    document.getElementById('status').innerText = `Error: ${error.message || 'Unknown error occurred'}`;
  }
}

function returnToProfile() {
  window.api.navigate('profile.html');
}