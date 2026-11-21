import { msg } from '../../js/locale.js';
import { createFeedbackTimer, GUIDANCE_MS } from '../feedback.js';

const notice = document.querySelector('#notice');
const message = notice.querySelector('[role="status"]');
const dismiss = notice.querySelector('button');
const expireAfter = createFeedbackTimer(() => tell());

export function tell(text = '', durationMs = GUIDANCE_MS) {
  expireAfter(text ? durationMs : 0);
  const supplies = document.querySelector('.lr-field-supplies[open] [role="status"]');
  if (supplies) supplies.textContent = text;
  message.textContent = supplies ? '' : text;
  notice.hidden = !text || Boolean(supplies);
  dismiss.hidden = notice.hidden || durationMs > 0;
  if (!dismiss.hidden) dismiss.setAttribute('aria-label', msg('关闭提示', 'Dismiss message'));
}

dismiss.addEventListener('click', () => tell());
