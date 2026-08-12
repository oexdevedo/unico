/* ============================================================================
   Auth.js — Animated view switching, form handlers, and UX feedback
   ============================================================================ */

// ── View Switching with Animations ──────────────────────────────────────────

let isTransitioning = false;

function switchView(viewId) {
  if (isTransitioning) return;

  const allViews = document.querySelectorAll('.auth-view');
  const targetView = document.getElementById(viewId);
  if (!targetView) return;

  // Find the currently visible view
  let currentView = null;
  allViews.forEach(v => {
    if (v.classList.contains('active')) currentView = v;
  });

  // If same view, bail
  if (currentView && currentView.id === viewId) return;

  hideAlerts();
  isTransitioning = true;

  if (currentView) {
    // Animate out
    currentView.classList.add('view-exit');

    currentView.addEventListener('animationend', function handler() {
      currentView.removeEventListener('animationend', handler);
      currentView.classList.remove('active', 'view-exit');

      // Animate in
      targetView.classList.add('active', 'view-enter');
      targetView.addEventListener('animationend', function handler2() {
        targetView.removeEventListener('animationend', handler2);
        targetView.classList.remove('view-enter');
        isTransitioning = false;

        // Auto-focus first input
        const firstInput = targetView.querySelector('input:not([readonly]):not([type="hidden"])');
        if (firstInput) firstInput.focus();
      }, { once: true });
    }, { once: true });
  } else {
    // No current view (initial load edge case)
    targetView.classList.add('active', 'view-enter');
    targetView.addEventListener('animationend', function handler() {
      targetView.removeEventListener('animationend', handler);
      targetView.classList.remove('view-enter');
      isTransitioning = false;
    }, { once: true });
  }
}

// ── Password Toggle ─────────────────────────────────────────────────────────

function togglePassword(inputId, btn) {
  const input = document.getElementById(inputId);
  if (!input) return;

  if (input.type === 'password') {
    input.type = 'text';
    btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
      <line x1="1" y1="1" x2="23" y2="23"/>
    </svg>`;
  } else {
    input.type = 'password';
    btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>`;
  }
}

// ── Alert Helpers ────────────────────────────────────────────────────────────

function showError(id, message) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = message;
  el.style.display = 'block';
  el.className = 'error-msg';

  // Shake the parent form
  const form = el.closest('.auth-view');
  if (form) {
    form.classList.add('shake');
    form.addEventListener('animationend', () => form.classList.remove('shake'), { once: true });
  }
}

function showSuccess(id, message) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = message;
  el.style.display = 'block';
  el.className = 'success-msg';

  // Pulse glow on the message
  el.classList.add('pulse-success');
  el.addEventListener('animationend', () => el.classList.remove('pulse-success'), { once: true });
}

function hideAlerts() {
  document.querySelectorAll('.error-msg, .success-msg').forEach(el => {
    el.style.display = 'none';
    el.className = el.className; // reset animation state
  });
}

// ── Button Loading State ─────────────────────────────────────────────────────

function setLoading(btnId, loading) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  if (loading) {
    btn.classList.add('loading');
    btn.disabled = true;
  } else {
    btn.classList.remove('loading');
    btn.disabled = false;
  }
}

// ── Form Handlers ────────────────────────────────────────────────────────────

async function handleLogin(e) {
  e.preventDefault();
  hideAlerts();
  setLoading('btnLogin', true);

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
  } finally {
    setLoading('btnLogin', false);
  }
}

async function handleRegister(e) {
  e.preventDefault();
  hideAlerts();
  setLoading('btnRegister', true);

  const email = document.getElementById('regEmail').value;
  const phone = document.getElementById('regPhone').value;
  const password = document.getElementById('regPassword').value;

  if (!email.endsWith('@exdevedor.com.br')) {
    showError('registerError', 'Apenas e-mails @exdevedor.com.br são permitidos');
    setLoading('btnRegister', false);
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
      // Small delay so the view animates in first
      setTimeout(() => {
        showSuccess('loginSuccess', 'Conta criada com sucesso! Faça login.');
      }, 400);
    } else {
      showError('registerError', data.error || 'Erro ao criar conta');
    }
  } catch (err) {
    showError('registerError', 'Erro de conexão com o servidor');
  } finally {
    setLoading('btnRegister', false);
  }
}

async function handleForgot(e) {
  e.preventDefault();
  hideAlerts();
  setLoading('btnForgot', true);

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
      document.getElementById('resetToken').value = data.token;
      switchView('viewReset');
      setTimeout(() => {
        showSuccess('resetSuccess', 'Dados confirmados! Crie sua nova senha.');
      }, 400);
    } else {
      showError('forgotError', data.error || 'E-mail ou WhatsApp incorretos');
    }
  } catch (err) {
    showError('forgotError', 'Erro de conexão com o servidor');
  } finally {
    setLoading('btnForgot', false);
  }
}

async function handleReset(e) {
  e.preventDefault();
  hideAlerts();
  setLoading('btnReset', true);

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
      setTimeout(() => {
        showSuccess('loginSuccess', 'Senha alterada com sucesso! Faça login.');
      }, 400);
    } else {
      showError('resetError', data.error || 'Token inválido ou expirado');
    }
  } catch (err) {
    showError('resetError', 'Erro de conexão com o servidor');
  } finally {
    setLoading('btnReset', false);
  }
}
