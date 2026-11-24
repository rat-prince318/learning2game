import { ApiClient } from '../js/api.js';
import { msg } from '../js/locale.js';
import { studyMarkup } from '../js/study.js';
import { escapeHtml, sourceCitation } from '../js/utils.js';

const api = new ApiClient();
export function readCourseNotes(view, spot) {
  const query = new URLSearchParams({mode:view.mode === 'tower' ? 'tower' : 'campaign'});
  if (spot) query.set('spot', spot);
  return api.request('/rpg/expeditions/' + encodeURIComponent(view.session_id) + '/course-notes?' + query);
}

export function notePassage(note) {
  return '<div class="course-passage">' + studyMarkup(note.body) + '</div>' +
    '<p class="course-citation">' + msg('出处', 'Source') + '　' + escapeHtml(sourceCitation(note.source_ref).replace(/\u00b7/gu,' ')) + '</p>';
}

// Every opening reads the current save. Browsing never submits a battle action.
export function openCoursebook(view, trigger, preferredId, spotNotes = []) {
  const dialog = document.createElement('dialog');
  dialog.className = 'coursebook';
  dialog.setAttribute('aria-labelledby', 'coursebook-title');
  dialog.innerHTML = '<header><h2 id="coursebook-title">' + msg('课程笔记', 'Course notebook') +
    '</h2><button type="button" data-book-close>' + msg('合上笔记', 'Close notebook') +
    '</button></header><section class="coursebook-inside"></section>';
  const inside = dialog.querySelector('.coursebook-inside');
  const question = view.battle?.prompt?.text;
  function render(data) {
    const relevant = new Set(data.relevant_note_ids);
    const highlighted = question ? relevant : new Set(spotNotes.map(note => note.id));
    const notes = data.notes;
    if (!notes.length) {
      inside.textContent = msg('去地图上找守站人交谈，或调查沿途的地点，带回第一条笔记。',
        'Talk to the local keeper or inspect a landmark to collect your first note.');
      return;
    }
    const options = group => group.map(n => '<option value="' + escapeHtml(n.id) + '">' + escapeHtml(n.title) + '</option>').join('');
    const group = (label, members) => members.length ? '<optgroup label="' + label + '">' + options(members) + '</optgroup>' : '';
    const index = highlighted.size
      ? group(question ? msg('本题相关', 'For this question') : msg('在这里收集', 'From this stop'), notes.filter(n => highlighted.has(n.id))) +
        group(msg('其他笔记', 'Other notes'), notes.filter(n => !highlighted.has(n.id)))
      : options(notes);
    inside.innerHTML = '<label class="coursebook-index">' + msg('已收集', 'Collected notes') + '　' + notes.length +
      '<select aria-label="' + msg('选择知识点', 'Choose a topic') + '">' + index +
      '</select></label>' + (question ? '<details class="coursebook-question"><summary>' +
        msg('对照当前题目', 'View current question') + '</summary>' + studyMarkup(question) + '</details>' : '') +
      '<article class="coursebook-page"></article>';
    const select = inside.querySelector('select');
    if (notes.some(n => n.id === preferredId)) select.value = preferredId;
    function showPage() {
      const note = notes.find(n => n.id === select.value);
      const chapter = note.region_index + 1;
      inside.querySelector('article').innerHTML = '<p class="coursebook-chapter">' +
        msg('第 ' + chapter + ' 章', 'Chapter ' + chapter) +
        (question && relevant.has(note.id) ? '　/　' + msg('本题相关', 'Related to this question') : '') +
        '</p><h3>' + studyMarkup(note.title) + '</h3>' + notePassage(note);
    }
    select.addEventListener('change', showPage);
    showPage();
  }
  async function load() {
    inside.innerHTML = '<p role="status">' + msg('正在翻开笔记…', 'Opening your notebook…') + '</p>';
    try {
      const data = await readCourseNotes(view);
      if (dialog.open) render(data);
    } catch {
      if (!dialog.open) return;
      inside.innerHTML = '<p role="status">' + msg('笔记读取失败，请再试一次。', 'Your notebook could not be loaded.') +
        '</p><button type="button" data-book-retry>' + msg('重新读取', 'Try again') + '</button>';
    }
  }
  dialog.addEventListener('click', event => {
    if (event.target.closest('[data-book-close]')) dialog.close();
    if (event.target.closest('[data-book-retry]')) void load();
  });
  dialog.addEventListener('close', () => {
    dialog.remove();
    if (trigger?.isConnected) trigger.focus({preventScroll:true});
  }, {once:true});
  document.body.append(dialog);
  dialog.showModal();
  void load();
  return dialog;
}
