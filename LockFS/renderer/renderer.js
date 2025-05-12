function setStatus(msg) {
  document.getElementById('status').innerText = msg;
}

async function register() {
  const user = document.getElementById('user').value;
  const pass = document.getElementById('pass').value;
  const res = await window.api.register(user, pass);
  setStatus(res.success ? "Registered!" : res.msg);
}

async function login() {
  const user = document.getElementById('user').value;
  const pass = document.getElementById('pass').value;
  const res = await window.api.login(user, pass);
  setStatus(res.success ? "Logged in!" : res.msg);
}

async function upload() {
  const res = await window.api.uploadFile();
  setStatus(res.success ? "File uploaded!" : "Failed to upload");
}

async function createFile() {
  const name = document.getElementById('filename').value;
  const data = document.getElementById('filedata').value;
  const res = await window.api.createFile(name, data);
  setStatus(res.success ? "File created!" : "Failed");
}

async function protectFile() {
  const name = document.getElementById('fileToProtect').value;
  const pass = document.getElementById('filePassword').value;
  const res = await window.api.protectFile(name, pass);
  setStatus(res.success ? "File protected!" : res.msg);
}

async function unlockFile() {
  const name = document.getElementById('fileToUnlock').value;
  const pass = document.getElementById('unlockPassword').value;
  const res = await window.api.unlockFile(name, pass);
  if (res.success) {
    setStatus("File unlocked!");
    document.getElementById('unlockedContent').innerText = res.content;
  } else {
    setStatus(res.msg);
    document.getElementById('unlockedContent').innerText = '';
  }
}

