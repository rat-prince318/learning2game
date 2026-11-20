import { BattleController } from '../battle/controller.js';
import { msg } from '../../js/locale.js';

export const backLabel = () => msg('返回地图', 'Return to map');

export function mountPanel(container, {sessionId, onExit, onViewChange}, render) {
  const doc = container.ownerDocument;
  if (!doc.querySelector('link[data-tower-styles]')) {
    const link = doc.createElement('link');
    link.rel = 'stylesheet';
    link.href = new URL('./tower.css', import.meta.url).href;
    link.dataset.towerStyles = '';
    doc.head.append(link);
  }
  const root = doc.createElement('section');
  root.className = 'rpg-expansion';
  root.innerHTML = '<div class="ex-content"></div><p class="ex-status" role="status" aria-live="polite"></p>';
  container.append(root);
  const content = root.firstElementChild, status = root.lastElementChild;
  const controller = new BattleController(sessionId);
  const lifetime = new AbortController();
  let disposed = false, busy = false, error = false;
  const context = {
    root, content, controller, onExit: () => onExit?.(controller.view), signal:lifetime.signal,
    redraw: () => { if (!disposed) render(context, controller.view); },
    accept(view) { if (!disposed) onViewChange?.(view); },
    async command(fields) {
      if (busy || disposed) return null;
      busy = true;
      root.setAttribute('aria-busy', 'true');
      content.inert = true;
      try {
        const result = fields ? await controller.send(fields) : await controller.load();
        if (disposed) return null;
        context.accept(result);
        status.replaceChildren();
        error = false;
        context.redraw();
        return result;
      } catch {
        if (disposed) return null;
        error = true;
        showError();
        return null;
      } finally {
        busy = false;
        content.inert = false;
        root.setAttribute('aria-busy','false');
      }
    },
  };
  function showError() {
    const retry = doc.createElement('button');
    retry.type = 'button';
    retry.textContent = msg('重新连接','Reconnect');
    retry.addEventListener('click', () => context.command(null), {once:true});
    status.replaceChildren(msg('连接中断，进度已保留。','Connection interrupted. Your progress is saved.'), ' ', retry);
  }
  window.addEventListener('learning2game:locale', () => {
    context.redraw();
    if (error) showError();
  }, {signal:lifetime.signal});
  context.redraw();
  const ready = context.command(null);
  return {context, ready, destroy() {
    disposed = true;
    lifetime.abort();
    root.remove();
  }};
}
