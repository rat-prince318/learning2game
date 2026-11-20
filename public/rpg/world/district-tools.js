import { msg } from '../../js/locale.js';

export function openDistrictTool(view) {
  if (!view?.eight_chapters || !view.campaign_story) return null;
  switch (view.region_index) {
    case 2: return { kind: 'rail', siding: '', stopped: false };
    case 5: return { kind: 'lines', rope: '' };
    case 6: return { kind: 'bell', beat: 0 };
    case 7: return { kind: 'orrery', bearing: 0, elevation: 30 };
    default: return null;
  }
}

export function operateDistrictTool(state, action) {
  switch (state.kind) {
    case 'rail':
      if (action === 'hopper' || action === 'cooling') return { ...state, siding: action, stopped: false };
      if (action === 'brake' && state.siding === 'cooling') return { ...state, stopped: true };
      break;
    case 'lines':
      if (['drift', 'ice', 'post'].includes(action)) return { ...state, rope: action };
      break;
    case 'bell':
      if (action === 'ring') return { ...state, beat: state.beat % 3 + 1 };
      break;
    case 'orrery':
      if (action === 'rotate') return { ...state, bearing: (state.bearing + 1) % 4 };
      if (action === 'lower') return { ...state, elevation: Math.max(-30, state.elevation - 15) };
      if (action === 'raise') return { ...state, elevation: Math.min(30, state.elevation + 15) };
      break;
  }
  return state;
}

export function districtToolReady(state) {
  switch (state.kind) {
    case 'rail': return state.siding === 'cooling' && state.stopped;
    case 'lines': return state.rope === 'post';
    case 'bell': return state.beat === 3;
    case 'orrery': return state.bearing === 1 && state.elevation === 0;
    default: return false;
  }
}

const action = (key, label, selected, disabled = false) =>
  `<button type="button" data-do="set-control" data-tool="${key}"${selected == null ? '' : ' aria-pressed="' + selected + '"'}${disabled ? ' disabled' : ''}>${label}</button>`;

function instrument(state, name, drawing, reading, controls, finish) {
  return `<div class="lr-field-instrument lr-instrument-${state.kind}"><strong>${name}</strong>
    <div class="lr-tool-display" aria-hidden="true">${drawing}</div><p role="status">${reading}</p>
    <div class="lr-controls">${controls}<button type="button" class="lr-gold" data-do="inspect"${districtToolReady(state) ? '' : ' disabled'}>${finish}</button></div></div>`;
}

export function renderDistrictTool(state) {
  switch (state.kind) {
    case 'rail': {
      const cooling = state.siding === 'cooling';
      const reading = state.stopped ? msg('车轮在水槽里停稳了，车轴上的铁环正好对着安全钩。', 'The wheels come to rest in the water trough. The axle ring lines up with the safety hook.')
        : cooling ? msg('水浇在车轮上，白汽腾起来。矿车还在往前滑，脚边有个踏闸。', 'Steam rises where the wheels meet the trough. The cart is still rolling. A brake pedal lies at your feet.')
        : state.siding === 'hopper' ? msg('装料道通向炉口。车轮越靠近炉门，颜色就越亮。', 'The hopper line leads straight to the furnace. The wheels glow brighter as the cart draws near.')
        : msg('一边通炉口，另一边的铁轨穿过水槽。车轮烧得通红。', 'One line runs into the furnace. The other crosses a water trough. The cart wheels glow red.');
      const drawing = `<div class="lr-rail-plan" data-track="${state.siding}" data-stop="${state.stopped}"><i></i><b></b><span></span></div>`;
      return instrument(state, msg('矿车分道闸', 'Ore cart points'), drawing, reading,
        action('hopper', msg('拨向装料口', 'Switch to hopper'), state.siding === 'hopper') +
        action('cooling', msg('拨向冷却槽', 'Switch to trough'), cooling) +
        action('brake', msg('踩下踏闸', 'Set foot brake'), null, !cooling || state.stopped),
        msg('挂好车轴安全钩', 'Hook the axle ring'));
    }
    case 'lines': {
      const { rope } = state;
      const echo = rope === 'post';
      const reading = echo ? msg('绳头在掌心顶了三下，停了停，又轻轻一碰。冰下有人回信。', 'Three firm tugs against your palm. A pause, then a light tap. Someone is answering beneath the ice.')
        : rope === 'drift' ? msg('积雪簌簌滑下，绳头跟着你走了一截。', 'Powder slips down the bank and the loose end pulls out with your hand.')
        : rope === 'ice' ? msg('冰壁传回一下脆响，绳子随即松了。', 'The ice wall answers with one sharp crack, then the line goes slack.')
        : msg('雪线垂在三处。把绳头拢在手里，试试哪根能传回冰底的动静。', 'Three lines vanish into the snow. Hold each end to feel for an answer from below.');
      const drawing = `<div class="lr-line-trace" data-echo="${echo}">${(echo ? [3,3,3,1] : rope ? [1] : []).map(n => '<i style="--length:' + n + '"></i>').join('')}</div>`;
      return instrument(state, msg('山口听绳', 'Pass bell lines'), drawing, reading,
        action('drift', msg('牵雪坡绳', 'Tug snowbank line'), rope === 'drift') +
        action('ice', msg('牵冰壁绳', 'Tug ice line'), rope === 'ice') +
        action('post', msg('牵实木桩绳', 'Tug timber line'), echo),
        msg('敲一声木铃报平安', 'Ring once to answer'));
    }
    case 'bell': {
      const { beat } = state;
      const readings = [
        msg('桥头三座信号窗都暗着。修钟匠指指车道，再指指吊桥的插销。', 'All three signal windows are dark. The bell tender points to the cart lane, then the bridge pin.'),
        msg('第一响。东岸的旗手举起黄旗，领头的车夫勒住马。', 'First stroke. The east-bank flagger raises yellow and the lead driver reins in.'),
        msg('第二响。西岸升起黄旗，最后一辆车让开桥板。', 'Second stroke. Yellow rises on the west bank. The last cart clears the span.'),
        msg('第三响。绿旗升起，两岸都已净空。现在可以拔销落桥。', 'Third stroke. The green flag is up. Both banks are clear. Pull the pin to lower the span.'),
      ];
      const drawing = `<div class="lr-bridge-signals">${['I','II','III'].map((n,i) => '<i data-lit="' + (beat > i) + '">' + n + '</i>').join('')}</div>`;
      return instrument(state, msg('钟楼放桥台', 'Drawbridge signals'), drawing, readings[beat],
        action('ring', msg('拉钟绳', 'Pull bell rope')), msg('拔销放桥', 'Unpin the bridge'));
    }
    case 'orrery': {
      const { bearing, elevation } = state;
      const bearings = [msg('北', 'north'), msg('东', 'east'), msg('南', 'south'), msg('西', 'west')];
      const height = elevation ? msg((elevation > 0 ? '高出' : '低于') + '地平线 ' + Math.abs(elevation) + '°',
        Math.abs(elevation) + '° ' + (elevation > 0 ? 'above' : 'below') + ' the horizon') : msg('齐平地平线', 'level with the horizon');
      const reading = districtToolReady(state)
        ? msg('日环正对东方地平线。晨光穿过两层铜环，在信镜中央聚成一束。', 'The rings face the eastern horizon. A thin band of dawn passes through both rings onto the signal mirror.')
        : msg('瞄准槽朝' + bearings[bearing] + '，' + height + '。第一束晨光贴着东面的天际线。', 'The sight faces ' + bearings[bearing] + ', ' + height + '. Dawn is breaking low on the eastern skyline.');
      const drawing = `<div class="lr-orbit-sight" data-aligned="${districtToolReady(state)}"><i style="--turn:${bearing * 90}deg"></i><b style="--tilt:${elevation}deg"></b></div>`;
      return instrument(state, msg('黄铜日环', 'Brass meridian'), drawing, reading,
        action('rotate', msg('向右转四分之一圈', 'Turn a quarter clockwise')) +
        action('lower', msg('压低日环', 'Lower ring'), null, elevation === -30) +
        action('raise', msg('抬高日环', 'Raise ring'), null, elevation === 30),
        msg('打开信镜', 'Uncover signal mirror'));
    }
    default: return '';
  }
}
