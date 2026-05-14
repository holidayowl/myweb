import { get, set } from '../storage.js';
import { uuid, formatDate, today, showToast, showModal, closeModal, confirm, paginate } from '../utils.js';
import { exportToExcel } from '../excel.js';

const PAGE_KEY = 'others_page';

function getData() { return get('others') || []; }
function saveData(d) { set('others', d); }
function getSchema() { return get('others_schema') || []; }

export function renderOthersList() {
  const data = getData();
  const schema = getSchema();
  const thisMonth = new Date().toISOString().slice(0, 7);
  const monthNew = data.filter(d => d.recordDate && d.recordDate.startsWith(thisMonth)).length;

  return `
    <div class="page-header"><h2>📁 其他工作内容</h2></div>
    <div class="stat-cards">
      <div class="stat-card"><div class="stat-label">工作记录总数</div><div class="stat-value">${data.length} <span style="font-size:14px">条</span></div></div>
      <div class="stat-card"><div class="stat-label">本月新增</div><div class="stat-value">${monthNew} <span style="font-size:14px">条</span></div></div>
      <div class="stat-card"><div class="stat-label">事项分类</div><div class="stat-value">${[...new Set(data.map(d => d.category))].length} <span style="font-size:14px">类</span></div></div>
      <div class="stat-card"><div class="stat-label">自定义字段</div><div class="stat-value">${schema.length} <span style="font-size:14px">个</span></div></div>
    </div>
    <div id="others-filter" class="filter-bar">
      <input id="filter-others-search" class="form-input" placeholder="搜索工作名称..." style="min-width:200px">
      <select id="filter-others-category" class="form-select" style="min-width:120px">
        <option value="all">全部分类</option>
        ${[...new Set(data.map(d => d.category))].map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('')}
      </select>
      <input id="filter-others-date" type="month" class="form-input" style="min-width:160px">
      <button id="filter-others-reset" class="btn btn-outline btn-sm">重置</button>
    </div>
    <div class="toolbar">
      <button id="others-add-btn" class="btn btn-primary">+ 新增记录</button>
      <button id="others-schema-btn" class="btn btn-outline">📐 管理字段</button>
      <button id="others-export-btn" class="btn btn-outline">📤 导出Excel</button>
    </div>
    <div class="card" style="overflow-x:auto">
      <table class="data-table">
        <thead><tr>
          <th>工作名称</th><th>记录时间</th><th>事项分类</th><th>备注</th><th>附件</th><th>操作</th>
        </tr></thead>
        <tbody id="others-tbody"></tbody>
      </table>
      <div id="others-pagination" class="pagination"></div>
    </div>
  `;
}

export function setupOthersEvents() {
  renderOthersContent();
  document.getElementById('others-add-btn').addEventListener('click', () => showOthersForm(null));
  document.getElementById('others-export-btn').addEventListener('click', () => {
    const data = getData();
    const sheets = [{ name: '其他工作', headers: ['工作名称', '记录时间', '事项分类', '备注说明'],
      data: data.map(d => ({ '工作名称': d.workName, '记录时间': d.recordDate, '事项分类': d.category, '备注说明': d.notes })) }];
    exportToExcel(sheets, `其他工作内容_${today()}.xlsx`);
    showToast('导出成功');
  });
  document.getElementById('others-schema-btn').addEventListener('click', showSchemaEditor);
  document.getElementById('filter-others-search').addEventListener('input', () => renderOthersContent());
  document.getElementById('filter-others-category').addEventListener('change', () => renderOthersContent());
  document.getElementById('filter-others-date').addEventListener('input', () => renderOthersContent());
  document.getElementById('filter-others-reset').addEventListener('click', () => {
    document.getElementById('filter-others-search').value = '';
    document.getElementById('filter-others-category').value = 'all';
    document.getElementById('filter-others-date').value = '';
    renderOthersContent();
  });
}

export function cleanupOthers() {}

function renderOthersContent() {
  let data = getData();
  const searchF = document.getElementById('filter-others-search').value.toLowerCase();
  const catF = document.getElementById('filter-others-category').value;
  const dateF = document.getElementById('filter-others-date').value;

  if (searchF) data = data.filter(d => d.workName && d.workName.toLowerCase().includes(searchF));
  if (catF !== 'all') data = data.filter(d => d.category === catF);
  if (dateF) data = data.filter(d => d.recordDate && d.recordDate.startsWith(dateF));

  data.sort((a, b) => new Date(b.recordDate || b.createdAt) - new Date(a.recordDate || a.createdAt));
  const p = paginate(data, PAGE_KEY, 15);

  const tbody = document.getElementById('others-tbody');
  if (p.items.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--text-muted)">暂无数据，点击 "+ 新增记录" 开始</td></tr>`;
  } else {
    tbody.innerHTML = p.items.map(d => `
      <tr>
        <td><strong>${esc(d.workName)}</strong></td>
        <td>${formatDate(d.recordDate)}</td>
        <td>${esc(d.category)}</td>
        <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(d.notes)}</td>
        <td>${d.attachmentName ? `<span class="tag tag-success">${esc(d.attachmentName)}</span>` : '-'}</td>
        <td class="actions">
          <button class="btn btn-outline btn-sm" data-edit="${d.id}">编辑</button>
          <button class="btn btn-outline btn-sm" data-delete="${d.id}" style="color:var(--danger)">删除</button>
        </td>
      </tr>
    `).join('');
  }

  const pagDiv = document.getElementById('others-pagination');
  if (p.totalPages > 1) {
    let h = `<button ${p.page <= 1 ? 'disabled' : ''} data-page="${p.page - 1}">上一页</button>`;
    for (let i = 1; i <= p.totalPages; i++) h += `<button class="${i === p.page ? 'active' : ''}" data-page="${i}">${i}</button>`;
    h += `<button ${p.page >= p.totalPages ? 'disabled' : ''} data-page="${p.page + 1}">下一页</button>`;
    pagDiv.innerHTML = h;
    pagDiv.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', () => { p.setPage(parseInt(btn.dataset.page)); renderOthersContent(); });
    });
  } else { pagDiv.innerHTML = ''; }

  tbody.querySelectorAll('[data-edit]').forEach(btn => btn.addEventListener('click', () => showOthersForm(btn.dataset.edit)));
  tbody.querySelectorAll('[data-delete]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (confirm('确定要删除这条记录吗？')) {
        saveData(getData().filter(d => d.id !== btn.dataset.delete));
        showToast('已删除');
        renderOthersContent();
      }
    });
  });
}

function showOthersForm(editId) {
  const schema = getSchema();
  const data = getData();
  const item = editId ? data.find(d => d.id === editId) : null;
  const title = item ? '编辑工作记录' : '新增工作记录';

  const defaultCats = schema.find(s => s.key === 'category');
  const catOptions = (defaultCats && defaultCats.options) || ['台账记录', '对外对接', '会议纪要', '检查记录', '其他'];

  const body = `
    <form id="others-form">
      <input type="hidden" name="id" value="${item ? item.id : ''}">
      <div class="form-row">
        <div class="form-group"><label>工作名称 <span class="hint">*</span></label>
          <input name="workName" class="form-input" value="${item ? esc(item.workName) : ''}" required>
        </div>
        <div class="form-group"><label>记录时间 <span class="hint">*</span></label>
          <input name="recordDate" type="date" class="form-input" value="${item ? item.recordDate : ''}" required>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>事项分类</label>
          <select name="category" class="form-select">${catOptions.map(c => `<option value="${c}" ${item && item.category === c ? 'selected' : ''}>${c}</option>`).join('')}</select>
        </div>
        <div class="form-group"><label>相关附件（可选）</label>
          <input type="file" name="attachmentFile" style="font-size:13px">
          ${item && item.attachmentName ? `<span style="font-size:12px;color:var(--text-secondary)">当前: ${esc(item.attachmentName)}</span>` : ''}
        </div>
      </div>
      <div class="form-group"><label>备注说明</label>
        <textarea name="notes" class="form-textarea" rows="3">${item ? esc(item.notes) : ''}</textarea>
      </div>
    </form>
  `;

  showModal(title, body, `
    <button id="others-form-cancel" class="btn btn-outline">取消</button>
    <button id="others-form-save" class="btn btn-primary">保存</button>
  `);

  document.getElementById('others-form-cancel').addEventListener('click', closeModal);
  document.getElementById('others-form-save').addEventListener('click', () => {
    const form = document.getElementById('others-form');
    const fd = new FormData(form);
    const fields = Object.fromEntries(fd.entries());
    if (!fields.workName || !fields.recordDate) { showToast('请填写必填字段。', 'error'); return; }

    const fileInput = form.querySelector('[name="attachmentFile"]');
    const saveFn = (extra) => {
      const list = getData();
      const now = new Date().toISOString();
      const record = {
        id: fields.id || uuid(),
        workName: fields.workName,
        recordDate: fields.recordDate,
        category: fields.category,
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
      renderOthersContent();
    };

    if (fileInput && fileInput.files[0]) {
      const file = fileInput.files[0];
      if (file.size > 2 * 1024 * 1024) { showToast('附件超过2MB限制。', 'error'); return; }
      const reader = new FileReader();
      reader.onload = () => saveFn({ attachment: reader.result, attachmentName: file.name });
      reader.readAsDataURL(file);
    } else {
      saveFn(item ? { attachment: item.attachment || '', attachmentName: item.attachmentName || '' } : {});
    }
  });
}

function showSchemaEditor() {
  const schema = getSchema();
  const body = `
    <form id="schema-form">
      ${schema.map((s, i) => `
        <div class="form-row" style="margin-bottom:8px;align-items:end">
          <div class="form-group"><label>字段名</label><input name="label_${i}" class="form-input" value="${esc(s.label)}"></div>
          <div class="form-group"><label>类型</label>
            <select name="type_${i}" class="form-select">
              <option value="text" ${s.type === 'text' ? 'selected' : ''}>文本</option>
              <option value="date" ${s.type === 'date' ? 'selected' : ''}>日期</option>
              <option value="select" ${s.type === 'select' ? 'selected' : ''}>下拉</option>
              <option value="textarea" ${s.type === 'textarea' ? 'selected' : ''}>长文本</option>
              <option value="file" ${s.type === 'file' ? 'selected' : ''}>附件</option>
            </select>
          </div>
          <div class="form-group"><label>必填</label><input type="checkbox" name="required_${i}" ${s.required ? 'checked' : ''}></div>
          <button type="button" class="btn btn-outline btn-sm schema-remove" data-idx="${i}" style="color:var(--danger)">删除</button>
        </div>
      `).join('')}
    </form>
    <button id="schema-add-field" class="btn btn-outline btn-sm" style="margin-top:8px">+ 添加字段</button>
  `;

  showModal('管理自定义字段', body, `
    <button id="schema-form-cancel" class="btn btn-outline">取消</button>
    <button id="schema-form-save" class="btn btn-primary">保存</button>
  `);

  document.getElementById('schema-form-cancel').addEventListener('click', closeModal);
  document.getElementById('schema-add-field').addEventListener('click', () => {
    const form = document.getElementById('schema-form');
    const i = form.querySelectorAll('[name^="label_"]').length;
    const row = document.createElement('div');
    row.className = 'form-row';
    row.style.cssText = 'margin-bottom:8px;align-items:end';
    row.innerHTML = `
      <div class="form-group"><label>字段名</label><input name="label_${i}" class="form-input" value=""></div>
      <div class="form-group"><label>类型</label>
        <select name="type_${i}" class="form-select"><option value="text">文本</option><option value="date">日期</option><option value="select">下拉</option><option value="textarea">长文本</option><option value="file">附件</option></select>
      </div>
      <div class="form-group"><label>必填</label><input type="checkbox" name="required_${i}"></div>
      <button type="button" class="btn btn-outline btn-sm schema-remove" style="color:var(--danger)">删除</button>
    `;
    form.appendChild(row);
    row.querySelector('.schema-remove').addEventListener('click', () => row.remove());
  });

  document.querySelectorAll('.schema-remove').forEach(btn => {
    btn.addEventListener('click', () => btn.closest('.form-row').remove());
  });

  document.getElementById('schema-form-save').addEventListener('click', () => {
    const form = document.getElementById('schema-form');
    const newSchema = [];
    const labels = form.querySelectorAll('[name^="label_"]');
    labels.forEach((labelEl, i) => {
      newSchema.push({
        key: 'field_' + i,
        label: labelEl.value || '字段' + (i + 1),
        type: form.querySelector(`[name="type_${i}"]`).value,
        required: form.querySelector(`[name="required_${i}"]`).checked,
        order: i + 1,
      });
    });
    set('others_schema', newSchema);
    closeModal();
    showToast('字段已更新');
  });
}

function esc(s) { return s ? String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;') : ''; }
