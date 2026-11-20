import { mountBattle } from './battle.js';
import { getSavedSession } from './demo.js';

const sessionId = new URL(location.href).searchParams.get('session');
mountBattle(document.querySelector('#battle'), {
  sessionId: sessionId || getSavedSession(),
  standalone: true,
  savedEntry: !sessionId,
});
