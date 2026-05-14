import { get, set, exportAll, importAll, clearAll, getUsageMB } from './storage.js';
import { showToast, confirm, today } from './utils.js';
import { changePassword, getAuthData } from './auth.js';
import { getSyncConfig, pushToCloud, pullFromCloud, checkCloudStatus } from './sync.js';

export function renderSettingsPage() {
  const settings = get('settings') || {};
  const syncConfig = getSyncConfig();
  const syncState = get('sync_state') || {};
  const usage = getUsageMB();

  return `
    <div class="page-header"><h2>⚙️ 系统设置</h2></div>

    <div class="card" style="margin-bottom:20px">
      <div class="card-header">🔐 修改密码</div>
      <form id="change-pwd-form">
        <div class="form-row">
          <div class="form-group"><label>当前密码</label><input type="password" name="oldPassword" class="form-input" required></div>
          <div class="form-group"><label>新密码</label><input type="password" name="newPassword" class="form-input" required minlength="4"></div>
        </div>
        <div class="form-group"><label>确认新密码</label><input type="password" name="confirmPassword" class="form-input" required minlength="4"></div>
        <p id="pwd-msg" class="form-error hidden"></p>
        <button type="submit" class="btn btn-primary">修改密码</button>
      </form>
    </div>

    <div class="card" style="margin-bottom:20px">
      <div class="card-header">☁️ GitHub 云端同步 <span style="font-size:12px;font-weight:400;color:var(--text-muted)">（可选，防止数据丢失）</span></div>
      <div class="form-row">
        <div class="form-group"><label>GitHub Token <span class="hint">需要 repo 权限</span></label>
          <input id="github-token" type="password" class="form-input" placeholder="${syncConfig.token ? '已配置 (不显示)' : 'ghp_xxxxxxxxxxxxxxxxxxxx'}" value="">
        </div>
        <div class="form-group"><label>仓库名</label>
          <input id="github-repo" class="form-input" placeholder="用户名/仓库名" value="${esc(syncConfig.repo)}">
        </div>
      </div>
      <div class="btn-group" style="margin-top:12px">
        <button id="save-github-config" class="btn btn-primary">保存配置</button>
        <button id="push-cloud-btn" class="btn btn-outline" ${!syncConfig.enabled ? 'disabled' : ''}>📤 推送到云端</button>
        <button id="pull-cloud-btn" class="btn btn-outline" ${!syncConfig.enabled ? 'disabled' : ''}>📥 从云端拉取</button>
      </div>
      <div id="sync-status" style="margin-top:12px;font-size:12px;color:var(--text-muted)">
        ${syncState.lastPush ? `上次推送: ${new Date(syncState.lastPush).toLocaleString('zh-CN')}` : '尚未推送'}
        &nbsp;|&nbsp;
        ${syncState.lastPull ? `上次拉取: ${new Date(syncState.lastPull).toLocaleString('zh-CN')}` : '尚未拉取'}
      </div>
    </div>

    <div class="card" style="margin-bottom:20px">
      <div class="card-header">💾 数据备份与恢复</div>
      <div class="btn-group" style="margin-bottom:12px">
        <button id="export-json-btn" class="btn btn-primary">📤 导出全部数据 (JSON)</button>
        <button id="import-json-btn" class="btn btn-outline">📥 导入数据恢复</button>
      </div>
      <input type="file" id="import-json-file" accept=".json" class="hidden">
      <div style="margin-top:12px">
        <label style="font-size:13px;color:var(--text-secondary)">数据存储占用</label>
        <div class="storage-bar">
          <progress value="${getUsageMB()}" max="5" style="width:100%;height:6px"></progress>
          <span>${usage} MB / 约 5 MB</span>
        </div>
        ${parseFloat(usage) > 4 ? '<p style="color:var(--danger);font-size:12px;margin-top:8px">存储空间紧张，建议清理旧附件或导出备份。</p>' : ''}
      </div>
    </div>

    <div class="card" style="margin-bottom:20px">
      <div class="card-header">📐 提醒设置</div>
      <form id="settings-form">
        <div class="form-row">
          <div class="form-group"><label>合同到期提醒（天前）</label>
            <input name="contractExpiryRemindDays" type="number" class="form-input" value="${settings.contractExpiryRemindDays || 30}" min="1">
          </div>
          <div class="form-group"><label>设备复检提醒（天前）</label>
            <input name="equipmentRecheckRemindDays" type="number" class="form-input" value="${settings.equipmentRecheckRemindDays || 7}" min="1">
          </div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>能耗异常阈值（%）</label>
            <input name="energyAbnormalPercent" type="number" class="form-input" value="${settings.energyAbnormalPercent || 30}" min="5">
          </div>
          <div class="form-group"><label>大额支出阈值（元）</label>
            <input name="largeExpenseThreshold" type="number" class="form-input" value="${settings.largeExpenseThreshold || 5000}" min="100">
          </div>
        </div>
        <button type="submit" class="btn btn-primary">保存设置</button>
      </form>
    </div>

    <div class="card" style="border:1px solid var(--danger)">
      <div class="card-header" style="color:var(--danger)">⚠️ 危险操作</div>
      <p style="font-size:13px;color:var(--text-secondary);margin-bottom:12px">清空所有数据前，建议先导出备份。</p>
      <button id="clear-all-btn" class="btn btn-danger">清空所有数据</button>
    </div>
  `;
}

export function setupSettingsEvents() {
  // Change password
  document.getElementById('change-pwd-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const oldPwd = fd.get('oldPassword');
    const newPwd = fd.get('newPassword');
    const confirmPwd = fd.get('confirmPassword');
    const msg = document.getElementById('pwd-msg');

    if (newPwd !== confirmPwd) {
      msg.textContent = '两次输入的新密码不一致。';
      msg.classList.remove('hidden');
      return;
    }
    if (newPwd.length < 4) {
      msg.textContent = '新密码至少需要4个字符。';
      msg.classList.remove('hidden');
      return;
    }
    if (changePassword(oldPwd, newPwd)) {
      msg.textContent = '密码修改成功！';
      msg.style.color = 'var(--success)';
      msg.classList.remove('hidden');
      e.target.reset();
    } else {
      msg.textContent = '当前密码错误。';
      msg.style.color = 'var(--danger)';
      msg.classList.remove('hidden');
    }
  });

  // GitHub config
  document.getElementById('save-github-config').addEventListener('click', () => {
    const token = document.getElementById('github-token').value.trim();
    const repo = document.getElementById('github-repo').value.trim();
    const settings = get('settings') || {};

    if (token) settings.githubToken = token;
    if (repo) settings.githubRepo = repo;

    set('settings', settings);
    showToast('GitHub 配置已保存');
    document.getElementById('github-token').value = '';
    document.getElementById('github-token').placeholder = '已配置 (不显示)';

    const config = getSyncConfig();
    document.getElementById('push-cloud-btn').disabled = !config.enabled;
    document.getElementById('pull-cloud-btn').disabled = !config.enabled;
  });

  document.getElementById('push-cloud-btn').addEventListener('click', async () => {
    const statusEl = document.getElementById('sync-status');
    try {
      statusEl.textContent = '正在上传...';
      await pushToCloud((msg) => { statusEl.textContent = msg; });
      const state = get('sync_state');
      statusEl.textContent = `上次推送: ${new Date(state.lastPush).toLocaleString('zh-CN')} | 上次拉取: ${state.lastPull ? new Date(state.lastPull).toLocaleString('zh-CN') : '尚未拉取'}`;
      showToast('数据已推送到云端');
    } catch (err) {
      statusEl.textContent = '推送失败';
      showToast(err.message, 'error');
    }
  });

  document.getElementById('pull-cloud-btn').addEventListener('click', async () => {
    const statusEl = document.getElementById('sync-status');
    if (!confirm('从云端拉取将覆盖本地数据，确定继续？')) return;
    try {
      statusEl.textContent = '正在下载...';
      const date = await pullFromCloud((msg) => { statusEl.textContent = msg; });
      const state = get('sync_state');
      statusEl.textContent = `上次推送: ${state.lastPush ? new Date(state.lastPush).toLocaleString('zh-CN') : '尚未推送'} | 上次拉取: ${new Date(state.lastPull).toLocaleString('zh-CN')}`;
      showToast(`数据已从云端恢复（备份时间: ${date}）`);
    } catch (err) {
      statusEl.textContent = '拉取失败';
      showToast(err.message, 'error');
    }
  });

  // JSON export
  document.getElementById('export-json-btn').addEventListener('click', () => {
    const data = exportAll();
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `myweb-backup-${today()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('数据已导出');
  });

  // JSON import
  document.getElementById('import-json-btn').addEventListener('click', () => {
    document.getElementById('import-json-file').click();
  });
  document.getElementById('import-json-file').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!confirm('导入将覆盖现有数据，确定继续吗？')) { e.target.value = ''; return; }

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const json = JSON.parse(ev.target.result);
        importAll(json);
        showToast('数据已恢复！页面即将刷新。');
        setTimeout(() => location.reload(), 1500);
      } catch (err) {
        showToast('文件格式无效，请选择正确的备份文件。', 'error');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  });

  // Settings form
  document.getElementById('settings-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const settings = get('settings') || {};
    settings.contractExpiryRemindDays = parseInt(fd.get('contractExpiryRemindDays')) || 30;
    settings.equipmentRecheckRemindDays = parseInt(fd.get('equipmentRecheckRemindDays')) || 7;
    settings.energyAbnormalPercent = parseInt(fd.get('energyAbnormalPercent')) || 30;
    settings.largeExpenseThreshold = parseInt(fd.get('largeExpenseThreshold')) || 5000;
    set('settings', settings);
    showToast('设置已保存');
  });

  // Clear all
  document.getElementById('clear-all-btn').addEventListener('click', () => {
    if (!confirm('此操作不可恢复！确定要清空所有数据吗？\n\n建议先点击"导出全部数据"进行备份。')) return;
    if (!confirm('再次确认：真的要清空所有数据吗？')) return;
    clearAll();
    showToast('数据已清空，页面即将跳转。');
    setTimeout(() => {
      sessionStorage.removeItem('myweb_logged_in');
      location.hash = '#/login';
    }, 1500);
  });
}

function esc(s) { return s ? String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;') : ''; }
