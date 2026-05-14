import { get } from '../storage.js';
import { formatCurrency, formatNumber, formatDate, today, daysFromNow } from '../utils.js';
import { createLineChart, createBarChart, createPieChart, destroyChart } from '../charts.js';
import { exportToExcel } from '../excel.js';

function getContracts() { return get('contracts') || []; }
function getEnergy() { return get('energy') || []; }
function getProperty() { return get('property') || []; }
function getEquipment() { return get('equipment') || []; }
function getOthers() { return get('others') || []; }

export function renderDashboard() {
  const now = today();
  const contracts = getContracts();
  const energy = getEnergy();
  const property = getProperty();
  const equipment = getEquipment();
  const others = getOthers();

  const activeContracts = contracts.filter(c => c.status !== 'terminated' && daysFromNow(c.endDate) >= 0);
  const expiringSoon = activeContracts.filter(c => daysFromNow(c.endDate) <= 30).length;
  const totalContractAmount = activeContracts.reduce((s, c) => s + (Number(c.amount) || 0), 0);
  const totalProperty = property.reduce((s, d) => s + (Number(d.amount) || 0), 0);
  const totalRepairCost = equipment.reduce((s, d) => s + (Number(d.repairCost) || 0), 0);
  const pendingRecheck = equipment.filter(d => d.repairResult === '待复检').length;

  return `
    <div class="page-header" style="display:flex;align-items:center;justify-content:space-between">
      <h2>📊 数据汇总分析</h2>
      <div class="btn-group">
        <select id="dashboard-period" class="form-select" style="min-width:100px">
          <option value="all">全部时间</option>
          <option value="month">本月</option>
          <option value="quarter">本季度</option>
          <option value="year">本年度</option>
        </select>
        <button id="dashboard-export" class="btn btn-primary">📤 导出总报表</button>
        <button id="dashboard-export-excel" class="btn btn-success">📥 导出Excel</button>
      </div>
    </div>

    <div class="stat-cards" style="margin-bottom:24px">
      <div class="stat-card"><div class="stat-label">有效合同</div><div class="stat-value">${activeContracts.length} <span style="font-size:14px">份</span></div><div class="stat-sub">即将到期 ${expiringSoon} 份</div></div>
      <div class="stat-card"><div class="stat-label">合同总金额</div><div class="stat-value">${formatCurrency(totalContractAmount)}</div></div>
      <div class="stat-card"><div class="stat-label">能耗记录</div><div class="stat-value">${energy.length} <span style="font-size:14px">条</span></div></div>
      <div class="stat-card"><div class="stat-label">运维总支出</div><div class="stat-value">${formatCurrency(totalProperty)}</div></div>
      <div class="stat-card"><div class="stat-label">维修总费用</div><div class="stat-value">${formatCurrency(totalRepairCost)}</div><div class="stat-sub">待复检 ${pendingRecheck} 台</div></div>
      <div class="stat-card"><div class="stat-label">其他工作记录</div><div class="stat-value">${others.length} <span style="font-size:14px">条</span></div></div>
    </div>

    <div class="card" style="margin-bottom:20px">
      <div class="card-header">📋 合同概况</div>
      <div style="height:300px;position:relative"><canvas id="chart-dash-contracts"></canvas></div>
    </div>

    <div class="charts-row" style="margin-bottom:20px">
      <div class="chart-box">
        <h4>📈 月度运维支出趋势</h4>
        <div style="height:260px;position:relative"><canvas id="chart-dash-property"></canvas></div>
      </div>
      <div class="chart-box">
        <h4>⚡ 能耗类型分布</h4>
        <div style="height:260px;position:relative"><canvas id="chart-dash-energy"></canvas></div>
      </div>
    </div>

    <div class="card">
      <div class="card-header">🔧 设备维修概况</div>
      <div class="charts-row">
        <div class="chart-box" style="box-shadow:none;padding:0">
          <div style="height:260px;position:relative"><canvas id="chart-dash-equip-method"></canvas></div>
        </div>
        <div class="chart-box" style="box-shadow:none;padding:0">
          <div style="height:260px;position:relative"><canvas id="chart-dash-equip-freq"></canvas></div>
        </div>
      </div>
    </div>
  `;
}

export function setupDashboardEvents() {
  renderDashboardCharts();

  document.getElementById('dashboard-export').addEventListener('click', () => {
    const summary = buildSummary();
    const text = formatSummaryText(summary);
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `工作数据汇总报表_${today()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  });

  document.getElementById('dashboard-export-excel').addEventListener('click', exportFullReport);

  document.getElementById('dashboard-period').addEventListener('change', () => {
    renderDashboardCharts();
  });
}

export function cleanupDashboard() {
  destroyChart('chart-dash-contracts');
  destroyChart('chart-dash-property');
  destroyChart('chart-dash-energy');
  destroyChart('chart-dash-equip-method');
  destroyChart('chart-dash-equip-freq');
}

function renderDashboardCharts() {
  const contracts = getContracts();
  const energy = getEnergy();
  const property = getProperty();
  const equipment = getEquipment();

  const monthMap = {};
  contracts.forEach(c => {
    const m = (c.signDate || '').slice(0, 7);
    if (m) monthMap[m] = (monthMap[m] || 0) + 1;
  });
  const months = Object.keys(monthMap).sort();
  createBarChart('chart-dash-contracts', months, [
    { label: '签订合同数', data: months.map(m => monthMap[m]), backgroundColor: '#1a73e8' },
  ], null);

  const propMonth = {};
  property.forEach(d => {
    const m = (d.expenseDate || '').slice(0, 7);
    if (m) propMonth[m] = (propMonth[m] || 0) + (Number(d.amount) || 0);
  });
  const pMonths = Object.keys(propMonth).sort().slice(-12);
  createLineChart('chart-dash-property', pMonths, [
    { label: '运维支出', data: pMonths.map(m => Math.round(propMonth[m])), borderColor: '#f59e0b' },
  ], null);

  const energyTypeMap = { water: 0, electric: 0, gas: 0 };
  energy.forEach(d => { energyTypeMap[d.energyType] = (energyTypeMap[d.energyType] || 0) + (Number(d.value) || 0); });
  const typeLabels = { water: '水', electric: '电', gas: '气' };
  createPieChart('chart-dash-energy',
    Object.keys(energyTypeMap).map(k => typeLabels[k] || k),
    Object.values(energyTypeMap), null);

  const methodCount = { 自修: 0, 外包: 0 };
  equipment.forEach(d => { if (methodCount[d.repairMethod] !== undefined) methodCount[d.repairMethod]++; });
  createPieChart('chart-dash-equip-method', Object.keys(methodCount), Object.values(methodCount), '维修方式占比');

  const freqMap = {};
  equipment.forEach(d => { freqMap[d.equipmentName] = (freqMap[d.equipmentName] || 0) + 1; });
  const sorted = Object.entries(freqMap).sort((a, b) => b[1] - a[1]).slice(0, 8);
  createBarChart('chart-dash-equip-freq', sorted.map(e => e[0]),
    [{ label: '维修次数', data: sorted.map(e => e[1]), backgroundColor: '#ef4444' }], '高频维修设备');
}

function buildSummary() {
  const contracts = getContracts();
  const energy = getEnergy();
  const property = getProperty();
  const equipment = getEquipment();
  const others = getOthers();

  const activeContracts = contracts.filter(c => c.status !== 'terminated' && daysFromNow(c.endDate) >= 0);
  return {
    有效合同数: activeContracts.length,
    即将到期合同数: activeContracts.filter(c => daysFromNow(c.endDate) <= 30).length,
    合同总金额: formatCurrency(activeContracts.reduce((s, c) => s + (Number(c.amount) || 0), 0)),
    能耗记录条数: energy.length,
    运维总支出: formatCurrency(property.reduce((s, d) => s + (Number(d.amount) || 0), 0)),
    维修总次数: equipment.length,
    维修总费用: formatCurrency(equipment.reduce((s, d) => s + (Number(d.repairCost) || 0), 0)),
    待复检设备: equipment.filter(d => d.repairResult === '待复检').length,
    其他工作记录: others.length,
    报表生成时间: new Date().toLocaleString('zh-CN'),
  };
}

function formatSummaryText(s) {
  let text = '══════════════════════════════\n';
  text += '    工作数据汇总报表\n';
  text += '══════════════════════════════\n\n';
  for (const [k, v] of Object.entries(s)) {
    text += `  ${k}: ${v}\n`;
  }
  text += '\n══════════════════════════════\n';
  return text;
}

function exportFullReport() {
  const contracts = getContracts();
  const energy = getEnergy();
  const property = getProperty();
  const equipment = getEquipment();
  const others = getOthers();

  const sheets = [
    {
      name: '合同',
      headers: ['contractName', 'contractNo', 'partner', 'signDate', 'startDate', 'endDate', 'amount', 'status', 'content', 'notes'],
      data: contracts.map(c => ({
        contractName: c.contractName,
        contractNo: c.contractNo,
        partner: c.partner,
        signDate: c.signDate,
        startDate: c.startDate,
        endDate: c.endDate,
        amount: c.amount,
        status: c.status === 'active' ? '有效' : c.status === 'terminated' ? '已终止' : '已过期',
        content: c.content,
        notes: c.notes,
      })),
    },
    {
      name: '能耗',
      headers: ['energyType', 'period', 'value', 'unit', 'isAbnormal', 'notes'],
      data: energy.map(d => ({
        energyType: d.energyType === 'water' ? '水' : d.energyType === 'electric' ? '电' : '气',
        period: d.period,
        value: d.value,
        unit: d.unit,
        isAbnormal: d.isAbnormal ? '是' : '否',
        notes: d.notes,
      })),
    },
    {
      name: '物业运维支出',
      headers: ['expenseType', 'amount', 'expenseDate', 'paymentMethod', 'purpose', 'notes'],
      data: property.map(d => ({
        expenseType: d.expenseType,
        amount: d.amount,
        expenseDate: d.expenseDate,
        paymentMethod: d.paymentMethod,
        purpose: d.purpose,
        notes: d.notes,
      })),
    },
    {
      name: '设备维修',
      headers: ['equipmentName', 'equipmentNo', 'repairDate', 'repairMethod', 'repairCost', 'repairResult', 'repairPerson', 'notes'],
      data: equipment.map(d => ({
        equipmentName: d.equipmentName,
        equipmentNo: d.equipmentNo,
        repairDate: d.repairDate,
        repairMethod: d.repairMethod,
        repairCost: d.repairCost,
        repairResult: d.repairResult,
        repairPerson: d.repairPerson,
        notes: d.notes,
      })),
    },
    {
      name: '其他工作',
      headers: ['workName', 'recordDate', 'category', 'notes'],
      data: others.map(d => ({
        workName: d.workName,
        recordDate: d.recordDate,
        category: d.category,
        notes: d.notes,
      })),
    },
  ];

  exportToExcel(sheets, `工作数据汇总报表_${today()}.xlsx`);
}
