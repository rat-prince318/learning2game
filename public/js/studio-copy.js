import { getLocale } from './locale.js';

// Only registered interface phrases are translated. Course passages, filenames,
// code, equations and model citations are kept in the learner's source language.
const english = new Map(
  Object.entries({
    '把课件变成有来源的配对练习，再根据自己的学习记录复习。':
      'Build matching practice from course material, then review your own progress.',
    'Learning2Game 学习配对工作室': 'Learning2Game Matching Studio',
    跳到主要内容: 'Skip to content',
    'Learning2Game 创建练习': 'Learning2Game Create practice',
    学习配对工作室: 'Matching Studio',
    学习流程: 'Learning workflow',
    创建练习: 'Create',
    配对练习: 'Matching practice',
    学习报告: 'Learning report',
    连接中: 'Connecting',
    请检查本次操作: 'Check this action',
    重试: 'Retry',
    关闭提示: 'Dismiss',
    把课件变成: 'Turn your notes into',
    '配对练习。': 'matching practice.',
    '选一段课件，或从植物细胞示例开始。': 'Choose a course excerpt or try the plant cell lesson.',
    '每张卡片都有出处，每轮都有自己的复习记录。':
      'Trace each card to its source and keep a record of every round.',
    用细胞讲义试一轮: 'Try the cell lesson',
    '使用自己的资料 ↓': 'Use your own material ↓',
    '植物细胞剖面示意，标注细胞核、叶绿体、液泡等结构':
      'Plant cell diagram showing the nucleus, chloroplast and vacuole.',
    植物细胞: 'Plant cell',
    结构与功能: 'Structure and function',
    学习资料: 'Course material',
    把一份课件拖到这里: 'Drop a course file here',
    支持文档和图片: 'Documents and images',
    选择文件: 'Choose file',
    移除: 'Remove',
    '指定 PDF 页码': 'PDF pages',
    '例如 1,3-5': 'For example, 1,3-5',
    '页码从 1 开始，最多选 10 页。留空使用默认范围。':
      'Select up to 10 pages, starting at 1. Leave blank for the default range.',
    预览文字: 'Preview text',
    '下载校园打印图文示例（PDF）': 'Download the campus printing sample (PDF)',
    练习设置: 'Practice settings',
    学习水平: 'Learner level',
    刚接触这门课: 'New to this course',
    已经有基础: 'Some experience',
    练习目标: 'Learning goal',
    认识概念: 'Recognize concepts',
    区分易混概念: 'Distinguish similar concepts',
    课前预习: 'Prepare for class',
    课后复习: 'Review after class',
    课堂练习: 'Classroom practice',
    难度: 'Difficulty',
    基础: 'Easy',
    标准: 'Standard',
    挑战: 'Challenge',
    期望题量: 'Number of pairs',
    限时练习: 'Timed practice',
    本轮时长: 'Round duration',
    '分析资料并推荐方案 →': 'Analyze and build a plan →',
    制作进度: 'Build progress',
    等待选材: 'Choose material',
    读懂课件: 'Read material',
    '提取知识点，标出原始出处': 'Identify concepts and cite the source',
    确认练习范围: 'Confirm scope',
    挑选这一轮想练的知识点: 'Choose the concepts for this round',
    生成配对卡: 'Build cards',
    '校验配对关系、数量和来源': 'Check the pairs, count and citations',
    开始练习: 'Start practice',
    '配对后查看报告，重练薄弱点': 'Review your round and revisit missed concepts',
    '请选择课件或试用示例。': 'Choose a course file or try the sample.',
    推荐练习方案: 'Practice plan',
    '选择本轮知识点（2 至 12 个）': 'Choose 2–12 concepts',
    本轮难度: 'Round difficulty',
    我已核对本轮知识点与练习设置: 'I have checked the concepts and settings',
    '确认方案并生成游戏 →': 'Confirm and build game →',
    配对卡已就绪: 'Your cards are ready',
    '开始配对 →': 'Start matching →',
    知识点与出处: 'Concepts and sources',
    查看工具调用记录: 'View tool activity',
    '在左栏选一个概念，再到右栏找到对应的描述。':
      'Choose a concept on the left, then its description on the right.',
    '↻ 重新开始': '↻ Restart',
    配对进度: 'Matched',
    本轮错误: 'Mistakes',
    使用提示: 'Hints used',
    已用时间: 'Elapsed',
    配对完成进度: 'Matching progress',
    配对卡片: 'Matching board',
    概念与结构: 'Concepts',
    左侧卡片: 'Concept cards',
    释义与关系: 'Descriptions',
    右侧卡片: 'Description cards',
    配对反馈: 'Feedback',
    重试本次配对: 'Retry this pair',
    同步会话进度: 'Sync progress',
    找一点线索: 'Clues',
    '选中左侧卡片后可以查看提示。': 'Choose a concept to reveal a clue.',
    查看当前概念的提示: 'Reveal a clue',
    '结束并查看报告 →': 'Finish and view report →',
    '可提前结束，剩余知识点会列入复习清单。':
      'Finish at any time. Remaining concepts go on your review list.',
    本轮: 'Your ',
    '下载报告 ↓': 'Download report ↓',
    '再练薄弱知识点 →': 'Practice missed concepts →',
    重玩这组卡片: 'Replay these cards',
    换一份资料: 'Choose new material',
    等待创建练习: 'Create a practice round',
    '去创建练习 →': 'Create practice →',
    资料与隐私: 'Materials and privacy',
    清理本次记录: 'Clear this round',
    关闭: 'Close',
    '学习资料和会话数据保存在服务端。浏览器保存本轮练习的引用，供刷新后继续。可在下方管理这台浏览器上传的资料。':
      'The server stores your files and sessions. This browser keeps a reference so you can resume. Manage files uploaded from this browser below.',
    本机资料: 'Materials from this browser',
    取消: 'Cancel',
    确认: 'Confirm',
    '进入远征 RPG': 'Play expedition RPG',
    入门: 'Beginner',
    有基础: 'Some experience',
    辨析概念: 'Distinguish concepts',
    出处: 'Source',
    '请重新尝试。': 'Please try again.',
    '这个服务模式下的资料清单为空。': 'No material is saved in this service mode.',
    课程资料: 'Course file',
    删除: 'Delete',
    '删除这份资料？': 'Delete this material?',
    确认删除: 'Delete',
    此服务中未找到该资料: 'Material missing from this service',
    '可以保留记录，或仅清除这台浏览器保存的引用。':
      'Keep the record or remove its reference from this browser.',
    清除本机引用: 'Remove local reference',
    '关联记录已删除。文件正在使用，服务重启后会重试清理。':
      'Associated records deleted. The file will be cleaned up when the service restarts.',
    '这份资料及关联练习已删除。': 'Material and related practice deleted.',
    '正在读取资料并整理知识点。': 'Reading your material and identifying concepts.',
    '查看本轮方案，确认想练习的范围。': 'Review your plan and confirm the scope.',
    '正在制作和检查配对卡片。': 'Building and checking the matching cards.',
    '关卡已保存，可以开始配对。': 'Your game is saved and ready to play.',
    '工具执行后，这里会显示名称、状态与耗时。': 'Tool activity and timings will appear here.',
    成功: 'Completed',
    失败: 'Failed',
    '先选择资料、确认方案并创建一轮练习。':
      'Choose material and confirm your plan to start a round.',
    '结束一轮配对后即可查看学习记录。': 'Finish a matching round to view your report.',
    选中的课件: 'Selected material',
    '请在原文件中查看这段文字。': 'Read this passage in the original file.',
    已选资料: 'Material selected',
    '示例讲义读取失败。': 'The sample could not be loaded.',
    '机器学习示例.txt': 'Machine learning sample.txt',
    '细胞结构讲义.txt': 'Plant cell lesson.txt',
    请查看处理提示: 'Check the message',
    '方案数据缺失，请重新推荐。': 'The plan is missing. Generate a new recommendation.',
    待确认: 'Ready for review',
    正在上传: 'Uploading',
    '请先确认本轮练习范围。': 'Confirm the scope before starting.',
    已就绪: 'Ready',
    '请重新开始一轮练习。': 'Start a new round.',
    '完成一次配对即可查看反馈。': 'Make a match to see feedback.',
    '正在整理复习建议…': 'Preparing review advice…',
    '可按报告里的出处回到资料复习。': 'Use the citations to review the material.',
    '进度已同步。': 'Progress synced.',
    剩余时间: 'Time left',
    已上传课件: 'Uploaded material',
    已上传: 'Uploaded',
    设置已更新: 'Settings updated',
    '请点击“分析资料并推荐方案”以应用新的练习设置。':
      'Select “Analyze and build a plan” to apply your settings.',
    '重新开始这组卡片？': 'Restart this set?',
    '本轮成绩将保存，然后开启新的配对会话。':
      'Your current score will be saved before a new round begins.',
    重新开始: 'Restart',
    '结束本轮练习？': 'Finish this round?',
    '本轮记录会立即保存，随后可以查看学习报告。':
      'Your progress will be saved and your report will open.',
    结束并查看报告: 'Finish and view report',
    '清理本次记录？': 'Clear this round?',
    '将删除本次上传的资料、关联关卡和成绩。':
      'This deletes the uploaded file, related games and scores.',
    '将清除这台浏览器中的练习引用。': 'This clears the practice reference in this browser.',
    确认清理: 'Clear round',
    '记录已清理。文件将在服务重启后重试删除。':
      'Records cleared. The file will be removed when the service restarts.',
    '本次记录已清理。': 'Round cleared.',
    示例模式: 'Demo mode',
    云端模型: 'Cloud model',
    本地处理: 'Local processing',
    '材料会发送给已配置的外部模型服务。请上传已获授权、适合共享的内容。':
      'Material is sent to the configured external model. Upload files you have permission to share.',
    '当前使用固定示例讲义，数据保存在本地。':
      'This mode uses a fixed sample and stores data locally.',
    '资料在本地处理。请使用已获授权的课件。':
      'Material is processed locally. Use course files you have permission to share.',
    '试用机器学习讲义 →': 'Try the machine learning lesson →',
    任务排队中: 'Queued',
    正在提取知识: 'Extracting concepts',
    正在推荐方案: 'Preparing plan',
    等待确认: 'Awaiting confirmation',
    正在生成卡片: 'Generating cards',
    正在核验: 'Validating',
    正在生成学习建议: 'Preparing advice',
    处理完成: 'Complete',
    处理失败: 'Failed',
    '请按 1,3-5 的格式填写页码。': 'Enter pages in the format 1,3-5.',
    '页码从 1 开始，每次最多选择 10 页。': 'Use page numbers from 1 and choose up to 10 pages.',
    '每次最多选择 10 页。': 'Choose up to 10 pages.',
    '请选择一份有内容的课件。': 'Choose a nonempty course file.',
    '请使用上传区列出的资料格式。': 'Choose a listed file format.',
    '服务响应格式异常，请重新连接。': 'Invalid service response. Reconnect and try again.',
    '等待服务响应超时，请重试。': 'The request timed out. Please try again.',
    '连接中断，请检查服务后重试。': 'Connection lost. Check the service and try again.',
    '处理失败，请重试。': 'Processing failed. Try again.',
    '服务返回了未知的处理状态。': 'The service returned an unknown status.',
    '处理时间较长，请稍后继续查询。': 'Processing is taking longer. Check back shortly.',
    '游戏配置无效：配对数量必须为 2–12。': 'The game must have 2–12 pairs.',
    '公开游戏配置包含答案字段，请让后端返回 GameConfigPublic。':
      'The server returned an invalid public game.',
    '卡片数量与配对数量不一致。': 'Card and pair counts differ.',
    '请调整课件表述后重新生成可区分的卡片。':
      'Revise the course wording and regenerate distinguishable cards.',
    '卡片 ID 或内容无效。': 'Invalid card ID or content.',
    '会话与游戏不一致或会话状态无效。': 'Invalid session or game mismatch.',
    '判分返回格式无效，请联系后端负责人。': 'The server returned an invalid score.',
    '请参阅原资料对应段落。': 'See the corresponding passage in your material.',
    '挑选这一轮想练的概念。': 'Choose the concepts for this round.',
    已配对: 'Matched',
    已选: 'Selected',
    概念: 'Concept',
    释义: 'Description',
    '正在核对这组配对…': 'Checking this pair…',
    '请重试上次配对或同步进度。': 'Retry your last match or sync your progress.',
    '本轮已结束。': 'Round complete.',
    '请选择左侧概念。': 'Choose a concept on the left.',
    '✓ 配对正确': '✓ Correct match',
    请再选一次: 'Try another match',
    '比较几个描述的关键特征，然后再试一次。': 'Compare the key features and try again.',
    首次配对正确率: 'First-try accuracy',
    总尝试正确率: 'Overall accuracy',
    本轮完成率: 'Completion',
    提示使用次数: 'Hints used',
    逐项复盘: 'Concept review',
    尚未尝试: 'Untried',
    进行中: 'In progress',
    重试后配对: 'Matched on retry',
    使用过提示: 'Used a hint',
    首次正确: 'First try',
    复习建议: 'Review advice',
    '正在整理这一轮的复习建议…': 'Preparing review advice for this round…',
    重新获取建议: 'Refresh advice',
    本轮复习清单为空: 'Review list complete',
  }),
);
const servicePhrases = {
  '已识别出试卷。本次未找到能在当前模式下核验答案的完整试题。请上传含题干和解答的版本，或选取带完整条件的题页。':
    'This file is an exam. Upload a paper with complete questions and worked answers, or select pages containing all the conditions needed to solve a problem.',
  '每份资料至少需要三个可区分且有出处的知识点。':
    'Each course needs at least three distinct, source-backed exercises or concepts.',
  '资料达到单次文字处理上限，可按章节拆分后继续。':
    'The text limit was reached. Upload the remaining material by chapter.',
  '本轮提取文字内容。图示关系可在启用视觉模型后提取。':
    'Text was extracted. Enable a vision model to read diagram relationships.',
  '一段原生公式含特殊排版，已跳过该段。可把公式写为 LaTeX 后重新上传。':
    'One passage used unsupported equation formatting. Write that formula as LaTeX and upload it again.',
  '有一幅图超过尺寸或帧数上限，请提供单张静态图。':
    'An image exceeds the size or frame limit. Provide a single still image.',
  '有一幅图的格式需要转换，建议使用 PNG 或 JPEG。': 'Convert the image to PNG or JPEG.',
  '文档解压后超出单次处理上限，请拆分章节再上传。':
    'This document exceeds the unpacked size limit. Upload a chapter at a time.',
  '请使用无密码、无宏的课件副本。': 'Use a copy without a password or macros.',
  '请上传与扩展名相符、可正常打开的 Word 或 PowerPoint 文件。':
    'Choose a working Word or PowerPoint file with the correct extension.',
  '请上传可直接打开的 PDF 副本。': 'Choose an unlocked PDF.',
  '选页适用于 PDF 和 PowerPoint。': 'Page selection is available for PDF and PowerPoint.',
  '请将材料拆分为 32 MiB 以内的文件。': 'Split this material into files up to 32 MiB.',
  '图示关系提取需要启用视觉模型。也可以上传包含术语和定义的文字讲义。':
    'Enable vision to read diagrams or upload a glossary with terms and definitions.',
  '资料读取失败。请检查文件内容，或将所需章节另存后重新上传。':
    'Check that the file opens, or export the chapter separately and upload it again.',
  '资料分析已达时间上限，请缩小选页范围后重试。':
    'Analysis timed out. Select fewer pages and try again.',
  '模型服务未完成资料提取，请检查模型配置或稍后重试。':
    'The model did not finish extraction. Check its settings or try again later.',
  '本轮模型文字调用已达上限，可缩小选页范围后继续。':
    'The text call limit was reached. Select fewer pages and continue.',
  '本轮已收集足够候选，可按章节上传其余内容。':
    'Enough candidates were found. Upload remaining material by chapter.',
  '部分候选包含重复或冲突的配对关系，已留待资料修订。':
    'Some pairs were duplicated or conflicting and were held for review.',
  '所选资料暂未提取到有来源的配对关系，请选择标注更清晰的图示或包含定义的段落。':
    'No sourced pairs were found. Choose a labeled diagram or a paragraph with definitions.',
  '请上传包含「术语：定义」的讲义，或启用模型分析叙述性资料与图示。':
    'Upload a glossary with term and definition pairs, or enable the model to read prose and diagrams.',
  '请从上传这份资料的浏览器删除记录。': 'Delete this record from the browser used for the upload.',
  '资料处理正在进行，请在任务结束后删除。':
    'Wait for processing to finish before deleting the material.',
};
for (const [zh, en] of Object.entries(servicePhrases)) english.set(zh, en);
for (const n of [2, 4, 6, 8, 12]) english.set(n + ' 对', n + ' pairs');
for (const n of [2, 3, 5]) english.set(n + ' 分钟', n + ' minutes');
const chinese = new Map([...english].map(([zh, en]) => [en, zh]));
export function currentCopy(text) {
  return getLocale() === 'en' ? (english.get(text) ?? text) : (chinese.get(text) ?? text);
}
export function ui(text) {
  return (getLocale() === 'en' && english.get(text)) || text;
}

export function bindStudioChrome() {
  const bindings = [];
  const walker = document.createTreeWalker(document.documentElement, NodeFilter.SHOW_TEXT);
  for (let node; (node = walker.nextNode()); ) {
    const original = node.nodeValue,
      key = original.trim();
    if (english.has(key))
      bindings.push(() => {
        node.nodeValue = original.replace(key, ui(key));
      });
  }
  for (const node of document.querySelectorAll(
    '[aria-label],[placeholder],[alt],meta[name=description]',
  )) {
    for (const attr of ['aria-label', 'placeholder', 'alt', 'content']) {
      const key = node.getAttribute(attr);
      if (english.has(key)) bindings.push(() => node.setAttribute(attr, ui(key)));
    }
  }
  const render = () => {
    for (const apply of bindings) apply();
  };
  render();
  return render;
}
