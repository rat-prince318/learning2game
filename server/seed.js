// Fixed, pre-authored teaching data. This file is never served to the browser.
const items = [
  ['nucleus', '细胞核 · Nucleus', '储存遗传信息，协调细胞的生长与活动。', 'Stores genetic information and coordinates many cellular activities.', '联系 DNA 和细胞活动的调控中心。'],
  ['mitochondrion', '线粒体 · Mitochondrion', '参与细胞呼吸，为细胞活动提供 ATP。', 'Carries out key steps of cellular respiration, producing ATP that supports cellular processes.', '想一想细胞怎样获得可使用的能量。'],
  ['membrane', '细胞膜 · Cell membrane', '选择性地控制物质进入和离开细胞。', 'A selectively permeable boundary that regulates movement of substances into and out of the cell.', '它位于细胞与外界之间，决定哪些物质通过。'],
  ['ribosome', '核糖体 · Ribosome', '读取信使 RNA 的信息，合成蛋白质。', 'Uses messenger RNA instructions to assemble amino acids into proteins.', '考虑氨基酸在哪里被组装成蛋白质。'],
  ['chloroplast', '叶绿体 · Chloroplast', '在植物细胞中进行光合作用。', 'Uses light energy for photosynthesis in plants and many algae.', '把阳光与有机物的制造联系起来。'],
  ['wall', '细胞壁 · Cell wall', '位于细胞膜外，提供结构支撑与保护。', 'An outer supporting layer that provides structural strength and protection in plant cells.', '想一想植物细胞如何保持结构和形状。'],
  ['vacuole', '液泡 · Vacuole', '储存水和溶质，并有助于维持植物细胞膨压。', 'Stores water and dissolved substances; a large central vacuole helps maintain turgor pressure in plant cells.', '与水的储存和植物细胞的膨压有关。'],
  ['cytoplasm', '细胞质 · Cytoplasm', '包含细胞器和细胞质基质，是多种细胞活动发生的区域。', 'The cellular region outside the nucleus, containing organelles and cytosol, where numerous cellular processes take place.', '这是细胞内部包围许多细胞器的区域。']
];

export const knowledgeSeed = items.map(([id, term, definition, english, hint], index) => ({
  knowledge_id: id, term, definition, english, hint,
  explanation: `${term.split(' · ')[0]}的主要作用：${definition} 该配对只练习样例中的主要功能，并不代表细胞器的全部功能。`,
  quality: 'reliable',
  source: {
    file_name: '细胞结构教学样例.txt', page: 1, snippet: `${term}：${definition}`,
    url: '/examples/cell-notes.txt',
    ...(index < 4 ? { image_url: '/examples/cell-diagram.svg', image_alt: '植物细胞示意图，标注细胞核、细胞膜、线粒体和核糖体。' } : {})
  }
}));

export function preferencesOf(raw = {}) {
  const preferences = { level: raw.level || 'beginner', goal: raw.goal || 'definitions', pair_count: Number(raw.pair_count || 6), time_limit_seconds: raw.time_limit_seconds == null ? null : Number(raw.time_limit_seconds) };
  if (!['beginner', 'intermediate', 'advanced'].includes(preferences.level) || !['definitions', 'functions', 'english'].includes(preferences.goal) || !Number.isInteger(preferences.pair_count) || preferences.pair_count < 1 || preferences.pair_count > 12 || (preferences.time_limit_seconds !== null && (!Number.isInteger(preferences.time_limit_seconds) || preferences.time_limit_seconds < 30 || preferences.time_limit_seconds > 3600))) {
    const error = new Error('学习偏好、题量或时间限制无效。'); error.code = 'INVALID_REQUEST'; throw error;
  }
  return preferences;
}
