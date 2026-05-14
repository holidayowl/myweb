import { get, set } from '../storage.js';
import { uuid, formatNumber, formatCurrency, formatDate, showToast, showModal, closeModal, confirm, paginate, getMonthLabel } from '../utils.js';
import { createLineChart, createBarChart, destroyChart } from '../charts.js';
import { importFromExcel, validateImport, resolveImportColumns, downloadImportTemplate } from '../excel.js';

const COLUMN_ALIASES = {
  energyType: ['能耗类型', '类型', '能源类型', '种类'],
  period: ['统计周期', '周期', '月份', '统计月份', '时间'],
  value: ['用量', '数值', '使用量', '消耗量', '用量数值'],
  cost: ['费用', '支出', '金额', '费用支出', '支出金额'],
  unit: ['单位', '计量单位'],
  notes: ['备注', '说明'],
};
const REQUIRED_KEYS = ['energyType', 'period', 'value'];
const TEMPLATE_HEADERS = ['能耗类型', '统计周期', '用量', '费用(元)', '单位', '备注'];

const PAGE_KEY = 'energy_page';
const ENERGY_TYPES = [
  { value: 'water', label: '水' },
  { value: 'electric', label: '电' },
  { value: 'gas', label: '气' },
];
const UNITS = { water: '吨', electric: '度', gas: '立方米' };

function getData() { return get('energy') || []; }
function saveData(d) { set('energy', d); }
function typeLabel(v) { const t = ENERGY_TYPES.find(e => e.value === v); return t ? t.label : v; }

export function renderEnergyList() {
  return `
    <div class="page-header"><h2>⚡ 能耗信息</h2></div>
    <div class="stat-cards" id="energy-stats"></div>

    <div id="energy-yearly" class="card" style="margin-bottom:16px">
      <div class="card-header" style="cursor:pointer" onclick="this.parentElement.querySelector('.yearly-body').classList.toggle('hidden')">
        📊 各年度总览 <span style="font-size:12px;color:var(--text-muted);font-weight:400">（点击展开/收起）</span>
      </div>
      <div class="yearly-body hidden" id="energy-yearly-body"></div>
    </div>

    <div id="energy-yoy" class="card" style="margin-bottom:16px">
      <div class="card-header" style="cursor:pointer" onclick="this.parentElement.querySelector('.yoy-body').classList.toggle('hidden')">
        📈 同比对比（今年 vs 去年） <span style="font-size:12px;color:var(--text-muted);font-weight:400">（点击展开/收起）</span>
      </div>
      <div class="yoy-body hidden" id="energy-yoy-body"></div>
    </div>

    <div id="energy-filter" class="filter-bar">
      <select id="filter-energy-type" class="form-select" style="min-width:120px">
        <option value="all">全部类型</option>
        ${ENERGY_TYPES.map(t => `<option value="${t.value}">${t.label}</option>`).join('')}
      </select>
      <input id="filter-energy-period" type="month" class="form-input" style="min-width:160px">
      <button id="filter-energy-reset" class="btn btn-outline btn-sm">重置</button>
    </div>
    <div class="toolbar">
      <button id="energy-add-btn" class="btn btn-primary">+ 新增记录</button>
      <button id="energy-import-btn" class="btn btn-outline">📥 批量导入</button>
      <button id="energy-template-btn" class="btn btn-outline btn-sm">📋 模板</button>
    </div>
    <input type="file" id="energy-import-file" accept=".xlsx,.xls" style="display:none">
    <div class="card" style="overflow-x:auto">
      <table class="data-table">
        <thead><tr>
          <th>能耗类型</th><th>统计周期</th><th>用量</th><th>单位</th><th>费用(元)</th><th>异常</th><th>备注</th><th>操作</th>
        </tr></thead>
        <tbody id="energy-tbody"></tbody>
      </table>
      <div id="energy-pagination" class="pagination"></div>
    </div>
    <div class="charts-row">
      <div class="chart-box"><h4>月度用量趋势</h4><div style="height:280px;position:relative"><canvas id="chart-energy-trend"></canvas></div></div>
      <div class="chart-box"><h4>月度费用趋势</h4><div style="height:280px;position:relative"><canvas id="chart-energy-cost"></canvas></div></div>
    </div>
  `;
}

export function setupEnergyEvents() {
  renderEnergyContent();

  document.getElementById('energy-add-btn').addEventListener('click', () => showEnergyForm(null));
  document.getElementById('energy-import-btn').addEventListener('click', () => {
    document.getElementById('energy-import-file').click();
  });

  document.getElementById('energy-import-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const result = await importFromExcel(file);
      const sheetData = result[Object.keys(result)[0]] || [];
      if (sheetData.length === 0) { showToast('文件中没有数据。', 'error'); e.target.value = ''; return; }

      const actualHeaders = Object.keys(sheetData[0]);
      const { resolved, unmatched } = resolveImportColumns(actualHeaders, COLUMN_ALIASES);
      const unmatchedRequired = unmatched.filter(k => REQUIRED_KEYS.includes(k));

      if (unmatchedRequired.length > 0) {
        const names = unmatchedRequired.map(k => COLUMN_ALIASES[k][0]).join('、');
        showToast(`未识别必填列：${names}。当前文件包含：${actualHeaders.join(', ')}。请下载模板。`, 'error');
        e.target.value = ''; return;
      }

      const { valid, errors } = validateImport(sheetData, resolved, REQUIRED_KEYS);
      if (errors.length > 0) {
        const rows = errors.slice(0, 5).map(r => `第${r.row}行`).join(',');
        showToast(`导入：${valid.length}条成功，${errors.length}条失败（${rows}）`, 'warning');
      }
      if (valid.length > 0) {
        const typeMap = { '水': 'water', '电': 'electric', '气': 'gas' };
        const mapped = valid.map(row => {
          const et = String(row[resolved.energyType] || '').trim();
          const ut = String(row[resolved.unit] || '').trim();
          return {
            id: uuid(),
            energyType: typeMap[et] || 'electric',
            period: String(row[resolved.period] || '').trim(),
            value: parseFloat(row[resolved.value]) || 0,
            cost: parseFloat(row[resolved.cost]) || 0,
            unit: ut || undefined,
            isAbnormal: false,
            notes: row[resolved.notes] || '',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
        });
        getData().push(...mapped);
        saveData(getData());
        showToast(`成功导入 ${valid.length} 条能耗记录`);
        renderEnergyContent();
      }
    } catch (err) { showToast(err.message || '导入失败', 'error'); }
    e.target.value = '';
  });

  document.getElementById('energy-template-btn').addEventListener('click', () => {
    downloadImportTemplate(TEMPLATE_HEADERS, '能耗数据', '能耗导入模板.xlsx');
    showToast('模板已下载。');
  });

  document.getElementById('filter-energy-type').addEventListener('change', () => renderEnergyContent());
  document.getElementById('filter-energy-period').addEventListener('input', () => renderEnergyContent());
  document.getElementById('filter-energy-reset').addEventListener('click', () => {
    document.getElementById('filter-energy-type').value = 'all';
    document.getElementById('filter-energy-period').value = '';
    renderEnergyContent();
  });
}

export function cleanupEnergy() {
  destroyChart('chart-energy-trend');
  destroyChart('chart-energy-cost');
}

function renderEnergyContent(filter = {}) {
  let data = getData();
  const typeFilter = filter.type || document.getElementById('filter-energy-type').value;
  const periodFilter = filter.period || document.getElementById('filter-energy-period').value;

  if (typeFilter && typeFilter !== 'all') data = data.filter(d => d.energyType === typeFilter);
  if (periodFilter) data = data.filter(d => d.period.startsWith(periodFilter));

  // Stats: this year usage + cost only
  const thisYear = String(new Date().getFullYear());
  const thisYearData = data.filter(d => d.period && d.period.startsWith(thisYear));
  const stats = {};
  const costStats = {};
  for (const d of thisYearData) {
    if (!stats[d.energyType]) { stats[d.energyType] = 0; costStats[d.energyType] = 0; }
    stats[d.energyType] += Number(d.value) || 0;
    costStats[d.energyType] += Number(d.cost) || 0;
  }

  let statsHtml = '';
  for (const t of ENERGY_TYPES) {
    const val = stats[t.value] || 0;
    const cst = costStats[t.value] || 0;
    statsHtml += `<div class="stat-card"><div class="stat-label">${thisYear}年${t.label}用量</div><div class="stat-value">${formatNumber(val)} <span style="font-size:14px">${UNITS[t.value]}</span></div><div class="stat-sub">费用: ${formatCurrency(cst)}</div></div>`;
  }
  const abnormal = data.filter(d => d.isAbnormal).length;
  statsHtml += `<div class="stat-card ${abnormal > 0 ? 'stat-warning' : ''}"><div class="stat-label">异常记录</div><div class="stat-value">${abnormal} <span style="font-size:14px">条</span></div></div>`;
  document.getElementById('energy-stats').innerHTML = statsHtml;

  // Yearly overview
  renderYearlyOverview(data);
  renderYoYComparison(data);

  // Table with cost column
  data.sort((a, b) => b.period.localeCompare(a.period));
  const p = paginate(data, PAGE_KEY, 15);
  const tbody = document.getElementById('energy-tbody');
  if (p.items.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:40px;color:var(--text-muted)">暂无数据，点击 "+ 新增记录" 开始</td></tr>`;
  } else {
    tbody.innerHTML = p.items.map(d => `
      <tr>
        <td>${typeLabel(d.energyType)}</td>
        <td>${getMonthLabel(d.period)}</td>
        <td><strong>${formatNumber(d.value)}</strong></td>
        <td>${d.unit || UNITS[d.energyType]}</td>
        <td>${formatCurrency(d.cost || 0)}</td>
        <td>${d.isAbnormal ? '<span class="tag tag-danger">异常</span>' : '<span class="tag tag-success">正常</span>'}</td>
        <td>${esc(d.notes)}</td>
        <td class="actions">
          <button class="btn btn-outline btn-sm" data-edit="${d.id}">编辑</button>
          <button class="btn btn-outline btn-sm" data-delete="${d.id}" style="color:var(--danger)">删除</button>
        </td>
      </tr>
    `).join('');
  }

  const pagDiv = document.getElementById('energy-pagination');
  if (p.totalPages > 1) {
    pagDiv.innerHTML = buildPagination(p);
    pagDiv.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', () => { p.setPage(parseInt(btn.dataset.page)); renderEnergyContent(filter); });
    });
  } else { pagDiv.innerHTML = ''; }

  tbody.querySelectorAll('[data-edit]').forEach(btn => btn.addEventListener('click', () => showEnergyForm(btn.dataset.edit)));
  tbody.querySelectorAll('[data-delete]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (confirm('确定要删除这条记录吗？')) {
        saveData(getData().filter(d => d.id !== btn.dataset.delete));
        showToast('记录已删除');
        renderEnergyContent(filter);
      }
    });
  });

  renderEnergyCharts(data);
}

function renderYearlyOverview(data) {
  const years = {};
  for (const d of data) {
    const y = d.period.slice(0, 4);
    if (!years[y]) years[y] = {};
    if (!years[y][d.energyType]) years[y][d.energyType] = { value: 0, cost: 0 };
    years[y][d.energyType].value += Number(d.value) || 0;
    years[y][d.energyType].cost += Number(d.cost) || 0;
  }

  const sorted = Object.keys(years).sort();
  let html = '<table class="data-table"><thead><tr><th>年份</th>';
  for (const t of ENERGY_TYPES) { html += `<th>${t.label}用量</th><th>${t.label}费用</th>`; }
  html += '<th>总费用</th></tr></thead><tbody>';

  for (const y of sorted) {
    html += `<tr><td><strong>${y}</strong></td>`;
    let yTotal = 0;
    for (const t of ENERGY_TYPES) {
      const d = (years[y] && years[y][t.value]) || { value: 0, cost: 0 };
      html += `<td>${Math.round(d.value).toLocaleString('zh-CN')} ${UNITS[t.value]}</td><td>${formatCurrency(d.cost)}</td>`;
      yTotal += d.cost;
    }
    html += `<td><strong>${formatCurrency(yTotal)}</strong></td></tr>`;
  }
  html += '</tbody></table>';
  document.getElementById('energy-yearly-body').innerHTML = html;
}

function renderYoYComparison(data) {
  const now = new Date();
  const thisYear = String(now.getFullYear());
  const lastYear = String(now.getFullYear() - 1);

  // Find the latest month that exists in this year's data
  let latestMonth = 0;
  for (const d of data) {
    if (d.period && d.period.startsWith(thisYear)) {
      const m = parseInt(d.period.slice(5, 7));
      if (m > latestMonth) latestMonth = m;
    }
  }
  // Also check last year's available months
  let lastYearLatest = 0;
  for (const d of data) {
    if (d.period && d.period.startsWith(lastYear)) {
      const m = parseInt(d.period.slice(5, 7));
      if (m > lastYearLatest) lastYearLatest = m;
    }
  }
  const compareMonths = Math.min(latestMonth, lastYearLatest);
  if (compareMonths === 0) {
    document.getElementById('energy-yoy-body').innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:16px">数据不足，无法对比</p>';
    return;
  }

  const calc = (year, type) => {
    let val = 0, cost = 0, count = 0;
    for (const d of data) {
      if (d.energyType === type && d.period.startsWith(year)) {
        const m = parseInt(d.period.slice(5,7));
        if (m <= compareMonths) {
          val += Number(d.value) || 0;
          cost += Number(d.cost) || 0;
          count++;
        }
      }
    }
    return { val, cost, count };
  };

  const monthLabel = `同期1-${compareMonths}月`;
  let html = '<table class="data-table"><thead><tr><th>类型</th><th>指标</th><th>去年(' + lastYear + ')</th><th>今年(' + thisYear + ')</th><th>变化</th></tr></thead><tbody>';

  for (const t of ENERGY_TYPES) {
    const ly = calc(lastYear, t.value);
    const ty = calc(thisYear, t.value);

    const valChg = ly.val > 0 ? ((ty.val - ly.val) / ly.val * 100).toFixed(1) : '-';
    const costChg = ly.cost > 0 ? ((ty.cost - ly.cost) / ly.cost * 100).toFixed(1) : '-';

    html += `<tr><td rowspan="2"><strong>${t.label}</strong></td>
      <td>用量</td><td>${formatNumber(ly.val)} ${UNITS[t.value]}</td><td>${formatNumber(ty.val)} ${UNITS[t.value]}</td>
      <td>${valChg !== '-' ? (Number(valChg) >= 0 ? '<span style="color:var(--danger)">+' : '<span style="color:var(--success)">') + valChg + '%</span>' : '-'}</td></tr>`;
    html += `<tr><td>费用</td><td>${formatCurrency(ly.cost)}</td><td>${formatCurrency(ty.cost)}</td>
      <td>${costChg !== '-' ? (Number(costChg) >= 0 ? '<span style="color:var(--danger)">+' : '<span style="color:var(--success)">') + costChg + '%</span>' : '-'}</td></tr>`;
  }
  html += `<tr><td colspan="5" style="text-align:center;color:var(--text-muted);font-size:12px;padding-top:8px">对比范围：${monthLabel}（两年度均有数据的月份）</td></tr>`;
  html += '</tbody></table>';
  document.getElementById('energy-yoy-body').innerHTML = html;
}

function renderEnergyCharts(data) {
  const periodData = {};
  for (const d of data) {
    if (!periodData[d.period]) periodData[d.period] = { value: {}, cost: {} };
    periodData[d.period].value[d.energyType] = (periodData[d.period].value[d.energyType] || 0) + (Number(d.value) || 0);
    periodData[d.period].cost[d.energyType] = (periodData[d.period].cost[d.energyType] || 0) + (Number(d.cost) || 0);
  }
  const periods = Object.keys(periodData).sort().slice(-24);
  createLineChart('chart-energy-trend', periods.map(getMonthLabel),
    ENERGY_TYPES.map(t => ({ label: t.label, data: periods.map(p => periodData[p].value[t.value] || 0) })), null);

  createLineChart('chart-energy-cost', periods.map(getMonthLabel),
    ENERGY_TYPES.map(t => ({ label: t.label + '费用', data: periods.map(p => periodData[p].cost[t.value] || 0) })), null);
}

function showEnergyForm(editId) {
  const data = getData();
  const item = editId ? data.find(d => d.id === editId) : null;
  const title = item ? '编辑能耗记录' : '新增能耗记录';

  const body = `
    <form id="energy-form">
      <input type="hidden" name="id" value="${item ? item.id : ''}">
      <div class="form-row">
        <div class="form-group"><label>能耗类型</label>
          <select name="energyType" class="form-select">${ENERGY_TYPES.map(t => `<option value="${t.value}" ${item && item.energyType === t.value ? 'selected' : ''}>${t.label}</option>`).join('')}</select>
        </div>
        <div class="form-group"><label>统计周期（月份）</label>
          <input name="period" type="month" class="form-input" value="${item ? item.period : ''}" required>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>用量数值 <span class="hint">*</span></label>
          <input name="value" type="number" step="0.1" class="form-input" value="${item ? item.value : ''}" required>
        </div>
        <div class="form-group"><label>费用支出（元）</label>
          <input name="cost" type="number" step="0.01" class="form-input" value="${item ? (item.cost || '') : ''}">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>单位</label>
          <select name="unit" class="form-select">
            <option value="">自动</option>
            <option value="吨" ${item && item.unit === '吨' ? 'selected' : ''}>吨</option>
            <option value="度" ${item && item.unit === '度' ? 'selected' : ''}>度</option>
            <option value="立方米" ${item && item.unit === '立方米' ? 'selected' : ''}>立方米</option>
          </select>
        </div>
        <div class="form-group"><label>是否异常</label>
          <select name="isAbnormal" class="form-select">
            <option value="0" ${item && !item.isAbnormal ? 'selected' : ''}>否</option>
            <option value="1" ${item && item.isAbnormal ? 'selected' : ''}>是</option>
          </select>
        </div>
      </div>
      <div class="form-group"><label>备注</label>
        <input name="notes" class="form-input" value="${item ? esc(item.notes) : ''}">
      </div>
    </form>
  `;

  showModal(title, body, `<button id="energy-form-cancel" class="btn btn-outline">取消</button><button id="energy-form-save" class="btn btn-primary">保存</button>`);

  document.getElementById('energy-form-cancel').addEventListener('click', closeModal);
  document.getElementById('energy-form-save').addEventListener('click', () => {
    const form = document.getElementById('energy-form');
    const fd = new FormData(form);
    const fields = Object.fromEntries(fd.entries());
    if (!fields.period || !fields.value) { showToast('请填写必填字段。', 'error'); return; }

    const list = getData();
    const now = new Date().toISOString();
    const et = fields.energyType;
    const record = {
      energyType: et, period: fields.period, value: parseFloat(fields.value) || 0,
      cost: parseFloat(fields.cost) || 0, unit: fields.unit || UNITS[et],
      isAbnormal: fields.isAbnormal === '1', notes: fields.notes || '', updatedAt: now,
    };

    if (fields.id) {
      const idx = list.findIndex(d => d.id === fields.id);
      if (idx >= 0) list[idx] = { ...list[idx], ...record };
    } else {
      list.push({ id: uuid(), ...record, createdAt: now });
    }

    saveData(list);
    closeModal();
    showToast('记录已保存');
    renderEnergyContent();
  });
}

function buildPagination(p) {
  let h = `<button ${p.page <= 1 ? 'disabled' : ''} data-page="${p.page - 1}">上一页</button>`;
  for (let i = 1; i <= p.totalPages; i++) h += `<button class="${i === p.page ? 'active' : ''}" data-page="${i}">${i}</button>`;
  h += `<button ${p.page >= p.totalPages ? 'disabled' : ''} data-page="${p.page + 1}">下一页</button>`;
  return h;
}

function esc(s) { return s ? String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;') : ''; }
