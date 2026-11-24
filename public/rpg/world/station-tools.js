import { msg } from '../../js/locale.js';
import { renderDistrictTool } from './district-tools.js';

const pick = (i, label, active, extra = '') =>
  `<button type="button" data-do="set-control" data-index="${i}" ${active === null ? '' : 'aria-pressed="'+(active === i)+'"'}>${label}${extra}</button>`;
const commit = (label, ready) => `<button class="lr-gold" type="button" data-do="inspect" ${ready ? '' : 'disabled'}>${label}</button>`;

// The harbor is a signal board, the winch uses a sheet and a ratchet, and the
// archive has a light table. The single persisted event records a completed repair.
export function stationInstrument(view, setting, districtTool) {
  if (districtTool) return renderDistrictTool(districtTool);
  if (!view.campaign_story) return '';
  switch (view.region_index) {
    case 1: {
      const shoals = [msg('西滩', 'West shoal'), msg('中槽', 'Middle channel'), msg('外礁', 'Outer reef')];
      const soundings = ['1.2 m', '2.6 m', '0.9 m'];
      const response = setting === 0 ? msg('西滩的水刚没过船底一半。领港员把灯遮住，等你再选。', 'The west shoal would ground the hull. The pilot shields the light and waits.')
        : setting === 2 ? msg('礁石露出了一截白尖，船过不去。', 'A white reef tip breaks the surface. The boat would strike it.') : '';
      return `<div class="lr-field-instrument lr-buoys"><strong>${msg('领港灯盘', 'Pilot lights')}</strong><div class="lr-controls">
        ${shoals.map((name, i) => pick(i, name, null, '<small>' + soundings[i] + '</small>')).join('')}</div><p role="status">${response}</p></div>`;
    }
    case 3: {
      const taut = setting === 0;
      const response = taut ? msg('迎风索吃住了劲。绞盘齿正好转到铁爪底下。', 'The sheet takes the strain. A notch on the drum lines up with the pawl.')
        : setting === 1 ? msg('顺风索软绵绵地垂在桅杆旁。再试另一根。', 'The leeward sheet hangs slack beside the mast. Try the other line.')
        : msg('两根帆索，一根绷紧，一根正抽打甲板。', 'One sheet strains against its block. The other whips across the deck.');
      return `<div class="lr-field-instrument lr-winch"><p role="status">${response}</p><div class="lr-controls">
        ${pick(0,msg('绞紧迎风索','Haul windward'),setting)}${pick(1,msg('绞紧顺风索','Haul leeward'),setting)}
        ${commit(msg('扣住绞盘铁爪', 'Drop the pawl'), taut)}</div></div>`;
    }
    case 4: {
      const light = setting >= 0 ? setting : 0;
      const glimpses = [
        msg('红印盖满了折角，签名只剩一竖。', 'The red seal covers the fold. One stroke of a signature shows.'),
        msg('纸背显出一行细字。「木铃一响，就是自己人。」落款处画着半枚虎符。', 'Fine writing shows through. “One wooden chime means a friend.” A half-seal marks the signature.'),
        msg('侧光扫过一道旧折痕，细细的纸纹浮了起来。', 'An old crease cuts across the sheet. At this angle you see the grain of the paper.'),
      ];
      return `<div class="lr-field-instrument lr-light-table" data-light="${light}"><p role="status">${glimpses[light]}</p><div class="lr-controls">
        ${[msg('正面照','Front light'),msg('纸背透光','Backlight'),msg('侧面照','Raking light')].map((name,i) => pick(i,name,light)).join('')}</div>
        ${commit(msg('抄下暗号，收起战报', 'Copy the signal and pocket the dispatch'), light === 1)}</div>`;
    }
    default: return '';
  }
}
