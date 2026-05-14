import { get, set } from '../storage.js';
import { uuid, formatNumber, formatDate, showToast, showModal, closeModal, confirm, paginate, getMonthLabel } from '../utils.js';
import { createLineChart, createBarChart, destroyChart } from '../charts.js';
import { importFromExcel, validateImport } from '../excel.js';

const PAGE_KEY = 'energy_page';
const ENERGY_TYPES = [
  { value: 'water', label: '水' },
  { value: 'electric', label: '电' },
  { value: 'gas', label: '气' },
];
const UNITS = { water: '吨', electric: '度', gas: '立方米' };

function getData() { return get('energy') || []; }
function saveData(d) { set('energy', d); }

function typeLabel(v) {
  const t = ENERGY_TYPES.find(e => e.value === v);
  return t ? t.label : v;
}

export function renderEnergyList() {
  const data = getData();
  const types = [...new Set(data.map(d => d.energyType))];

  return `
    <div class="page-header"><h2>⚡ 能耗用量情况</h2></div>
    <div class="stat-cards" id="energy-stats"></div>
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
    </div>
    <div class="card" style="overflow-x:auto">
      <table class="data-table">
        <thead><tr>
          <th>能耗类型</th><th>统计周期</th><th>用量</th><th>单位</th><th>异常</th><th>备注</th><th>时间</th><th>操作</th>
        </tr></thead>
        <tbody id="energy-tbody"></tbody>
      </table>
      <div id="energy-pagination" class="pagination"></div>
    </div>
    <div class="charts-row">
      <div class="chart-box"><h4>月度用量趋势</h4><div style="height:280px;position:relative"><canvas id="chart-energy-trend"></canvas></div></div>
      <div class="chart-box"><h4>各类型累计用量</h4><div style="height:280px;position:relative"><canvas id="chart-energy-type"></canvas></div></div>
    </div>
    <div id="energy-import-area" class="hidden" style="margin-top:16px">
      <input type="file" id="energy-import-file" accept=".xlsx,.xls">
      <button id="energy-import-run" class="btn btn-sm btn-primary">执行导入</button>
    </div>
  `;
}

export function setupEnergyEvents() {
  renderEnergyContent();

  document.getElementById('energy-add-btn').addEventListener('click', () => showEnergyForm(null));
  document.getElementById('energy-import-btn').addEventListener('click', () => {
    document.getElementById('energy-import-area').classList.toggle('hidden');
  });

  document.getElementById('energy-import-run').addEventListener('click', async () => {
    const fileInput = document.getElementById('energy-import-file');
    const file = fileInput.files[0];
    if (!file) { showToast('请先选择 Excel 文件。', 'error'); return; }
    try {
      const result = await importFromExcel(file);
      const sheetData = result[Object.keys(result)[0]] || [];
      const fieldMap = {
        energyType: '能耗类型', period: '统计周期', value: '用量', unit: '单位', notes: '备注'
      };
      const { valid, errors } = validateImport(sheetData, fieldMap, ['能耗类型', '统计周期', '用量']);
      if (errors.length > 0) {
        showToast(`导入完成：成功 ${valid.length} 条，失败 ${errors.length} 条`, 'warning');
      }
      if (valid.length > 0) {
        const typeMap = { '水': 'water', '电': 'electric', '气': 'gas' };
        const mapped = valid.map(row => {
          const et = row['能耗类型'];
          const ut = row['单位'] || '';
          return {
            id: uuid(),
            energyType: typeMap[et] || 'electric',
            period: row['统计周期'] || '',
            value: parseFloat(row['用量']) || 0,
            unit: ut || undefined,
            isAbnormal: false,
            notes: row['备注'] || '',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
        });
        const list = getData();
        list.push(...mapped);
        saveData(list);
        showToast(`成功导入 ${valid.length} 条能耗记录`);
        renderEnergyContent();
        document.getElementById('energy-import-area').classList.add('hidden');
        fileInput.value = '';
      }
    } catch (err) {
      showToast(err.message || '导入失败', 'error');
    }
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
  destroyChart('chart-energy-type');
}

function renderEnergyContent(filter = {}) {
  let data = getData();
  const typeFilter = filter.type || document.getElementById('filter-energy-type').value;
  const periodFilter = filter.period || document.getElementById('filter-energy-period').value;

  if (typeFilter && typeFilter !== 'all') data = data.filter(d => d.energyType === typeFilter);
  if (periodFilter) data = data.filter(d => d.period.startsWith(periodFilter));

  // Stats
  const stats = {};
  for (const d of data) {
    if (!stats[d.energyType]) stats[d.energyType] = 0;
    stats[d.energyType] += Number(d.value) || 0;
  }
  const abnormal = data.filter(d => d.isAbnormal).length;

  let statsHtml = '';
  for (const t of ENERGY_TYPES) {
    const val = stats[t.value] || 0;
    statsHtml += `<div class="stat-card"><div class="stat-label">${t.label}累计用量</div><div class="stat-value">${formatNumber(val)} <span style="font-size:14px">${UNITS[t.value]}</span></div></div>`;
  }
  statsHtml += `<div class="stat-card ${abnormal > 0 ? 'stat-warning' : ''}"><div class="stat-label">异常记录</div><div class="stat-value">${abnormal} <span style="font-size:14px">条</span></div></div>`;
  document.getElementById('energy-stats').innerHTML = statsHtml;

  // Table
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
        <td>${d.isAbnormal ? '<span class="tag tag-danger">异常</span>' : '<span class="tag tag-success">正常</span>'}</td>
        <td>${esc(d.notes)}</td>
        <td>${formatDate(d.createdAt)}</td>
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

function renderEnergyCharts(data) {
  const periodData = {};
  for (const d of data) {
    if (!periodData[d.period]) periodData[d.period] = {};
    periodData[d.period][d.energyType] = (periodData[d.period][d.energyType] || 0) + (Number(d.value) || 0);
  }
  const periods = Object.keys(periodData).sort();
  createLineChart('chart-energy-trend', periods.map(getMonthLabel),
    ENERGY_TYPES.map((t, i) => ({
      label: t.label,
      data: periods.map(p => periodData[p][t.value] || 0),
    })), null);

  const typeTotal = ENERGY_TYPES.map(t => {
    return data.filter(d => d.energyType === t.value).reduce((s, d) => s + (Number(d.value) || 0), 0);
  });
  createBarChart('chart-energy-type', ENERGY_TYPES.map(t => t.label),
    [{ label: '累计用量', data: typeTotal, backgroundColor: '#1a73e8' }], null);
}

function showEnergyForm(editId) {
  const data = getData();
  const item = editId ? data.find(d => d.id === editId) : null;
  const title = item ? '编辑能耗记录' : '新增能耗记录';

  const body = `
    <form id="energy-form">
      <input type="hidden" name="id" value="${item ? item.id : ''}">
      <div class="form-row">
        <div class="form-group">
          <label>能耗类型</label>
          <select name="energyType" class="form-select">
            ${ENERGY_TYPES.map(t => `<option value="${t.value}" ${item && item.energyType === t.value ? 'selected' : ''}>${t.label}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>统计周期（月份）</label>
          <input name="period" type="month" class="form-input" value="${item ? item.period : ''}" required>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>用量数值 <span class="hint">*</span></label>
          <input name="value" type="number" step="0.1" class="form-input" value="${item ? item.value : ''}" required>
        </div>
        <div class="form-group">
          <label>单位</label>
          <select name="unit" class="form-select">
            <option value="">自动</option>
            <option value="吨" ${item && item.unit === '吨' ? 'selected' : ''}>吨</option>
            <option value="度" ${item && item.unit === '度' ? 'selected' : ''}>度</option>
            <option value="立方米" ${item && item.unit === '立方米' ? 'selected' : ''}>立方米</option>
          </select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>是否异常</label>
          <select name="isAbnormal" class="form-select">
            <option value="0" ${item && !item.isAbnormal ? 'selected' : ''}>否</option>
            <option value="1" ${item && item.isAbnormal ? 'selected' : ''}>是</option>
          </select>
        </div>
        <div class="form-group">
          <label>备注</label>
          <input name="notes" class="form-input" value="${item ? esc(item.notes) : ''}">
        </div>
      </div>
    </form>
  `;

  showModal(title, body, `
    <button id="energy-form-cancel" class="btn btn-outline">取消</button>
    <button id="energy-form-save" class="btn btn-primary">保存</button>
  `);

  document.getElementById('energy-form-cancel').addEventListener('click', closeModal);
  document.getElementById('energy-form-save').addEventListener('click', () => {
    const form = document.getElementById('energy-form');
    const fd = new FormData(form);
    const fields = Object.fromEntries(fd.entries());

    if (!fields.period || !fields.value) {
      showToast('请填写必填字段。', 'error');
      return;
    }

    const list = getData();
    const now = new Date().toISOString();
    const et = fields.energyType;

    if (fields.id) {
      const idx = list.findIndex(d => d.id === fields.id);
      if (idx >= 0) {
        list[idx] = { ...list[idx], ...fields, value: parseFloat(fields.value) || 0, isAbnormal: fields.isAbnormal === '1', unit: fields.unit || UNITS[et], updatedAt: now };
      }
    } else {
      list.push({ id: uuid(), energyType: et, period: fields.period, value: parseFloat(fields.value) || 0, unit: fields.unit || UNITS[et], isAbnormal: fields.isAbnormal === '1', notes: fields.notes || '', createdAt: now, updatedAt: now });
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
