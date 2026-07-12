/* ==================== HASH ROUTER ==================== */
let routerReady = false;
let navigationGuard = null;
let restoringCancelledHistory = false;

function routePath(...parts) {
  return parts.filter(part => part !== undefined && part !== null && part !== '')
    .map(part => encodeURIComponent(String(part)))
    .join('/');
}

function routeParts() {
  const raw = window.location.hash.replace(/^#\/?/, '');
  if (!raw) return ['home'];
  try {
    return raw.split('/').filter(Boolean).map(decodeURIComponent);
  } catch (error) {
    return ['home'];
  }
}

function currentRouteKey() {
  return routeParts().join('/');
}

function setNavigationGuard(message, shouldConfirm = () => true) {
  navigationGuard = { message, shouldConfirm };
}

function clearNavigationGuard() {
  navigationGuard = null;
}

function confirmRouteLeave() {
  if (!navigationGuard || !navigationGuard.shouldConfirm()) return true;
  return confirm(navigationGuard.message);
}

function writeRoute(route, replace = false) {
  const cleanRoute = String(route || 'home').replace(/^#\/?/, '') || 'home';
  const currentDepth = Number(history.state?.romeoDepth) || 0;
  const state = {
    romeoRoute: true,
    romeoDepth: replace ? currentDepth : currentDepth + 1
  };
  const url = `${window.location.pathname}${window.location.search}#/${cleanRoute}`;
  history[replace ? 'replaceState' : 'pushState'](state, '', url);
}

function navigateTo(route, options = {}) {
  if (!options.skipGuard && !confirmRouteLeave()) return false;
  clearNavigationGuard();
  const cleanRoute = String(route || 'home').replace(/^#\/?/, '') || 'home';
  if (cleanRoute === currentRouteKey()) {
    renderCurrentRoute();
    return true;
  }
  writeRoute(cleanRoute, Boolean(options.replace));
  if (routerReady) renderCurrentRoute();
  return true;
}

function navigateRoute(...parts) {
  return navigateTo(routePath(...parts));
}

function replaceRoute(...parts) {
  return navigateTo(routePath(...parts), { replace: true, skipGuard: true });
}

function navigateBack(fallback = 'home') {
  if (!confirmRouteLeave()) return;
  clearNavigationGuard();
  if (Number(history.state?.romeoDepth) > 0) history.back();
  else navigateTo(fallback, { replace: true, skipGuard: true });
}

function renderPracticeSetRoute(setId) {
  const routeKey = currentRouteKey();
  const tx = db.transaction('wordSets', 'readonly');
  tx.objectStore('wordSets').get(setId).onsuccess = event => {
    if (routeKey !== currentRouteKey()) return;
    if (!event.target.result) return replaceRoute('practice');
    renderPracticeMode(setId);
  };
}

function renderCurrentRoute() {
  if (!routerReady) return;
  clearNavigationGuard();
  const [section, action, value, extra] = routeParts();

  if (section === 'home' && !action) return renderHome();
  if ((section === 'learn' || section === 'practice') && !action) return renderSetSelection(section, 'all');
  if ((section === 'learn' || section === 'practice') && action === 'group' && value && !extra) {
    return renderSetSelection(section, value);
  }
  if (section === 'learn' && action === 'set' && value && !extra) return startLearn(value);
  if (section === 'practice' && action === 'set' && value && !extra) return renderPracticeSetRoute(value);
  if (section === 'target' && (action === 'learn' || action === 'practice') && !value) {
    return renderTargetSelection(action);
  }
  const targetGroups = action === 'practice'
    ? ['todayWrong', 'consolidation', 'historical', 'mastered', 'allWords']
    : ['consolidation', 'historical', 'mastered', 'allWords'];
  if (section === 'target' && (action === 'learn' || action === 'practice') && targetGroups.includes(value) && !extra) {
    return renderTargetGroup(action, value);
  }
  if (section === 'manager' && (action === 'sets' || action === 'groups') && !value) {
    return renderWordManager(action);
  }
  if (section === 'manager' && action === 'sets' && value === 'group' && extra) {
    return renderWordManager('sets', `group:${extra}`);
  }
  if (section === 'records' && !action) return renderRecords();

  replaceRoute('home');
}

function startRouter() {
  const initialRoute = currentRouteKey();
  history.replaceState({ romeoRoute: true, romeoDepth: 0 }, '',
    `${window.location.pathname}${window.location.search}#/${initialRoute}`);
  routerReady = true;
  renderCurrentRoute();
}

window.addEventListener('hashchange', () => {
  if (!routerReady) return;
  if (restoringCancelledHistory) {
    restoringCancelledHistory = false;
    return;
  }
  if (!confirmRouteLeave()) {
    restoringCancelledHistory = true;
    history.forward();
    return;
  }
  clearNavigationGuard();
  renderCurrentRoute();
});

window.addEventListener('beforeunload', event => {
  if (!navigationGuard || !navigationGuard.shouldConfirm()) return;
  event.preventDefault();
  event.returnValue = '';
});
