async function save() {
  const name = document.getElementById('filename').value;
  const content = document.getElementById('content').value;
  const password = document.getElementById('filePassword').value;
  
  if (!name || !content) {
    document.getElementById('status').innerText = "Filename and content are required.";
    return;
  }
  
  // First create the file with normal content
  const res = await window.api.createFile(name, content);
  
  // If password was provided, protect the file
  if (password && res.success) {
    const protectRes = await window.api.protectFile(name, password);
    if (!protectRes.success) {
      document.getElementById('status').innerText = "✅ File created but protection failed.";
      return;
    }
  }
  
  if (res.success) {
    document.getElementById('status').innerText = "✅ File created successfully!";
    setTimeout(() => {
      window.api.navigate('profile.html');
    }, 1500);
  } else {
    document.getElementById('status').innerText = "❌ Failed to save file.";
  }
}

function returnToProfile() {
  window.api.navigate('profile.html');
}