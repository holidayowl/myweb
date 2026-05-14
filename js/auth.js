export function isInitialized() {
  const data = localStorage.getItem('myweb_auth');
  return data !== null;
}

export function isLoggedIn() {
  return sessionStorage.getItem('myweb_logged_in') === '1';
}

export function getAuthData() {
  const raw = localStorage.getItem('myweb_auth');
  return raw ? JSON.parse(raw) : null;
}

export function createPassword(password) {
  const hash = CryptoJS.SHA256(password).toString();
  localStorage.setItem('myweb_auth', JSON.stringify({
    passwordHash: hash,
    initialized: true,
    createdAt: new Date().toISOString(),
  }));
}

export function login(password) {
  const auth = getAuthData();
  if (!auth || !auth.passwordHash) return false;
  const hash = CryptoJS.SHA256(password).toString();
  if (hash === auth.passwordHash) {
    sessionStorage.setItem('myweb_logged_in', '1');
    return true;
  }
  return false;
}

export function logout() {
  sessionStorage.removeItem('myweb_logged_in');
}

export function changePassword(oldPassword, newPassword) {
  if (!login(oldPassword)) return false;
  const hash = CryptoJS.SHA256(newPassword).toString();
  const auth = getAuthData();
  auth.passwordHash = hash;
  localStorage.setItem('myweb_auth', JSON.stringify(auth));
  return true;
}

export function renderLoginPage() {
  if (!isInitialized()) {
    return `
      <div class="auth-page">
        <div class="auth-card">
          <h1>🔐 首次使用</h1>
          <p class="auth-desc">请设置一个登录密码，用于保护您的工作数据。</p>
          <form id="setup-form">
            <div class="form-group">
              <label>设置密码</label>
              <input type="password" name="password" class="form-input" placeholder="请输入密码" required autocomplete="new-password">
            </div>
            <div class="form-group">
              <label>确认密码</label>
              <input type="password" name="confirmPassword" class="form-input" placeholder="请再次输入密码" required autocomplete="new-password">
            </div>
            <p id="setup-error" class="form-error hidden"></p>
            <button type="submit" class="btn btn-primary" style="width:100%">创建密码并进入</button>
          </form>
        </div>
      </div>
    `;
  }

  return `
    <div class="auth-page">
      <div class="auth-card">
        <h1>🔐 登录</h1>
        <p class="auth-desc">请输入密码以查看工作数据。</p>
        <form id="login-form">
          <div class="form-group">
            <label>密码</label>
            <input type="password" name="password" class="form-input" placeholder="请输入密码" required autocomplete="current-password">
          </div>
          <p id="login-error" class="form-error hidden">密码错误，请重试。</p>
          <button type="submit" class="btn btn-primary" style="width:100%">登录</button>
        </form>
      </div>
    </div>
  `;
}

export function setupAuthEvents() {
  const setupForm = document.getElementById('setup-form');
  if (setupForm) {
    setupForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const pw = setupForm.querySelector('[name="password"]').value;
      const cpw = setupForm.querySelector('[name="confirmPassword"]').value;
      const errorEl = document.getElementById('setup-error');

      if (!pw || pw.length < 4) {
        errorEl.textContent = '密码至少需要4个字符。';
        errorEl.classList.remove('hidden');
        return;
      }
      if (pw !== cpw) {
        errorEl.textContent = '两次输入的密码不一致。';
        errorEl.classList.remove('hidden');
        return;
      }

      createPassword(pw);
      sessionStorage.setItem('myweb_logged_in', '1');
      location.hash = '#/home';
    });
    return;
  }

  const loginForm = document.getElementById('login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const pw = loginForm.querySelector('[name="password"]').value;
      if (login(pw)) {
        location.hash = '#/home';
      } else {
        document.getElementById('login-error').classList.remove('hidden');
      }
    });
  }
}
