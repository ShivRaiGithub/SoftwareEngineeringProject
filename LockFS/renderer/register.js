async function register() {
  const user = document.getElementById('username').value;
  const pass = document.getElementById('password').value;
  
  const passwordError = validatePassword(pass);
  if (passwordError) {
    document.getElementById('status').innerText = passwordError;
    return;
  }

  const res = await window.api.register(user, pass);
  if (res.success) window.api.navigate('login.html');
  else document.getElementById('status').innerText = res.msg;
}


function goToLogin() {
  window.api.navigate('login.html');
}

function validatePassword(password) {
  const minLength = 6;
  const hasUpperCase = /[A-Z]/.test(password);
  const hasLowerCase = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSymbol = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password);

  if (password.length < minLength) return "Password must be at least 6 characters long";
  if (!hasUpperCase) return "Password must contain at least one uppercase letter";
  if (!hasLowerCase) return "Password must contain at least one lowercase letter";
  if (!hasNumber) return "Password must contain at least one number";
  if (!hasSymbol) return "Password must contain at least one symbol";
  
  return null;
}
