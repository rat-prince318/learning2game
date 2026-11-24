import { msg } from '../../js/locale.js';
import { CONFIRMATION_MS, createFeedbackTimer } from '../feedback.js';
import { packLabel, packRows, packList, packDetail, heroPanel } from './pack-content.js';

const tabs = ['gear', 'supplies', 'relics'];
const commands = { equip: 'equip', unequip: 'unequip', use: 'use_item', 'confirm-discard': 'discard_item' };

export function openPack({ view: initial, send, onClose }) {
  const dialog = document.createElement('dialog');
  dialog.id = 'lr-pack';
  dialog.setAttribute('aria-labelledby', 'lr-pack-title');
  const previousFocus = document.activeElement;
  const events = new AbortController();
  let view = initial, tab = 'gear', dropping = false, busy = false;
  let selected = {}, notice = '', failed = false, disposed = false;
  const expireAfter = createFeedbackTimer(() => {
    notice = '';
    dialog.querySelector('[data-pack-status]').textContent = '';
  });

  function clearNotice() {
    expireAfter();
    notice = '';
    failed = false;
  }

  function render(focusSelector) {
    if (disposed) return;
    const list = packRows(view, tab);
    const row = list.find(entry => entry.id === selected[tab]) || list[0];
    if (row?.id !== selected[tab]) dropping = false;
    selected[tab] = row?.id;
    const oldGrid = dialog.querySelector('.pack-items');
    const scroll = oldGrid && oldGrid.dataset.tab === tab ? oldGrid.scrollTop : 0;
    dialog.innerHTML = '<div class="pack-shell"><header class="pack-header"><div class="pack-brand">' +
      '<span class="pack-insignia" aria-hidden="true">✦</span><h1 id="lr-pack-title">' + msg('远征背包', 'Expedition pack') +
      '</h1></div><div class="pack-tools"><span class="pack-coins"><i aria-hidden="true">◆</i><b>' + view.coins +
      '</b> ' + msg('路币', 'coins') + '</span><button type="button" data-pack-action="close" class="pack-close" aria-label="' +
      msg('关闭背包', 'Close pack') + '"><span aria-hidden="true">×</span> <span>' + msg('关闭', 'Close') +
      '</span></button></div></header><div class="pack-layout">' + heroPanel(view) +
      '<section class="pack-inventory" aria-label="' + msg('随身物品', 'Inventory') +
      '"><nav class="pack-tabs" role="tablist" aria-label="' + msg('物品分类', 'Item categories') + '">' +
      tabs.map(id => '<button type="button" role="tab" aria-selected="' + (id === tab) + '" id="lr-pack-tab-' +
        id + '" aria-controls="lr-pack-items" tabindex="' + (id === tab ? 0 : -1) + '" data-pack-tab="' + id + '">' + packLabel(id) + '</button>').join('') +
      '</nav><div class="pack-items" id="lr-pack-items" data-tab="' + tab + '" role="tabpanel" aria-labelledby="lr-pack-tab-' +
      tab + '">' + packList(list, row?.id, tab, view.mode) + '</div><div class="pack-detail' + (row ? '' : ' pack-detail-empty') +
      '">' + packDetail(view, tab, row, dropping) + '</div><div class="pack-status" data-pack-status role="status" aria-live="polite"></div></section></div></div>';
    dialog.querySelector('.pack-items').scrollTop = scroll;
    const status = dialog.querySelector('[data-pack-status]');
    status.textContent = busy ? msg('正在保存…', 'Saving…') : notice;
    status.classList.toggle('is-error', failed);
    if (focusSelector) dialog.querySelector(focusSelector)?.focus({preventScroll:true});
  }

  const dispose = notify => {
    if (disposed) return;
    disposed = true;
    expireAfter();
    events.abort();
    if (dialog.open) dialog.close();
    dialog.remove();
    if (previousFocus?.isConnected) previousFocus.focus({preventScroll:true});
    if (notify) onClose?.();
  };
  const close = () => { if (!busy) dispose(true); };
  function pickTab(id) {
    tab = id;
    dropping = false;
    clearNotice();
    render('[data-pack-tab="' + id + '"]');
  }
  function pickItem(button) {
    selected[tab] = button.dataset.packItem;
    dropping = false;
    clearNotice();
    render('[data-pack-item][aria-pressed="true"]');
    dialog.querySelector('[data-pack-item][aria-pressed="true"]')?.scrollIntoView({block:'nearest'});
  }
  function cancelDrop() {
    dropping = false;
    clearNotice();
    render('[data-pack-action="discard"]');
  }
  async function apply(action) {
    const item_id = selected[tab];
    const fields = {action:commands[action], item_id};
    if (action === 'confirm-discard') {
      const input = dialog.querySelector('[data-pack-quantity]');
      if (!input || !input.reportValidity() || !Number.isInteger(input.valueAsNumber)) return;
      fields.quantity = input.valueAsNumber;
    }
    if (!fields.action || !item_id) return;
    clearNotice();
    busy = true;
    dialog.setAttribute('aria-busy','true');
    const status = dialog.querySelector('[data-pack-status]');
    status.classList.remove('is-error');
    status.textContent = msg('正在保存…', 'Saving…');
    try {
      const result = await send(fields);
      if (disposed) return;
      if (!result?.player) throw new Error(msg('暂时读不到存档，请重试。','Could not read the updated save. Try again.'));
      view = result;
      dropping = false;
      failed = false;
      notice = {
        equip: msg('已换上装备。', 'Equipment changed.'), unequip: msg('已收回背包。', 'Returned to pack.'),
        use: msg('已使用一份道具。', 'One item used.'), 'confirm-discard': msg('已丢弃所选物品。', 'Selected items discarded.')
      }[action];
      expireAfter(CONFIRMATION_MS);
    } catch (error) {
      if (error?.status === 409) dropping = false;
      failed = true;
      notice = error?.message || msg('保存失败，请重试。','Could not save. Try again.');
    } finally {
      busy = false;
      dialog.removeAttribute('aria-busy');
      render(dropping ? '[data-pack-action="confirm-discard"]' : '[data-pack-item][aria-pressed="true"]');
      const input = dialog.querySelector('[data-pack-quantity]');
      if (input && fields.quantity) input.value = String(Math.min(fields.quantity, Number(input.max)));
      if (!disposed && !dialog.contains(document.activeElement)) dialog.querySelector('[aria-selected="true"]')?.focus();
    }
  }

  dialog.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button || busy || button.disabled) return;
    if (button.dataset.packWorn) {
      tab = 'gear';
      selected.gear = button.dataset.packWorn;
      dropping = false;
      clearNotice();
      render('[data-pack-item][aria-pressed="true"]');
      dialog.querySelector('[data-pack-item][aria-pressed="true"]')?.scrollIntoView({block:'nearest'});
      return;
    }
    if (button.dataset.packTab) return pickTab(button.dataset.packTab);
    if (button.dataset.packItem) return pickItem(button);
    const action = button.dataset.packAction;
    if (action === 'close') return close();
    if (action === 'cancel') return cancelDrop();
    if (action === 'discard') {
      dropping = true;
      clearNotice();
      render('[data-pack-action="cancel"]');
      return;
    }
    if (commands[action]) void apply(action);
  });
  dialog.addEventListener('cancel', event => {
    event.preventDefault();
    if (!busy) dropping ? cancelDrop() : close();
  });
  dialog.addEventListener('keydown', event => {
    if (event.key === 'Tab') return;
    event.stopPropagation();
    if (event.code === 'KeyE' && !event.altKey && !event.metaKey && !event.ctrlKey) {
      event.preventDefault();
      if (!event.repeat) close();
      return;
    }
    if (busy || !['ArrowLeft','ArrowRight','ArrowDown','ArrowUp','Home','End'].includes(event.key)) return;
    const tabButton = event.target.closest('[data-pack-tab]');
    const itemButton = event.target.closest('[data-pack-item]');
    if (!itemButton && !tabButton) return;
    const buttons = [...dialog.querySelectorAll(tabButton ? '[data-pack-tab]' : '[data-pack-item]')];
    const index = buttons.indexOf(tabButton || itemButton);
    const columns = tabButton ? 1 : getComputedStyle(dialog.querySelector('.pack-items')).gridTemplateColumns.trim().split(/\s+/).length;
    const step = {ArrowLeft:-1,ArrowRight:1,ArrowDown:columns,ArrowUp:-columns}[event.key];
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length-1 :
      tabButton ? (index + step + buttons.length) % buttons.length : Math.max(0,Math.min(buttons.length-1,index+step));
    event.preventDefault();
    if (tabButton) pickTab(buttons[next].dataset.packTab);
    else pickItem(buttons[next]);
  });
  window.addEventListener('learning2game:locale', () => {
    if (!failed) clearNotice();
    render();
  }, {signal:events.signal});
  render();
  document.body.append(dialog);
  dialog.showModal();
  dialog.querySelector('[data-pack-tab="gear"]').focus({preventScroll:true});
  return {close, destroy:() => dispose(false), update(next) {if (next?.player) {view = next; render();}}};
}
