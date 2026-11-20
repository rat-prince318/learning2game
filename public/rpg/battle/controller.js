import { ApiClient, ApiError } from '../../js/api.js';
import { newId } from '../../js/utils.js';

// Each tab keeps its own receipt. Two tabs can still safely act on the same
// expedition because the server compares the outer expedition revision.
const inMemory = new Map();
export const tabRecords = {
  read(key) {
    if (inMemory.has(key)) return inMemory.get(key);
    try {
      return JSON.parse(sessionStorage.getItem(key));
    } catch {
      return null;
    }
  },
  write(key, value) {
    try {
      if (value == null) sessionStorage.removeItem(key);
      else sessionStorage.setItem(key, JSON.stringify(value));
      inMemory.delete(key);
    } catch {
      inMemory.set(key, value);
    }
  },
};

export class BattleController {
  constructor(sessionId, { api = new ApiClient(), storage = tabRecords, initialView = null } = {}) {
    if (!sessionId) throw new Error('请提供远征存档编号。');
    this.sessionId = sessionId;
    this.path = '/rpg/expeditions/' + encodeURIComponent(sessionId);
    this.api = api;
    this.storage = storage;
    this.key = 'l2g.battle.turn.v1.' + sessionId;
    this.pending = storage.read(this.key);
    this.view = null;
    if (initialView) this._accept(initialView);
    this.resynced = false;
    this.active = null;
  }

  get hasPending() {
    return Boolean(this.pending);
  }

  load() {
    return this._run('load', () => this._restore());
  }

  retry() {
    return this._run('retry', () => this._restore());
  }

  send(fields) {
    const label = JSON.stringify(fields);
    return this._run(label, async () => {
      if (this.pending) {
        const savedFields = Object.keys(this.pending).filter((key) => !['event_id', 'expected_revision'].includes(key));
        if (savedFields.length !== Object.keys(fields).length || !savedFields.every((key) => this.pending[key] === fields[key])) {
          throw new ApiError('PENDING_TURN', '上一次操作正在确认，请先恢复进度。');
        }
        return this._restore();
      }
      if (!this.view) throw new ApiError('NO_SESSION', '请先读取远征存档。');
      // Persist before sending. A closed tab or a lost HTTP response must
      // never turn a retry into a second answer, hint or reward.
      this._remember({ ...fields, event_id: newId(), expected_revision: this.view.revision });
      return this._postPending();
    });
  }

  _run(label, work) {
    if (this.active) {
      if (this.active.label === label) return this.active.promise;
      return Promise.reject(new ApiError('BUSY', '正在确认当前操作。'));
    }
    this.resynced = false;
    const promise = Promise.resolve().then(work).finally(() => { this.active = null; });
    this.active = { label, promise };
    return promise;
  }

  _remember(value) {
    this.pending = value;
    this.storage.write(this.key, value);
  }

  _accept(view) {
    if (view?.session_id !== this.sessionId || !Number.isInteger(view.revision)) {
      throw new ApiError('BAD_RESPONSE', '存档响应格式异常，请重新读取。');
    }
    this.view = view;
    return view;
  }

  async _restore() {
    const view = this._accept(await this.api.request(this.path));
    if (!this.pending) return view;
    // Another tab (or our own lost response) may have advanced past the
    // stored event. Replaying an old receipt would show an outdated prompt.
    if (this.pending.expected_revision !== view.revision) {
      this._remember(null);
      this.resynced = true;
      return view;
    }
    return this._postPending();
  }

  async _postPending() {
    try {
      const next = this._accept(await this.api.request(this.path + '/actions', {
        method: 'POST',
        body: this.pending,
      }));
      this._remember(null);
      return next;
    } catch (error) {
      if (error.status === 409) {
        const current = this._accept(await this.api.request(this.path));
        this._remember(null);
        this.resynced = true;
        return current;
      }
      // Client validation failures require a fresh choice. Connectivity,
      // throttling and server errors keep the same idempotency receipt.
      if (error.status >= 400 && error.status < 500 && ![408, 425, 429].includes(error.status)) {
        this._remember(null);
      }
      throw error;
    }
  }
}
