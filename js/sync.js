import { get, set, exportAll, importAll } from './storage.js';

const GITHUB_API = 'https://api.github.com';

function getSyncConfig() {
  const settings = get('settings') || {};
  return {
    token: settings.githubToken || '',
    repo: settings.githubRepo || '',
    enabled: !!(settings.githubToken && settings.githubRepo),
  };
}

function apiHeaders(token) {
  return {
    'Authorization': `token ${token}`,
    'Accept': 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
  };
}

export async function pushToCloud(onProgress) {
  const config = getSyncConfig();
  if (!config.enabled) {
    throw new Error('请先在设置中配置 GitHub Token 和仓库名。');
  }

  const [owner, repo] = config.repo.split('/');
  if (!owner || !repo) {
    throw new Error('仓库名格式错误，请使用 "用户名/仓库名" 格式。');
  }

  const exportData = exportAll();
  const content = JSON.stringify(exportData, null, 2);
  const contentBase64 = btoa(unescape(encodeURIComponent(content)));

  if (onProgress) onProgress('正在检查云端数据...');

  let sha = null;
  try {
    const resp = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/contents/myweb-data.json`, {
      headers: apiHeaders(config.token),
    });
    if (resp.ok) {
      const fileInfo = await resp.json();
      sha = fileInfo.sha;
    }
  } catch (e) {
    // file doesn't exist yet, that's ok
  }

  if (onProgress) onProgress('正在上传数据到云端...');

  const body = {
    message: `备份: ${new Date().toLocaleString('zh-CN')}`,
    content: contentBase64,
  };
  if (sha) body.sha = sha;

  const resp = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/contents/myweb-data.json`, {
    method: 'PUT',
    headers: apiHeaders(config.token),
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    if (resp.status === 401) throw new Error('GitHub Token 无效，请检查。');
    if (resp.status === 404) throw new Error('仓库不存在或无权限访问，请检查仓库名。');
    throw new Error(err.message || `上传失败 (${resp.status})`);
  }

  const syncState = get('sync_state') || {};
  syncState.lastPush = new Date().toISOString();
  set('sync_state', syncState);

  return true;
}

export async function pullFromCloud(onProgress) {
  const config = getSyncConfig();
  if (!config.enabled) {
    throw new Error('请先在设置中配置 GitHub Token 和仓库名。');
  }

  const [owner, repo] = config.repo.split('/');
  if (!owner || !repo) {
    throw new Error('仓库名格式错误，请使用 "用户名/仓库名" 格式。');
  }

  if (onProgress) onProgress('正在从云端下载数据...');

  const resp = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/contents/myweb-data.json`, {
    headers: apiHeaders(config.token),
  });

  if (!resp.ok) {
    if (resp.status === 404) throw new Error('云端尚未有备份数据，请先执行一次推送。');
    if (resp.status === 401) throw new Error('GitHub Token 无效，请检查。');
    throw new Error(`下载失败 (${resp.status})`);
  }

  const fileInfo = await resp.json();
  const content = decodeURIComponent(escape(atob(fileInfo.content)));
  const json = JSON.parse(content);

  importAll(json);

  const syncState = get('sync_state') || {};
  syncState.lastPull = new Date().toISOString();
  syncState.cloudSha = fileInfo.sha;
  set('sync_state', syncState);

  return json.exportDate || '未知时间';
}

export async function checkCloudStatus() {
  const config = getSyncConfig();
  if (!config.enabled) return { hasCloud: false };

  const [owner, repo] = config.repo.split('/');
  if (!owner || !repo) return { hasCloud: false };

  try {
    const resp = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/contents/myweb-data.json`, {
      headers: apiHeaders(config.token),
    });
    if (!resp.ok) return { hasCloud: false };

    const fileInfo = await resp.json();
    const content = decodeURIComponent(escape(atob(fileInfo.content)));
    const json = JSON.parse(content);

    const syncState = get('sync_state') || {};
    const localPush = syncState.lastPush;

    return {
      hasCloud: true,
      cloudDate: json.exportDate,
      isNewer: !localPush || new Date(json.exportDate) > new Date(localPush),
      sha: fileInfo.sha,
    };
  } catch {
    return { hasCloud: false };
  }
}

export { getSyncConfig };
