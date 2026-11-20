import { msg } from '../../js/locale.js';
import { escapeHtml } from '../../js/utils.js';

// Only open the dispatch bench for actual queue/stack material. Both mechanisms
// are always offered, so opening the tool discloses no assessed choice.
const topic = /(?:^|\n)栈(?:$|\n)|「栈」|先进先出|后进先出|后入先出|入栈|出栈|栈顶|堆栈|入队|出队|队列|\b(?:fifo|lifo|queues?|stacks?|enqueue|dequeue)\b|\b(?:first|last)[ -]in[,]?[ -](?:first|last)[ -]out\b/iu;
const lanes = ['queue','stack'];
function tokens(value) {
  const normalized = value.trim().replace(/^\[([^\]]*)\]$/u,'$1').toUpperCase();
  const parts = /^(?:[A-E]{2,5}|[1-5]{2,5}|[XYZ]{2,3})$/.test(normalized) ?
    [...normalized] : normalized.split(/\s*(?:[,，、→]|->)\s*|\s+/u);
  return parts.length>=2 && parts.length<=5 && new Set(parts).size===parts.length &&
    parts.every(token=>/^[A-EXYZ1-5]$/.test(token)) ? parts : null;
}
// Match an observation to the player's declared apparatus only when both
// alternatives appear exactly once on this page. The question and the answer
// key are never consulted to decide which apparatus to use.
function mechanisms(options) {
  const signatures = {
    queue:/^队列$|^queue$|先进先出|队尾.{0,28}队首|\bfifo\b|arrival order|rear.{0,40}front|first[ -]in[,]? first[ -]out/iu,
    stack:/^栈$|^stack$|后进先出|栈顶|\blifo\b|latest item.{0,65}first item removed|last[ -]in[,]? first[ -]out/iu,
  };
  const found = {};
  for (const [lane,pattern] of Object.entries(signatures)) {
    const matches=options.filter(option=>pattern.test(option.text));
    if (matches.length!==1) return null;
    found[lane]=matches[0].id;
  }
  return found.queue===found.stack ? null : found;
}
export function cargoFor(prompt) {
  if (!prompt || !topic.test([prompt.text,...prompt.options.map(o=>o.text)].join('\n'))) return null;
  const rows = prompt.options.map(o=>tokens(o.text));
  const alphabet = row=>row?.slice().sort().join('');
  const key = alphabet(rows[0]);
  const matchable = Boolean(key) && rows.every(row=>alphabet(row)===key) &&
    new Set(rows.map(row=>row.join(''))).size===rows.length;
  return {mode:'queue', stock:matchable ? [...key] : ['A','B','C'], rack:[], output:[], peak:0, mechanisms:mechanisms(prompt.options),
    options:matchable ? new Map(rows.map((row,i)=>[row.join(''),prompt.options[i].id])) : null, open:false};
}
export function operateCargo(state, action, value) {
  if (action==='mode') {
    if (!lanes.includes(value) || state.mode===value) return;
    state.mode=value;
    // Before the first unload, compare two gates on exactly the same cargo.
    // A new run begins if a previous dispatch would mix mechanisms.
    if (state.output.length) { state.rack=[]; state.output=[]; state.peak=0; }
  } else if (action==='load') {
    if (state.stock.includes(value) && !state.rack.includes(value) && !state.output.includes(value)) {
      state.rack.push(value);
      state.peak=Math.max(state.peak,state.rack.length);
    }
  } else if (action==='unload' && state.rack.length) {
    const parcel = state.mode==='queue' ? state.rack.shift() : state.rack.pop();
    state.output.push(parcel);
  } else if (action==='reset') { state.rack=[]; state.output=[]; state.peak=0; }
}
export function cargoOption(state) {
  if (!state || state.rack.length) return undefined;
  if (state.options && state.output.length===state.stock.length) return state.options.get(state.output.join(''));
  if (state.peak>=2 && state.output.length>=2) return state.mechanisms?.[state.mode];
}

export function cargoMarkup(state) {
  if (!state) return '';
  const queue=state.mode==='queue', populated=state.rack.length || state.output.length;
  const slots=Array.from({length:state.stock.length},(_,i)=>{
    const token=state.rack[i], next=token && i===(queue?0:state.rack.length-1);
    return '<span class="bf-bin'+(next?' bf-next':'')+'">'+(token?crate(token,state):'')+'</span>';
  }).join('');
  const matching=cargoOption(state);
  const btn=(act,txt,props='')=>'<button type="button" data-act="cargo" data-op="'+act+'" '+props+'>'+txt+'</button>';
  return `<details class="bf-cargo" ${state.open?'open':''}><summary>${msg('操作渡口货栈','Operate the cargo dock')}</summary>
    <div class="bf-cargo-work"><div class="bf-cargo-modes" role="group" aria-label="${msg('选择机械结构','Choose a mechanism')}">
      ${btn('mode',msg('双端传送带 / 队列','Conveyor / queue'),'data-value="queue" aria-pressed="'+queue+'"')}
      ${btn('mode',msg('单门栈道 / 栈','Single gate / stack'),'data-value="stack" aria-pressed="'+!queue+'"')}</div>
    <p>${msg('按题面顺序装货，再操作闸门观察取货次序。','Load the crates in the order given by the clue, then open the gate to inspect the dispatch order.')}</p>
    <div class="bf-cargo-yard">
      <div class="bf-cargo-stock" role="group" aria-label="${msg('待装货箱','Available crates')}">${state.stock.map(token=>{
        const used=state.rack.includes(token)||state.output.includes(token);
        return btn('load',crate(token,state),'data-value="'+token+'" aria-label="'+msg('装入 ','Load ')+token+'" '+(used?'disabled':''));
      }).join('')}</div>
      <div class="bf-cargo-rack" data-mode="${state.mode}" aria-label="${msg('货架','Cargo rack')}"><div>${slots}</div>
      <small>${queue ? msg('◀ 从左出货','◀ Dispatch from left') : msg('从右出货 ▶','Dispatch from right ▶')}</small></div>
    </div>
    <div class="bf-cargo-controls">${btn('unload',queue ? msg('出队 / 取一箱','Dequeue one') : msg('出栈 / 取一箱','Pop one'), state.rack.length?'':'disabled')}
      ${btn('reset',msg('重新装货','Reset cargo'),populated?'':'disabled')}</div>
    <div class="bf-cargo-log" role="status">${msg('已出货','Dispatched')} <strong>${state.output.map(escapeHtml).join(' → ') || '—'}</strong></div>
    ${matching ? btn('bind',state.options ? msg('将出货次序刻入战技','Bind this dispatch order') : msg('将实测机制刻入战技','Bind this mechanism')) : ''}</div></details>`;
}
function crate(token,state) {
  const i=state.stock.indexOf(token);
  return '<span class="bf-crate" style="--crate-color:'+['#ba8653','#648d89','#9c755e','#8876a0','#8b945a'][i]+'"><b>'+escapeHtml(token)+'</b></span>';
}

export function animateParcel(dock, source, from, target) {
  if (!target || !source.animate) return;
  const parent=dock.getBoundingClientRect(), to=target.getBoundingClientRect();
  const parcel=source.cloneNode(true);
  parcel.classList.add('bf-travel-crate');
  parcel.setAttribute('aria-hidden','true');
  const x=from.x-parent.x, y=from.y-parent.y;
  const dx=to.x + to.width/2 - from.width/2 - from.x, dy=to.y - from.y;
  dock.append(parcel);
  const flight=parcel.animate([
    {transform:`translate(${x}px,${y}px)`,opacity:.9},
    {transform:`translate(${x+dx*.48}px,${y+dy*.48-16}px) rotate(-5deg)`,opacity:1,offset:.48},
    {transform:`translate(${x+dx}px,${y+dy}px)`,opacity:0},
  ],{duration:310,easing:'ease-in-out'});
  flight.onfinish=flight.oncancel=()=>parcel.remove();
}
