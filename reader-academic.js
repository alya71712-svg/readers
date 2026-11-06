/* Research-platform sharing for all reader pages.
   This copies a structured prompt to the clipboard; it does not send reader text to a service. */
(function () {
  'use strict';

  const PLATFORMS = [
    { group: 'البحث في الأدبيات والأدلة', items: [
      { id: 'consensus', mode: 'question', name: 'Consensus', url: 'https://consensus.app/search/', note: 'سؤال طبيعي عن الأدلة العلمية' },
      { id: 'elicit', mode: 'question', name: 'Elicit', url: 'https://elicit.com/', note: 'وكيل بحث ومراجعة أدبيات' },
      { id: 'scite', mode: 'question', name: 'Scite Assistant', url: 'https://scite.ai/assistant', note: 'بحث وسياق الاستشهادات الداعمة أو المعارضة' },
      { id: 'scispace', mode: 'question', name: 'SciSpace', url: 'https://scispace.com/search', note: 'بحث أوراق؛ محادثة PDF تتطلب إدخال الورقة' },
      { id: 'openread', mode: 'question', name: 'OpenRead', url: 'https://www.openread.academy/', note: '5 استخدامات شهرياً لبعض مزايا البحث وقراءة الأوراق' },
      { id: 'liner-scholar', mode: 'question', name: 'Liner Scholar (ScholarLiner)', url: 'https://liner.com/scholar', note: 'رصيد مجاني يتجدد شهرياً؛ عدد الرصيد غير معلن' },
      { id: 'paperguide', mode: 'question', name: 'Paperguide', url: 'https://paperguide.ai/', note: '1,500 رصيد و20 بحث AI شهرياً بالخطة المجانية' },
      { id: 'paperpal', mode: 'question', name: 'Paperpal', url: 'https://paperpal.com/', note: 'ميزات AI حتى 5 مرات يومياً؛ الحدود تختلف حسب الأداة' },
      { id: 'undermind', mode: 'question', name: 'Undermind', url: 'https://app.undermind.ai/', note: 'بحث عميق ينطلق من هدف أو سؤال' },
      { id: 'perplexity', mode: 'question', name: 'Perplexity', url: 'https://www.perplexity.ai/', note: 'بحث ويب وأكاديمي مع مصادر' }
    ]},
    { group: 'اكتشاف الأوراق وشبكات المراجع', items: [
      { id: 'researchrabbit', mode: 'seed', name: 'ResearchRabbit', url: 'https://app.researchrabbit.ai/', note: 'تحتاج عادةً إلى ورقة أو DOI كبذرة' },
      { id: 'litmaps', mode: 'seed', name: 'Litmaps', url: 'https://app.litmaps.com/', note: 'ابحث عن ورقة ثم استكشف خريطتها' },
      { id: 'connected-papers', mode: 'seed', name: 'Connected Papers', url: 'https://www.connectedpapers.com/', note: 'شبكة أوراق تبدأ بورقة منشورة' }
    ]},
    { group: 'محركات وفهارس الأوراق', items: [
      { id: 'semantic-scholar', mode: 'search', name: 'Semantic Scholar', url: 'https://www.semanticscholar.org/', note: 'محرك بحث أكاديمي؛ السؤال متاح لبعض الأوراق' },
      { id: 'openalex', mode: 'search', name: 'OpenAlex', url: 'https://openalex.org/', note: 'فهرس مفتوح؛ واجهة API منفصلة للبحث الدلالي' }
    ]},
    { group: 'مساعدات عامة بحصص مجانية متجددة', items: [
      { id: 'overchat', mode: 'question', name: 'Overchat AI', url: 'https://overchat.ai/', note: '100 رصيد يومياً؛ مساعد عام لا قاعدة أوراق متخصصة' },
      { id: 'gemini-deep-research', mode: 'question', name: 'Gemini Deep Research', url: 'https://gemini.google.com/', note: 'ضمن حدود Gemini المجانية؛ تتجدد كل 5 ساعات مع حد أسبوعي غير معلن' },
      { id: 'claude', mode: 'question', name: 'Claude (مساعد عام)', url: 'https://claude.ai/', note: 'حد استخدام متغير يتجدد كل 5 ساعات وأسبوعياً؛ Research مدفوع' }
    ]},
    { group: 'دفاتر المصادر وتلخيص النصوص', items: [
      { id: 'google-notebooklm', mode: 'source', name: 'Google NotebookLM', url: 'https://notebooklm.google.com/', note: 'أضف الحزمة كمصدر إلى دفتر ثم اطرح سؤالك' },
      { id: 'scholarcy', mode: 'document', name: 'Scholarcy', url: 'https://library.scholarcy.com/', note: 'استيراد نص أو مستند لتلخيصه' },
      { id: 'chatpdf', mode: 'document', name: 'ChatPDF', url: 'https://www.chatpdf.com/', note: 'مستندان يومياً؛ الصق النص أو ارفع الملف كمصدر أولاً' }
    ]}
  ];

  const state = { open: false, view: 'platforms', selected: null, items: [] };
  let lastSelection = null;
  let root, trigger, panel;

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
  function currentBook() {
    const data = readerData();
    return data.currentIndex >= 0 ? (data.books[data.currentIndex] || null) : null;
  }
  function passageText() {
    try { return typeof selText !== 'undefined' ? safeText(selText).trim() : ''; } catch (_) { return ''; }
  }
  function paragraphId() {
    try { return typeof selPid !== 'undefined' ? selPid : null; } catch (_) { return null; }
  }
  function isInsideReader(node) {
    const bookText = byId('bookText');
    return !!(bookText && node && (node === bookText || bookText.contains(node.nodeType === 3 ? node.parentNode : node)));
  }
  function captureSelection() {
    const selection = window.getSelection && window.getSelection();
    if (!selection || !selection.rangeCount) return;
    const text = selection.toString().trim();
    if (!text) return;
    const range = selection.getRangeAt(0);
    if (!isInsideReader(range.startContainer)) return;
    const book = currentBook();
    if (!book) return;
    let pid = null;
    try {
      if (typeof getParagraphIdForNode === 'function') pid = getParagraphIdForNode(byId('bookText'), range.startContainer);
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
      if (event.target && event.target.closest && event.target.closest('.reader-research-wrap, .reader-research-popover')) return;
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
      return snip && selected && (selected.includes(snip.slice(0, 60)) || snip.includes(selected.slice(0, 60)));
    };
    const linkedNotes = data.savedNotes.filter(item => item.bookId === context.bookId && (sameParagraph(item) || similarText(item)));
    const linkedMarks = data.savedMarks.filter(item => item.bookId === context.bookId && item.color && item.snip && item.snip !== '(بداية الصفحة)' && (sameParagraph(item) || similarText(item)));
    return { notes: linkedNotes, highlights: linkedMarks };
  }
  function selectCurrentPassage() {
    const book = currentBook();
    const selection = lastSelection;
    if (!selection || !selection.text || !book) return false;
    state.selected = { ...selection, title: book.title || selection.title, author: book.author || selection.author };
    state.view = 'platforms';
    renderPanel();
    return true;
  }
  function authorOf(context, arabic) {
    return safeText(context && context.author).trim() || (arabic ? 'غير مذكور في بيانات القارئ' : 'Not specified in reader metadata');
  }
  function paragraphOf(context) { return context && context.pid != null && context.pid !== '' ? String(context.pid) : 'غير محدد'; }
  function isArabicText(text) {
    const value = safeText(text);
    const arabicCount = (value.match(/[\u0600-\u06FF]/g) || []).length;
    const latinCount = (value.match(/[A-Za-z]/g) || []).length;
    return arabicCount > 0 && arabicCount >= latinCount * 0.5;
  }
  function buildPrompt(context, platformId) {
    const arabic = isArabicText(context.text);
    const platform = PLATFORMS.flatMap(group => group.items).find(item => item.id === platformId);
    const mode = platform ? platform.mode : 'question';
    const text = safeText(context.text).trim();
    const related = context.kind === 'selection' ? relatedAnnotations(context) : { notes: [], highlights: [] };
    const lines = [];
    const add = value => lines.push(value);

    if (mode === 'seed') {
      add(arabic
        ? 'ابحث عن ورقة علمية منشورة وذات صلة تصلح كبذرة لخريطة المراجع. المقتطف أدناه من كتاب، وليس DOI أو ورقة محكّمة؛ استخدمه لتحديد الموضوع فقط، ولا تتعامل معه بوصفه ورقة بذرة.'
        : 'Find a published scholarly paper related to this passage that could serve as a seed for a citation map. The passage below is from a book, not a DOI or peer-reviewed paper; use it only to identify the topic, not as a seed paper.');
    } else if (mode === 'search') {
      add(arabic
        ? 'ابحث عن أوراق ودراسات علمية تتناول المفاهيم الواردة في المقتطف. هذا استعلام بحث عن منشورات، وليس رفعاً للنص كمستند أو طلباً لتحليله.'
        : 'Find scholarly papers about the concepts in this passage. Treat this as a search query for publications, not as an uploaded document or a request to analyze the passage itself.');
    } else if (mode === 'source') {
      add(arabic
        ? 'حزمة مصدر لإضافتها يدوياً إلى دفتر مصادر. بعد إضافة النص كمصدر، أجب عن السؤال: ما الأدلة العلمية أو المصادر الأولية ذات الصلة بالفكرة، وما حدودها؟'
        : 'Source packet to add manually to a research notebook. After adding this text as a source, answer: What scholarly evidence or primary sources are relevant to the idea, and what are their limitations?');
    } else if (mode === 'document') {
      add(platformId === 'chatpdf'
        ? (arabic
          ? 'أضف المقتطف أدناه كمصدر نصي في ChatPDF أو الصقه في مساحة المستند، ثم حلّل حجته ومفاهيمه وأجب عن سؤال بحثي مرتبط به اعتماداً على المصدر. ميّز ما يقوله النص عما لا يثبته.'
          : 'Add the passage below as a text source in ChatPDF or paste it into the document area. Analyze its argument and concepts, then answer a research question about it using the source. Distinguish what the text says from what it does not establish.')
        : (arabic
          ? 'نص مستورد للتلخيص والتنظيم. لخّص المادة المقتبسة أدناه بدقة، واستخرج الفكرة والمصطلحات والادعاءات الأساسية. ميّز ما يقوله النص عما لا يثبته.'
          : 'Imported text for summarization and organization. Summarize the passage accurately and extract its central idea, terms, and claims. Distinguish what the passage says from what it does not establish.'));
    } else if (arabic) {
      add('أجرِ بحثاً أكاديمياً موثقاً للإجابة عن السؤال البحثي الآتي: ما مدى دقة الفكرة أو الادعاء الوارد في المقتطف، وكيف تفسره الدراسات والمصادر الأولية ذات الصلة؟');
      add('اعرض الأدلة المؤيدة والمعارضة، وميّز بوضوح بين المصادر الأولية والدراسات المحكمة أو الثانوية. أورد الاستشهادات وروابط الناشر أو DOI عند توفرها، واذكر حدود الأدلة والخلافات البحثية. لا تتعامل مع المقتطف بوصفه حقيقة مثبتة، ولا تخترع مراجع.');
    } else {
      add('Conduct a source-grounded academic investigation: How accurate is the idea or claim in this passage, and how do relevant primary sources and scholarly studies interpret it?');
      add('Present evidence for and against the claim. Distinguish primary sources from peer-reviewed or secondary scholarship. Provide citations and publisher or DOI links where available, and explain evidence limits and scholarly disagreements. Do not treat the passage as established fact or invent references.');
    }

    add('');
    add(arabic ? 'بيانات المصدر:' : 'Source context:');
    add((arabic ? 'الكتاب: ' : 'Book: ') + (context.title || (arabic ? 'غير محدد' : 'Not specified')));
    add((arabic ? 'المؤلف: ' : 'Author: ') + authorOf(context, arabic));
    add((arabic ? 'رقم الفقرة في القارئ: ' : 'Paragraph number in reader: ') + paragraphOf(context));
    add((arabic ? 'المقتطف: «' : 'Passage: “') + text + (arabic ? '»' : '”'));
    if (context.note) add((arabic ? 'ملاحظة القارئ: ' : 'Reader note: ') + safeText(context.note).trim());
    if (context.kind === 'highlight') add(arabic ? 'نوع المادة: تظليل محفوظ' : 'Selected material: saved highlight');
    if (context.kind === 'note') add(arabic ? 'نوع المادة: ملاحظة محفوظة' : 'Selected material: saved note');
    if (related.notes.length) {
      add(''); add(arabic ? 'ملاحظات مرتبطة بالفقرة:' : 'Notes linked to this paragraph:');
      related.notes.slice(0, 5).forEach(item => add('- ' + safeText(item.text).trim() + (item.text ? ' — ' : '') + safeText(item.note).trim()));
    }
    if (related.highlights.length) {
      add(''); add(arabic ? 'تظليلات محفوظة مرتبطة بالفقرة:' : 'Saved highlights linked to this paragraph:');
      related.highlights.slice(0, 5).forEach(item => add('- «' + safeText(item.snip).trim() + '»' + (item.note ? (arabic ? ' — ملاحظة: ' : ' — Note: ') + item.note : '')));
    }
    if (mode === 'seed') add(arabic
      ? '\nملاحظة: إذا لم يقبل البحث فقرة حرة، استخدم عنوان ورقة علمية أو DOI مطابقاً للموضوع لبدء الخريطة.'
      : '\nNote: If the search does not accept a free-text passage, use the title or DOI of a matching scholarly paper to start the map.');
    if (mode === 'source') add(arabic
      ? '\nبعد إضافة المصدر إلى الدفتر، اسأل عن الأدلة والاختلافات البحثية مع إحالات قابلة للتحقق.'
      : '\nAfter adding the source to the notebook, ask about the evidence and research disagreements with verifiable citations.');
    if (mode === 'document') add(arabic
      ? '\nلا تضف ادعاءات أو مراجع غير موجودة في النص المستورد.'
      : '\nDo not add claims or references that are absent from the imported text.');
    if (mode === 'question' && arabic) add('\nنظّم الإجابة تحت: سؤال محدد، خلاصة الأدلة، المصادر وأنواعها، مواضع الاتفاق والخلاف، وما لا تسمح الأدلة بالجزم به.');
    if (mode === 'question' && !arabic) add('\nOrganize the response as: focused question, evidence summary, sources and source types, areas of agreement and dispute, and what the evidence cannot establish.');
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
  function platformMarkup() {
    return PLATFORMS.map(group => '<section class="reader-research-group"><h3>' + escapeHtml(group.group) + '</h3><div class="reader-research-platforms">' + group.items.map(item => '<a class="reader-research-platform" href="' + escapeHtml(item.url) + '" target="_blank" rel="noopener noreferrer" data-platform="' + escapeHtml(item.name) + '" data-platform-id="' + escapeHtml(item.id) + '"><strong>' + escapeHtml(item.name) + '</strong><span>' + escapeHtml(item.note) + '</span><span class="reader-research-cta">نسخ الحزمة وفتح الموقع ↗</span></a>').join('') + '</div></section>').join('');
  }
  function renderPanel() {
    if (!panel) return;
    panel.innerHTML = '<div class="reader-research-head"><div><strong>🔬 منصات البحث العلمي</strong><div class="reader-research-sub">تُنسخ الحزمة ولا تُرسل تلقائياً. الصقيها يدوياً. حدود الاستخدام المجاني قد تختلف أو تتغير؛ أدوات الخرائط تحتاج غالباً ورقة أو DOI، والدفاتر تتطلب إضافة النص كمصدر.</div></div><button type="button" class="reader-research-close" aria-label="إغلاق">×</button></div>' +
      '<div class="reader-research-context"></div>' +
      '<div class="reader-research-actions"><button type="button" class="reader-research-secondary" data-action="use-selection">استخدام النص المحدد</button><button type="button" class="reader-research-secondary" data-action="show-annotations">اختيار ملاحظة أو تظليل محفوظ</button></div>' +
      '<div class="reader-research-picker" ' + (state.view === 'annotations' ? '' : 'hidden') + '><label>ابحث في الملاحظات والتظليلات<input type="search" class="reader-research-filter" placeholder="عنوان الكتاب أو نص الملاحظة…"></label><label class="reader-research-filter-check"><input type="checkbox" class="reader-research-current-only" checked> الكتاب المفتوح فقط</label><div class="reader-research-annotation-list"></div></div>' +
      '<div class="reader-research-platform-list" ' + (state.view === 'annotations' ? 'hidden' : '') + '>' + platformMarkup() + '</div>';
    panel.querySelector('.reader-research-close').addEventListener('click', closePanel);
    panel.querySelector('[data-action="use-selection"]').addEventListener('click', () => {
      if (!selectCurrentPassage()) showToast('حدّد نصاً داخل الكتاب أولاً، أو اختر ملاحظة/تظليلاً محفوظاً.');
    });
    panel.querySelector('[data-action="show-annotations"]').addEventListener('click', () => {
      state.view = 'annotations'; state.items = listAnnotations(); renderPanel();
    });
    const filter = panel.querySelector('.reader-research-filter');
    const onlyCurrent = panel.querySelector('.reader-research-current-only');
    if (filter) filter.addEventListener('input', renderAnnotationList);
    if (onlyCurrent) onlyCurrent.addEventListener('change', renderAnnotationList);
    panel.querySelectorAll('.reader-research-platform').forEach(link => {
      link.addEventListener('click', event => {
        const context = state.selected || lastSelection;
        if (!context || !safeText(context.text).trim()) {
          event.preventDefault();
          showToast('حدّد نصاً أو اختر ملاحظة/تظليلاً محفوظاً أولاً.');
          return;
        }
        const prompt = buildPrompt(context, link.dataset.platformId);
        try {
          if (typeof copyToClipboard === 'function') copyToClipboard(prompt, '✓ نُسخت الحزمة البحثية؛ الصقها في ' + link.dataset.platform);
          else copyFallback(prompt, link.dataset.platform);
        } catch (_) { copyFallback(prompt, link.dataset.platform); }
        closePanel();
      });
    });
    updateContextSummary();
    if (state.view === 'annotations') renderAnnotationList();
    if (state.open) positionPanel();
  }
  function copyFallback(text, platformName) {
    const area = document.createElement('textarea');
    area.value = text; area.setAttribute('readonly', '');
    area.style.cssText = 'position:fixed;top:-10000px;left:-10000px';
    document.body.appendChild(area); area.select();
    let copied = false;
    try { copied = document.execCommand('copy'); } catch (_) {}
    area.remove();
    showToast(copied ? '✓ نُسخت الحزمة؛ الصقها في ' + platformName : 'تعذّر النسخ تلقائياً.');
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
      .reader-research-trigger{border-color:var(--blue,var(--accent,#527995))!important;color:var(--blue,var(--accent,#527995))!important}
      .reader-research-trigger:hover{background:rgba(74,122,154,.14)!important}
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
  function installUI() {
    const toolbar = byId('tb1') || byId('tb2');
    if (!toolbar || byId('reader-research-wrap')) return;
    installStyles();
    root = document.createElement('span'); root.className = 'reader-research-wrap'; root.id = 'reader-research-wrap';
    trigger = document.createElement('button'); trigger.type = 'button'; trigger.id = 'reader-research-trigger';
    trigger.className = 'tbtn reader-research-trigger'; trigger.textContent = '🔬 منصات البحث العلمي';
    trigger.setAttribute('aria-haspopup', 'dialog'); trigger.setAttribute('aria-expanded', 'false');
    trigger.addEventListener('click', event => { event.stopPropagation(); togglePanel(); });
    root.appendChild(trigger);
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
