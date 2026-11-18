/** Gameplay state is independent of DOM. No answer map exists in this module. */
export function shuffle(cards, random = Math.random) {
  const result = [...cards];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function validatePublicGame(game) {
  if (!game || typeof game.game_id !== 'string' || !Number.isInteger(game.pair_count) || game.pair_count < 1 || game.pair_count > 12) throw new Error('游戏配置无效：配对数量必须为 1–12。');
  const forbidden = /^(answers?|answer_map|pairs|pair_id|correct_.*|knowledge_id|explanation|hint)$/i;
  const inspect = value => {
    if (Array.isArray(value)) { value.forEach(inspect); return; }
    if (value && typeof value === 'object') for (const [key, item] of Object.entries(value)) {
      if (forbidden.test(key)) throw new Error('公开游戏配置包含答案字段，请让后端返回 GameConfigPublic。');
      inspect(item);
    }
  };
  inspect(game);
  const ids = new Set();
  for (const cards of [game.left_cards, game.right_cards]) {
    if (!Array.isArray(cards) || cards.length !== game.pair_count) throw new Error('卡片数量与配对数量不一致。');
    for (const card of cards) {
      if (typeof card.id !== 'string' || !card.id || ids.has(card.id) || typeof card.text !== 'string' || !card.text.trim()) throw new Error('卡片 ID 或内容无效。');
      ids.add(card.id);
    }
  }
  return game;
}

const ordered = (cards, ids) => {
  if (!Array.isArray(ids) || new Set(ids).size !== cards.length || ids.length !== cards.length) return shuffle(cards);
  const index = new Map(cards.map(card => [card.id, card]));
  return ids.every(id => index.has(id)) ? ids.map(id => index.get(id)) : shuffle(cards);
};

export class MatchingEngine {
  #api; #version = 0; #listeners = new Set(); #state = null;
  constructor(api) { this.#api = api; }
  subscribe(listener) { this.#listeners.add(listener); return () => this.#listeners.delete(listener); }
  get snapshot() { return this.#state ? structuredClone(this.#state) : null; }
  #emit() { for (const listener of this.#listeners) listener(this.snapshot); }
  start(game, session, recovery = {}) {
    validatePublicGame(game);
    if (session.game_id !== game.game_id || !session.session_id || !['active', 'completed', 'finished'].includes(session.status)) throw new Error('会话与游戏不一致或会话状态无效。');
    this.#version++;
    const active = session.status === 'active';
    const pending = active && recovery.session_id === session.session_id ? recovery.pendingEvent : null;
    const validPending = pending && game.left_cards.some(c => c.id === pending.left_card_id) && game.right_cards.some(c => c.id === pending.right_card_id) && typeof pending.event_id === 'string';
    this.#state = {
      game: structuredClone(game), session: structuredClone(session),
      leftCards: ordered(game.left_cards, recovery.leftOrder), rightCards: ordered(game.right_cards, recovery.rightOrder),
      selectedLeft: validPending ? pending.left_card_id : null,
      selectedRight: validPending ? pending.right_card_id : null,
      phase: active ? validPending ? 'retry' : 'active' : 'ended',
      pendingEvent: validPending ? pending : null, feedback: null, error: null
    };
    this.#emit();
  }
  selectLeft(id) {
    const s = this.#state;
    if (!s || s.phase !== 'active' || !s.leftCards.some(c => c.id === id) || s.session.matched_left_ids.includes(id)) return;
    s.selectedLeft = s.selectedLeft === id ? null : id;
    s.selectedRight = null; s.error = null; this.#emit();
  }
  async chooseRight(id) {
    const s = this.#state;
    if (!s || s.phase !== 'active' || !s.selectedLeft || !s.rightCards.some(c => c.id === id) || s.session.matched_right_ids.includes(id)) return;
    s.selectedRight = id;
    s.pendingEvent = { event_id: crypto.randomUUID(), left_card_id: s.selectedLeft, right_card_id: id };
    await this.#submit();
  }
  async retry() { if (this.#state?.phase === 'retry' && this.#state.pendingEvent) await this.#submit(); }
  async #submit() {
    const s = this.#state, version = this.#version, event = { ...s.pendingEvent };
    s.phase = 'submitting'; s.error = null; this.#emit();
    try {
      const result = await this.#api.attempt(s.session.session_id, event);
      if (version !== this.#version) return;
      if (result.session?.session_id !== s.session.session_id || typeof result.is_correct !== 'boolean') throw new Error('判分返回格式无效，请联系后端负责人。');
      s.session = structuredClone(result.session);
      s.feedback = { ...result, left_card_id: event.left_card_id, right_card_id: event.right_card_id };
      s.pendingEvent = null; s.selectedLeft = null; s.selectedRight = null;
      s.phase = result.session.status === 'active' ? 'active' : 'ended';
    } catch (error) {
      if (version !== this.#version) return;
      s.error = { message: error.message, code: error.code || 'NETWORK_ERROR' };
      s.phase = 'retry';
    }
    this.#emit();
  }
  suspend() { if (this.#state) { this.#version++; this.#state.phase = 'ended'; this.#emit(); } }
  clear() { this.#version++; this.#state = null; this.#emit(); }
  updateSession(session) {
    if (!this.#state || session.session_id !== this.#state.session.session_id) return;
    this.#state.session = structuredClone(session);
    if (session.status !== 'active') this.#state.phase = 'ended';
    this.#emit();
  }
  recovery() {
    const s = this.#state;
    return s ? { session_id: s.session.session_id, leftOrder: s.leftCards.map(c => c.id), rightOrder: s.rightCards.map(c => c.id), pendingEvent: s.pendingEvent } : null;
  }
}
