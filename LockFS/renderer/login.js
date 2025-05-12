async function login() {
  const user = document.getElementById('username').value;
  const pass = document.getElementById('password').value;
  const res = await window.api.login(user, pass);
  if (res.success) window.api.navigate('profile.html');
  else document.getElementById('status').innerText = res.msg;
}

function goToRegister() {
  window.api.navigate('register.html');
}
