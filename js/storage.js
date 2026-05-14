const PREFIX = 'myweb_';

const STORAGE_KEYS = [
  'auth',
  'contracts',
  'energy',
  'property',
  'equipment',
  'others',
  'others_schema',
  'settings',
  'alert_dismissed',
  'sync_state',
];

export function key(name) {
  return PREFIX + name;
}

export function get(name) {
  const raw = localStorage.getItem(key(name));
  if (raw === null) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

export function set(name, value) {
  localStorage.setItem(key(name), JSON.stringify(value));
}

export function remove(name) {
  localStorage.removeItem(key(name));
}

export function ensure(name, defaultValue) {
  if (get(name) === null) {
    set(name, defaultValue);
  }
  return get(name);
}

export function getAll() {
  const result = {};
  for (const k of STORAGE_KEYS) {
    const val = get(k);
    if (val !== null) {
      result[k] = val;
    }
  }
  return result;
}

export function exportAll() {
  const data = getAll();
  return {
    version: '1.0',
    exportDate: new Date().toISOString(),
    data,
  };
}

export function importAll(json) {
  if (!json || !json.data) {
    throw new Error('无效的备份文件格式。');
  }
  for (const [k, v] of Object.entries(json.data)) {
    set(k, v);
  }
}

export function clearAll() {
  for (const k of STORAGE_KEYS) {
    remove(k);
  }
}

export function getUsage() {
  let total = 0;
  for (const k of STORAGE_KEYS) {
    const raw = localStorage.getItem(key(k));
    if (raw) total += raw.length * 2;
  }
  return total;
}

export function getUsageMB() {
  return (getUsage() / 1024 / 1024).toFixed(2);
}

export function isStorageLow() {
  return getUsage() > 4 * 1024 * 1024;
}

export function initAllKeys() {
  ensure('contracts', []);
  ensure('energy', []);
  ensure('property', []);
  ensure('equipment', []);
  ensure('others', []);
  ensure('others_schema', [
    { key: 'workName', label: '工作名称', type: 'text', required: true, order: 1 },
    { key: 'recordDate', label: '记录时间', type: 'date', required: true, order: 2 },
    { key: 'category', label: '事项分类', type: 'select', required: true, options: ['台账记录', '对外对接', '会议纪要', '检查记录', '其他'], order: 3 },
    { key: 'attachment', label: '相关附件', type: 'file', required: false, order: 4 },
    { key: 'notes', label: '备注说明', type: 'textarea', required: false, order: 5 },
  ]);
  ensure('settings', {
    largeExpenseThreshold: 5000,
    contractExpiryRemindDays: 30,
    equipmentRecheckRemindDays: 7,
    energyAbnormalPercent: 30,
  });
  ensure('alert_dismissed', []);
  ensure('sync_state', { lastPush: null, lastPull: null });
}
