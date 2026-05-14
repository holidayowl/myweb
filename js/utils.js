export function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

export function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function formatDateTime(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return `${formatDate(dateStr)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function formatCurrency(num) {
  if (num == null) return '¥0.00';
  return '¥' + Number(num).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatNumber(num) {
  if (num == null) return '0';
  return Number(num).toLocaleString('zh-CN');
}

export function debounce(fn, delay = 300) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

export function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

export function today() {
  return new Date().toISOString().slice(0, 10);
}

export function nowISO() {
  return new Date().toISOString();
}

export function daysBetween(d1, d2) {
  return Math.ceil((new Date(d2) - new Date(d1)) / 86400000);
}

export function daysFromNow(dateStr) {
  return daysBetween(today(), dateStr);
}

export function getMonthLabel(period) {
  if (!period) return '';
  const [y, m] = period.split('-');
  return `${y}年${parseInt(m)}月`;
}

export function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('toast-hide');
    setTimeout(() => toast.remove(), 300);
  }, 2500);
}

export function showModal(title, bodyHtml, footerHtml = '') {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = bodyHtml;
  document.getElementById('modal-footer').innerHTML = footerHtml;
  document.getElementById('modal-overlay').classList.remove('hidden');
}

export function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
}

export function confirm(msg) {
  return window.confirm(msg);
}

export function getFormData(formEl) {
  const data = {};
  for (const el of formEl.querySelectorAll('input, select, textarea')) {
    if (el.name) {
      data[el.name] = el.type === 'checkbox' ? el.checked : el.value;
    }
  }
  return data;
}

export function setFormData(formEl, data) {
  for (const key of Object.keys(data)) {
    const el = formEl.querySelector(`[name="${key}"]`);
    if (el) {
      if (el.type === 'checkbox') el.checked = !!data[key];
      else el.value = data[key] ?? '';
    }
  }
}

const PAGINATION = {};
export function paginate(data, pageKey, pageSize = 20) {
  if (!PAGINATION[pageKey]) PAGINATION[pageKey] = 1;
  const totalPages = Math.ceil(data.length / pageSize);
  const page = Math.min(PAGINATION[pageKey], totalPages || 1);
  const start = (page - 1) * pageSize;
  return {
    items: data.slice(start, start + pageSize),
    page,
    totalPages,
    total: data.length,
    setPage(p) { PAGINATION[pageKey] = p; },
  };
}
