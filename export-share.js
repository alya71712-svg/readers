/* تصدير مرقّم: قائمة بكل التظليلات والملاحظات والإشارات بأرقام ثابتة، تختار منها رقماً أو أكثر،
   ثم تُصدَّر ملفاً، أو تُشارَك عبر تطبيقات الجهاز، أو تُرسَل إلى منصات البحث العلمي والذكاء الاصطناعي
   مع خانة للسؤال البحثي. كل شيء محلي: لا يُرسَل أي نص إلا عند ضغطك على منصة أو «مشاركة». */
(function (root) {
  'use strict';

  // نفس منصات reader-academic.js (نسخة مستقلة لأن تلك الوحدة مرتبطة بشريط القارئ)
  var PLATFORMS = [
    { group: 'البحث في الأدبيات والأدلة', items: [
      { id: 'consensus', mode: 'question', name: 'Consensus', url: 'https://consensus.app/search/' },
      { id: 'elicit', mode: 'question', name: 'Elicit', url: 'https://elicit.com/' },
      { id: 'scite', mode: 'question', name: 'Scite', url: 'https://scite.ai/assistant' },
      { id: 'scispace', mode: 'question', name: 'SciSpace', url: 'https://scispace.com/search' },
      { id: 'undermind', mode: 'question', name: 'Undermind', url: 'https://app.undermind.ai/' },
      { id: 'perplexity', mode: 'question', name: 'Perplexity', url: 'https://www.perplexity.ai/', deepLink: 'https://www.perplexity.ai/search?q=' },
      { id: 'openread', mode: 'question', name: 'OpenRead', url: 'https://www.openread.academy/' },
      { id: 'paperguide', mode: 'question', name: 'Paperguide', url: 'https://paperguide.ai/' }
    ]},
    { group: 'الذكاء الاصطناعي العام', items: [
      { id: 'claude', mode: 'question', name: 'Claude', url: 'https://claude.ai/', deepLink: 'https://claude.ai/new?q=' },
      { id: 'chatgpt', mode: 'question', name: 'ChatGPT', url: 'https://chatgpt.com/', deepLink: 'https://chatgpt.com/?q=' },
      { id: 'gemini', mode: 'question', name: 'Gemini', url: 'https://gemini.google.com/' },
      { id: 'notebooklm', mode: 'source', name: 'NotebookLM', url: 'https://notebooklm.google.com/' },
      { id: 'scholarcy', mode: 'document', name: 'Scholarcy', url: 'https://library.scholarcy.com/', max: 4800 },
      { id: 'chatpdf', mode: 'document', name: 'ChatPDF', url: 'https://www.chatpdf.com/' }
    ]},
    { group: 'محركات الأوراق والمكتبات (يُنسخ استعلام قصير)', items: [
      { id: 'semantic-scholar', mode: 'search', name: 'Semantic Scholar', url: 'https://www.semanticscholar.org/', deepLink: 'https://www.semanticscholar.org/search?q=' },
      { id: 'google-scholar', mode: 'search', name: 'Google Scholar', url: 'https://scholar.google.com/', deepLink: 'https://scholar.google.com/scholar?q=' },
      { id: 'core', mode: 'search', name: 'CORE', url: 'https://core.ac.uk/search' },
      { id: 'gallica', mode: 'search', name: 'Gallica', url: 'https://gallica.bnf.fr/' },
      { id: 'persee', mode: 'search', name: 'Persée', url: 'https://www.persee.fr/' },
      { id: 'openedition', mode: 'search', name: 'OpenEdition', url: 'https://search.openedition.org/' }
    ]}
  ];
  var PRESETS = [
    { label: 'فحص الدقة', q: 'ما مدى دقة الأفكار الواردة في هذه المقتطفات، وكيف تفسّرها الدراسات والمصادر الأولية ذات الصلة؟' },
    { label: 'أدلة معارضة', q: 'ما الدراسات والأدلة التي تعارض هذه الأفكار أو تقيّدها أو تقترح تفسيراً بديلاً لها؟' },
    { label: 'مصادر أولية', q: 'ما المصادر الأولية القديمة ذات الصلة بهذه المقتطفات (بلغاتها الأصلية)، وأين يرد المعنى نفسه أو ما يشبهه فيها؟' },
    { label: 'الرابط بينها', q: 'ما العلاقة بين هذه المقتطفات، وهل تشير الدراسات إلى بنية أو سياق تاريخي مشترك يجمعها؟' }
  ];
  var KEY_Q = 'exportShare.question.v1', KEY_FAV = 'exportShare.fav.v1';
  var MAX_QUESTION = 800, MAX_PACK = 40000, MAX_DEEPLINK_URL = 6000;
  var KIND = { highlight: 'تظليل', note: 'ملاحظة', bookmark: 'إشارة' };

  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function oneLine(s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); }
  function clip(s, n) {
    s = oneLine(s); if (s.length <= n) return s;
    var c = s.slice(0, n), sp = c.lastIndexOf(' ');
    return (sp > n * 0.7 ? c.slice(0, sp) : c) + ' […]';
  }
  function platformById(id) {
    for (var g = 0; g < PLATFORMS.length; g++) for (var i = 0; i < PLATFORMS[g].items.length; i++) if (PLATFORMS[g].items[i].id === id) return PLATFORMS[g].items[i];
    return null;
  }

  /* ---------- الأرقام: «1,3,5-8» ↔ مجموعة ---------- */
  function toLatinDigits(s) {
    return String(s || '').replace(/[٠-٩]/g, function (d) { return String(d.charCodeAt(0) - 1632); })
      .replace(/[۰-۹]/g, function (d) { return String(d.charCodeAt(0) - 1776); });
  }
  function parseNumbers(text, max) {
    var out = {}, t = toLatinDigits(text).replace(/[،؛;]/g, ',').replace(/[–—−]/g, '-');
    t.split(/[,\s]+/).forEach(function (part) {
      if (!part) return;
      var m = part.match(/^(\d+)-(\d+)$/);
      if (m) {
        var a = +m[1], b = +m[2]; if (a > b) { var x = a; a = b; b = x; }
        for (var k = Math.max(1, a); k <= Math.min(b, max); k++) out[k] = 1;
      } else if (/^\d+$/.test(part)) {
        var n = +part; if (n >= 1 && n <= max) out[n] = 1;
      }
    });
    return out;
  }
  function formatNumbers(set) {
    var ks = Object.keys(set).map(Number).sort(function (a, b) { return a - b; }), parts = [], i = 0;
    while (i < ks.length) {
      var j = i; while (j + 1 < ks.length && ks[j + 1] === ks[j] + 1) j++;
      parts.push(j - i >= 2 ? ks[i] + '-' + ks[j] : ks.slice(i, j + 1).join(','));
      i = j + 1;
    }
    return parts.join(',');
  }

  /* ---------- بناء الحزمة المرسلة للمنصات ---------- */
  var DEFAULT_Q = 'ما الأدلة العلمية والمصادر الأولية ذات الصلة بالأفكار الواردة في هذه المقتطفات، وما حدودها؟';
  function entryBlock(e, noteToo, maxText) {
    var loc = [e.readerTitle, e.book].filter(Boolean).join(' › ') + (e.pid != null && !isNaN(e.pid) ? ' — فقرة ' + e.pid : '');
    var head = '[' + e.n + '] ' + loc + ' · ' + KIND[e.kind] + (e.colorName ? ' ' + e.colorName : '');
    var lines = [head];
    if (e.kind === 'note') {
      lines.push('ملاحظتي: ' + oneLine(e.note));
      if (e.text) lines.push('عن المقتطف: «' + clip(e.text, maxText) + '»');
    } else {
      if (e.text) lines.push('«' + clip(e.text, maxText) + '»');
      if (noteToo && e.note) lines.push('ملاحظتي: ' + clip(e.note, maxText));
    }
    return lines.join('\n');
  }
  function buildFull(items, question, maxChars) {
    var q = oneLine(question).slice(0, MAX_QUESTION) || DEFAULT_Q;
    var head = '# سؤالي البحثي\n' + q + '\n\n# المقتطفات المختارة من مكتبتي (' + items.length + ')\n';
    var tail = '\n\n# تعليمات\nأجب عن السؤال اعتماداً على المقتطفات أعلاه وعلى مصادر موثقة. أرقام [..] هي أرقام العناصر في قائمتي، وإن أشرت إلى مقتطف فاذكر رقمه. ميّز بين المصادر الأولية والدراسات المحكّمة، وأورد الاستشهادات وروابط الناشر أو DOI عند توفرها، واذكر مواضع الخلاف وحدود الأدلة. لا تخترع مراجع. ابحث بالإنجليزية والفرنسية والألمانية أيضاً (وباليونانية واللاتينية للمصادر القديمة)، وأجب بالعربية مع إبقاء المصطلحات الفنية بين قوسين.';
    var room = maxChars - head.length - tail.length, body = [], used = 0, omitted = 0;
    items.forEach(function (e) {
      var b = entryBlock(e, true, 1500);
      if (used + b.length + 2 > room && body.length) { omitted++; return; }
      body.push(b); used += b.length + 2;
    });
    return head + body.join('\n\n') + (omitted ? '\n\n(… ' + omitted + ' عنصراً لم يُدرج لطول النص؛ قلّل المحدد.)' : '') + tail;
  }
  // نسخة قصيرة تُحمَّل في الرابط نفسه (الحزمة الكاملة تبقى في الحافظة)
  function buildDeep(items, question, platform) {
    var q = oneLine(question).slice(0, 300) || DEFAULT_Q;
    var raw = 700;
    for (var tries = 0; tries < 6; tries++) {
      var parts = [q], used = q.length;
      for (var i = 0; i < items.length; i++) {
        var b = entryBlock(items[i], false, 180).replace(/\n/g, ' ');
        if (used + b.length > raw && i > 0) break;
        parts.push(b); used += b.length;
      }
      var text = parts.join('\n') + '\nاستشهد بمصادر موثقة ولا تخترع مراجع، وأجب بالعربية.';
      var url = platform.deepLink + encodeURIComponent(text);
      if (url.length <= MAX_DEEPLINK_URL) return { url: url };
      raw = Math.floor(raw / 2);
    }
    return null;
  }
  function buildShortQuery(items, question) {
    var q = oneLine(question);
    if (q) return clip(q, 200);
    return clip(items[0].text || items[0].note || '', 200);
  }

  /* ---------- نسخ متزامن داخل الضغطة (مهم للجوال) ---------- */
  function copySync(text) {
    var ok = false;
    try {
      var ta = document.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
      document.body.appendChild(ta); ta.focus(); ta.select();
      try { ta.setSelectionRange(0, text.length); } catch (e) {}
      ok = document.execCommand('copy'); ta.remove();
    } catch (e) {}
    if (!ok && navigator.clipboard && navigator.clipboard.writeText) { try { navigator.clipboard.writeText(text); ok = true; } catch (e) {} }
    return ok;
  }

  var cssDone = false;
  function addCss() {
    if (cssDone) return; cssDone = true;
    var st = document.createElement('style');
    st.textContent =
      '.xs-bar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:8px 0}' +
      '.xs-bar input[type=text]{flex:1 1 170px;min-width:0}' +
      '.xs-bar button{padding:8px 12px;min-height:40px}' +
      '.xs-count{font-weight:700;color:var(--accent);font-size:14px}' +
      '.xs-list{max-height:46vh;overflow:auto;border:1px solid var(--line);border-radius:12px;background:var(--cell);padding:4px}' +
      '.xs-grp{position:sticky;top:0;z-index:1;margin:6px 0 2px;padding:5px 9px;border-radius:8px;background:var(--soft);color:var(--accent);font-weight:700;font-size:13px}' +
      '.chat-form label.xs-row{display:flex;gap:9px;align-items:flex-start;padding:9px 8px;border-bottom:1px dashed var(--line);cursor:pointer;margin:0;font-weight:400}' +
      '.xs-row:last-child{border-bottom:0}.xs-row.on{background:color-mix(in srgb,var(--accent) 10%,transparent);border-radius:8px}' +
      '.xs-row input{width:20px;height:20px;margin:2px 0 0;flex:none}' +
      '.xs-no{flex:none;min-width:34px;padding:2px 7px;border-radius:12px;background:var(--accent);color:#fff;font-weight:700;font-size:13px;text-align:center;line-height:1.6}' +
      '.xs-main{flex:1;min-width:0}.xs-meta{font-size:12px;color:var(--muted);margin-bottom:2px}' +
      '.xs-q{font-size:14px;line-height:1.8;overflow-wrap:anywhere}.xs-n{font-size:13px;color:var(--accent);margin-top:2px;line-height:1.7}' +
      '.xs-chips{display:flex;gap:6px;flex-wrap:wrap;margin:6px 0}' +
      '.xs-chips button{padding:6px 11px;min-height:34px;font-size:13px}' +
      '.xs-plat{display:grid;grid-template-columns:repeat(auto-fill,minmax(138px,1fr));gap:7px;margin:6px 0 10px}' +
      '.xs-pbtn{display:flex;align-items:stretch;border:1px solid color-mix(in srgb,var(--accent) 25%,var(--line));border-radius:11px;background:var(--soft);overflow:hidden}' +
      '.xs-pbtn button.go{flex:1;background:transparent;color:var(--accent);padding:10px 8px;min-height:44px;font-weight:700;border:0;border-radius:0;text-align:center}' +
      '.xs-pbtn button.st{flex:none;width:34px;background:transparent;color:var(--accent);border:0;border-radius:0;padding:0;font-size:17px}' +
      '.xs-h{margin:14px 0 4px;font-weight:700;font-size:14px}' +
      '.xs-sub{font-size:12px;color:var(--muted);margin:2px 0 4px}' +
      '.xs-form textarea.chat-field{min-height:86px}';
    document.head.appendChild(st);
  }

  function open(ctx) {
    var el = ctx.el, RB = root.ReaderBridge;
    if (!RB || !RB.listNumbered) { ctx.openModal('تصدير مرتب', el('p', { text: 'وحدة الربط لم تُحمَّل — أعد تحميل الصفحة.' })); return; }
    addCss();

    var rsel = el('select', { class: 'chat-field' }, [el('option', { value: 'all', text: 'كل القراء' })].concat(ctx.readers.filter(function (r) { return r.texts; }).map(function (r) { return el('option', { value: r.id, text: r.title }); })));
    function chk(label, on) { var i = el('input', { type: 'checkbox' }); i.checked = !!on; return { i: i, row: el('label', { class: 'exp-chk' }, [i, document.createTextNode(label)]) }; }
    var cH = chk('تظليلي', true), cN = chk('ملاحظاتي', true), cB = chk('إشاراتي العادية', false);
    var gsel = el('select', { class: 'chat-field' }, [['book', 'حسب الكتاب (بترتيب الفقرات)'], ['color', 'حسب لون التظليل'], ['topic', 'حسب مواضيع أحدّدها بكلمات']].map(function (a) { return el('option', { value: a[0], text: a[1] }); }));
    var topics = el('textarea', { class: 'chat-field', rows: '3', placeholder: 'موضوع في كل سطر، والكلمات البديلة بفاصلة. مثال:\nالزوجة والجماعة: زوجة, wife\nالحاكم: ملك, king' });
    var topicsBtn = el('button', { type: 'button', class: 'ghost', text: 'تطبيق المواضيع' });
    var topicsWrap = el('div', {}, [el('label', { text: 'المواضيع' }), topics, el('div', { class: 'xs-bar' }, [topicsBtn])]);
    topicsWrap.style.display = 'none';
    var filt = el('input', { type: 'text', class: 'chat-field', placeholder: 'مثال: wife أو زوجة', autocomplete: 'off' });

    var info = el('div', { class: 'exp-info', role: 'status', 'aria-live': 'polite' });
    var count = el('span', { class: 'xs-count', text: '' });
    var nums = el('input', { type: 'text', class: 'chat-field', dir: 'ltr', placeholder: 'أرقام: 1,3,5-8', autocomplete: 'off', inputmode: 'text', 'aria-label': 'أرقام العناصر المختارة' });
    var bAll = el('button', { type: 'button', class: 'ghost', text: 'الكل' });
    var bNone = el('button', { type: 'button', class: 'ghost', text: 'مسح' });
    var list = el('div', { class: 'xs-list', role: 'group', 'aria-label': 'العناصر المرقّمة' });

    var q = el('textarea', { class: 'chat-field', rows: '3', maxlength: String(MAX_QUESTION), placeholder: 'اكتب سؤالك البحثي هنا، مثال: ما أدلة ارتباط الزوجة في الأمثولة بالجماعة المحكومة؟' });
    q.value = lsGet(KEY_Q) || '';
    q.addEventListener('input', function () { lsSet(KEY_Q, q.value); });
    var presets = el('div', { class: 'xs-chips' }, PRESETS.map(function (p) { return el('button', { type: 'button', class: 'ghost', text: p.label, onclick: function () { q.value = p.q; lsSet(KEY_Q, q.value); q.focus(); } }); }));

    var bHtml = el('button', { type: 'button', class: 'ghost', text: '⬇ HTML' });
    var bMd = el('button', { type: 'button', class: 'ghost', text: '⬇ Markdown' });
    var bCopy = el('button', { type: 'button', class: 'secondary', text: '📋 نسخ للصق' });
    var bShare = el('button', { type: 'button', text: '📤 مشاركة عبر التطبيقات' });

    var all = [], sel = {}, rows = {};
    function selectedItems() { return all.filter(function (e) { return sel[e.n]; }); }
    function say(t) { info.textContent = t; }

    function refreshCount() {
      var n = Object.keys(sel).length;
      count.textContent = all.length ? ('المحدد ' + n + ' من ' + all.length) : '';
      Object.keys(rows).forEach(function (k) { rows[k].classList.toggle('on', !!sel[k]); });
    }
    function syncNums() { nums.value = formatNumbers(sel); refreshCount(); }
    function setSel(n, on) { if (on) sel[n] = 1; else delete sel[n]; if (rows[n]) rows[n].querySelector('input').checked = !!on; }

    function renderList() {
      list.replaceChildren(); rows = {};
      if (!all.length) { list.appendChild(el('p', { text: 'لا توجد تظليلات أو ملاحظات مطابقة على هذا الجهاز. إن كانت محفوظة في السحابة فافتح القارئ مرة لمزامنتها.' })); return; }
      var lastG = null;
      all.forEach(function (e) {
        var g = (e.sectionTitle ? e.sectionTitle + ' · ' : '') + e.groupTitle;
        if (g !== lastG) { list.appendChild(el('div', { class: 'xs-grp', text: g })); lastG = g; }
        var cb = el('input', { type: 'checkbox', 'aria-label': 'العنصر ' + e.n });
        cb.checked = !!sel[e.n];
        cb.addEventListener('change', function () { setSel(e.n, cb.checked); syncNums(); });
        var meta = (e.pid != null && !isNaN(e.pid) ? 'فقرة ' + e.pid : 'بلا رقم فقرة') + ' · ' + (e.dot ? e.dot + ' ' : '') + KIND[e.kind] + (e.date ? ' · ' + e.date : '');
        var main = el('div', { class: 'xs-main' }, [el('div', { class: 'xs-meta', text: meta })]);
        if (e.kind === 'note') {
          main.appendChild(el('div', { class: 'xs-q', text: clip(e.note, 400) }));
          if (e.text) main.appendChild(el('div', { class: 'xs-meta', text: 'عن: «' + clip(e.text, 140) + '»' }));
        } else {
          if (e.text) main.appendChild(el('div', { class: 'xs-q', text: '«' + clip(e.text, 400) + '»' }));
          if (e.note) main.appendChild(el('div', { class: 'xs-n', text: '↳ ' + clip(e.note, 300) }));
        }
        var row = el('label', { class: 'xs-row' }, [cb, el('span', { class: 'xs-no', text: String(e.n) }), main]);
        rows[e.n] = row; list.appendChild(row);
      });
    }

    function params() { return { reader: rsel.value, kinds: { highlights: cH.i.checked, notes: cN.i.checked, bookmarks: cB.i.checked }, groupBy: gsel.value, topics: topics.value, filter: filt.value.trim() }; }
    function reload() {
      try {
        var r = RB.listNumbered(params());
        all = r.entries; sel = {};
        renderList(); syncNums();
        say(all.length ? 'اختر رقماً أو أكثر بالضغط على العناصر أو بكتابة أرقام في الخانة.' : '');
      } catch (e) { say('تعذّر التجهيز: ' + ((e && e.message) || e)); }
    }
    var tmr = null;
    [rsel, gsel, cH.i, cN.i, cB.i].forEach(function (x) { x.addEventListener('change', function () { topicsWrap.style.display = gsel.value === 'topic' ? '' : 'none'; reload(); }); });
    filt.addEventListener('input', function () { clearTimeout(tmr); tmr = setTimeout(reload, 350); });
    topicsBtn.onclick = reload;
    nums.addEventListener('input', function () {
      var want = parseNumbers(nums.value, all.length);
      all.forEach(function (e) { setSel(e.n, !!want[e.n]); });
      refreshCount();
    });
    nums.addEventListener('blur', syncNums);
    bAll.onclick = function () { all.forEach(function (e) { setSel(e.n, true); }); syncNums(); };
    bNone.onclick = function () { all.forEach(function (e) { setSel(e.n, false); }); syncNums(); };

    /* ---------- ملفات ونسخ ومشاركة ---------- */
    function pickedOrNull() { var ks = Object.keys(sel).map(Number); return ks.length ? ks : null; }
    function download(name, mime, text) {
      var a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob(['﻿' + text], { type: mime + ';charset=utf-8' }));
      a.download = name; document.body.appendChild(a); a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
    }
    async function fileExport(kind) {
      if (!all.length) { say('لا توجد عناصر للتصدير.'); return; }
      var pick = pickedOrNull();
      try {
        var p = params(); if (pick) p.pick = pick;
        var res = await RB.exportOrganized(p);
        if (kind === 'html') download(res.filename + (pick ? '-selected' : '') + '.html', 'text/html', res.html);
        else download(res.filename + (pick ? '-selected' : '') + '.md', 'text/markdown', res.markdown);
        say('✓ نُزّل ' + (pick ? 'المحدد فقط (' + pick.length + ')' : 'الكل (' + all.length + ') — لم تحدّد أرقاماً') + '.');
      } catch (e) { say('تعذّر التصدير: ' + ((e && e.message) || e)); }
    }
    bHtml.onclick = function () { fileExport('html'); };
    bMd.onclick = function () { fileExport('md'); };
    function needSel() { var it = selectedItems(); if (!it.length) { say('حدّد رقماً واحداً على الأقل أولاً.'); return null; } return it; }
    bCopy.onclick = function () {
      var it = needSel(); if (!it) return;
      say(copySync(buildFull(it, q.value, MAX_PACK)) ? '✓ نُسخ السؤال مع ' + it.length + ' عنصراً — الصقه في أي تطبيق.' : 'تعذّر النسخ التلقائي في هذا المتصفح.');
    };
    bShare.onclick = async function () {
      var it = needSel(); if (!it) return;
      var text = buildFull(it, q.value, MAX_PACK);
      if (typeof navigator.share !== 'function') { say(copySync(text) ? 'المشاركة المباشرة غير متاحة هنا؛ نُسخ النص — الصقه في التطبيق.' : 'المشاركة غير متاحة والنسخ فشل.'); return; }
      try { await navigator.share({ title: 'مقتطفات من «القراء العشرة»', text: text }); say('✓ عادت المشاركة من الجهاز.'); }
      catch (e) { say(e && e.name === 'AbortError' ? 'أُلغيت المشاركة.' : (copySync(text) ? 'تعذّرت المشاركة؛ نُسخ النص بدلاً منها.' : 'تعذّرت المشاركة.')); }
    };

    /* ---------- المنصات ---------- */
    var favs = []; try { favs = JSON.parse(lsGet(KEY_FAV) || 'null') || ['consensus']; } catch (e) { favs = ['consensus']; }
    var platBox = el('div', {});
    function launch(pl) {
      var it = needSel(); if (!it) return;
      var full = buildFull(it, q.value, pl.max || MAX_PACK);
      var copyText = pl.mode === 'search' ? buildShortQuery(it, q.value) : full;
      var copied = copySync(copyText), target = pl.url, pre = false;
      if (pl.deepLink) {
        var d = buildDeep(it, q.value, pl);
        if (d) { target = d.url; pre = true; }
      }
      window.open(target, '_blank', 'noopener');
      say(pre ? '✓ فُتحت ' + pl.name + ' والسؤال جاهز فيها (نسخة مختصرة)، والحزمة الكاملة منسوخة.'
        : pl.mode === 'search' ? (copied ? '✓ نُسخ استعلام قصير — الصقه في خانة البحث في ' + pl.name + '.' : 'تعذّر النسخ تلقائياً.')
        : (copied ? '✓ نُسخت الحزمة (السؤال + ' + it.length + ' عنصراً) — الصقها في ' + pl.name + '.' : 'تعذّر النسخ تلقائياً؛ استخدم «نسخ للصق».'));
    }
    function platBtn(pl) {
      var on = favs.indexOf(pl.id) >= 0;
      return el('div', { class: 'xs-pbtn' }, [
        el('button', { type: 'button', class: 'go', text: pl.name + ' ↗', onclick: function () { launch(pl); } }),
        el('button', { type: 'button', class: 'st', text: on ? '★' : '☆', 'aria-label': on ? 'إزالة من المفضلة' : 'تثبيت في المفضلة', 'aria-pressed': on ? 'true' : 'false',
          onclick: function () { favs = on ? favs.filter(function (x) { return x !== pl.id; }) : favs.concat(pl.id); lsSet(KEY_FAV, JSON.stringify(favs)); renderPlat(); } })
      ]);
    }
    function renderPlat() {
      platBox.replaceChildren();
      var pinned = favs.map(platformById).filter(Boolean);
      if (pinned.length) { platBox.appendChild(el('div', { class: 'xs-h', text: '⭐ المفضلة' })); platBox.appendChild(el('div', { class: 'xs-plat' }, pinned.map(platBtn))); }
      PLATFORMS.forEach(function (g) {
        platBox.appendChild(el('div', { class: 'xs-h', text: g.group }));
        platBox.appendChild(el('div', { class: 'xs-plat' }, g.items.map(platBtn)));
      });
    }
    renderPlat();

    ctx.openModal('تصدير مرتب ومشاركة البحث', el('div', { class: 'chat-form xs-form' }, [
      el('div', { class: 'manus-brief' }, [
        el('strong', { text: 'اختر ما تريد من تظليلاتك وملاحظاتك بأرقامها' }),
        el('p', { text: 'كل عنصر له رقم ثابت. حدّد رقماً أو أكثر، واكتب سؤالك البحثي، ثم نزّلها أو شاركها أو أرسلها إلى منصة بحث علمي أو ذكاء اصطناعي. لا يخرج أي نص من جهازك إلا عند ضغطك على «مشاركة» أو على منصة.' })
      ]),
      el('label', { text: 'القارئ' }), rsel,
      el('label', { text: 'ما الذي يُعرض؟' }), cH.row, cN.row, cB.row,
      el('label', { text: 'الترتيب (وتُرقَّم العناصر بحسبه)' }), gsel, topicsWrap,
      el('label', { text: 'فلترة بكلمة (اختياري)' }), filt,
      el('div', { class: 'xs-h', text: '١ — اختر الأرقام' }),
      el('div', { class: 'xs-bar' }, [count, nums, bAll, bNone]),
      list,
      el('div', { class: 'xs-h', text: '٢ — سؤالك البحثي' }),
      q, presets,
      el('div', { class: 'xs-h', text: '٣ — أرسل أو نزّل' }),
      el('div', { class: 'row manus-actions' }, [bShare, bCopy, bHtml, bMd]),
      el('div', { class: 'xs-sub', text: 'الملفات المنزّلة تحمل أرقامك نفسها؛ وإن لم تحدّد شيئاً نزّلت الكل.' }),
      el('div', { class: 'xs-h', text: '🔬 منصات البحث العلمي والذكاء الاصطناعي' }),
      el('div', { class: 'xs-sub', text: 'تُنسخ الحزمة (السؤال + المحدد) ثم تُفتح المنصة؛ ما له رابط مباشر يُفتح والسؤال جاهز فيه، وغيره الصقه بعد الفتح.' }),
      platBox,
      info
    ]));
    reload();
  }

  root.ExportShare = { open: open, _t: { parseNumbers: parseNumbers, formatNumbers: formatNumbers, buildFull: buildFull, buildDeep: buildDeep, PLATFORMS: PLATFORMS } };
})(typeof window !== 'undefined' ? window : globalThis);
