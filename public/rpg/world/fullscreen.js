import { msg } from '../../js/locale.js';

const wrap = document.querySelector('#road');
const menu = document.querySelector('#game-menu-toggle');
const full = document.querySelector('#game-fullscreen-toggle');
const header = document.querySelector('#top');
function menuOpen() {
  return wrap.classList.contains('game-menu-open');
}
function closeMenu() {
  wrap.classList.remove('game-menu-open');
  sync();
}
function battlePreference(action) {
  return wrap.querySelector('.bf-immersive .bf-system [data-act="' + action + '"]');
}
function syncPreferences() {
  const settings = header.querySelector('.lr-settings');
  if (!settings || !menuOpen()) return;
  for (const action of ['sound', 'motion']) {
    const source = battlePreference(action);
    let button = settings.querySelector('[data-field-pref="' + action + '"]');
    if (!source) {
      button?.remove();
      continue;
    }
    if (!button) {
      button = document.createElement('button');
      button.type = 'button';
      button.dataset.fieldPref = action;
      settings.append(button);
    }
    button.setAttribute('aria-label', source.getAttribute('aria-label'));
    button.setAttribute('aria-pressed', source.getAttribute('aria-pressed'));
    button.textContent = source.textContent;
  }
}
function sync() {
  const active = Boolean(document.fullscreenElement);
  menu.textContent = menuOpen() ? msg('收起菜单', 'Close menu') : msg('菜单', 'Menu');
  menu.setAttribute('aria-expanded', String(menuOpen()));
  full.textContent = active ? msg('退出全屏', 'Exit fullscreen') : msg('全屏', 'Fullscreen');
  full.setAttribute('aria-pressed', String(active));
  syncPreferences();
}
menu.addEventListener('click', () => {
  wrap.classList.toggle('game-menu-open');
  sync();
});
header.addEventListener('click', (e) => {
  const preference = e.target.closest('[data-field-pref]');
  if (preference) {
    battlePreference(preference.dataset.fieldPref)?.click();
    syncPreferences();
    return;
  }
  if (['language', 'sound'].includes(e.target.closest('[data-do]')?.dataset.do)) {
    queueMicrotask(syncPreferences);
  } else closeMenu();
});
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || e.defaultPrevented || document.querySelector('dialog[open]')) return;
  if (menuOpen()) {
    closeMenu();
    menu.focus();
    e.preventDefault();
  } else if (
    document.querySelector('.lr-world, .bf-immersive') &&
    !document.querySelector('.lr-dialog-layer .lr-dialog')
  ) {
    menu.click();
    menu.focus();
  }
});
full.hidden = !document.fullscreenEnabled;
full.addEventListener('click', async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch {
    const n = document.querySelector('#notice');
    n.hidden = false;
    n.textContent = msg(
      '当前窗口已铺满游戏。浏览器可通过 F11 进入屏幕全屏。',
      'The game fills this window. Your browser can also enter fullscreen with F11.',
    );
  }
});
document.addEventListener('fullscreenchange', sync);
document.addEventListener('lantern:scene-ready', () => {
  closeMenu();
});
window.addEventListener('learning2game:locale', () => queueMicrotask(sync));
sync();
