async function register() {
  const user = document.getElementById('username').value;
  const pass = document.getElementById('password').value;
  const res = await window.api.register(user, pass);
  if (res.success) window.api.navigate('login.html');
  else document.getElementById('status').innerText = res.msg;
}
