import { get, set } from './storage.js';
import { today, daysFromNow } from './utils.js';

export function scanAlerts() {
  const alerts = [];
  const settings = get('settings') || {};
  const contractDays = settings.contractExpiryRemindDays || 30;
  const equipDays = settings.equipmentRecheckRemindDays || 7;
  const energyPct = settings.energyAbnormalPercent || 30;

  // 1. Contract expiry alerts
  const contracts = get('contracts') || [];
  const now = today();

  contracts.forEach(c => {
    if (c.status === 'terminated') return;
    const daysLeft = daysFromNow(c.endDate);

    if (daysLeft < 0) {
      alerts.push({
        id: `contract-expired-${c.id}`,
        type: 'contract_expired',
        level: 'danger',
        title: '合同已过期',
        message: `【${c.contractName}】已于 ${c.endDate} 过期`,
        link: '#/contracts',
      });
    } else if (daysLeft <= contractDays) {
      alerts.push({
        id: `contract-expiring-${c.id}`,
        type: 'contract_expiring',
        level: daysLeft <= 7 ? 'danger' : 'warning',
        title: '合同即将到期',
        message: `【${c.contractName}】将于 ${c.endDate} 到期，剩余 ${daysLeft} 天`,
        link: '#/contracts',
      });
    }
  });

  // 2. Equipment recheck alerts
  const equipment = get('equipment') || [];
  equipment.forEach(e => {
    if (e.repairResult !== '待复检' || !e.recheckDate) return;
    const daysLeft = daysFromNow(e.recheckDate);
    if (daysLeft >= 0 && daysLeft <= equipDays) {
      alerts.push({
        id: `equip-recheck-${e.id}`,
        type: 'equipment_recheck',
        level: daysLeft <= 3 ? 'danger' : 'warning',
        title: '设备待复检',
        message: `【${e.equipmentName}】需在 ${e.recheckDate} 前完成复检，剩余 ${daysLeft} 天`,
        link: '#/equipment',
      });
    } else if (daysLeft < 0 && daysLeft >= -14) {
      alerts.push({
        id: `equip-overdue-${e.id}`,
        type: 'equipment_overdue',
        level: 'danger',
        title: '复检已逾期',
        message: `【${e.equipmentName}】复检日期 ${e.recheckDate} 已过 ${Math.abs(daysLeft)} 天`,
        link: '#/equipment',
      });
    }
  });

  // 3. Energy anomaly alerts
  const energy = get('energy') || [];
  const typeGroups = {};
  energy.forEach(e => {
    if (!typeGroups[e.energyType]) typeGroups[e.energyType] = [];
    typeGroups[e.energyType].push(e);
  });

  for (const [type, records] of Object.entries(typeGroups)) {
    records.sort((a, b) => a.period.localeCompare(b.period));
    const recent6 = records.slice(-7, -1);
    if (recent6.length < 3) continue;

    const avg = recent6.reduce((s, r) => s + (Number(r.value) || 0), 0) / recent6.length;
    const latest = records[records.length - 1];

    if (avg > 0 && !latest.isAbnormal) {
      const deviation = ((Number(latest.value) || 0) - avg) / avg * 100;
      if (Math.abs(deviation) > energyPct) {
        alerts.push({
          id: `energy-anomaly-${latest.id}`,
          type: 'energy_anomaly',
          level: 'warning',
          title: '能耗异常波动',
          message: `【${type === 'electric' ? '电' : type === 'water' ? '水' : '气'}】${latest.period} 用量较近6月均值偏差 ${Math.abs(deviation).toFixed(0)}%${deviation > 0 ? '（偏高）' : '（偏低）'}`,
          link: '#/energy',
        });
      }
    }
  }

  // Filter dismissed
  const dismissed = get('alert_dismissed') || [];
  return alerts.filter(a => !dismissed.includes(a.id));
}

export function dismissAlert(alertId) {
  const dismissed = get('alert_dismissed') || [];
  if (!dismissed.includes(alertId)) {
    dismissed.push(alertId);
    set('alert_dismissed', dismissed);
  }
}

export function dismissAllAlerts(alerts) {
  const dismissed = get('alert_dismissed') || [];
  for (const a of alerts) {
    if (!dismissed.includes(a.id)) {
      dismissed.push(a.id);
    }
  }
  set('alert_dismissed', dismissed);
}

export function renderAlertDrawer(alerts) {
  const body = document.getElementById('alert-drawer-body');
  if (!alerts || alerts.length === 0) {
    body.innerHTML = '<div class="empty-state"><p>暂无提醒通知 🎉</p></div>';
    return;
  }

  body.innerHTML = `
    <div style="margin-bottom:12px;text-align:right">
      <button id="dismiss-all-btn" class="btn btn-outline btn-sm">全部关闭</button>
    </div>
    ${alerts.map(a => `
      <div class="alert-item alert-${a.level}" data-link="${a.link}" data-alert-id="${a.id}">
        <div class="alert-title">${a.level === 'danger' ? '🔴' : '🟡'} ${a.title}</div>
        <div class="alert-msg">${a.message}</div>
      </div>
    `).join('')}
  `;

  body.querySelectorAll('.alert-item').forEach(item => {
    item.addEventListener('click', () => {
      dismissAlert(item.dataset.alertId);
      location.hash = item.dataset.link;
      document.getElementById('alert-drawer').classList.add('hidden');
    });
  });

  const dismissAll = document.getElementById('dismiss-all-btn');
  if (dismissAll) {
    dismissAll.addEventListener('click', (e) => {
      e.stopPropagation();
      dismissAllAlerts(alerts);
      document.getElementById('alert-drawer').classList.add('hidden');
    });
  }
}

export function updateAlertBadge(alerts) {
  const badge = document.getElementById('alert-badge');
  if (alerts && alerts.length > 0) {
    badge.textContent = alerts.length > 99 ? '99+' : alerts.length;
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }
}
