import { router } from './router.js';
import { closeModal } from './utils.js';
import { isLoggedIn, isInitialized, renderLoginPage, setupAuthEvents, logout } from './auth.js';
import { initAllKeys } from './storage.js';
import { renderContractList, setupContractEvents, cleanupContracts } from './modules/contracts.js';
import { renderEnergyList, setupEnergyEvents, cleanupEnergy } from './modules/energy.js';
import { renderPropertyList, setupPropertyEvents, cleanupProperty } from './modules/property.js';
import { renderEquipmentList, setupEquipmentEvents, cleanupEquipment } from './modules/equipment.js';
import { renderOthersList, setupOthersEvents, cleanupOthers } from './modules/others.js';
import { renderDashboard, setupDashboardEvents, cleanupDashboard } from './modules/dashboard.js';
import { renderSettingsPage, setupSettingsEvents } from './backup.js';
import { scanAlerts, renderAlertDrawer, updateAlertBadge } from './alerts.js';
import { renderHomePage, setupHomeEvents } from './modules/home.js';

function setupEventListeners() {
  document.getElementById('sidebar-toggle').addEventListener('click', () => {
    document.getElementById('sidebar-nav').classList.toggle('open');
  });

  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('modal-overlay').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeModal();
  });

  document.getElementById('alert-bell').addEventListener('click', () => {
    document.getElementById('alert-drawer').classList.toggle('hidden');
  });

  document.getElementById('alert-drawer-close').addEventListener('click', () => {
    document.getElementById('alert-drawer').classList.add('hidden');
  });

  const mnavMore = document.getElementById('mnav-more');
  const mobileMoreMenu = document.getElementById('mobile-more-menu');
  mnavMore.addEventListener('click', () => {
    mobileMoreMenu.classList.toggle('hidden');
  });
  mobileMoreMenu.querySelector('.mobile-more-overlay').addEventListener('click', () => {
    mobileMoreMenu.classList.add('hidden');
  });
  mobileMoreMenu.querySelectorAll('a').forEach(a => {
    a.addEventListener('click', () => mobileMoreMenu.classList.add('hidden'));
  });

  document.getElementById('app-content').addEventListener('click', () => {
    document.getElementById('sidebar-nav').classList.remove('open');
  });
}

function refreshAlerts() {
  if (!isLoggedIn()) return;
  const alerts = scanAlerts();
  updateAlertBadge(alerts);
  renderAlertDrawer(alerts);
}

function updateHeader() {
  const userEl = document.getElementById('header-user');
  if (isLoggedIn()) {
    userEl.innerHTML = '<a href="#/settings" style="font-size:13px">⚙️</a> <a href="#/login" id="logout-btn" style="font-size:13px">退出</a>';
    document.getElementById('logout-btn').addEventListener('click', (e) => {
      e.preventDefault();
      logout();
      location.hash = '#/login';
    });
    refreshAlerts();
  } else {
    userEl.innerHTML = '';
  }
}

function registerRoutes() {
  router.register('#/login', {
    title: '登录',
    render: () => renderLoginPage(),
    afterRender: () => setupAuthEvents(),
  });

  router.register('#/home', {
    title: '首页',
    guard: isLoggedIn,
    render: () => renderHomePage(),
    afterRender: () => { setupHomeEvents(); refreshAlerts(); },
  });

  router.register('#/contracts', {
    title: '合同目录',
    guard: isLoggedIn,
    render: () => renderContractList(),
    afterRender: () => setupContractEvents(),
    cleanup: () => cleanupContracts(),
  });

  router.register('#/energy', {
    title: '能耗用量',
    guard: isLoggedIn,
    render: () => renderEnergyList(),
    afterRender: () => setupEnergyEvents(),
    cleanup: () => cleanupEnergy(),
  });

  router.register('#/property', {
    title: '物业运维',
    guard: isLoggedIn,
    render: () => renderPropertyList(),
    afterRender: () => setupPropertyEvents(),
    cleanup: () => cleanupProperty(),
  });

  router.register('#/equipment', {
    title: '设备维修',
    guard: isLoggedIn,
    render: () => renderEquipmentList(),
    afterRender: () => setupEquipmentEvents(),
    cleanup: () => cleanupEquipment(),
  });

  router.register('#/others', {
    title: '其他工作',
    guard: isLoggedIn,
    render: () => renderOthersList(),
    afterRender: () => setupOthersEvents(),
    cleanup: () => cleanupOthers(),
  });

  router.register('#/dashboard', {
    title: '数据汇总',
    guard: isLoggedIn,
    render: () => renderDashboard(),
    afterRender: () => setupDashboardEvents(),
    cleanup: () => cleanupDashboard(),
  });

  router.register('#/settings', {
    title: '设置',
    guard: isLoggedIn,
    render: () => renderSettingsPage(),
    afterRender: () => { setupSettingsEvents(); refreshAlerts(); },
  });
}

function init() {
  setupEventListeners();
  registerRoutes();

  const originalResolve = router.resolve.bind(router);
  router.resolve = function () {
    const hash = location.hash || '#/login';
    const route = this.routes[hash];
    if (route && route.guard && !route.guard()) {
      location.hash = '#/login';
      return;
    }
    if (!route) {
      location.hash = '#/login';
      return;
    }

    if (hash !== '#/login' && isLoggedIn()) {
      initAllKeys();
    }

    if (this.currentCleanup) {
      this.currentCleanup();
      this.currentCleanup = null;
    }

    this.currentRoute = hash;
    document.querySelectorAll('#sidebar-nav .nav-item').forEach(el => {
      el.classList.toggle('active', el.getAttribute('href') === hash);
    });
    document.querySelectorAll('#mobile-nav .mnav-item[href]').forEach(el => {
      el.classList.toggle('active', el.getAttribute('href') === hash);
    });
    document.title = route.title ? `${route.title} - 工作数据汇总` : '工作数据汇总';

    const main = document.getElementById('app-content');
    main.innerHTML = '';

    if (route.render) {
      const result = route.render();
      if (typeof result === 'string') {
        main.innerHTML = result;
      }
    }

    updateHeader();

    if (route.afterRender) {
      route.afterRender();
    }

    if (route.cleanup) {
      this.currentCleanup = route.cleanup;
    }
  };

  router.start();
}

init();
