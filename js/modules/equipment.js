import { get, set } from '../storage.js';
import { uuid, formatDate, formatCurrency, showToast, showModal, closeModal, confirm, paginate } from '../utils.js';
import { createPieChart, createBarChart, destroyChart } from '../charts.js';
import { importFromExcel, validateImport, resolveImportColumns, downloadImportTemplate } from '../excel.js';

const COLUMN_ALIASES = {
  equipmentName: ['设备名称', '名称', '设备名', '设备'],
  equipmentNo: ['设备编号', '编号', '设备号'],
  repairDate: ['维修日期', '日期', '维修时间', '修理日期'],
  faultDescription: ['故障描述', '故障说明', '故障现象', '问题描述', '描述'],
  repairMethod: ['维修方式', '方式', '处理方法', '维修方法'],
  repairCost: ['费用', '维修费用', '金额', '花费', '成本'],
  repairPerson: ['维修人员', '维修人', '负责人', '处理人'],
  repairResult: ['维修结果', '结果', '处理结果', '维修结论'],
  recheckDate: ['复检日期', '复查日期', '检验日期'],
  notes: ['备注', '说明'],
};
const REQUIRED_KEYS = ['equipmentName', 'repairDate'];
const TEMPLATE_HEADERS = ['设备名称', '设备编号', '维修日期', '故障描述', '维修方式', '费用', '维修人员', '维修结果', '复检日期', '备注'];

const PAGE_KEY = 'equipment_page';
const REPAIR_METHODS = ['自修', '外包'];
const REPAIR_RESULTS = ['已修复', '待复检'];

function getData() { return get('equipment') || []; }
function saveData(d) { set('equipment', d); }

export function renderEquipmentList() {
  const data = getData();
  const totalCost = data.reduce((s, d) => s + (Number(d.repairCost) || 0), 0);
  const pending = data.filter(d => d.repairResult === '待复检').length;
  const outsourcing = data.filter(d => d.repairMethod === '外包').length;

  return `
    <div class="page-header"><h2>🔧 设备维修记录</h2></div>
    <div class="stat-cards">
      <div class="stat-card"><div class="stat-label">维修总次数</div><div class="stat-value">${data.length} <span style="font-size:14px">次</span></div></div>
      <div class="stat-card"><div class="stat-label">维修总费用</div><div class="stat-value">${formatCurrency(totalCost)}</div></div>
      <div class="stat-card stat-warning"><div class="stat-label">待复检</div><div class="stat-value">${pending} <span style="font-size:14px">台</span></div></div>
      <div class="stat-card"><div class="stat-label">外包比例</div><div class="stat-value">${data.length > 0 ? Math.round(outsourcing / data.length * 100) : 0}<span style="font-size:14px">%</span></div></div>
    </div>
    <div id="equip-filter" class="filter-bar">
      <input id="filter-equip-name" class="form-input" placeholder="搜索设备名称..." style="min-width:160px">
      <select id="filter-equip-result" class="form-select" style="min-width:120px">
        <option value="all">全部结果</option>
        ${REPAIR_RESULTS.map(r => `<option value="${r}">${r}</option>`).join('')}
      </select>
      <input id="filter-equip-date" type="month" class="form-input" style="min-width:160px">
      <button id="filter-equip-reset" class="btn btn-outline btn-sm">重置</button>
    </div>
    <div class="toolbar">
      <button id="equip-add-btn" class="btn btn-primary">+ 新增记录</button>
      <button id="equip-import-btn" class="btn btn-outline">📥 导入Excel</button>
      <button id="equip-template-btn" class="btn btn-outline btn-sm">📋 模板</button>
    </div>
    <input type="file" id="equip-import-file" accept=".xlsx,.xls" style="display:none">
    <div class="card" style="overflow-x:auto">
      <table class="data-table">
        <thead><tr><th>设备名称</th><th>编号</th><th>维修日期</th><th>故障描述</th><th>维修方式</th><th>费用</th><th>结果</th><th>操作</th></tr></thead>
        <tbody id="equip-tbody"></tbody>
      </table>
      <div id="equip-pagination" class="pagination"></div>
    </div>
    <div class="charts-row">
      <div class="chart-box"><h4>维修方式占比</h4><div style="height:280px;position:relative"><canvas id="chart-equip-method"></canvas></div></div>
      <div class="chart-box"><h4>各设备维修次数（前8）</h4><div style="height:280px;position:relative"><canvas id="chart-equip-freq"></canvas></div></div>
    </div>
  `;
}

export function setupEquipmentEvents() {
  renderEquipContent();
  document.getElementById('equip-add-btn').addEventListener('click', () => showEquipForm(null));
  document.getElementById('equip-import-btn').addEventListener('click', () => {
    document.getElementById('equip-import-file').click();
  });

  document.getElementById('equip-import-file').addEventListener('change', async (e) => {
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
        const mapped = valid.map(row => ({
          id: uuid(),
          equipmentName: row[resolved.equipmentName] || '',
          equipmentNo: row[resolved.equipmentNo] || '',
          repairDate: row[resolved.repairDate] || '',
          faultDescription: row[resolved.faultDescription] || '',
          repairMethod: row[resolved.repairMethod] || '自修',
          repairCost: parseFloat(row[resolved.repairCost]) || 0,
          repairPerson: row[resolved.repairPerson] || '',
          repairResult: row[resolved.repairResult] || '已修复',
          recheckDate: row[resolved.recheckDate] || '',
          attachment: '', attachmentName: '',
          notes: row[resolved.notes] || '',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }));
        getData().push(...mapped);
        saveData(getData());
        showToast(`成功导入 ${valid.length} 条维修记录`);
        renderEquipContent();
      }
    } catch (err) { showToast(err.message || '导入失败', 'error'); }
    e.target.value = '';
  });

  document.getElementById('equip-template-btn').addEventListener('click', () => {
    downloadImportTemplate(TEMPLATE_HEADERS, '设备维修', '维修记录导入模板.xlsx');
    showToast('模板已下载。');
  });
  document.getElementById('filter-equip-name').addEventListener('input', () => renderEquipContent());
  document.getElementById('filter-equip-result').addEventListener('change', () => renderEquipContent());
  document.getElementById('filter-equip-date').addEventListener('input', () => renderEquipContent());
  document.getElementById('filter-equip-reset').addEventListener('click', () => {
    document.getElementById('filter-equip-name').value = '';
    document.getElementById('filter-equip-result').value = 'all';
    document.getElementById('filter-equip-date').value = '';
    renderEquipContent();
  });
}

export function cleanupEquipment() {
  destroyChart('chart-equip-method');
  destroyChart('chart-equip-freq');
}

function renderEquipContent() {
  let data = getData();
  const nameF = document.getElementById('filter-equip-name').value.toLowerCase();
  const resultF = document.getElementById('filter-equip-result').value;
  const dateF = document.getElementById('filter-equip-date').value;

  if (nameF) data = data.filter(d => d.equipmentName && d.equipmentName.toLowerCase().includes(nameF));
  if (resultF !== 'all') data = data.filter(d => d.repairResult === resultF);
  if (dateF) data = data.filter(d => d.repairDate && d.repairDate.startsWith(dateF));

  data.sort((a, b) => new Date(b.repairDate || b.createdAt) - new Date(a.repairDate || a.createdAt));
  const p = paginate(data, PAGE_KEY, 15);

  const tbody = document.getElementById('equip-tbody');
  if (p.items.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:40px;color:var(--text-muted)">暂无数据，点击 "+ 新增记录" 开始</td></tr>`;
  } else {
    tbody.innerHTML = p.items.map(d => `
      <tr>
        <td><strong>${esc(d.equipmentName)}</strong></td>
        <td>${esc(d.equipmentNo)}</td>
        <td>${formatDate(d.repairDate)}</td>
        <td style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(d.faultDescription)}</td>
        <td>${esc(d.repairMethod)}</td>
        <td>${formatCurrency(d.repairCost)}</td>
        <td>${d.repairResult === '待复检' ? '<span class="tag tag-warning">待复检</span>' : '<span class="tag tag-success">已修复</span>'}</td>
        <td class="actions">
          <button class="btn btn-outline btn-sm" data-edit="${d.id}">编辑</button>
          <button class="btn btn-outline btn-sm" data-delete="${d.id}" style="color:var(--danger)">删除</button>
        </td>
      </tr>
    `).join('');
  }

  const pagDiv = document.getElementById('equip-pagination');
  if (p.totalPages > 1) {
    pagDiv.innerHTML = buildPagination(p);
    pagDiv.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', () => { p.setPage(parseInt(btn.dataset.page)); renderEquipContent(); });
    });
  } else { pagDiv.innerHTML = ''; }

  tbody.querySelectorAll('[data-edit]').forEach(btn => btn.addEventListener('click', () => showEquipForm(btn.dataset.edit)));
  tbody.querySelectorAll('[data-delete]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (confirm('确定要删除这条记录吗？')) {
        saveData(getData().filter(d => d.id !== btn.dataset.delete));
        showToast('已删除');
        renderEquipContent();
      }
    });
  });

  renderEquipCharts(data);
}

function renderEquipCharts(data) {
  const methodCount = { 自修: 0, 外包: 0 };
  data.forEach(d => { if (methodCount[d.repairMethod] !== undefined) methodCount[d.repairMethod]++; });
  createPieChart('chart-equip-method', Object.keys(methodCount), Object.values(methodCount), null);

  const freqMap = {};
  data.forEach(d => { freqMap[d.equipmentName] = (freqMap[d.equipmentName] || 0) + 1; });
  const sorted = Object.entries(freqMap).sort((a, b) => b[1] - a[1]).slice(0, 8);
  createBarChart('chart-equip-freq', sorted.map(e => e[0]),
    [{ label: '维修次数', data: sorted.map(e => e[1]), backgroundColor: '#1a73e8' }], null);
}

function showEquipForm(editId) {
  const data = getData();
  const item = editId ? data.find(d => d.id === editId) : null;
  const title = item ? '编辑维修记录' : '新增维修记录';

  const body = `
    <form id="equip-form">
      <input type="hidden" name="id" value="${item ? item.id : ''}">
      <div class="form-row">
        <div class="form-group"><label>设备名称 <span class="hint">*</span></label>
          <input name="equipmentName" class="form-input" value="${item ? esc(item.equipmentName) : ''}" required>
        </div>
        <div class="form-group"><label>设备编号</label>
          <input name="equipmentNo" class="form-input" value="${item ? esc(item.equipmentNo) : ''}">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>维修日期 <span class="hint">*</span></label>
          <input name="repairDate" type="date" class="form-input" value="${item ? item.repairDate : ''}" required>
        </div>
        <div class="form-group"><label>维修费用 <span class="hint">*</span></label>
          <input name="repairCost" type="number" step="0.01" class="form-input" value="${item ? item.repairCost : ''}">
        </div>
      </div>
      <div class="form-group"><label>故障描述</label>
        <textarea name="faultDescription" class="form-textarea" rows="2">${item ? esc(item.faultDescription) : ''}</textarea>
      </div>
      <div class="form-row">
        <div class="form-group"><label>维修方式</label>
          <select name="repairMethod" class="form-select">${REPAIR_METHODS.map(m => `<option value="${m}" ${item && item.repairMethod === m ? 'selected' : ''}>${m}</option>`).join('')}</select>
        </div>
        <div class="form-group"><label>维修人员</label>
          <input name="repairPerson" class="form-input" value="${item ? esc(item.repairPerson) : ''}">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>维修结果</label>
          <select name="repairResult" class="form-select">${REPAIR_RESULTS.map(r => `<option value="${r}" ${item && item.repairResult === r ? 'selected' : ''}>${r}</option>`).join('')}</select>
        </div>
        <div class="form-group"><label>复检日期</label>
          <input name="recheckDate" type="date" class="form-input" value="${item ? item.recheckDate : ''}">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>维修照片（可选，限制2MB）</label>
          <input type="file" name="attachmentFile" accept=".jpg,.jpeg,.png" style="font-size:13px">
          ${item && item.attachmentName ? `<span style="font-size:12px;color:var(--text-secondary)">当前: ${esc(item.attachmentName)}</span>` : ''}
        </div>
        <div class="form-group"><label>备注</label>
          <input name="notes" class="form-input" value="${item ? esc(item.notes) : ''}">
        </div>
      </div>
    </form>
  `;

  showModal(title, body, `
    <button id="equip-form-cancel" class="btn btn-outline">取消</button>
    <button id="equip-form-save" class="btn btn-primary">保存</button>
  `);

  document.getElementById('equip-form-cancel').addEventListener('click', closeModal);
  document.getElementById('equip-form-save').addEventListener('click', () => {
    const form = document.getElementById('equip-form');
    const fd = new FormData(form);
    const fields = Object.fromEntries(fd.entries());
    if (!fields.equipmentName || !fields.repairDate) { showToast('请填写必填字段。', 'error'); return; }

    const fileInput = form.querySelector('[name="attachmentFile"]');
    const saveFn = (extra) => {
      const list = getData();
      const now = new Date().toISOString();
      const record = {
        id: fields.id || uuid(),
        equipmentName: fields.equipmentName,
        equipmentNo: fields.equipmentNo || '',
        repairDate: fields.repairDate,
        faultDescription: fields.faultDescription || '',
        repairMethod: fields.repairMethod,
        repairCost: parseFloat(fields.repairCost) || 0,
        repairPerson: fields.repairPerson || '',
        repairResult: fields.repairResult,
        recheckDate: fields.recheckDate || '',
        notes: fields.notes || '',
        ...extra,
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
      renderEquipContent();
    };

    if (fileInput && fileInput.files[0]) {
      const file = fileInput.files[0];
      if (file.size > 2 * 1024 * 1024) { showToast('照片超过2MB限制。', 'error'); return; }
      const reader = new FileReader();
      reader.onload = () => saveFn({ attachment: reader.result, attachmentName: file.name });
      reader.readAsDataURL(file);
    } else {
      saveFn(item ? { attachment: item.attachment || '', attachmentName: item.attachmentName || '' } : {});
    }
  });
}

function buildPagination(p) {
  let h = `<button ${p.page <= 1 ? 'disabled' : ''} data-page="${p.page - 1}">上一页</button>`;
  for (let i = 1; i <= p.totalPages; i++) h += `<button class="${i === p.page ? 'active' : ''}" data-page="${i}">${i}</button>`;
  h += `<button ${p.page >= p.totalPages ? 'disabled' : ''} data-page="${p.page + 1}">下一页</button>`;
  return h;
}

function esc(s) { return s ? String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;') : ''; }
