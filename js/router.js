class Router {
  constructor() {
    this.routes = {};
    this.currentRoute = null;
    this.currentCleanup = null;
    window.addEventListener('hashchange', () => this.resolve());
  }

  register(hash, config) {
    this.routes[hash] = config;
  }

  resolve() {
    const hash = location.hash || '#/login';
    const route = this.routes[hash];
    if (!route) {
      location.hash = '#/login';
      return;
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
      if (route.afterRender) {
        route.afterRender();
      }
      if (route.cleanup) {
        this.currentCleanup = route.cleanup;
      }
    }
  }

  navigate(hash) {
    location.hash = hash;
  }

  start() {
    this.resolve();
  }
}

export const router = new Router();
