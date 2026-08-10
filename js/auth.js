function switchView(viewId) {
  const views = ['viewLogin', 'viewRegister', 'viewForgot', 'viewReset'];
  views.forEach(v => {
    document.getElementById(v).style.display = (v === viewId) ? 'block' : 'none';
  });
}

function showError(id, message) {
  const el = document.getElementById(id);
  el.textContent = message;
  el.style.display = 'block';
}

function showSuccess(id, message) {
  const el = document.getElementById(id);
  el.textContent = message;
  el.style.display = 'block';
}

function hideAlerts() {
  document.querySelectorAll('.error-msg, .success-msg').forEach(el => el.style.display = 'none');
}

async function handleLogin(e) {
  e.preventDefault();
  hideAlerts();
  
  const email = document.getElementById('loginEmail').value;
  const password = document.getElementById('loginPassword').value;
  
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    
    const data = await res.json();
    if (res.ok && data.success) {
      window.location.href = '/index.html';
    } else {
      showError('loginError', data.error || 'Credenciais inválidas');
    }
  } catch (err) {
    showError('loginError', 'Erro de conexão com o servidor');
  }
}

async function handleRegister(e) {
  e.preventDefault();
  hideAlerts();
  
  const email = document.getElementById('regEmail').value;
  const phone = document.getElementById('regPhone').value;
  const password = document.getElementById('regPassword').value;
  
  if (!email.endsWith('@exdevedor.com.br')) {
    showError('registerError', 'Apenas e-mails @exdevedor.com.br são permitidos');
    return;
  }
  
  try {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, phone, password })
    });
    
    const data = await res.json();
    if (res.ok && data.success) {
      switchView('viewLogin');
      showSuccess('loginError', 'Conta criada com sucesso! Faça login.');
      document.getElementById('loginError').className = 'success-msg'; // reusando o elemento como success temporariamente
    } else {
      showError('registerError', data.error || 'Erro ao criar conta');
    }
  } catch (err) {
    showError('registerError', 'Erro de conexão com o servidor');
  }
}

async function handleForgot(e) {
  e.preventDefault();
  hideAlerts();
  
  const email = document.getElementById('forgotEmail').value;
  const phone = document.getElementById('forgotPhone').value;
  
  try {
    const res = await fetch('/api/auth/recover', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, phone })
    });
    
    const data = await res.json();
    if (res.ok && data.success) {
      document.getElementById('resetEmail').value = email;
      document.getElementById('resetToken').value = data.token; // automatically set token returned by server
      switchView('viewReset');
      showSuccess('resetSuccess', 'Dados confirmados! Crie sua nova senha.');
    } else {
      showError('forgotError', data.error || 'E-mail ou WhatsApp incorretos');
    }
  } catch (err) {
    showError('forgotError', 'Erro de conexão com o servidor');
  }
}

async function handleReset(e) {
  e.preventDefault();
  hideAlerts();
  
  const email = document.getElementById('resetEmail').value;
  const token = document.getElementById('resetToken').value;
  const newPassword = document.getElementById('resetPassword').value;
  
  try {
    const res = await fetch('/api/auth/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, token, newPassword })
    });
    
    const data = await res.json();
    if (res.ok && data.success) {
      switchView('viewLogin');
      showSuccess('loginError', 'Senha alterada com sucesso! Faça login.');
      document.getElementById('loginError').className = 'success-msg';
    } else {
      showError('resetError', data.error || 'Token inválido ou expirado');
    }
  } catch (err) {
    showError('resetError', 'Erro de conexão com o servidor');
  }
}
