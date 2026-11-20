const key = 'learning2game.locale';
function stored() {
  try {
    return globalThis.localStorage?.getItem(key);
  } catch {
    return null;
  }
}
let locale = stored() === 'en' ? 'en' : 'zh';
const applyLanguage = () => {
  if (globalThis.document) document.documentElement.lang = locale === 'zh' ? 'zh-CN' : 'en';
};
export const getLocale = () => locale;
export const msg = (zh, en) => (locale === 'en' ? en : zh);
export function setLocale(value) {
  if (value !== 'zh' && value !== 'en') return;
  const changed = locale !== value;
  locale = value;
  applyLanguage();
  try {
    globalThis.localStorage?.setItem(key, value);
  } catch {
    /* Private browsing. */
  }
  if (changed && globalThis.window)
    window.dispatchEvent(new CustomEvent('learning2game:locale', { detail: { locale } }));
}
applyLanguage();
globalThis.window?.addEventListener('storage', (event) => {
  if (event.key === key && (event.newValue === 'zh' || event.newValue === 'en'))
    setLocale(event.newValue);
});
