/* Research-platform sharing for all reader pages.
   The structured prompt is always copied to the clipboard. For platforms with a verified
   query URL (deepLink), the site is opened with the prompt in its URL, so the text reaches
   that service when the user taps the platform; otherwise nothing is sent until the user pastes. */
(function () {
  'use strict';

  const PLATFORMS = [
    { group: 'البحث في الأدبيات والأدلة', items: [
      { id: 'consensus', mode: 'question', name: 'Consensus', url: 'https://consensus.app/search/', note: 'ألصقي الحزمة؛ يبدأ النص المحدد في أولها' },
      { id: 'elicit', mode: 'question', name: 'Elicit', url: 'https://elicit.com/', note: 'وكيل بحث ومراجعة أدبيات' },
      { id: 'answerthis', mode: 'question', name: 'AnswerThis', url: 'https://answerthis.io/', note: 'بحث بالأطروحة أو DOI أو العنوان أو المؤلف؛ يمكن ربط الحساب عبر MCP' }
      { id: 'scite', mode: 'question', name: 'Scite Assistant', url: 'https://scite.ai/assistant', note: 'بحث وسياق الاستشهادات الداعمة أو المعارضة' },
      { id: 'scispace', mode: 'question', name: 'SciSpace', url: 'https://scispace.com/search', note: '100 رصيد Agent شهرياً؛ محادثة PDF تتطلب إدخال الورقة' },
      { id: 'openread', mode: 'question', name: 'OpenRead', url: 'https://www.openread.academy/', note: '5 استخدامات شهرياً لبعض مزايا البحث وقراءة الأوراق' },
      { id: 'liner-scholar', mode: 'question', name: 'Liner Scholar (ScholarLiner)', url: 'https://liner.com/scholar', note: 'رصيد مجاني يتجدد شهرياً؛ عدد الرصيد غير معلن' },
      { id: 'paperguide', mode: 'question', name: 'Paperguide', url: 'https://paperguide.ai/', note: '1,500 رصيد و20 بحث AI شهرياً بالخطة المجانية' },
      { id: 'paperpal', mode: 'question', name: 'Paperpal', url: 'https://paperpal.com/', note: 'ميزات AI حتى 5 مرات يومياً؛ الحدود تختلف حسب الأداة' },
      { id: 'undermind', mode: 'question', name: 'Undermind', url: 'https://app.undermind.ai/', note: 'بحث عميق ينطلق من هدف أو سؤال' },
      { id: 'perplexity', mode: 'question', name: 'Perplexity', url: 'https://www.perplexity.ai/', deepLink: 'https://www.perplexity.ai/search?q=', note: 'بحث ويب وأكاديمي مع مصادر؛ يُفتح مع السؤال جاهزاً' }
    ]},
    { group: 'اكتشاف الأوراق وشبكات المراجع', items: [
      { id: 'researchrabbit', mode: 'seed', name: 'ResearchRabbit', url: 'https://app.researchrabbit.ai/', note: 'تحتاج عادةً إلى ورقة أو DOI كبذرة' },
      { id: 'litmaps', mode: 'seed', name: 'Litmaps', url: 'https://app.litmaps.com/', note: 'ابحث عن ورقة ثم استكشف خريطتها' },
      { id: 'connected-papers', mode: 'seed', name: 'Connected Papers', url: 'https://www.connectedpapers.com/', note: 'شبكة أوراق تبدأ بورقة منشورة' }
    ]},
    { group: 'محركات وفهارس الأوراق', items: [
      { id: 'semantic-scholar', mode: 'search', name: 'Semantic Scholar', url: 'https://www.semanticscholar.org/', deepLink: 'https://www.semanticscholar.org/search?q=', note: 'محرك بحث أكاديمي؛ يُفتح مع الاستعلام جاهزاً' },
      { id: 'google-scholar', mode: 'search', name: 'Google Scholar', url: 'https://scholar.google.com/', deepLink: 'https://scholar.google.com/scholar?q=', note: 'فهرس واسع؛ يُفتح مع الاستعلام جاهزاً' },
      { id: 'openalex', mode: 'search', name: 'OpenAlex', url: 'https://openalex.org/', note: 'فهرس مفتوح؛ واجهة API منفصلة للبحث الدلالي' },
      { id: 'core', mode: 'search', name: 'CORE', url: 'https://core.ac.uk/search', note: 'أبحاث مفتوحة الوصول ومستودعات جامعية؛ الصق الاستعلام في خانة البحث' }
    ]},
    { group: 'مكتبات وأرشيفات (مصادر أولية ودراسات فرنسية)', items: [
      { id: 'gallica', mode: 'search', name: 'Gallica (BnF)', url: 'https://gallica.bnf.fr/', note: 'مخطوطات وطبعات قديمة ومصادر أولية؛ البحث بالفرنسية أنسب، والصق الاستعلام في الخانة' },
      { id: 'persee', mode: 'search', name: 'Persée', url: 'https://www.persee.fr/', note: 'دوريات العلوم الإنسانية الفرنسية بنص كامل؛ الصق الاستعلام في الخانة' },
      { id: 'openedition', mode: 'search', name: 'OpenEdition', url: 'https://search.openedition.org/', note: 'كتب ودوريات ومدونات أكاديمية مفتوحة بالفرنسية وغيرها؛ الصق الاستعلام في الخانة' }
    ]},
    { group: 'مساعدات عامة بحصص مجانية متجددة', items: [
      { id: 'overchat', mode: 'question', name: 'Overchat AI', url: 'https://overchat.ai/', note: '100 رصيد يومياً؛ مساعد عام لا قاعدة أوراق متخصصة' },
      { id: 'gemini-deep-research', mode: 'question', name: 'Gemini Deep Research', url: 'https://gemini.google.com/', note: 'ضمن حدود Gemini المجانية؛ تتجدد كل 5 ساعات مع حد أسبوعي غير معلن' },
      { id: 'chatgpt', mode: 'question', name: 'ChatGPT', url: 'https://chatgpt.com/', deepLink: 'https://chatgpt.com/?q=', note: 'مساعد عام بحد مجاني متغير؛ يُفتح مع السؤال جاهزاً' },
      { id: 'claude', mode: 'question', name: 'Claude (مساعد عام)', url: 'https://claude.ai/', deepLink: 'https://claude.ai/new?q=', note: 'حد استخدام متغير يتجدد كل 5 ساعات وأسبوعياً؛ Research مدفوع؛ يُفتح مع السؤال جاهزاً' }
    ]},
    { group: 'دفاتر المصادر وتلخيص النصوص', items: [
      { id: 'google-notebooklm', mode: 'source', name: 'Google NotebookLM', url: 'https://notebooklm.google.com/', note: 'أضف الحزمة كمصدر إلى دفتر ثم اطرح سؤالك' },
      { id: 'scholarcy', mode: 'document', name: 'Scholarcy', url: 'https://library.scholarcy.com/', note: 'استيراد نص أو مستند لتلخيصه' },
      { id: 'chatpdf', mode: 'document', name: 'ChatPDF', url: 'https://www.chatpdf.com/', note: 'مستندان يومياً؛ الصق النص أو ارفع الملف كمصدر أولاً' }
    ]}
  ];

  // سقف طول المقتطف داخل الحزمة، وحدود خاصة ببعض الخدمات (Scholarcy: نص ملصوق حتى 5,000 حرف).
  const MAX_PASSAGE_CHARS = 6000;
  const PLATFORM_MAX_TOTAL = { scholarcy: 4800 };
  const SHORT_QUERY_CHARS = 200;
  const MIN_SIMILAR_CHARS = 15;
  // أقصى طول لرابط عميق؛ ما زاد عنه يُفتح الموقع بلا استعلام وتُنسخ الحزمة فقط.
  const MAX_DEEPLINK_URL = 6000;
  const PREFS_KEY = 'readerResearchPrefs.v1';
  // قوالب أسئلة سريعة تملأ حقل السؤال البحثي؛ يمكن تعديل النص بعد اختيارها.
  const PRESETS = [
    { id: 'accuracy', label: 'فحص الدقة', q: 'ما مدى دقة الفكرة أو الادعاء الوارد في المقتطف، وكيف تفسره الدراسات والمصادر الأولية ذات الصلة؟' },
    { id: 'counter', label: 'أدلة معارضة', q: 'ما الدراسات والأدلة التي تعارض هذه الفكرة أو تقيّدها أو تقترح تفسيراً بديلاً لها؟' },
    { id: 'primary', label: 'مصادر أولية', q: 'ما المصادر الأولية القديمة ذات الصلة بهذا المقتطف (بلغاتها الأصلية)، وأين يرد المعنى نفسه أو ما يشبهه فيها؟' },
    { id: 'dating', label: 'التأريخ', q: 'كيف يُؤرَّخ هذا النص أو الحدث، وما مواضع الخلاف بين الباحثين في تأريخه وسياقه؟' },
    { id: 'translations', label: 'الترجمات والطبعات', q: 'ما الطبعات النقدية والترجمات المتاحة للمصدر المذكور، وهل تختلف في فهم هذا الموضع؟' }
  ];
  const MAX_QUESTION_CHARS = 600;
  const state = { open: false, view: 'platforms', selected: null, items: [], includeNotes: false, question: '', favorites: ['consensus'], last: null };
  // المفضلة وآخر منصة تُحفظ في المتصفح فقط (localStorage قد يكون غير متاح أو فارغاً، لذلك كل شيء داخل try/catch).
  function loadPrefs() {
    try {
      const raw = localStorage.getItem(PREFS_KEY);
      const saved = raw ? JSON.parse(raw) : null;
      if (!saved || typeof saved !== 'object') return;
      if (Array.isArray(saved.favorites)) state.favorites = saved.favorites.filter(id => typeof id === 'string' && platformById(id));
      if (typeof saved.last === 'string' && platformById(saved.last)) state.last = saved.last;
    } catch (_) {}
  }
  function savePrefs() {
    try { localStorage.setItem(PREFS_KEY, JSON.stringify({ favorites: state.favorites, last: state.last })); } catch (_) {}
  }
  loadPrefs();
  let lastSelection = null;
  let root, trigger, panel, aiTrigger;

  function byId(id) { return document.getElementById(id); }
  function safeText(value) { return String(value == null ? '' : value); }
  function escapeHtml(value) {
    return safeText(value).replace(/[&<>"']/g, ch => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));
  }
  function readerData() {
    let books = [], savedNotes = [], savedMarks = [], currentIndex = -1;
    try { if (typeof library !== 'undefined' && Array.isArray(library)) books = library; } catch (_) {}
    try { if (typeof notes !== 'undefined' && Array.isArray(notes)) savedNotes = notes; } catch (_) {}
    try { if (typeof bookmarks !== 'undefined' && Array.isArray(bookmarks)) savedMarks = bookmarks; } catch (_) {}
    try { if (typeof cur !== 'undefined') currentIndex = Number(cur); } catch (_) {}
    return { books, savedNotes, savedMarks, currentIndex };
  }
  function currentBook(pane) {
    const data = readerData();
    let index = data.currentIndex;
    if (pane === 2) {
      try { if (typeof cur2 !== 'undefined') index = Number(cur2); } catch (_) {}
    }
    return index >= 0 ? (data.books[index] || null) : null;
  }
  function passageText() {
    try { return typeof selText !== 'undefined' ? safeText(selText).trim() : ''; } catch (_) { return ''; }
  }
  function paragraphId() {
    try { return typeof selPid !== 'undefined' ? selPid : null; } catch (_) { return null; }
  }
  // يعيد 1 أو 2 حسب لوح القراءة الذي يحوي العقدة، أو 0 إن كانت خارج القارئ.
  function paneOf(node) {
    if (!node) return 0;
    const el = node.nodeType === 3 ? node.parentNode : node;
    const first = byId('bookText');
    const second = byId('bookText2');
    if (first && (el === first || first.contains(el))) return 1;
    if (second && (el === second || second.contains(el))) return 2;
    return 0;
  }
  function isInsideReader(node) { return paneOf(node) > 0; }
  function captureSelection() {
    const selection = window.getSelection && window.getSelection();
    if (!selection || !selection.rangeCount) return;
    const text = selection.toString().trim();
    if (!text) return;
    const range = selection.getRangeAt(0);
    const pane = paneOf(range.startContainer);
    if (!pane) return;
    const book = currentBook(pane);
    if (!book) return;
    let pid = null;
    try {
      if (typeof getParagraphIdForNode === 'function') pid = getParagraphIdForNode(byId(pane === 2 ? 'bookText2' : 'bookText'), range.startContainer);
      else pid = paragraphId();
    } catch (_) { pid = paragraphId(); }
    lastSelection = { kind: 'selection', text, bookId: book.id, title: book.title, author: book.author || '', pid };
    state.selected = lastSelection;
    if (state.open) updateContextSummary();
  }
  function setSelectionCapture() {
    document.addEventListener('selectionchange', captureSelection);
    document.addEventListener('mouseup', () => setTimeout(captureSelection, 0));
    document.addEventListener('touchend', () => setTimeout(captureSelection, 50), { passive: true });
    document.addEventListener('pointerdown', event => {
      if (event.target && event.target.closest && event.target.closest('.reader-research-wrap, .reader-research-popover')) {
        // On mobile, tapping the toolbar may collapse the browser selection. Snapshot it first.
        captureSelection();
        return;
      }
      if (!isInsideReader(event.target)) {
        // Keep a selection while the user opens our toolbar, but discard it after unrelated actions.
        lastSelection = null;
        if (state.selected && state.selected.kind === 'selection') state.selected = null;
      }
    }, true);
  }
  function listAnnotations() {
    const data = readerData();
    const all = [];
    data.savedNotes.forEach((note, index) => {
      const book = data.books.find(item => item.id === note.bookId);
      all.push({
        kind: 'note', key: 'note-' + index, title: note.book || (book && book.title) || 'مصدر غير معروف',
        author: (book && book.author) || '', bookId: note.bookId, pid: note.pid,
        text: safeText(note.snip).trim(), note: safeText(note.text).trim(), ts: Number(note.ts) || 0
      });
    });
    data.savedMarks.forEach((mark, index) => {
      const snippet = safeText(mark.snip).trim();
      if (!snippet || snippet === '(بداية الصفحة)') return;
      const book = data.books.find(item => item.id === mark.bookId);
      all.push({
        kind: 'highlight', key: 'highlight-' + index, title: mark.title || (book && book.title) || 'مصدر غير معروف',
        author: (book && book.author) || '', bookId: mark.bookId, pid: mark.pid,
        text: snippet, note: safeText(mark.note).trim(), ts: Number(mark.ts) || 0
      });
    });
    return all.sort((a, b) => b.ts - a.ts);
  }
  function relatedAnnotations(context) {
    if (!context || !context.bookId) return { notes: [], highlights: [] };
    const data = readerData();
    const sameParagraph = item => item.bookId === context.bookId && context.pid != null && item.pid === context.pid;
    const selected = safeText(context.text).toLowerCase().replace(/\s+/g, ' ').trim();
    const similarText = item => {
      const snip = safeText(item.snip).toLowerCase().replace(/\s+/g, ' ').trim();
      // حد أدنى للطول حتى لا يطابق تحديد قصير (كلمة واحدة) عدداً كبيراً من الملاحظات.
    return snip.length >= MIN_SIMILAR_CHARS && selected.length >= MIN_SIMILAR_CHARS && (selected.includes(snip.slice(0, 60)) || snip.includes(selected.slice(0, 60)));
    };
    const linkedNotes = data.savedNotes.filter(item => item.bookId === context.bookId && (sameParagraph(item) || similarText(item)));
    const linkedMarks = data.savedMarks.filter(item => item.bookId === context.bookId && item.color && item.snip && item.snip !== '(بداية الصفحة)' && (sameParagraph(item) || similarText(item)));
    return { notes: linkedNotes, highlights: linkedMarks };
  }
  function selectCurrentPassage() {
    const selection = lastSelection;
    if (!selection || !selection.text) return false;
    // العنوان والمؤلف يؤخذان من التحديد نفسه (قد يكون من اللوح الثاني)، لا من الكتاب المفتوح في اللوح الأول.
    state.selected = { ...selection };
    state.view = 'platforms';
    renderPanel();
    return true;
  }
  function authorOf(context, arabic) {
    return safeText(context && context.author).trim() || (arabic ? 'غير مذكور في بيانات القارئ' : 'Not specified in reader metadata');
  }
  function paragraphOf(context) { return context && context.pid != null && context.pid !== '' ? String(context.pid) : 'غير محدد'; }
  function platformById(platformId) {
    return PLATFORMS.flatMap(group => group.items).find(item => item.id === platformId);
  }
  function clipText(value, limit) {
    const s = safeText(value).trim();
    if (s.length <= limit) return s;
    const cut = s.slice(0, limit);
    const space = cut.lastIndexOf(' ');
    return (space > limit * 0.7 ? cut.slice(0, space) : cut) + ' […]';
  }
  // استعلام قصير للمنصات التي تقبل كلمات بحث أو عنوان ورقة (الخرائط والفهارس)، لا فقرة كاملة.
  function buildShortQuery(context) {
    const question = safeText(state.question).replace(/\s+/g, ' ').trim();
    const passage = clipText(safeText(context.text).replace(/\s+/g, ' '), question ? 120 : SHORT_QUERY_CHARS);
    const title = safeText(context.title).trim();
    const lines = [];
    if (question) lines.push('السؤال البحثي: ' + clipText(question, 100));
    if (title) lines.push('المصدر: ' + title);
    lines.push('ابحث عن أوراق أو مصادر مرتبطة بالمقتطف: «' + passage + '»');
    return lines.join('\n');
  }
  // نسخة مختصرة تُحمَّل في الرابط العميق لمنصات الأسئلة (الحزمة الكاملة تبقى في الحافظة)،
  // حتى لا يتجاوز الرابط الحد المقبول مع المقتطفات المتوسطة.
  function buildDeepLinkPrompt(context) {
    const q = safeText(state.question).replace(/\s+/g, ' ').trim().slice(0, MAX_QUESTION_CHARS);
    const passage = clipText(safeText(context.text).replace(/\s+/g, ' '), 500);
    const source = [safeText(context.title).trim(), safeText(context.author).trim()].filter(Boolean).join(' — ');
    return (q || 'ما مدى دقة الفكرة الواردة في المقتطف التالي، وكيف تفسرها الدراسات والمصادر الأولية؟') +
      '\nالمقتطف: «' + passage + '»' + (source ? '\nالمصدر: ' + source : '') +
      '\nاستشهد بمصادر قابلة للتحقق، ولا تختلق مراجع. ابحث بالإنجليزية والفرنسية والألمانية عند الحاجة، وأجب باللغة العربية.';
  }
  function buildPrompt(context, platformId) {
    const platform = platformById(platformId);
    const mode = platform ? platform.mode : 'question';
    if (platformId === 'consensus') return buildConsensusPrompt(context);
    if (mode === 'seed' || mode === 'search') return buildShortQuery(context);
    const text = safeText(context.text).trim();
    let limit = Math.min(text.length, MAX_PASSAGE_CHARS);
    let prompt = buildFullPrompt(context, platformId, limit);
    const max = PLATFORM_MAX_TOTAL[platformId];
    if (max && prompt.length > max) {
      limit = Math.max(300, limit - (prompt.length - max) - 20);
      prompt = buildFullPrompt(context, platformId, limit);
    }
    return prompt;
  }
  function buildConsensusPrompt(context) {
    const question = safeText(state.question).replace(/\s+/g, ' ').trim().slice(0, MAX_QUESTION_CHARS);
    const passage = clipText(safeText(context.text).replace(/\s+/g, ' '), 1200);
    const source = [safeText(context.title).trim(), safeText(context.author).trim()].filter(Boolean).join(' — ');
    const lines = [
      'النص المحدد من القارئ:',
      '«' + passage + '»',
      source ? 'المصدر: ' + source : '',
      '',
      'السؤال البحثي: ' + (question || 'ما هي الأدلة العلمية أو المصادر الأولية ذات الصلة بهذا المقطع؟'),
      'أدرج الأدلة المؤيدة والمعارضة، مع توفير روابط قابلة للتحقق منها حيثما أمكن. لا تختلق المراجع. أجب باللغة العربية.'
    ];
    return lines.filter(Boolean).join('\n');
  }
  function buildFullPrompt(context, platformId, passageLimit) {
    const platform = platformById(platformId);
    const mode = platform ? platform.mode : 'question';
    const text = clipText(context.text, passageLimit);
    const q = safeText(state.question).replace(/\s+/g, ' ').trim().slice(0, MAX_QUESTION_CHARS);
    const related = (context.kind === 'selection' && state.includeNotes) ? relatedAnnotations(context) : { notes: [], highlights: [] };
    const lines = [];
    const add = value => lines.push(value);

    if (mode === 'source') {
      add('حزمة مصدر لإضافتها يدوياً إلى دفتر مصادر. بعد إضافة النص كمصدر، أجب بالعربية عن السؤال: ما الأدلة العلمية أو المصادر الأولية ذات الصلة بالفكرة، وما حدودها؟');
    } else if (mode === 'document') {
      add(platformId === 'chatpdf'
        ? 'أضف المقتطف أدناه كمصدر نصي في ChatPDF أو الصقه في مساحة المستند، ثم حلّل حجته ومفاهيمه وأجب بالعربية عن سؤال بحثي مرتبط به اعتماداً على المصدر. ميّز ما يقوله النص عما لا يثبته.'
        : 'نص مستورد للتلخيص والتنظيم. لخّص المادة المقتبسة أدناه بالعربية بدقة، واستخرج الفكرة والمصطلحات والادعاءات الأساسية. ميّز ما يقوله النص عما لا يثبته.');
    } else {
      add('أجرِ بحثاً أكاديمياً موثقاً للإجابة عن السؤال البحثي الآتي: ' + (q || 'ما مدى دقة الفكرة أو الادعاء الوارد في المقتطف، وكيف تفسره الدراسات والمصادر الأولية ذات الصلة؟'));
      add('اعرض الأدلة المؤيدة والمعارضة، وميّز بوضوح بين المصادر الأولية والدراسات المحكمة أو الثانوية. أورد الاستشهادات وروابط الناشر أو DOI عند توفرها، واذكر حدود الأدلة والخلافات البحثية. لا تتعامل مع المقتطف بوصفه حقيقة مثبتة، ولا تختلق مراجع. أجب باللغة العربية.');
    }

    if (q && (mode === 'source' || mode === 'document')) add('السؤال المطلوب: ' + q);

    add('');
    add('بيانات المصدر:');
    add('الكتاب: ' + (context.title || 'غير محدد'));
    add('المؤلف: ' + authorOf(context, true));
    add('رقم الفقرة في القارئ: ' + paragraphOf(context));
    add('المقتطف: «' + text + '»');
    if (context.note && state.includeNotes) add('ملاحظة القارئ: ' + safeText(context.note).trim());
    if (context.kind === 'highlight') add('نوع المادة: تظليل محفوظ');
    if (context.kind === 'note') add('نوع المادة: ملاحظة محفوظة');
    if (related.notes.length) {
      add(''); add('ملاحظات مرتبطة بالفقرة:');
      related.notes.slice(0, 5).forEach(item => add('- ' + safeText(item.text).trim() + (item.text ? ' — ' : '') + safeText(item.note).trim()));
    }
    if (related.highlights.length) {
      add(''); add('تظليلات محفوظة مرتبطة بالفقرة:');
      related.highlights.slice(0, 5).forEach(item => add('- «' + safeText(item.snip).trim() + '»' + (item.note ? ' — ملاحظة: ' + item.note : '')));
    }
    if (mode === 'source') add('\nبعد إضافة المصدر إلى الدفتر، اسأل عن الأدلة والاختلافات البحثية مع إحالات قابلة للتحقق، وأجب بالعربية.');
    if (mode === 'document') add('\nلا تضف ادعاءات أو مراجع غير موجودة في النص المستورد، واكتب الإجابة بالعربية.');
    if (mode === 'question') {
      add('\nابحث في الأدبيات بالإنجليزية والفرنسية والألمانية أيضاً، لا بالعربية وحدها، فمعظم الدراسات المحكمة منشورة بها (ومصطلحات اليونانية واللاتينية للمصادر القديمة عند الحاجة)، وأجب بالعربية.');
      add('نظّم الإجابة تحت: سؤال محدد، خلاصة الأدلة، المصادر وأنواعها، مواضع الاتفاق والخلاف، وما لا تسمح الأدلة بالجزم به.');
    }
    return lines.join('\n');
  }
  function showToast(message) {
    if (typeof toast === 'function') toast(message);
    else if (window.console) console.info(message);
  }
  function updateContextSummary() {
    const context = state.selected;
    const el = panel && panel.querySelector('.reader-research-context');
    if (!el) return;
    if (!context || !context.text) {
      el.innerHTML = '<strong>مصدر الحزمة:</strong> لا يوجد تحديد نصي نشط. يمكنك اختيار ملاحظة أو تظليل محفوظ أدناه.';
      return;
    }
    const kind = context.kind === 'selection' ? 'نص محدد' : (context.kind === 'note' ? 'ملاحظة محفوظة' : 'تظليل محفوظ');
    const title = context.title || 'مصدر غير محدد';
    const preview = safeText(context.text).replace(/\s+/g, ' ').trim();
    el.innerHTML = '<strong>المادة الحالية: ' + escapeHtml(kind) + '</strong><div class="reader-research-meta">' + escapeHtml(title) + ' · الفقرة ' + escapeHtml(paragraphOf(context)) + '</div><div class="reader-research-preview">«' + escapeHtml(preview.length > 180 ? preview.slice(0, 180) + '…' : preview) + '»</div>' + (context.note ? '<div class="reader-research-meta">ملاحظة: ' + escapeHtml(context.note.slice(0, 140)) + '</div>' : '');
  }
  function renderAnnotationList() {
    const list = panel.querySelector('.reader-research-annotation-list');
    if (!list) return;
    const search = safeText(panel.querySelector('.reader-research-filter').value).toLowerCase().trim();
    const current = currentBook();
    const onlyCurrent = panel.querySelector('.reader-research-current-only').checked;
    const entries = state.items.filter(item => {
      if (onlyCurrent && current && item.bookId !== current.id) return false;
      const text = (item.title + ' ' + item.text + ' ' + item.note + ' ' + item.author).toLowerCase();
      return !search || text.includes(search);
    });
    if (!entries.length) {
      list.innerHTML = '<div class="reader-research-empty">لا توجد ملاحظات أو تظليلات مطابقة.</div>';
      return;
    }
    list.innerHTML = entries.slice(0, 80).map((item, index) => {
      const text = item.text || item.note || '(ملاحظة بلا مقتطف محفوظ)';
      return '<button type="button" class="reader-research-annotation" data-entry="' + index + '"><span class="reader-research-kind">' + (item.kind === 'note' ? '📝 ملاحظة' : '🖍 تظليل') + '</span><strong>' + escapeHtml(item.title) + '</strong><span>' + escapeHtml(text.length > 150 ? text.slice(0, 150) + '…' : text) + '</span>' + (item.note ? '<small>ملاحظة: ' + escapeHtml(item.note.slice(0, 100)) + '</small>' : '') + '<small>الفقرة: ' + escapeHtml(paragraphOf(item)) + '</small></button>';
    }).join('');
    list.querySelectorAll('.reader-research-annotation').forEach(button => {
      button.addEventListener('click', () => {
        const item = entries[Number(button.dataset.entry)];
        if (!item) return;
        state.selected = { ...item, text: item.text || item.note || '', kind: item.kind };
        state.view = 'platforms';
        renderPanel();
      });
    });
    if (entries.length > 80) list.insertAdjacentHTML('beforeend', '<div class="reader-research-empty">تظهر أول 80 نتيجة فقط؛ استخدم البحث لتضييق القائمة.</div>');
  }
  function platformCard(item) {
    const fav = state.favorites.includes(item.id);
    const tag = item.id === state.last && !fav ? ' · الأخيرة' : '';
    const cta = item.deepLink ? 'فتح الموقع بالاستعلام جاهزاً ↗' : 'نسخ الحزمة وفتح الموقع ↗';
    return '<div class="reader-research-item"><a class="reader-research-platform" href="' + escapeHtml(item.url) + '" target="_blank" rel="noopener noreferrer" data-platform="' + escapeHtml(item.name) + '" data-platform-id="' + escapeHtml(item.id) + '"><strong>' + escapeHtml(item.name + tag) + '</strong><span>' + escapeHtml(item.note) + '</span><span class="reader-research-cta">' + cta + '</span></a>' +
      '<button type="button" class="reader-research-star" data-star-id="' + escapeHtml(item.id) + '" aria-pressed="' + (fav ? 'true' : 'false') + '" aria-label="' + (fav ? 'إزالة من المفضلة' : 'تثبيت في المفضلة') + '">' + (fav ? '★' : '☆') + '</button></div>';
  }
  // المفضلة أولاً بترتيب التثبيت، وآخر منصة استُخدمت في المقدمة.
  function pinnedIds() {
    const ids = [];
    [state.last].concat(state.favorites).forEach(id => { if (id && !ids.includes(id) && platformById(id)) ids.push(id); });
    return ids;
  }
  function platformMarkup() {
    const pinned = pinnedIds().map(platformById);
    const pinnedHtml = pinned.length ? '<section class="reader-research-group"><h3>⭐ المفضلة والأخيرة</h3><div class="reader-research-platforms">' + pinned.map(platformCard).join('') + '</div></section>' : '';
    return pinnedHtml + PLATFORMS.map(group => '<section class="reader-research-group"><h3>' + escapeHtml(group.group) + '</h3><div class="reader-research-platforms">' + group.items.map(platformCard).join('') + '</div></section>').join('');
  }
  // يربط أزرار النجمة وبطاقات المنصات؛ يُستدعى عند رسم اللوحة وعند تغيير المفضلة.
  function bindPlatformList() {
    panel.querySelectorAll('.reader-research-star').forEach(button => {
      button.addEventListener('click', () => {
        const id = button.dataset.starId;
        state.favorites = state.favorites.includes(id) ? state.favorites.filter(item => item !== id) : state.favorites.concat(id);
        savePrefs();
        const list = panel.querySelector('.reader-research-platform-list');
        if (list) { list.innerHTML = platformMarkup(); bindPlatformList(); }
      });
    });
    panel.querySelectorAll('.reader-research-platform').forEach(link => {
      link.addEventListener('click', event => {
        // نمنع فتح الرابط الافتراضي: النسخ يجب أن يتم أولاً وبشكل متزامن ضمن الضغطة نفسها،
        // وإلا فقد يفقد المستند التركيز عند فتح التبويب الجديد فيفشل النسخ (خاصة على الجوال).
        event.preventDefault();
        const context = state.selected || lastSelection;
        if (!context || !safeText(context.text).trim()) {
          showToast('حدّد نصاً أو اختر ملاحظة/تظليلاً محفوظاً أولاً.');
          return;
        }
        const platform = platformById(link.dataset.platformId);
        const prompt = buildPrompt(context, link.dataset.platformId);
        const copied = copySync(prompt);
        if (!copied && navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(prompt).catch(() => {});
        let target = link.href;
        let prefilled = false;
        if (platform && platform.deepLink) {
          const query = platform.mode === 'question' ? buildDeepLinkPrompt(context) : prompt;
          const deep = platform.deepLink + encodeURIComponent(query);
          if (deep.length <= MAX_DEEPLINK_URL) { target = deep; prefilled = true; }
        }
        window.open(target, '_blank', 'noopener');
        state.last = link.dataset.platformId;
        savePrefs();
        if (prefilled) showToast('✓ فُتحت ' + link.dataset.platform + ' بالاستعلام جاهزاً' + (platform.mode === 'question' ? ' (نسخة مختصرة)' : '') + '، والحزمة الكاملة منسوخة');
        else if (platform && platform.mode === 'seed') showToast('✓ نُسخ استعلام قصير؛ ابحث بعنوان ورقة أو DOI في ' + link.dataset.platform);
        else showToast(copied ? '✓ نُسخت الحزمة؛ الصقها في ' + link.dataset.platform : 'تعذّر النسخ تلقائياً؛ انسخ النص يدوياً.');
        closePanel();
      });
    });
  }
  function openSaveToFile() {
    const context = state.selected || lastSelection;
    const api = window.ReaderResearchFiles;
    if (!context || !safeText(context.text).trim()) {
      showToast('حدّدي نصاً في القارئ أو اختاري ملاحظة/تظليلاً محفوظاً أولاً.');
      return;
    }
    if (!api) {
      showToast('تعذّر تحميل ملفات البحث. أعيدي تحميل صفحة القارئ.');
      return;
    }
    const files = api.listFiles();
    const overlay = document.createElement('div');
    overlay.setAttribute('role', 'presentation');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:100010;display:flex;align-items:center;justify-content:center;padding:14px;background:rgba(0,0,0,.58);direction:rtl;font:14px/1.6 system-ui,sans-serif';
    const box = document.createElement('div');
    box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-labelledby', 'reader-file-title');
    box.style.cssText = 'width:min(94vw,480px);max-height:90vh;overflow:auto;padding:16px;border:1px solid var(--border,#bbb);border-radius:10px;background:var(--bg2,#fff);color:var(--text,#222);box-shadow:0 14px 40px rgba(0,0,0,.3)';
    const title = document.createElement('h2'); title.id = 'reader-file-title'; title.textContent = 'حفظ المقتطف في ملف بحث'; title.style.cssText = 'font-size:17px;margin:0 0 8px';
    const excerpt = document.createElement('blockquote'); excerpt.textContent = '«' + safeText(context.text).slice(0, 500) + (context.text.length > 500 ? '…' : '') + '»'; excerpt.style.cssText = 'margin:0 0 12px;padding:8px 10px;border-inline-start:3px solid var(--gold,#a7864a);background:rgba(127,127,127,.08);max-height:120px;overflow:auto';
    const label = document.createElement('label'); label.textContent = 'اختاري ملفاً أو أنشئي ملفاً جديداً'; label.style.cssText = 'display:block;margin:9px 0 4px';
    const select = document.createElement('select'); select.style.cssText = 'width:100%;padding:9px;border:1px solid var(--border,#bbb);border-radius:7px;background:var(--bg,#fff);color:inherit;font:inherit';
    const newOption = document.createElement('option'); newOption.value = 'new'; newOption.textContent = '＋ إنشاء ملف جديد'; select.appendChild(newOption);
    files.forEach(file => { const option = document.createElement('option'); option.value = file.id; option.textContent = file.title + ' (' + file.entries.length + ')'; select.appendChild(option); });
    const name = document.createElement('input'); name.type = 'text'; name.maxLength = 120; name.placeholder = 'عنوان ملف البحث'; name.setAttribute('aria-label', 'عنوان ملف البحث الجديد'); name.style.cssText = 'width:100%;margin-top:7px;padding:9px;border:1px solid var(--border,#bbb);border-radius:7px;background:var(--bg,#fff);color:inherit;font:inherit';
    const noteLabel = document.createElement('label'); noteLabel.textContent = 'ملاحظة على هذا المقتطف (اختياري)'; noteLabel.style.cssText = 'display:block;margin:10px 0 4px';
    const note = document.createElement('textarea'); note.rows = 3; note.maxLength = 5000; note.placeholder = 'اكتبي فكرة أو تعليقاً…'; note.style.cssText = 'width:100%;box-sizing:border-box;padding:9px;border:1px solid var(--border,#bbb);border-radius:7px;background:var(--bg,#fff);color:inherit;font:inherit;resize:vertical';
    if (context.note) note.value = context.note;
    const actions = document.createElement('div'); actions.style.cssText = 'display:flex;gap:8px;margin-top:12px';
    const save = document.createElement('button'); save.type = 'button'; save.textContent = 'حفظ المقتطف'; save.className = 'reader-research-secondary'; save.style.cssText = 'flex:1;padding:9px;border:1px solid var(--gold,#a7864a);border-radius:7px;background:rgba(127,127,127,.08);color:inherit;font:inherit;cursor:pointer';
    const cancel = document.createElement('button'); cancel.type = 'button'; cancel.textContent = 'إلغاء'; cancel.className = 'reader-research-secondary'; cancel.style.cssText = 'padding:9px;border:1px solid var(--border,#bbb);border-radius:7px;background:transparent;color:inherit;font:inherit;cursor:pointer';
    function close() { overlay.remove(); document.removeEventListener('keydown', onKey); }
    function onKey(event) { if (event.key === 'Escape') close(); }
    cancel.addEventListener('click', close);
    overlay.addEventListener('click', event => { if (event.target === overlay) close(); });
    document.addEventListener('keydown', onKey);
    save.addEventListener('click', () => {
      let fileId = select.value;
      if (fileId === 'new') {
        const created = api.createFile(name.value);
        if (!created) { name.focus(); showToast('اكتبي عنواناً للملف أو تحققي من مساحة التخزين.'); return; }
        fileId = created.id;
      }
      const readerTitle = document.title;
      const ok = api.addEntry(fileId, {
        text: context.text,
        reader: readerTitle,
        book: context.title || '',
        author: context.author || '',
        paragraph: paragraphOf(context),
        url: location.href.split('#')[0],
        note: note.value,
        kind: context.kind || 'selection'
      });
      if (!ok) { showToast('تعذّر حفظ المقتطف في التخزين المحلي.'); return; }
      close(); showToast('✓ أُضيف المقتطف إلى ملف البحث.');
    });
    actions.append(save, cancel);
    box.append(title, excerpt, label, select, name, noteLabel, note, actions);
    overlay.appendChild(box); document.body.appendChild(overlay);
    select.addEventListener('change', () => { name.hidden = select.value !== 'new'; });
    name.hidden = select.value !== 'new';
    if (name.hidden) select.focus(); else name.focus();
  }
  function renderPanel() {
    if (!panel) return;
    panel.innerHTML = '<div class="reader-research-head"><div><strong>🔬 منصات البحث العلمي</strong><div class="reader-research-sub">تُنسخ الحزمة دائماً؛ مساعدات الذكاء الاصطناعي تتلقى توجيهاً للإجابة بالعربية، أما محركات وفهارس الأوراق فتعرض النتائج بلغاتها الأصلية. المنصات المكتوب عليها «بالاستعلام جاهزاً» تُفتح والسؤال فيها؛ والباقي الصقي فيه الحزمة المنسوخة. اضغط ☆ لتثبيت منصة في المفضلة. حدود الاستخدام المجاني قد تتغير؛ أدوات الخرائط تحتاج غالباً ورقة أو DOI، والدفاتر تتطلب إضافة النص كمصدر.</div></div><button type="button" class="reader-research-close" aria-label="إغلاق">×</button></div>' +
      '<div class="reader-research-context"></div>' +
      '<div class="reader-research-question-box"><label>سؤالك البحثي (اختياري)<textarea class="reader-research-question" rows="2" maxlength="' + MAX_QUESTION_CHARS + '" placeholder="اتركه فارغاً لاستخدام السؤال الافتراضي: فحص دقة الفكرة"></textarea></label><div class="reader-research-presets">' + PRESETS.map(p => '<button type="button" class="reader-research-chip" data-preset="' + escapeHtml(p.id) + '">' + escapeHtml(p.label) + '</button>').join('') + '</div></div>' +
      '<div class="reader-research-actions"><button type="button" class="reader-research-secondary" data-action="use-selection">استخدام النص المحدد</button><button type="button" class="reader-research-secondary" data-action="show-annotations">اختيار ملاحظة أو تظليل محفوظ</button><button type="button" class="reader-research-secondary" data-action="save-to-file">حفظ في ملف بحث</button><a class="reader-research-secondary" href="../research.html" style="display:inline-block;text-decoration:none">إدارة الملفات</a></div>' +
      '<label class="reader-research-filter-check reader-research-notes-opt"><input type="checkbox" class="reader-research-include-notes"> تضمين ملاحظاتي وتظليلاتي المرتبطة بالحزمة (مطفأ افتراضياً حفاظاً على خصوصية أفكارك)</label>' +
      '<div class="reader-research-picker" ' + (state.view === 'annotations' ? '' : 'hidden') + '><label>ابحث في الملاحظات والتظليلات<input type="search" class="reader-research-filter" placeholder="عنوان الكتاب أو نص الملاحظة…"></label><label class="reader-research-filter-check"><input type="checkbox" class="reader-research-current-only" checked> الكتاب المفتوح فقط</label><div class="reader-research-annotation-list"></div></div>' +
      '<div class="reader-research-platform-list" ' + (state.view === 'annotations' ? 'hidden' : '') + '>' + platformMarkup() + '</div>';
    panel.querySelector('.reader-research-close').addEventListener('click', closePanel);
    panel.querySelector('[data-action="use-selection"]').addEventListener('click', () => {
      if (!selectCurrentPassage()) showToast('حدّد نصاً داخل الكتاب أولاً، أو اختر ملاحظة/تظليلاً محفوظاً.');
    });
    panel.querySelector('[data-action="show-annotations"]').addEventListener('click', () => {
      state.view = 'annotations'; state.items = listAnnotations(); renderPanel();
    });
    panel.querySelector('[data-action="save-to-file"]').addEventListener('click', openSaveToFile);
    const filter = panel.querySelector('.reader-research-filter');
    const onlyCurrent = panel.querySelector('.reader-research-current-only');
    if (filter) filter.addEventListener('input', renderAnnotationList);
    if (onlyCurrent) onlyCurrent.addEventListener('change', renderAnnotationList);
    const questionBox = panel.querySelector('.reader-research-question');
    if (questionBox) {
      questionBox.value = state.question;
      questionBox.addEventListener('input', () => { state.question = questionBox.value; });
    }
    panel.querySelectorAll('.reader-research-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const preset = PRESETS.find(item => item.id === chip.dataset.preset);
        if (!preset || !questionBox) return;
        state.question = preset.q;
        questionBox.value = preset.q;
      });
    });
    const notesToggle = panel.querySelector('.reader-research-include-notes');
    if (notesToggle) {
      notesToggle.checked = state.includeNotes;
      notesToggle.addEventListener('change', () => { state.includeNotes = notesToggle.checked; });
    }
    bindPlatformList();
    updateContextSummary();
    if (state.view === 'annotations') renderAnnotationList();
    if (state.open) positionPanel();
  }
  // نسخ متزامن عبر execCommand؛ يعيد true عند النجاح.
  function copySync(text) {
    const area = document.createElement('textarea');
    area.value = text; area.setAttribute('readonly', '');
    area.style.cssText = 'position:fixed;top:-10000px;left:-10000px;opacity:0';
    document.body.appendChild(area);
    area.select();
    try { area.setSelectionRange(0, text.length); } catch (_) {}
    let copied = false;
    try { copied = document.execCommand('copy'); } catch (_) {}
    area.remove();
    return copied;
  }
  function closePanel() {
    if (!panel || !trigger) return;
    panel.hidden = true; state.open = false; trigger.setAttribute('aria-expanded', 'false');
  }
  function positionPanel() {
    if (!panel || !trigger || !state.open) return;
    const rect = trigger.getBoundingClientRect();
    const width = Math.min(390, window.innerWidth - 16);
    panel.style.width = width + 'px';
    panel.style.left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)) + 'px';
    panel.style.maxHeight = Math.max(160, window.innerHeight - 16) + 'px';
    const naturalHeight = Math.min(panel.scrollHeight, window.innerHeight - 16);
    let top = rect.bottom + 8;
    if (top + naturalHeight > window.innerHeight - 8) top = Math.max(8, rect.top - naturalHeight - 8);
    panel.style.top = top + 'px';
    panel.style.maxHeight = Math.max(120, window.innerHeight - top - 8) + 'px';
  }
  function openPanel() {
    if (!panel || !trigger) return;
    state.open = true; panel.hidden = false; state.view = 'platforms';
    if (lastSelection) state.selected = lastSelection;
    renderPanel();
    trigger.setAttribute('aria-expanded', 'true');
    positionPanel();
  }
  function togglePanel() { state.open ? closePanel() : openPanel(); }
  function installStyles() {
    const style = document.createElement('style');
    style.textContent = `
      .reader-research-wrap{display:inline-flex;align-items:center}
      .reader-ai-category{display:flex;flex:0 1 190px;flex-direction:column;align-items:stretch;gap:3px;min-width:150px;padding:4px;border:1px solid var(--border,#c9c2b4);border-radius:7px;background:rgba(127,127,127,.05)}
      .reader-ai-category-label{display:block;text-align:center;font-size:10px;font-weight:700;color:var(--text2,#666)}
      .reader-ai-category>.tbtn{width:100%;box-sizing:border-box;white-space:normal;line-height:1.35;padding:5px 6px;font-size:11px}
      .reader-research-trigger{border-color:var(--blue,var(--accent,#527995))!important;color:var(--blue,var(--accent,#527995))!important}
      .reader-research-trigger:hover{background:rgba(74,122,154,.14)!important}
      .reader-ai-models-trigger{border-color:var(--gold,#a7864a)!important;color:var(--gold,#8d6e32)!important}
      .reader-ai-models-trigger:hover{background:rgba(167,134,74,.14)!important}
      .reader-research-popover{position:fixed;z-index:100000;max-height:calc(100vh - 24px);overflow:auto;box-sizing:border-box;padding:12px;border:1px solid var(--border,#c9c2b4);border-radius:10px;background:var(--bg2,#fff);color:var(--text,#222);box-shadow:0 12px 36px rgba(0,0,0,.28);font:13px/1.5 system-ui,-apple-system,'Segoe UI',sans-serif;direction:rtl}
      .reader-research-popover[hidden]{display:none!important}
      .reader-research-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:10px}
      .reader-research-head strong{font-size:15px;color:var(--gold,#8d6e32)}
      .reader-research-sub,.reader-research-meta{font-size:11px;color:var(--text2,#666);margin-top:3px}
      .reader-research-close{flex:0 0 auto;border:1px solid var(--border,#bbb);border-radius:6px;background:transparent;color:inherit;font-size:19px;line-height:1;padding:3px 8px;cursor:pointer}
      .reader-research-context{padding:9px 10px;margin:8px 0;border:1px solid var(--border,#ccc);border-radius:7px;background:rgba(127,127,127,.07);overflow-wrap:anywhere}
      .reader-research-preview{margin-top:5px;max-height:68px;overflow:auto;font-family:Georgia,serif}
      .reader-research-actions{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0}
      .reader-research-secondary{border:1px solid var(--border,#bbb);border-radius:6px;background:transparent;color:inherit;padding:6px 9px;cursor:pointer;font:inherit}
      .reader-research-secondary:hover{border-color:var(--gold,#a7864a)}
      .reader-research-group{margin-top:11px}
      .reader-research-group h3{font-size:12px;margin:0 0 5px;color:var(--gold,#8d6e32)}
      .reader-research-platforms{display:grid;grid-template-columns:1fr;gap:5px}
      .reader-research-platform{display:grid;grid-template-columns:1fr auto;gap:0 10px;text-decoration:none!important;color:inherit!important;border:1px solid var(--border,#ccc);border-radius:7px;padding:7px 9px;background:transparent}
      .reader-research-platform:hover{border-color:var(--accent,#527995);background:rgba(74,122,154,.09)}
      .reader-research-platform strong{font-size:13px}
      .reader-research-platform span{font-size:11px;color:var(--text2,#666)}
      .reader-research-platform .reader-research-cta{grid-column:1/-1;color:var(--accent,#527995);font-size:10px;margin-top:2px}
      .reader-research-picker{margin:10px 0;padding-top:9px;border-top:1px solid var(--border,#ccc)}
      .reader-research-picker[hidden],.reader-research-platform-list[hidden]{display:none!important}
      .reader-research-picker label{display:block;font-size:11px;color:var(--text2,#666);margin:4px 0}
      .reader-research-filter{display:block;box-sizing:border-box;width:100%;margin-top:4px;padding:7px;border:1px solid var(--border,#bbb);border-radius:6px;background:var(--bg,#fff);color:var(--text,#222);font:inherit}
      .reader-research-filter-check{display:flex!important;align-items:center;gap:6px}
      .reader-research-notes-opt{font-size:11px;color:var(--text2,#666);margin:6px 0}
      .reader-research-item{position:relative}
      .reader-research-item .reader-research-platform{padding-left:40px}
      .reader-research-star{position:absolute;top:3px;left:3px;width:34px;height:34px;border:0;border-radius:6px;background:transparent;color:var(--text2,#888);font-size:18px;line-height:1;cursor:pointer}
      .reader-research-star[aria-pressed="true"]{color:var(--gold,#c79a2b)}
      .reader-research-question-box{margin:8px 0}
      .reader-research-question-box label{display:block;font-size:11px;color:var(--text2,#666)}
      .reader-research-question{display:block;box-sizing:border-box;width:100%;margin-top:4px;padding:7px;border:1px solid var(--border,#bbb);border-radius:6px;background:var(--bg,#fff);color:var(--text,#222);font-family:inherit;font-size:13px;line-height:1.5;resize:vertical;min-height:48px}
      .reader-research-presets{display:flex;flex-wrap:wrap;gap:5px;margin-top:6px}
      .reader-research-chip{border:1px solid var(--border,#bbb);border-radius:999px;background:transparent;color:inherit;padding:4px 10px;font:inherit;font-size:11px;cursor:pointer}
      .reader-research-chip:hover{border-color:var(--gold,#a7864a)}
      .reader-research-annotation-list{display:grid;gap:5px;margin-top:7px;max-height:220px;overflow:auto}
      .reader-research-annotation{display:grid;gap:2px;text-align:right;border:1px solid var(--border,#ccc);border-radius:6px;padding:7px;background:transparent;color:inherit;font:inherit;cursor:pointer;overflow-wrap:anywhere}
      .reader-research-annotation:hover{border-color:var(--accent,#527995)}
      .reader-research-annotation strong{font-size:12px}
      .reader-research-annotation span:not(.reader-research-kind),.reader-research-annotation small{font-size:11px;color:var(--text2,#666)}
      .reader-research-kind{font-size:10px;color:var(--gold,#8d6e32)}
      .reader-research-empty{padding:8px;text-align:center;color:var(--text2,#666);font-size:11px}
      @media(max-width:600px){.reader-research-popover{padding:10px}.reader-research-platform{min-height:42px}}
    `;
    document.head.appendChild(style);
  }
  function openAiModels() {
    captureSelection();
    const context = state.selected || lastSelection;
    if (!context || !safeText(context.text).trim()) {
      showToast('حدّد فقرة من نص القارئ أولاً، ثم افتح نماذج الذكاء الاصطناعي.');
      return;
    }
    const token = (window.crypto && typeof window.crypto.randomUUID === 'function')
      ? window.crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);
    try {
      localStorage.setItem('readerAiHandoff:' + token, JSON.stringify({
        text: clipText(context.text, MAX_PASSAGE_CHARS), title: context.title || '',
        author: context.author || '', pid: context.pid == null ? '' : String(context.pid), createdAt: Date.now()
      }));
      const url = new URL('../ai-models.html', window.location.href);
      url.hash = 'handoff=' + encodeURIComponent(token);
      window.open(url.toString(), '_blank', 'noopener');
    } catch (_) {
      showToast('تعذّر تمرير النص تلقائياً؛ انسخ الفقرة وافتح صفحة «نماذج الذكاء» من اللوحة الرئيسية للصقها يدوياً.');
    }
  }
  function installUI() {
    const toolbar = byId('tb1') || byId('tb2');
    if (!toolbar || byId('reader-research-wrap')) return;
    installStyles();
    root = document.createElement('span'); root.className = 'reader-research-wrap reader-ai-category'; root.id = 'reader-research-wrap';
    const categoryLabel = document.createElement('span'); categoryLabel.className = 'reader-ai-category-label'; categoryLabel.textContent = 'الذكاء الاصطناعي';
    root.appendChild(categoryLabel);
    trigger = document.createElement('button'); trigger.type = 'button'; trigger.id = 'reader-research-trigger';
    trigger.className = 'tbtn reader-research-trigger'; trigger.textContent = '🔬 منصات البحث العلمي';
    trigger.setAttribute('aria-haspopup', 'dialog'); trigger.setAttribute('aria-expanded', 'false');
    trigger.addEventListener('click', event => {
      captureSelection();
      event.stopPropagation();
      togglePanel();
    });
    root.appendChild(trigger);
    aiTrigger = document.createElement('button'); aiTrigger.type = 'button';
    aiTrigger.className = 'tbtn reader-ai-models-trigger'; aiTrigger.textContent = '🤖 نماذج الذكاء الاصطناعي';
    aiTrigger.title = 'افتح نموذجاً خارجياً مع الفقرة المحددة والسؤال البحثي';
    aiTrigger.addEventListener('click', event => {
      captureSelection();
      event.stopPropagation();
      openAiModels();
    });
    root.appendChild(aiTrigger);
    const indexButton = Array.from(toolbar.querySelectorAll('button')).find(button => button.textContent.trim() === '☰');
    if (indexButton && indexButton.parentElement === toolbar) toolbar.insertBefore(root, indexButton.nextSibling);
    else toolbar.appendChild(root);
    panel = document.createElement('div'); panel.id = 'reader-research-popover'; panel.className = 'reader-research-popover';
    panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', 'منصات البحث العلمي'); panel.hidden = true;
    document.body.appendChild(panel);
    document.addEventListener('click', event => {
      if (!state.open || !event.target) return;
      const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
      if (root.contains(event.target) || panel.contains(event.target) || path.includes(root) || path.includes(panel)) return;
      closePanel();
    });
    document.addEventListener('keydown', event => { if (event.key === 'Escape') closePanel(); });
    window.addEventListener('resize', () => { if (state.open) positionPanel(); });
    window.addEventListener('scroll', () => { if (state.open) positionPanel(); }, true);
  }
  function init() {
    installUI();
    setSelectionCapture();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
