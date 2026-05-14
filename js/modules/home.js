import { get } from '../storage.js';
import { formatCurrency, formatNumber, today, daysFromNow, getMonthLabel } from '../utils.js';
import { scanAlerts, dismissAlert } from '../alerts.js';

export function renderHomePage() {
  const contracts = get('contracts') || [];
  const energy = get('energy') || [];
  const property = get('property') || [];
  const equipment = get('equipment') || [];
  const others = get('others') || [];
  const syncState = get('sync_state') || {};

  const activeContracts = contracts.filter(c => c.status !== 'terminated' && daysFromNow(c.endDate) >= 0);
  const expiringSoon = activeContracts.filter(c => daysFromNow(c.endDate) <= 30).length;
  const totalAmount = activeContracts.reduce((s, c) => s + (Number(c.amount) || 0), 0);

  const thisMonth = new Date().toISOString().slice(0, 7);
  const monthProperty = property.filter(d => d.expenseDate && d.expenseDate.startsWith(thisMonth)).reduce((s, d) => s + (Number(d.amount) || 0), 0);
  const monthEnergy = energy.filter(d => d.period === thisMonth);

  const pendingRecheck = equipment.filter(d => d.repairResult === '待复检').length;
  const monthOthers = others.filter(d => d.recordDate && d.recordDate.startsWith(thisMonth)).length;

  const alerts = scanAlerts();

  return `
    <div class="page-header"><h2>🏠 工作数据概览</h2></div>

    <div class="stat-cards">
      <div class="stat-card" data-link="#/contracts">
        <div class="stat-label">📋 有效合同</div>
        <div class="stat-value">${activeContracts.length}</div>
        <div class="stat-sub">${expiringSoon > 0 ? `即将到期 ${expiringSoon} 份` : '暂无即将到期合同'}</div>
      </div>
      <div class="stat-card" data-link="#/contracts">
        <div class="stat-label">💰 合同总金额</div>
        <div class="stat-value">${formatCurrency(totalAmount)}</div>
      </div>
      <div class="stat-card" data-link="#/energy">
        <div class="stat-label">⚡ 本月能耗记录</div>
        <div class="stat-value">${monthEnergy.length}</div>
        <div class="stat-sub">${monthEnergy.map(e => `${e.energyType === 'electric' ? '电' : e.energyType === 'water' ? '水' : '气'}: ${formatNumber(e.value)}${e.unit}`).join(' / ') || '本月暂无记录'}</div>
      </div>
      <div class="stat-card" data-link="#/property">
        <div class="stat-label">🏗️ 本月运维支出</div>
        <div class="stat-value">${formatCurrency(monthProperty)}</div>
      </div>
      <div class="stat-card ${pendingRecheck > 0 ? 'stat-warning' : ''}" data-link="#/equipment">
        <div class="stat-label">🔧 待复检设备</div>
        <div class="stat-value">${pendingRecheck}</div>
        <div class="stat-sub">共 ${equipment.length} 次维修记录</div>
      </div>
      <div class="stat-card" data-link="#/others">
        <div class="stat-label">📁 本月工作记录</div>
        <div class="stat-value">${monthOthers}</div>
        <div class="stat-sub">共 ${others.length} 条记录</div>
      </div>
    </div>

    <div class="charts-row" style="margin-bottom:20px">
      <div class="card">
        <div class="card-header">🔔 提醒通知</div>
        ${alerts.length === 0
          ? '<div class="empty-state"><p>暂无提醒 🎉</p></div>'
          : `<div style="max-height:300px;overflow-y:auto">${alerts.map(a => `
              <div class="alert-item alert-${a.level}" style="cursor:pointer" data-link="${a.link}" data-alert-id="${a.id}">
                <div class="alert-title">${a.level === 'danger' ? '🔴' : '🟡'} ${a.title}</div>
                <div class="alert-msg">${a.message}</div>
              </div>
            `).join('')}</div>`
        }
      </div>
      <div class="card">
        <div class="card-header">📊 快捷信息</div>
        <div style="font-size:13px;line-height:2">
          <p>📋 合同: ${activeContracts.length} 份有效 / ${totalAmount > 0 ? formatCurrency(totalAmount) : '暂无'} 总金额</p>
          <p>⚡ 能耗: ${energy.length} 条记录</p>
          <p>🏗️ 运维: 累计 ${formatCurrency(property.reduce((s, d) => s + (Number(d.amount) || 0), 0))}</p>
          <p>🔧 维修: ${equipment.length} 次 / ${formatCurrency(equipment.reduce((s, d) => s + (Number(d.repairCost) || 0), 0))} 总费用</p>
          <p>📁 其他: ${others.length} 条工作记录</p>
          <hr style="margin:8px 0;border-color:var(--border)">
          <p>☁️ 云端: ${syncState.lastPush ? `上次同步 ${new Date(syncState.lastPush).toLocaleString('zh-CN')}` : '尚未配置或同步'}</p>
          <p>💾 上次备份: ${syncState.lastPull ? new Date(syncState.lastPull).toLocaleString('zh-CN') : '无记录'}</p>
        </div>
      </div>
    </div>

    <div class="card" style="text-align:center;padding:32px">
      <p style="font-size:15px;color:var(--text-secondary);margin-bottom:16px">快速开始</p>
      <div class="btn-group" style="justify-content:center">
        <a href="#/contracts" class="btn btn-outline">📋 管理合同</a>
        <a href="#/energy" class="btn btn-outline">⚡ 录入能耗</a>
        <a href="#/property" class="btn btn-outline">🏗️ 记录支出</a>
        <a href="#/dashboard" class="btn btn-primary">📊 查看汇总</a>
      </div>
    </div>
  `;
}

export function setupHomeEvents() {
  document.querySelectorAll('.stat-card[data-link]').forEach(card => {
    card.addEventListener('click', () => {
      location.hash = card.dataset.link;
    });
  });

  document.querySelectorAll('.alert-item[data-link]').forEach(item => {
    item.addEventListener('click', () => {
      dismissAlert(item.dataset.alertId);
      location.hash = item.dataset.link;
    });
  });
}
