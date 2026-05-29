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
  migrateData();
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

const DATA_KEYS = ['contracts', 'energy', 'property', 'equipment', 'others'];

// 物业费分类规则（永久生效，按优先级匹配）：
// 1. 保安/保洁/礼仪/接待 → 物业费
// 2. 安全/消防 → 安全费
// 3. 采购/购买/耗材 → 物资采购
// 4. 日期范围(XX年X月-XX年X月) 或 维护/保养/维保/调试/清运/化粪池/垃圾/清洗/水箱/水质/绿化/养护/虫控/消杀 → 维保费
// 5. 维修/修理/更换/大修/工程/施工/改造/安装/检验 → 维修费
// 6. 其余 → 其他
const DATE_RANGE_RE = /\d{4}[.\s]*年\s*\d{1,2}[.\s]*月\s*[-—~至到]\s*\d{4}[.\s]*年\s*\d{1,2}[.\s]*月/;
const CATEGORY_REMAP = {
  '物业费（保安保洁礼仪接待）': '物业费',
  '房屋和设备维修费': '维修费',
  '环境和设备维保费': '维保费',
};

function classifyPropertyExpense(item) {
  const text = (item.purpose || '') + (item.notes || '');
  if (/保安|保洁|礼仪|接待/.test(text)) return '物业费';
  if (/安全|消防/.test(text)) return '安全费';
  if (/采购|购买|耗材/.test(text)) return '物资采购';
  if (DATE_RANGE_RE.test(text)) return '维保费';
  if (/维护|保养|维保|调试|清运|化粪池|垃圾|清洗|水箱|水质|绿化|养护|虫控|消杀/.test(text)) return '维保费';
  if (/维修|修理|更换|大修|工程|施工|改造|安装|检验/.test(text)) return '维修费';
  return '其他';
}

export function migrateData() {
  for (const dk of DATA_KEYS) {
    const val = get(dk);
    if (!val || !Array.isArray(val)) continue;
    let changed = false;
    for (const item of val) {
      if (!item.expenseType) continue;
      // 旧分类名映射
      if (CATEGORY_REMAP[item.expenseType]) {
        item.expenseType = CATEGORY_REMAP[item.expenseType];
        changed = true;
      }
      // 按用途内容重新归类
      if (item.purpose) {
        const newType = classifyPropertyExpense(item);
        if (item.expenseType !== newType) {
          item.expenseType = newType;
          changed = true;
        }
      }
    }
    if (changed) set(dk, val);
  }
}

export async function autoLoadData() {
  const needsImport = DATA_KEYS.some(k => {
    const val = get(k);
    return val === null || (Array.isArray(val) && val.length === 0);
  });

  if (needsImport) {
    try {
      const resp = await fetch('data/import-data.json');
      if (resp.ok) {
        const json = await resp.json();
        if (json && json.data) {
          for (const k of DATA_KEYS) {
            if (json.data[k] !== undefined) {
              set(k, json.data[k]);
            }
          }
        }
      }
    } catch (e) {
      // 加载失败时由 initAllKeys 设置空默认值
    }
  }

  migrateData();
  initAllKeys();
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
