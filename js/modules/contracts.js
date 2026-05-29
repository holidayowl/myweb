import { get, set } from '../storage.js';
import { uuid, formatDate, formatCurrency, today, daysFromNow, showToast, showModal, closeModal, confirm, paginate } from '../utils.js';
import { createPieChart, createBarChart, destroyChart } from '../charts.js';
import { importFromExcel, validateImport, resolveImportColumns, downloadImportTemplate, exportToExcel } from '../excel.js';

const COLUMN_ALIASES = {
  contractName: ['合同名称', '名称', '合同名', '项目名称', '项目名'],
  contractNo: ['合同编号', '编号', '合同号', '序号'],
  partner: ['合作方', '合作单位', '对方单位', '供应商', '客户'],
  signDate: ['签订日期', '签署日期', '签约日期', '日期'],
  startDate: ['有效期起', '开始日期', '生效日期', '起始日期'],
  endDate: ['有效期止', '结束日期', '到期日期', '截止日期', '终止日期'],
  amount: ['金额', '合同金额', '总金额', '价款', '费用'],
  content: ['合同内容', '核心内容', '主要内容', '内容'],
  notes: ['备注', '说明', '备注说明'],
};
const REQUIRED_KEYS = ['contractName', 'partner'];
const TEMPLATE_HEADERS = ['合同名称', '合同编号', '合作方', '签订日期', '有效期起', '有效期止', '金额', '合同内容', '备注'];

const PAGE_KEY = 'contracts_page';
let sortField = null;
let sortDir = 'asc';

function getContracts() { return get('contracts') || []; }
function saveContracts(data) { set('contracts', data); }

function computeStatus(contract) {
  if (contract.status === 'terminated') return 'terminated';
  const days = daysFromNow(contract.endDate);
  if (days < 0) return 'expired';
  return 'active';
}

function getStatusLabel(status) {
  const map = { active: '有效', expired: '已过期', terminated: '已终止' };
  return map[status] || status;
}

function getStatusTag(status) {
  if (status === 'active') return 'tag-success';
  if (status === 'expired') return 'tag-danger';
  return 'tag-default';
}

function getRemindDays() {
  return (get('settings') || {}).contractExpiryRemindDays || 30;
}

function getRemainingLabel(contract) {
  if (contract.status === 'terminated') return '-';
  const days = daysFromNow(contract.endDate);
  const remindDays = getRemindDays();
  if (days < 0) return `<span class="tag tag-danger">已过期${Math.abs(days)}天</span>`;
  if (days <= remindDays) return `<span class="tag tag-warning">剩余${days}天</span>`;
  return `<span class="tag tag-success">剩余${days}天</span>`;
}

function updateSortArrows() {
  document.querySelectorAll('.sortable').forEach(el => {
    const field = el.dataset.sort;
    const arrow = sortField === field ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ' ⇅';
    // Remove existing arrow suffix and append new one
    el.textContent = el.textContent.replace(/[▲▼⇅]\s*$/, '').trimEnd() + arrow;
  });
}

export function renderContractList() {
  const contracts = getContracts();
  const now = today();

  const remindDays = getRemindDays();
  const active = contracts.filter(c => computeStatus(c) === 'active');
  const expiringSoon = active.filter(c => daysFromNow(c.endDate) <= remindDays);
  const totalAmount = active.reduce((s, c) => s + (Number(c.amount) || 0), 0);
  const partners = [...new Set(contracts.map(c => c.partner).filter(Boolean))];

  return `
    <div class="page-header">
      <h2>📋 合同目录</h2>
    </div>

    <div class="stat-cards">
      <div class="stat-card" data-filter="active">
        <div class="stat-label">有效合同</div>
        <div class="stat-value">${active.length} <span style="font-size:14px">份</span></div>
      </div>
      <div class="stat-card stat-warning" data-filter="expiring">
        <div class="stat-label">即将到期（30天内）</div>
        <div class="stat-value">${expiringSoon.length} <span style="font-size:14px">份</span></div>
      </div>
      <div class="stat-card">
        <div class="stat-label">合同总金额</div>
        <div class="stat-value">${formatCurrency(totalAmount)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">合作方</div>
        <div class="stat-value">${partners.length} <span style="font-size:14px">家</span></div>
      </div>
    </div>

    <div id="contracts-filter" class="filter-bar">
      <select id="filter-status" class="form-select" style="min-width:120px">
        <option value="all">全部状态</option>
        <option value="active">有效</option>
        <option value="expiring">即将到期</option>
        <option value="expired">已过期</option>
        <option value="terminated">已终止</option>
      </select>
      <input id="filter-partner" class="form-input" placeholder="搜索合作方..." style="min-width:160px">
      <input id="filter-name" class="form-input" placeholder="搜索合同名称..." style="min-width:160px">
      <button id="filter-reset" class="btn btn-outline btn-sm">重置</button>
    </div>

    <div class="toolbar">
      <button id="contract-add-btn" class="btn btn-primary">+ 新增合同</button>
      <button id="contract-import-btn" class="btn btn-outline">📥 导入Excel</button>
      <button id="contract-template-btn" class="btn btn-outline btn-sm">📋 模板</button>
      <button id="contract-export-btn" class="btn btn-outline">📤 导出Excel</button>
    </div>
    <input type="file" id="contracts-import-file" accept=".xlsx,.xls" style="display:none">

    <div class="card" style="overflow-x:auto">
      <table class="data-table" id="contracts-table">
        <thead>
          <tr>
            <th>合同名称</th>
            <th>编号</th>
            <th>合作方</th>
            <th class="sortable" data-sort="amount">金额 ${sortField === 'amount' ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'}</th>
            <th>有效期</th>
            <th class="sortable" data-sort="remaining">剩余时间 ${sortField === 'remaining' ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'}</th>
            <th>状态</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody id="contracts-tbody"></tbody>
      </table>
      <div id="contracts-pagination" class="pagination"></div>
    </div>

    <div class="charts-row">
      <div class="chart-box">
        <h4>合同状态分布</h4>
        <div style="height:280px;position:relative"><canvas id="chart-contracts-status"></canvas></div>
      </div>
      <div class="chart-box">
        <h4>各合作方合同数量（前8）</h4>
        <div style="height:280px;position:relative"><canvas id="chart-contracts-partner"></canvas></div>
      </div>
    </div>

  `;
}

export function setupContractEvents() {
  renderTable();
  renderCharts();

  document.querySelectorAll('.sortable').forEach(th => {
    th.addEventListener('click', () => {
      const field = th.dataset.sort;
      if (sortField === field) { sortDir = sortDir === 'asc' ? 'desc' : 'asc'; }
      else { sortField = field; sortDir = 'asc'; }
      updateSortArrows();
      renderTable();
    });
  });

  document.getElementById('contract-add-btn').addEventListener('click', () => showContractForm(null));
  document.getElementById('contract-import-btn').addEventListener('click', () => {
    document.getElementById('contracts-import-file').click();
  });

  document.getElementById('contracts-import-file').addEventListener('change', async (e) => {
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
        const suffix = errors.length > 5 ? `等${errors.length}行` : '';
        showToast(`导入：${valid.length}条成功，${errors.length}条失败（${rows}${suffix}）`, 'warning');
      }
      if (valid.length > 0) {
        const mapped = valid.map(row => {
          const m = {};
          for (const k of Object.keys(COLUMN_ALIASES)) {
            m[k] = row[resolved[k]] !== undefined ? row[resolved[k]] : '';
          }
          return {
            ...m, id: uuid(),
            amount: parseFloat(m.amount) || 0, status: 'active',
            attachment: '', attachmentName: '',
            createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
          };
        });
        getContracts().push(...mapped);
        saveContracts(getContracts());
        showToast(`成功导入 ${valid.length} 条合同记录`);
        renderTable(); renderCharts();
      }
    } catch (err) { showToast(err.message || '导入失败', 'error'); }
    e.target.value = '';
  });

  document.getElementById('contract-template-btn').addEventListener('click', () => {
    downloadImportTemplate(TEMPLATE_HEADERS, '合同目录', '合同导入模板.xlsx');
    showToast('模板已下载，按模板格式填写后导入。');
  });

  document.getElementById('contract-export-btn').addEventListener('click', () => {
    const contracts = getContracts();
    exportToExcel([{
      name: '合同目录',
      headers: ['合同名称', '合同编号', '合作方', '签订日期', '有效期起', '有效期止', '金额', '状态', '合同内容', '备注'],
      data: contracts.map(c => ({
        '合同名称': c.contractName, '合同编号': c.contractNo, '合作方': c.partner,
        '签订日期': c.signDate, '有效期起': c.startDate, '有效期止': c.endDate,
        '金额': c.amount, '状态': computeStatus(c) === 'active' ? '有效' : computeStatus(c) === 'expired' ? '已过期' : '已终止',
        '合同内容': c.content, '备注': c.notes,
      })),
    }], `合同目录_${today()}.xlsx`);
    showToast('导出成功');
  });

  let currentFilter = { status: 'all', partner: '', name: '' };
  const filterEls = {
    status: document.getElementById('filter-status'),
    partner: document.getElementById('filter-partner'),
    name: document.getElementById('filter-name'),
  };

  function applyFilter() {
    currentFilter.status = filterEls.status.value;
    currentFilter.partner = filterEls.partner.value.toLowerCase();
    currentFilter.name = filterEls.name.value.toLowerCase();
    renderTable(currentFilter);
  }

  filterEls.status.addEventListener('change', applyFilter);
  filterEls.partner.addEventListener('input', applyFilter);
  filterEls.name.addEventListener('input', applyFilter);
  document.getElementById('filter-reset').addEventListener('click', () => {
    filterEls.status.value = 'all';
    filterEls.partner.value = '';
    filterEls.name.value = '';
    applyFilter();
  });

  document.querySelectorAll('.stat-card[data-filter]').forEach(card => {
    card.addEventListener('click', () => {
      const f = card.dataset.filter;
      if (f === 'expiring') {
        filterEls.status.value = 'expiring';
      } else {
        filterEls.status.value = f;
      }
      applyFilter();
    });
  });
}

export function cleanupContracts() {
  destroyChart('chart-contracts-status');
  destroyChart('chart-contracts-partner');
}

function filterContracts(contracts, filter) {
  return contracts.filter(c => {
    const status = computeStatus(c);
    if (filter.status === 'active' && status !== 'active') return false;
    if (filter.status === 'expiring') {
      if (status !== 'active') return false;
      if (daysFromNow(c.endDate) > getRemindDays()) return false;
    }
    if (filter.status === 'expired' && status !== 'expired') return false;
    if (filter.status === 'terminated' && status !== 'terminated') return false;
    if (filter.partner && !c.partner.toLowerCase().includes(filter.partner)) return false;
    if (filter.name && !c.contractName.toLowerCase().includes(filter.name)) return false;
    return true;
  });
}

function renderTable(filter = {}) {
  let contracts = getContracts();
  contracts = filterContracts(contracts, filter || {});
  if (sortField === 'amount') {
    contracts.sort((a, b) => sortDir === 'asc' ? (a.amount || 0) - (b.amount || 0) : (b.amount || 0) - (a.amount || 0));
  } else if (sortField === 'remaining') {
    contracts.sort((a, b) => sortDir === 'asc' ? daysFromNow(a.endDate) - daysFromNow(b.endDate) : daysFromNow(b.endDate) - daysFromNow(a.endDate));
  } else {
    contracts.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  }

  const p = paginate(contracts, PAGE_KEY, 15);

  const tbody = document.getElementById('contracts-tbody');
  if (p.items.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:40px;color:var(--text-muted)">暂无数据，点击 "+ 新增合同" 开始记录</td></tr>`;
  } else {
    tbody.innerHTML = p.items.map(c => {
      const status = computeStatus(c);
      return `
        <tr>
          <td><strong>${esc(c.contractName)}</strong></td>
          <td>${esc(c.contractNo)}</td>
          <td>${esc(c.partner)}</td>
          <td>${formatCurrency(c.amount)}</td>
          <td>${formatDate(c.startDate)} ~ ${formatDate(c.endDate)}</td>
          <td>${getRemainingLabel(c)}</td>
          <td><span class="tag ${getStatusTag(status)}">${getStatusLabel(status)}</span></td>
          <td class="actions">
            <button class="btn btn-outline btn-sm" data-edit="${c.id}">编辑</button>
            <button class="btn btn-outline btn-sm" data-delete="${c.id}" style="color:var(--danger)">删除</button>
          </td>
        </tr>
      `;
    }).join('');
  }

  const pagDiv = document.getElementById('contracts-pagination');
  if (p.totalPages > 1) {
    let html = `<button ${p.page <= 1 ? 'disabled' : ''} data-page="${p.page - 1}">上一页</button>`;
    for (let i = 1; i <= p.totalPages; i++) {
      html += `<button class="${i === p.page ? 'active' : ''}" data-page="${i}">${i}</button>`;
    }
    html += `<button ${p.page >= p.totalPages ? 'disabled' : ''} data-page="${p.page + 1}">下一页</button>`;
    pagDiv.innerHTML = html;
    pagDiv.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', () => {
        p.setPage(parseInt(btn.dataset.page));
        renderTable(filter);
      });
    });
  } else {
    pagDiv.innerHTML = '';
  }

  tbody.querySelectorAll('[data-edit]').forEach(btn => {
    btn.addEventListener('click', () => showContractForm(btn.dataset.edit));
  });
  tbody.querySelectorAll('[data-delete]').forEach(btn => {
    btn.addEventListener('click', () => {
      const c = getContracts().find(x => x.id === btn.dataset.delete);
      if (c && confirm(`确定要删除合同"${c.contractName}"吗？此操作不可恢复。`)) {
        saveContracts(getContracts().filter(x => x.id !== btn.dataset.delete));
        showToast('合同已删除');
        renderTable(filter);
        renderCharts();
      }
    });
  });
}

function renderCharts() {
  const contracts = getContracts();
  const statusCounts = { active: 0, expired: 0, terminated: 0 };
  contracts.forEach(c => { statusCounts[computeStatus(c)]++; });

  const statusLabels = Object.keys(statusCounts);
  const statusLabelsCN = { active: '有效', expired: '已过期', terminated: '已终止' };
  createPieChart('chart-contracts-status',
    statusLabels.map(s => statusLabelsCN[s]),
    statusLabels.map(s => statusCounts[s]),
    null
  );

  const partnerMap = {};
  contracts.forEach(c => {
    if (c.partner) {
      partnerMap[c.partner] = (partnerMap[c.partner] || 0) + 1;
    }
  });
  const sorted = Object.entries(partnerMap).sort((a, b) => b[1] - a[1]).slice(0, 8);
  createBarChart('chart-contracts-partner',
    sorted.map(e => e[0]),
    [{ label: '合同数量', data: sorted.map(e => e[1]), backgroundColor: '#1a73e8' }],
    null
  );
}

function showContractForm(editId) {
  const contracts = getContracts();
  const data = editId ? contracts.find(c => c.id === editId) : null;
  const title = data ? '编辑合同' : '新增合同';

  const body = `
    <form id="contract-form">
      <input type="hidden" name="id" value="${data ? data.id : ''}">
      <div class="form-row">
        <div class="form-group">
          <label>合同名称 <span class="hint">*</span></label>
          <input name="contractName" class="form-input" value="${data ? esc(data.contractName) : ''}" required>
        </div>
        <div class="form-group">
          <label>合同编号 <span class="hint">*</span></label>
          <input name="contractNo" class="form-input" value="${data ? esc(data.contractNo) : ''}" required>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>合作方 <span class="hint">*</span></label>
          <input name="partner" class="form-input" value="${data ? esc(data.partner) : ''}" required>
        </div>
        <div class="form-group">
          <label>合同金额 <span class="hint">*</span></label>
          <input name="amount" type="number" step="0.01" class="form-input" value="${data ? data.amount : ''}" required>
        </div>
      </div>
      <div class="form-row-3">
        <div class="form-group">
          <label>签订日期 <span class="hint">*</span></label>
          <input name="signDate" type="date" class="form-input" value="${data ? data.signDate : ''}" required>
        </div>
        <div class="form-group">
          <label>有效期起 <span class="hint">*</span></label>
          <input name="startDate" type="date" class="form-input" value="${data ? data.startDate : ''}" required>
        </div>
        <div class="form-group">
          <label>有效期止 <span class="hint">*</span></label>
          <input name="endDate" type="date" class="form-input" value="${data ? data.endDate : ''}" required>
        </div>
      </div>
      <div class="form-group">
        <label>合同核心内容</label>
        <textarea name="content" class="form-textarea" rows="3">${data ? esc(data.content) : ''}</textarea>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>附件（可选，限制2MB）</label>
          <div class="file-upload">
            <input type="file" name="attachmentFile" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" style="font-size:13px">
            ${data && data.attachmentName ? `<span class="file-name">当前: ${esc(data.attachmentName)}</span>` : ''}
          </div>
        </div>
        <div class="form-group">
          <label>状态</label>
          <select name="status" class="form-select">
            <option value="active" ${!data || data.status === 'active' ? 'selected' : ''}>有效</option>
            <option value="terminated" ${data && data.status === 'terminated' ? 'selected' : ''}>已终止</option>
          </select>
        </div>
      </div>
      <div class="form-group">
        <label>备注</label>
        <input name="notes" class="form-input" value="${data ? esc(data.notes) : ''}">
      </div>
    </form>
  `;

  const footer = `
    <button id="contract-form-cancel" class="btn btn-outline">取消</button>
    <button id="contract-form-save" class="btn btn-primary">保存</button>
  `;

  showModal(title, body, footer);

  document.getElementById('contract-form-cancel').addEventListener('click', closeModal);
  document.getElementById('contract-form-save').addEventListener('click', () => {
    const form = document.getElementById('contract-form');
    const formData = new FormData(form);
    const fields = Object.fromEntries(formData.entries());

    if (!fields.contractName || !fields.contractNo || !fields.partner || !fields.signDate || !fields.startDate || !fields.endDate || !fields.amount) {
      showToast('请填写所有必填字段。', 'error');
      return;
    }

    const fileInput = form.querySelector('[name="attachmentFile"]');
    if (fileInput && fileInput.files[0]) {
      const file = fileInput.files[0];
      if (file.size > 2 * 1024 * 1024) {
        showToast('附件超过2MB限制，请压缩后上传。', 'error');
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        fields.attachment = reader.result;
        fields.attachmentName = file.name;
        saveContractData(fields);
      };
      reader.readAsDataURL(file);
      return;
    }

    if (data) {
      fields.attachment = data.attachment || '';
      fields.attachmentName = data.attachmentName || '';
    }
    saveContractData(fields);
  });
}

function saveContractData(fields) {
  const contracts = getContracts();
  const now = new Date().toISOString();

  if (fields.id) {
    const idx = contracts.findIndex(c => c.id === fields.id);
    if (idx >= 0) {
      contracts[idx] = {
        ...contracts[idx],
        ...fields,
        amount: parseFloat(fields.amount) || 0,
        updatedAt: now,
      };
    }
  } else {
    contracts.push({
      id: uuid(),
      contractName: fields.contractName,
      contractNo: fields.contractNo,
      partner: fields.partner,
      signDate: fields.signDate,
      startDate: fields.startDate,
      endDate: fields.endDate,
      amount: parseFloat(fields.amount) || 0,
      content: fields.content || '',
      attachment: fields.attachment || '',
      attachmentName: fields.attachmentName || '',
      status: fields.status || 'active',
      notes: fields.notes || '',
      createdAt: now,
      updatedAt: now,
    });
  }

  saveContracts(contracts);
  closeModal();
  showToast(fields.id ? '合同已更新' : '合同已添加');
  renderTable();
  renderCharts();
}

function esc(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
