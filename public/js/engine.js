import { msg } from './locale.js';
import { ui } from './studio-copy.js';
import { displayText, newId } from './utils.js';

const validId = value => typeof value === 'string' && /^[^\s\x00-\x1f\x7f]{1,128}$/u.test(value);
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
  const count = game?.left_cards?.length;
  if (
    !game ||
    !validId(game.game_id) ||
    !Array.isArray(game.left_cards) ||
    !Number.isInteger(count) ||
    count < 2 ||
    count > 12 ||
    (game.pair_count != null && game.pair_count !== count)
  )
    throw new Error(ui('游戏配置无效：配对数量必须为 2–12。'));
  const forbidden =
    /^(answers?|answer_map|pairs|pair_id|correct(?:_.*)?|is_correct|solution|knowledge_id|explanation|hint)$/i;
  const inspect = (value) => {
    if (Array.isArray(value)) {
      value.forEach(inspect);
      return;
    }
    if (value && typeof value === 'object')
      for (const [key, item] of Object.entries(value)) {
        if (forbidden.test(key))
          throw new Error(ui('公开游戏配置包含答案字段，请让后端返回 GameConfigPublic。'));
        // The map keys here are opaque card IDs. Their options are checked below.
        if (value !== game || key !== 'court_options') inspect(item);
      }
  };
  inspect(game);
  const groups = game.court_options;
  if (!groups || typeof groups !== 'object' || Array.isArray(groups)) {
    throw new Error(msg(
      '当前球场使用旧版篮板。请更新服务并重新打开球场，既有成绩保存在学习报告中。',
      'This court uses an older set of backboards. Update the service and reopen the court. Saved results are available in the learning report.',
    ));
  }
  const invalidOptions = () => new Error(msg(
    '这组题目的篮板数据有误。请重新生成球场。',
    'The backboards for this lesson are incomplete. Generate the court again.',
  ));
  if (!Array.isArray(game.right_cards) || game.right_cards.length < 3 || game.right_cards.length > count * 4)
    throw invalidOptions();

  const labels = new Map();
  for (const card of [...game.left_cards, ...game.right_cards]) {
    if (!validId(card?.id) || labels.has(card.id) || typeof card.text !== 'string')
      throw new Error(ui('卡片 ID 或内容无效。'));
    const printed = displayText(card.text, '').trim().replace(/\s+/gu, ' ');
    if (!printed) throw new Error(ui('请调整课件表述后重新生成可区分的卡片。'));
    labels.set(card.id, printed);
  }
  if (new Set(game.left_cards.map(card => labels.get(card.id))).size !== count)
    throw new Error(ui('请调整课件表述后重新生成可区分的卡片。'));

  const boardIds = new Set(game.right_cards.map(card => card.id));
  const used = new Set();
  if (Object.keys(groups).length !== count) throw invalidOptions();
  for (const ball of game.left_cards) {
    const options = Object.hasOwn(groups, ball.id) ? groups[ball.id] : null;
    if (!Array.isArray(options) || ![3, 4].includes(options.length) ||
        options.some(id => !boardIds.has(id)) ||
        new Set(options.map(id => labels.get(id))).size !== options.length)
      throw invalidOptions();
    for (const id of options) used.add(id);
  }
  if (used.size !== boardIds.size) throw invalidOptions();
  return { ...game, pair_count: count };
}

const ordered = (cards, ids) => {
  if (!Array.isArray(ids) || new Set(ids).size !== cards.length || ids.length !== cards.length)
    return shuffle(cards);
  const index = new Map(cards.map((card) => [card.id, card]));
  return ids.every((id) => index.has(id)) ? ids.map((id) => index.get(id)) : shuffle(cards);
};

export class MatchingEngine {
  #api;
  #version = 0;
  #listeners = new Set();
  #state = null;
  constructor(api) {
    this.#api = api;
  }
  subscribe(listener) {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }
  get snapshot() {
    return this.#state ? structuredClone(this.#state) : null;
  }
  #emit() {
    for (const listener of this.#listeners) listener(this.snapshot);
  }
  start(game, session, recovery = {}) {
    game = validatePublicGame(game);
    if (
      session.game_id !== game.game_id ||
      !session.session_id ||
      !['active', 'completed', 'finished'].includes(session.status)
    )
      throw new Error(ui('会话与游戏不一致或会话状态无效。'));
    this.#version++;
    const active = session.status === 'active';
    const pending =
      active && recovery.session_id === session.session_id ? recovery.pendingEvent : null;
    const validPending =
      pending &&
      Object.hasOwn(game.court_options, pending.left_card_id) &&
      game.court_options[pending.left_card_id].includes(pending.right_card_id) &&
      validId(pending.event_id);
    // A migrated court may replace an old cross-question distractor. The server
    // snapshot already counts any accepted attempt. Keep the ball for a new shot.
    const savedBall = pending?.left_card_id || recovery.heldBallId;
    const canResumeBall = active && recovery.session_id === session.session_id &&
      game.left_cards.some(card => card.id === savedBall) && !session.matched_left_ids.includes(savedBall);
    this.#state = {
      game: structuredClone(game),
      session: structuredClone(session),
      leftCards: ordered(game.left_cards, recovery.leftOrder),
      selectedLeft: validPending ? pending.left_card_id : (canResumeBall ? savedBall : null),
      selectedRight: validPending ? pending.right_card_id : null,
      phase: active ? (validPending ? 'retry' : 'active') : 'ended',
      pendingEvent: validPending ? pending : null,
      feedback: null,
      error: null,
    };
    this.#emit();
  }
  selectLeft(id) {
    const s = this.#state;
    if (
      !s ||
      s.phase !== 'active' ||
      !s.leftCards.some((c) => c.id === id) ||
      s.session.matched_left_ids.includes(id)
    )
      return;
    s.selectedLeft = s.selectedLeft === id ? null : id;
    s.selectedRight = null;
    s.error = null;
    this.#emit();
  }
  async chooseRight(id) {
    const s = this.#state;
    if (
      !s ||
      s.phase !== 'active' ||
      !s.selectedLeft ||
      s.session.matched_left_ids.includes(s.selectedLeft) ||
      !s.game.court_options[s.selectedLeft].includes(id)
    )
      return;
    s.selectedRight = id;
    s.pendingEvent = { event_id: newId(), left_card_id: s.selectedLeft, right_card_id: id };
    await this.#submit();
  }
  async retry() {
    if (this.#state?.phase === 'retry' && this.#state.pendingEvent) await this.#submit();
  }
  async #submit() {
    const s = this.#state,
      version = this.#version,
      event = { ...s.pendingEvent };
    s.phase = 'submitting';
    s.error = null;
    this.#emit();
    try {
      const result = await this.#api.attempt(s.session.session_id, event);
      if (version !== this.#version) return;
      if (
        result.session?.session_id !== s.session.session_id ||
        typeof result.is_correct !== 'boolean'
      )
        throw new Error(ui('判分返回格式无效，请联系后端负责人。'));
      s.session = structuredClone(result.session);
      s.feedback = {
        ...result,
        left_card_id: event.left_card_id,
        right_card_id: event.right_card_id,
      };
      s.pendingEvent = null;
      s.selectedLeft = result.is_correct ? null : event.left_card_id;
      s.selectedRight = null;
      s.phase = result.session.status === 'active' ? 'active' : 'ended';
    } catch (error) {
      if (version !== this.#version) return;
      s.error = { message: error.message, code: error.code || 'NETWORK_ERROR' };
      s.phase = 'retry';
    }
    this.#emit();
  }
  suspend() {
    if (this.#state) {
      this.#version++;
      this.#state.phase = 'ended';
      this.#emit();
    }
  }
  clear() {
    this.#version++;
    this.#state = null;
    this.#emit();
  }
  updateSession(session) {
    if (!this.#state || session.session_id !== this.#state.session.session_id) return;
    this.#state.session = structuredClone(session);
    if (session.status !== 'active') this.#state.phase = 'ended';
    this.#emit();
  }
  recovery() {
    const s = this.#state;
    return s
      ? {
          session_id: s.session.session_id,
          heldBallId: s.selectedLeft,
          leftOrder: s.leftCards.map((c) => c.id),
          pendingEvent: s.pendingEvent,
        }
      : null;
  }
}
