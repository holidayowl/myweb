import { get, set } from '../storage.js';
import { uuid, formatDate, formatCurrency, today, showToast, showModal, closeModal, confirm, paginate } from '../utils.js';
import { createPieChart, createBarChart, destroyChart } from '../charts.js';
import { importFromExcel, validateImport, resolveImportColumns, downloadImportTemplate, exportToExcel } from '../excel.js';

const COLUMN_ALIASES = {
  expenseType: ['支出项目', '项目', '费用类型', '支出类别', '类型', '类别'],
  amount: ['金额', '支出金额', '费用金额', '数额'],
  expenseDate: ['日期', '支出日期', '发生日期', '时间'],
  paymentMethod: ['支付方式', '方式', '付款方式'],
  purpose: ['用途', '用途说明', '说明', '事由'],
  notes: ['备注', '备注说明'],
};
const REQUIRED_KEYS = ['expenseType', 'amount', 'expenseDate'];
const TEMPLATE_HEADERS = ['支出项目', '金额', '日期', '支付方式', '用途说明', '备注'];

const PAGE_KEY = 'property_page';
const EXPENSE_TYPES = ['设备维保费', '保洁费', '绿化费', '安保费', '维修耗材费', '水电维修', '其他'];
const PAYMENT_METHODS = ['银行转账', '现金', '微信', '支付宝', '其他'];

function getData() { return get('property') || []; }
function saveData(d) { set('property', d); }

export function renderPropertyList() {
  const data = getData();
  const settings = get('settings') || {};
  const threshold = settings.largeExpenseThreshold || 5000;
  const total = data.reduce((s, d) => s + (Number(d.amount) || 0), 0);
  const largeCount = data.filter(d => (Number(d.amount) || 0) >= threshold).length;
  const thisMonth = new Date().toISOString().slice(0, 7);
  const monthTotal = data.filter(d => d.expenseDate && d.expenseDate.startsWith(thisMonth)).reduce((s, d) => s + (Number(d.amount) || 0), 0);

  return `
    <div class="page-header"><h2>🏗️ 物业运维支出</h2></div>
    <div class="stat-cards">
      <div class="stat-card"><div class="stat-label">当月支出</div><div class="stat-value">${formatCurrency(monthTotal)}</div></div>
      <div class="stat-card"><div class="stat-label">累计总支出</div><div class="stat-value">${formatCurrency(total)}</div></div>
      <div class="stat-card stat-warning"><div class="stat-label">大额支出（≥${formatCurrency(threshold)}）</div><div class="stat-value">${largeCount} <span style="font-size:14px">笔</span></div></div>
      <div class="stat-card"><div class="stat-label">支出类别</div><div class="stat-value">${[...new Set(data.map(d => d.expenseType))].length} <span style="font-size:14px">类</span></div></div>
    </div>
    <div id="property-filter" class="filter-bar">
      <select id="filter-prop-type" class="form-select" style="min-width:140px">
        <option value="all">全部类别</option>
        ${EXPENSE_TYPES.map(t => `<option value="${t}">${t}</option>`).join('')}
      </select>
      <input id="filter-prop-month" type="month" class="form-input" style="min-width:160px">
      <button id="filter-prop-reset" class="btn btn-outline btn-sm">重置</button>
    </div>
    <div class="toolbar">
      <button id="prop-add-btn" class="btn btn-primary">+ 新增支出</button>
      <button id="prop-import-btn" class="btn btn-outline">📥 导入Excel</button>
      <button id="prop-template-btn" class="btn btn-outline btn-sm">📋 模板</button>
      <button id="prop-export-btn" class="btn btn-outline">📤 导出Excel</button>
    </div>
    <input type="file" id="prop-import-file" accept=".xlsx,.xls" style="display:none">
    <div class="card" style="overflow-x:auto">
      <table class="data-table">
        <thead><tr><th>支出项目</th><th>金额</th><th>日期</th><th>支付方式</th><th>大额</th><th>用途</th><th>操作</th></tr></thead>
        <tbody id="property-tbody"></tbody>
      </table>
      <div id="property-pagination" class="pagination"></div>
    </div>
    <div class="charts-row">
      <div class="chart-box"><h4>支出类别占比</h4><div style="height:280px;position:relative"><canvas id="chart-prop-type"></canvas></div></div>
      <div class="chart-box"><h4>月度支出趋势</h4><div style="height:280px;position:relative"><canvas id="chart-prop-trend"></canvas></div></div>
    </div>
  `;
}

export function setupPropertyEvents() {
  renderPropertyContent();
  document.getElementById('prop-add-btn').addEventListener('click', () => showPropertyForm(null));

  document.getElementById('prop-import-btn').addEventListener('click', () => {
    document.getElementById('prop-import-file').click();
  });

  document.getElementById('prop-import-file').addEventListener('change', async (e) => {
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
        const settings = get('settings') || {};
        const threshold = settings.largeExpenseThreshold || 5000;
        const mapped = valid.map(row => ({
          id: uuid(),
          expenseType: row[resolved.expenseType] || '',
          amount: parseFloat(row[resolved.amount]) || 0,
          expenseDate: row[resolved.expenseDate] || '',
          paymentMethod: row[resolved.paymentMethod] || '',
          purpose: row[resolved.purpose] || '',
          isLargeExpense: (parseFloat(row[resolved.amount]) || 0) >= threshold,
          notes: row[resolved.notes] || '',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }));
        getData().push(...mapped);
        saveData(getData());
        showToast(`成功导入 ${valid.length} 条支出记录`);
        renderPropertyContent();
      }
    } catch (err) { showToast(err.message || '导入失败', 'error'); }
    e.target.value = '';
  });

  document.getElementById('prop-template-btn').addEventListener('click', () => {
    downloadImportTemplate(TEMPLATE_HEADERS, '物业运维支出', '运维支出导入模板.xlsx');
    showToast('模板已下载。');
  });

  document.getElementById('prop-export-btn').addEventListener('click', () => {
    const data = getData();
    const sheets = [{ name: '物业运维支出', headers: ['支出项目', '金额', '日期', '支付方式', '用途', '备注'],
      data: data.map(d => ({ '支出项目': d.expenseType, '金额': d.amount, '日期': d.expenseDate, '支付方式': d.paymentMethod, '用途': d.purpose, '备注': d.notes })) }];
    exportToExcel(sheets, `物业运维支出_${today()}.xlsx`);
    showToast('导出成功');
  });
  document.getElementById('filter-prop-type').addEventListener('change', () => renderPropertyContent());
  document.getElementById('filter-prop-month').addEventListener('input', () => renderPropertyContent());
  document.getElementById('filter-prop-reset').addEventListener('click', () => {
    document.getElementById('filter-prop-type').value = 'all';
    document.getElementById('filter-prop-month').value = '';
    renderPropertyContent();
  });
}

export function cleanupProperty() {
  destroyChart('chart-prop-type');
  destroyChart('chart-prop-trend');
}

function renderPropertyContent() {
  let data = getData();
  const typeF = document.getElementById('filter-prop-type').value;
  const monthF = document.getElementById('filter-prop-month').value;
  if (typeF !== 'all') data = data.filter(d => d.expenseType === typeF);
  if (monthF) data = data.filter(d => d.expenseDate && d.expenseDate.startsWith(monthF));

  data.sort((a, b) => new Date(b.expenseDate || b.createdAt) - new Date(a.expenseDate || a.createdAt));
  const settings = get('settings') || {};
  const threshold = settings.largeExpenseThreshold || 5000;
  const p = paginate(data, PAGE_KEY, 15);

  const tbody = document.getElementById('property-tbody');
  if (p.items.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--text-muted)">暂无数据，点击 "+ 新增支出" 开始记录</td></tr>`;
  } else {
    tbody.innerHTML = p.items.map(d => `
      <tr>
        <td><strong>${esc(d.expenseType)}</strong></td>
        <td>${formatCurrency(d.amount)}</td>
        <td>${formatDate(d.expenseDate)}</td>
        <td>${esc(d.paymentMethod)}</td>
        <td>${(Number(d.amount) || 0) >= threshold ? '<span class="tag tag-warning">大额</span>' : '-'}</td>
        <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(d.purpose)}</td>
        <td class="actions">
          <button class="btn btn-outline btn-sm" data-edit="${d.id}">编辑</button>
          <button class="btn btn-outline btn-sm" data-delete="${d.id}" style="color:var(--danger)">删除</button>
        </td>
      </tr>
    `).join('');
  }

  const pagDiv = document.getElementById('property-pagination');
  if (p.totalPages > 1) {
    pagDiv.innerHTML = buildPagination(p);
    pagDiv.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', () => { p.setPage(parseInt(btn.dataset.page)); renderPropertyContent(); });
    });
  } else { pagDiv.innerHTML = ''; }

  tbody.querySelectorAll('[data-edit]').forEach(btn => btn.addEventListener('click', () => showPropertyForm(btn.dataset.edit)));
  tbody.querySelectorAll('[data-delete]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (confirm('确定要删除这条记录吗？')) {
        saveData(getData().filter(d => d.id !== btn.dataset.delete));
        showToast('已删除');
        renderPropertyContent();
      }
    });
  });

  renderPropertyCharts(data);
}

function renderPropertyCharts(data) {
  const typeMap = {};
  data.forEach(d => { typeMap[d.expenseType] = (typeMap[d.expenseType] || 0) + (Number(d.amount) || 0); });
  const types = Object.keys(typeMap).sort((a, b) => typeMap[b] - typeMap[a]);
  createPieChart('chart-prop-type', types, types.map(t => Math.round(typeMap[t])), null);

  const monthMap = {};
  data.forEach(d => {
    const m = (d.expenseDate || '').slice(0, 7);
    if (m) monthMap[m] = (monthMap[m] || 0) + (Number(d.amount) || 0);
  });
  const months = Object.keys(monthMap).sort();
  createBarChart('chart-prop-trend', months, [{ label: '月度支出', data: months.map(m => Math.round(monthMap[m])), backgroundColor: '#1a73e8' }], null);
}

function showPropertyForm(editId) {
  const data = getData();
  const item = editId ? data.find(d => d.id === editId) : null;
  const title = item ? '编辑支出' : '新增支出';

  const body = `
    <form id="property-form">
      <input type="hidden" name="id" value="${item ? item.id : ''}">
      <div class="form-row">
        <div class="form-group"><label>支出项目</label>
          <select name="expenseType" class="form-select">${EXPENSE_TYPES.map(t => `<option value="${t}" ${item && item.expenseType === t ? 'selected' : ''}>${t}</option>`).join('')}</select>
        </div>
        <div class="form-group"><label>金额 <span class="hint">*</span></label>
          <input name="amount" type="number" step="0.01" class="form-input" value="${item ? item.amount : ''}" required>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>支出日期 <span class="hint">*</span></label>
          <input name="expenseDate" type="date" class="form-input" value="${item ? item.expenseDate : ''}" required>
        </div>
        <div class="form-group"><label>支付方式</label>
          <select name="paymentMethod" class="form-select">${PAYMENT_METHODS.map(m => `<option value="${m}" ${item && item.paymentMethod === m ? 'selected' : ''}>${m}</option>`).join('')}</select>
        </div>
      </div>
      <div class="form-group"><label>用途说明</label>
        <input name="purpose" class="form-input" value="${item ? esc(item.purpose) : ''}">
      </div>
      <div class="form-group"><label>备注</label>
        <input name="notes" class="form-input" value="${item ? esc(item.notes) : ''}">
      </div>
    </form>
  `;

  showModal(title, body, `
    <button id="prop-form-cancel" class="btn btn-outline">取消</button>
    <button id="prop-form-save" class="btn btn-primary">保存</button>
  `);

  document.getElementById('prop-form-cancel').addEventListener('click', closeModal);
  document.getElementById('prop-form-save').addEventListener('click', () => {
    const form = document.getElementById('property-form');
    const fd = new FormData(form);
    const fields = Object.fromEntries(fd.entries());
    if (!fields.amount || !fields.expenseDate) { showToast('请填写必填字段。', 'error'); return; }

    const settings = get('settings') || {};
    const threshold = settings.largeExpenseThreshold || 5000;
    const list = getData();
    const now = new Date().toISOString();
    const record = {
      id: fields.id || uuid(),
      expenseType: fields.expenseType,
      amount: parseFloat(fields.amount) || 0,
      expenseDate: fields.expenseDate,
      paymentMethod: fields.paymentMethod,
      purpose: fields.purpose || '',
      isLargeExpense: (parseFloat(fields.amount) || 0) >= threshold,
      notes: fields.notes || '',
      updatedAt: now,
    };

    if (fields.id) {
      const idx = list.findIndex(d => d.id === fields.id);
      if (idx >= 0) list[idx] = { ...list[idx], ...record };
    } else {
      record.createdAt = now;
      list.push(record);
    }
    saveData(list);
    closeModal();
    showToast('已保存');
    renderPropertyContent();
  });
}

function buildPagination(p) {
  let h = `<button ${p.page <= 1 ? 'disabled' : ''} data-page="${p.page - 1}">上一页</button>`;
  for (let i = 1; i <= p.totalPages; i++) h += `<button class="${i === p.page ? 'active' : ''}" data-page="${i}">${i}</button>`;
  h += `<button ${p.page >= p.totalPages ? 'disabled' : ''} data-page="${p.page + 1}">下一页</button>`;
  return h;
}

function esc(s) { return s ? String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;') : ''; }
