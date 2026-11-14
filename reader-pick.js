/* reader-pick.js v1 — تحديد الفقرات بمربّعات صغيرة ثم نسخها ومشاركتها (للقراء العشرة).
   • مربّع ☐ بجوار رقم كل فقرة في النص؛ الضغط يضع ✓ وتصير الفقرة «مختارة».
   • مربّع مماثل بجوار كل نتيجة في كل أنواع البحث: العالمي، الموضوعي، المتقدم، المقارنة الدلالية والنصية.
     (النتيجة تُضاف بفقرتها الكاملة ورقمها واسم الكتاب، لا بالمقتطف القصير فقط.)
   • شريط عائم يعرض عدد المختار: «نسخ لـ Claude» ينسخ ويفتح مشاركة تطبيقات الهاتف معاً، و«مراجعة» تفتح قائمة المختار
     مع سؤالك البحثي ومنصات الذكاء الاصطناعي والبحث العلمي.
   • أزرار «نسخ … لـ Claude.ai» القديمة (التحليل العميق وسؤال البحث) تفتح هي أيضاً مشاركة الهاتف.
   لا يُرسَل أي نص إلا عند ضغطك على نسخ أو مشاركة أو منصة. المربّعات فارغة النص فلا تغيّر مواضع التظليل والبحث. */
(function(){
  'use strict';

  var KEY_Q = 'exportShare.question.v1';   // نفس خانة السؤال في لوحة التصدير بالرئيسية
  var SS_KEY = 'readerPick.v1';
  var MAX_ITEM = 2500, MAX_PACK = 40000, MAX_URL = 6000;
  var PLAT = [
    { name: 'Claude', url: 'https://claude.ai/new', deep: 'https://claude.ai/new?q=' },
    { name: 'ChatGPT', url: 'https://chatgpt.com/', deep: 'https://chatgpt.com/?q=' },
    { name: 'Gemini', url: 'https://gemini.google.com/' },
    { name: 'Consensus', url: 'https://consensus.app/search/' },
    { name: 'Perplexity', url: 'https://www.perplexity.ai/', deep: 'https://www.perplexity.ai/search?q=' },
    { name: 'NotebookLM', url: 'https://notebooklm.google.com/' },
    { name: 'Elicit', url: 'https://elicit.com/' },
    { name: 'Scite', url: 'https://scite.ai/assistant' }
  ];
  var PRESETS = [
    ['فحص الدقة', 'ما مدى دقة الأفكار الواردة في هذه المقتطفات، وكيف تفسّرها الدراسات والمصادر الأولية ذات الصلة؟'],
    ['أدلة معارضة', 'ما الدراسات والأدلة التي تعارض هذه الأفكار أو تقيّدها أو تقترح تفسيراً بديلاً لها؟'],
    ['مصادر أولية', 'ما المصادر الأولية القديمة ذات الصلة بهذه المقتطفات (بلغاتها الأصلية)، وأين يرد المعنى نفسه أو ما يشبهه فيها؟'],
    ['الرابط بينها', 'ما العلاقة بين هذه المقتطفات، وهل تشير الدراسات إلى بنية أو سياق تاريخي مشترك يجمعها؟']
  ];
  var DEFAULT_Q = 'اشرح لي هذه المقتطفات، وما الأدلة والمصادر ذات الصلة بها وحدودها؟';

  var items = [];            // [{key,bookId,bookTitle,reader,pid,page,sec,text}]
  var byKey = Object.create(null);

  function lsGet(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } }
  function lsSet(k, v){ try{ localStorage.setItem(k, v); }catch(e){} }
  function oneLine(s){ return String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); }
  function clip(s, n){ s = oneLine(s); return s.length <= n ? s : s.slice(0, n) + ' […]'; }
  function say(m){ try{ if(typeof toast === 'function') toast(m); }catch(e){} }
  function $(id){ return document.getElementById(id); }
  function el(tag, attrs, kids){
    var e = document.createElement(tag);
    if(attrs) Object.keys(attrs).forEach(function(k){
      if(k === 'text') e.textContent = attrs[k];
      else if(k === 'onclick') e.onclick = attrs[k];
      else e.setAttribute(k, attrs[k]);
    });
    (kids || []).forEach(function(c){ if(c) e.appendChild(c); });
    return e;
  }

  /* ---------- الكتاب الحالي والبحث عن كتاب ---------- */
  function curBook(){
    try{ return (typeof library !== 'undefined' && typeof cur !== 'undefined' && cur >= 0) ? library[cur] : null; }catch(e){ return null; }
  }
  function bookById(id){
    try{ if(typeof getBookById === 'function') return getBookById(id); }catch(e){}
    try{ for(var i = 0; i < library.length; i++) if(library[i].id === id) return library[i]; }catch(e){}
    return null;
  }

  /* ---------- حفظ مؤقت لهذه الجلسة ---------- */
  function persist(){ try{ sessionStorage.setItem(SS_KEY, JSON.stringify(items)); }catch(e){} }
  function restore(){
    try{
      var a = JSON.parse(sessionStorage.getItem(SS_KEY) || '[]');
      if(Array.isArray(a)) a.forEach(function(it){ if(it && it.key && !byKey[it.key]){ items.push(it); byKey[it.key] = it; } });
    }catch(e){}
  }

  /* ---------- إنشاء عنصر مختار ---------- */
  function makeItem(book, pid, pos, fallbackText){
    var text = '';
    try{ if(window.ReaderLocate && pid != null) text = window.ReaderLocate.para(book, pid); }catch(e){}
    if(!text) text = fallbackText || '';
    text = text.replace(/[ \t]+\n/g, '\n').trim();
    if(!text) return null;
    var page = null, sec = '';
    try{ if(typeof pos === 'number' && typeof getPageForOffset === 'function') page = getPageForOffset(book, pos); }catch(e){}
    try{ if(typeof pos === 'number' && window.ReaderLocate) sec = window.ReaderLocate.at(book, pos).sec || ''; }catch(e){}
    return {
      key: book.id + '|' + (pid != null ? pid : 'x' + (text.length > 40 ? text.slice(0, 40) : text)),
      bookId: book.id, bookTitle: book.title || '', reader: oneLine(document.title).slice(0, 60),
      pid: pid, page: page, sec: sec, text: text.length > MAX_ITEM ? text.slice(0, MAX_ITEM) + ' […]' : text
    };
  }
  function addItem(it){ if(!it || byKey[it.key]) return; items.push(it); byKey[it.key] = it; }
  function removeKey(k){
    if(!byKey[k]) return;
    delete byKey[k];
    items = items.filter(function(x){ return x.key !== k; });
  }
  function afterChange(){ persist(); syncBoxes(); updateBar(); if(sheet && sheet.classList.contains('show')) renderSheet(); }

  /* ---------- نص الفقرة من الصفحة (احتياط إن لم يُعرف موضعها) ---------- */
  function domParaText(badge){
    var out = '', n = badge.nextSibling;
    while(n){
      if(n.nodeType === 1){
        var c = n.classList;
        if(c && (c.contains('para-num') || c.contains('sec-anchor') || c.contains('chunk-bar') || c.contains('toc-box'))) break;
        if(!(c && c.contains('pk-box'))) out += n.textContent;
      } else if(n.nodeType === 3) out += n.nodeValue;
      if(out.length > MAX_ITEM) break;
      n = n.nextSibling;
    }
    return out;
  }

  /* ---------- مربّعات الفقرات داخل النص ---------- */
  function decorateText(){
    var c = $('bookText'); if(!c) return;
    var book = curBook(); if(!book) return;
    var badges = c.querySelectorAll('.para-num[data-pid]:not(.para-num-footnote)');
    for(var i = 0; i < badges.length; i++){
      var b = badges[i], nx = b.nextElementSibling;
      if(nx && nx.classList && nx.classList.contains('pk-box')) continue;
      var pid = b.getAttribute('data-pid');
      var btn = el('button', { type: 'button', 'class': 'pk-box', translate: 'no', role: 'checkbox', 'aria-checked': 'false', 'aria-label': 'تحديد الفقرة ' + pid, 'data-pid': pid, 'data-bid': book.id });
      if(byKey[book.id + '|' + pid]){ btn.classList.add('on'); btn.setAttribute('aria-checked', 'true'); }
      b.parentNode.insertBefore(btn, b.nextSibling);
    }
  }

  function toggleText(btn){
    var bid = btn.getAttribute('data-bid'), pid = btn.getAttribute('data-pid'), key = bid + '|' + pid;
    if(byKey[key]){ removeKey(key); afterChange(); return; }
    var book = bookById(bid); if(!book) return;
    var badge = btn.previousElementSibling;
    var it = makeItem(book, Number(pid), null, badge ? domParaText(badge) : '');
    if(!it){ say('تعذّر قراءة نص هذه الفقرة'); return; }
    it.key = key; // نفس المفتاح مهما كان مصدر الإضافة
    addItem(it); afterChange();
  }

  /* ---------- مربّعات نتائج البحث ---------- */
  var RES_SEL = '#sp-res .sr, #theme-res .sr, #adv-results .adv-hit, #cmp-sem-results .cmp-hit, #cmp-results .cmp-hit';
  function decorateResults(){
    var list = document.querySelectorAll(RES_SEL);
    for(var i = 0; i < list.length; i++){
      var r = list[i];
      if(r.firstElementChild && r.firstElementChild.classList.contains('pk-box')) continue;
      r.classList.add('pk-has');
      var btn = el('button', { type: 'button', 'class': 'pk-box pk-r', translate: 'no', role: 'checkbox', 'aria-checked': 'false', 'aria-label': 'تحديد هذه النتيجة للنسخ' });
      if(r._pkKey && byKey[r._pkKey]){ btn.classList.add('on'); btn.setAttribute('aria-checked', 'true'); }
      r.insertBefore(btn, r.firstChild);
    }
  }

  /* يستخلص {book,pos,fallback} من عنصر نتيجة */
  function resolveResult(r){
    var book = null, pos = null, fb = '';
    var snipEl = r.querySelector('.sr-snip, .adv-hit-snippet, .cmp-hit-text');
    fb = snipEl ? snipEl.textContent : r.textContent;
    fb = fb.replace(/^\s*…|…\s*$/g, '').trim();
    if(r.classList.contains('sr')){
      var cap = null, oj = window.jumpToGlobalHit, oc = window.closePanel;
      window.jumpToGlobalHit = function(h){ cap = h; };
      window.closePanel = function(){};
      try{ if(typeof r.onclick === 'function') r.onclick(); }catch(e){}
      window.jumpToGlobalHit = oj; window.closePanel = oc;
      if(cap){ book = bookById(cap.bookId); if(typeof cap.pos === 'number') pos = cap.pos; }
    } else if(r.classList.contains('adv-hit')){
      var m = /jumpToAdvancedHit\((\d+),(\d+),(\d+)\)/.exec(r.getAttribute('onclick') || '');
      if(m){ book = library[+m[1]] || null; pos = +m[2]; }
    } else if(r.classList.contains('cmp-hit')){
      var m2 = /showBook\((\d+)\)/.exec(r.getAttribute('onclick') || '');
      if(m2){
        book = library[+m2[1]] || null;
        if(book){ var probe = fb.replace(/\s+/g, ' ').slice(0, 50), i = (book.content || '').indexOf(fb.slice(0, 50)); if(i >= 0) pos = i; else if(probe) pos = null; }
      } else if(r.closest && r.closest('#cmp-results')){
        var aSel = $('cmp-book1'), bSel = $('cmp-book2');
        var first = aSel && library[+aSel.value], second = bSel && library[+bSel.value];
        var passages = Array.prototype.map.call(r.querySelectorAll('.cmp-hit-text'), function(node){ return node.textContent.trim(); }).filter(Boolean);
        if(first && second && passages.length){
          var resultIndex = Array.prototype.indexOf.call(r.parentNode.querySelectorAll('.cmp-hit'), r);
          var combined = 'مقارنة نصية بين «' + (first.title || '') + '» و«' + (second.title || '') + '»\n\n' + passages.join('\n\n');
          var compared = makeItem(first, null, null, combined);
          if(compared){
            compared.bookTitle = 'مقارنة: ' + (first.title || 'الكتاب الأول') + ' × ' + (second.title || 'الكتاب الثاني');
            compared.key = first.id + '|cmp|' + second.id + '|' + resultIndex + '|' + compared.text.slice(-80);
            return compared;
          }
        }
      }
    }
    if(!book) return null;
    var pid = null;
    if(typeof pos === 'number' && window.ReaderLocate){ var info = window.ReaderLocate.at(book, pos); pid = info && info.pid != null ? info.pid : null; }
    return makeItem(book, pid, pos, fb);
  }

  function toggleResult(btn){
    var r = btn.parentNode;
    if(r._pkKey && byKey[r._pkKey]){ removeKey(r._pkKey); afterChange(); return; }
    var it = resolveResult(r);
    if(!it){ say('تعذّر تحديد موضع هذه النتيجة في الكتاب'); return; }
    r._pkKey = it.key;
    if(byKey[it.key]){ afterChange(); return; } // الفقرة نفسها مختارة أصلاً
    addItem(it); afterChange();
  }

  function syncBoxes(){
    var boxes = document.querySelectorAll('.pk-box');
    for(var i = 0; i < boxes.length; i++){
      var b = boxes[i], key = b.classList.contains('pk-r') ? (b.parentNode && b.parentNode._pkKey) : (b.getAttribute('data-bid') + '|' + b.getAttribute('data-pid'));
      var on = !!(key && byKey[key]);
      if(b.classList.contains('on') !== on){ b.classList.toggle('on', on); b.setAttribute('aria-checked', on ? 'true' : 'false'); }
    }
  }

  /* ---------- بناء النص المُرسَل ---------- */
  function sortedItems(){
    var order = {};
    try{ library.forEach(function(b, i){ order[b.id] = i; }); }catch(e){}
    return items.slice().sort(function(a, b){
      var x = order[a.bookId], y = order[b.bookId]; x = x == null ? 1e6 : x; y = y == null ? 1e6 : y;
      return (x - y) || ((a.pid || 0) - (b.pid || 0));
    });
  }
  function label(it, n){
    return '[' + n + '] ' + [it.reader && it.reader !== it.bookTitle ? it.reader : '', it.bookTitle].filter(Boolean).join(' › ') +
      (it.pid != null ? ' — فقرة ' + it.pid : '') + (it.page ? ' — ص ~' + it.page : '') + (it.sec ? ' — ' + clip(it.sec, 60) : '');
  }
  function question(){ var q = $('pk-q'); return oneLine(q ? q.value : lsGet(KEY_Q)) || DEFAULT_Q; }
  function buildPrompt(maxChars){
    maxChars = maxChars || MAX_PACK;
    var list = sortedItems();
    var head = '# سؤالي\n' + question().slice(0, 800) + '\n\n# الفقرات التي حدّدتها (' + list.length + ')\n';
    var tail = '\n\n# تعليمات\nأجب عن سؤالي اعتماداً على الفقرات أعلاه. أرقام [..] هي أرقام الفقرات في قائمتي فاذكرها عند الإشارة. وعند الحاجة استعن بمصادر موثقة ولا تخترع مراجع. أجب بالعربية مع إبقاء المصطلحات الفنية بين قوسين.';
    var room = maxChars - head.length - tail.length, body = [], used = 0, omitted = 0;
    list.forEach(function(it, i){
      var b = label(it, i + 1) + '\n«' + it.text + '»';
      if(used + b.length + 2 > room && body.length){ omitted++; return; }
      body.push(b); used += b.length + 2;
    });
    return head + body.join('\n\n') + (omitted ? '\n\n(… ' + omitted + ' فقرة لم تُدرج لطول النص؛ قلّل المحدد.)' : '') + tail;
  }
  function buildDeep(platform){
    var q = question().slice(0, 300), list = sortedItems(), raw = 800;
    for(var t = 0; t < 6; t++){
      var parts = [q], used = q.length;
      for(var i = 0; i < list.length; i++){
        var b = '[' + (i + 1) + '] ' + (list[i].bookTitle ? list[i].bookTitle + ': ' : '') + clip(list[i].text, 260);
        if(used + b.length > raw && i > 0) break;
        parts.push(b); used += b.length;
      }
      var url = platform.deep + encodeURIComponent(parts.join('\n') + '\nأجب بالعربية.');
      if(url.length <= MAX_URL) return url;
      raw = Math.floor(raw / 2);
    }
    return null;
  }

  /* ---------- نسخ ومشاركة ---------- */
  function copySync(text){
    var ok = false;
    try{
      var ta = document.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
      document.body.appendChild(ta); ta.focus(); ta.select();
      try{ ta.setSelectionRange(0, text.length); }catch(e){}
      ok = document.execCommand('copy'); ta.remove();
    }catch(e){}
    if(!ok && navigator.clipboard && navigator.clipboard.writeText){ try{ navigator.clipboard.writeText(text); ok = true; }catch(e){} }
    try{
      if(window.ReaderCopyContext && typeof window.ReaderCopyContext.remember === 'function') window.ReaderCopyContext.remember(text);
      else window.dispatchEvent(new CustomEvent('reader:copy', { detail: { text: text, source: 'reader-pick' } }));
    }catch(e){}
    return ok;
  }
  function needItems(){ if(!items.length){ say('حدّد فقرة واحدة على الأقل أولاً'); return false; } return true; }

  /* ينسخ ثم يفتح مشاركة الهاتف في الضغطة نفسها */
  function copyAndShare(){
    if(!needItems()) return;
    var text = buildPrompt(), n = items.length, copied = copySync(text);
    if(typeof navigator.share !== 'function'){ say(copied ? '✓ نُسخت ' + n + ' فقرة — الصقها في Claude.ai' : 'تعذّر النسخ التلقائي'); return; }
    try{
      navigator.share({ title: 'مقتطفات من «القراء العشرة»', text: text }).then(function(){
        say('✓ نُسخت ' + n + ' فقرة وعادت المشاركة');
      }, function(e){
        say(e && e.name === 'AbortError' ? (copied ? '✓ نُسخت ' + n + ' فقرة (أُلغيت المشاركة)' : 'أُلغيت المشاركة') : (copied ? '✓ نُسخ النص — الصقه في Claude.ai' : 'تعذّرت المشاركة'));
      });
    }catch(e){ say(copied ? '✓ نُسخ النص — الصقه في Claude.ai' : 'تعذّرت المشاركة'); }
  }
  function launch(p){
    if(!needItems()) return;
    var full = buildPrompt(), copied = copySync(full), target = p.url, pre = false;
    if(p.deep){ var d = buildDeep(p); if(d){ target = d; pre = true; } }
    var w = null;
    try{ w = window.open(target, '_blank'); }catch(e){}
    if(w){ try{ w.opener = null; }catch(e){} }
    if(!w){ say((copied ? 'نُسخت الفقرات. ' : '') + 'حظر المتصفح فتح ' + p.name + ' تلقائياً؛ اسمح بالنوافذ المنبثقة لهذا الموقع ثم اضغط الزر مرة أخرى.'); return; }
    say(pre ? '✓ فُتحت ' + p.name + ' وسؤالك جاهز (نسخة مختصرة)، والكاملة منسوخة' : (copied ? '✓ نُسخت الفقرات — الصقها في ' + p.name : 'تعذّر النسخ تلقائياً'));
  }

  /* ---------- الشريط العائم ---------- */
  var bar = null, sheet = null;
  function buildBar(){
    if(bar) return;
    var n = el('span', { 'class': 'pk-n', id: 'pk-n', text: '✓ 0' });
    bar = el('div', { id: 'pk-bar', translate: 'no', dir: 'rtl' }, [
      n,
      el('button', { type: 'button', 'class': 'pk-b pk-go', text: '📋 نسخ لـ Claude', onclick: copyAndShare }),
      el('button', { type: 'button', 'class': 'pk-b', text: '👁 مراجعة', onclick: openSheet }),
      el('button', { type: 'button', 'class': 'pk-b', text: '✕', 'aria-label': 'مسح التحديد', onclick: function(){ if(items.length && confirm('مسح كل الفقرات المختارة (' + items.length + ')؟')){ items = []; byKey = Object.create(null); afterChange(); } } })
    ]);
    document.body.appendChild(bar);
  }
  function updateBar(){
    buildBar();
    var n = items.length;
    $('pk-n').textContent = '✓ ' + n;
    bar.classList.toggle('show', n > 0);
  }

  /* ---------- نافذة المراجعة ---------- */
  function openSheet(){ buildSheet(); renderSheet(); sheet.classList.add('show'); }
  function closeSheet(){ if(sheet) sheet.classList.remove('show'); }
  function buildSheet(){
    if(sheet) return;
    var q = el('textarea', { id: 'pk-q', rows: '3', maxlength: '800', placeholder: 'سؤالك البحثي (اختياري) — مثال: ما معنى هذه الفقرات وما أدلتها؟' });
    q.value = lsGet(KEY_Q) || '';
    q.addEventListener('input', function(){ lsSet(KEY_Q, q.value); });
    var chips = el('div', { 'class': 'pk-chips' }, PRESETS.map(function(p){ return el('button', { type: 'button', text: p[0], onclick: function(){ q.value = p[1]; lsSet(KEY_Q, q.value); } }); }));
    var plats = el('div', { 'class': 'pk-plat' }, PLAT.map(function(p){ return el('button', { type: 'button', text: p.name + ' ↗', onclick: function(){ launch(p); } }); }));
    var box = el('div', { 'class': 'pk-box-sheet' }, [
      el('div', { 'class': 'pk-hd' }, [
        el('b', { id: 'pk-ttl', text: 'الفقرات المختارة' }),
        el('button', { type: 'button', 'class': 'pk-b', text: '✕', 'aria-label': 'إغلاق', onclick: closeSheet })
      ]),
      el('div', { id: 'pk-list' }),
      el('div', { 'class': 'pk-h', text: 'سؤالك' }), q, chips,
      el('div', { 'class': 'pk-acts' }, [
        el('button', { type: 'button', 'class': 'pk-b pk-go', text: '📋 نسخ لـ Claude + مشاركة', onclick: copyAndShare })
      ]),
      el('div', { 'class': 'pk-h', text: 'إرسال إلى منصة (تُنسخ الفقرات ثم تُفتح المنصة)' }), plats
    ]);
    sheet = el('div', { id: 'pk-sheet', translate: 'no', dir: 'rtl', onclick: function(e){ if(e.target === sheet) closeSheet(); } }, [box]);
    document.body.appendChild(sheet);
  }
  function renderSheet(){
    var list = $('pk-list'), srt = sortedItems();
    $('pk-ttl').textContent = 'الفقرات المختارة (' + srt.length + ')';
    list.textContent = '';
    if(!srt.length){ list.appendChild(el('div', { 'class': 'pk-empty', text: 'لا توجد فقرات مختارة. اضغط المربّع ☐ بجوار رقم أي فقرة أو نتيجة بحث.' })); return; }
    srt.forEach(function(it, i){
      list.appendChild(el('div', { 'class': 'pk-row' }, [
        el('div', { 'class': 'pk-rm' }, [
          el('div', { 'class': 'pk-rl', text: label(it, i + 1) }),
          el('div', { 'class': 'pk-rt', text: clip(it.text, 200) })
        ]),
        el('button', { type: 'button', 'class': 'pk-b', text: '✕', 'aria-label': 'إزالة', onclick: function(){ removeKey(it.key); afterChange(); } })
      ]));
    });
  }

  /* ---------- التنسيق ---------- */
  function injectCss(){
    if($('pk-css')) return;
    var st = el('style', { id: 'pk-css' });
    st.textContent = [
      '.pk-box{display:inline-block;vertical-align:middle;position:relative;width:26px;height:26px;min-width:26px;margin:0 4px;padding:0;border:2px solid var(--gold,#c9a84c);border-radius:6px;background:transparent;cursor:pointer;font-size:0;line-height:0;box-sizing:border-box;touch-action:manipulation;-webkit-tap-highlight-color:transparent;user-select:none;-webkit-user-select:none}',
      '.pk-box::before{content:"";position:absolute;inset:-9px}',
      '.pk-box::after{content:"✓";position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font:700 19px/1 sans-serif;color:#fff;opacity:0}',
      '.pk-box.on{background:#2e9e5b;border-color:#2e9e5b}.pk-box.on::after{opacity:1}',
      '.para-num:has(+ .pk-box.on){outline:2px solid #2e9e5b;outline-offset:1px}',
      '.pk-has{position:relative;padding-inline-start:46px!important}',
      '.pk-box.pk-r{position:absolute;inset-inline-start:8px;top:9px;margin:0}',
      '#pk-bar{display:none;position:fixed;right:10px;bottom:calc(76px + env(safe-area-inset-bottom,0px));max-width:calc(100vw - 84px);z-index:260;align-items:center;gap:6px;padding:6px 8px;background:var(--bg2,#1a2236);border:1.5px solid #2e9e5b;border-radius:26px;box-shadow:0 4px 18px rgba(0,0,0,.55);font-family:sans-serif}',
      '#pk-bar.show{display:flex}',
      'body:has(#pk-sheet.show) #page-pill,body:has(#pk-sheet.show) #find-nav-pill,body:has(#pk-sheet.show) #pk-bar{display:none!important}',
      'body:has(#find-nav-pill.show) #pk-bar{bottom:calc(170px + env(safe-area-inset-bottom,0px))}',
      '#pk-bar .pk-n{color:#fff;background:#2e9e5b;border-radius:16px;padding:6px 11px;font-weight:700;font-size:15px;white-space:nowrap}',
      '.pk-b{min-height:44px;min-width:44px;padding:6px 12px;border:1px solid var(--border,#34415e);border-radius:22px;background:var(--bg3,#222c44);color:var(--text,#e6e9f0);font:600 14px sans-serif;cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent;white-space:nowrap}',
      '.pk-b.pk-go{background:#2e9e5b;border-color:#2e9e5b;color:#fff}',
      '#pk-sheet{display:none;position:fixed;inset:0;z-index:300;background:rgba(0,0,0,.6);align-items:flex-end;justify-content:center;font-family:sans-serif}',
      '#pk-sheet.show{display:flex}',
      '.pk-box-sheet{width:min(560px,100vw);max-height:90vh;overflow:auto;background:var(--bg2,#1a2236);color:var(--text,#e6e9f0);border:1px solid var(--border,#34415e);border-radius:16px 16px 0 0;padding:12px 14px calc(16px + env(safe-area-inset-bottom,0px))}',
      '.pk-hd{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px;font-size:17px;color:var(--gold,#c9a84c)}',
      '.pk-row{display:flex;gap:8px;align-items:flex-start;padding:9px 0;border-bottom:1px solid var(--border,#34415e)}',
      '.pk-rm{flex:1;min-width:0}.pk-rl{font-size:13.5px;color:var(--gold,#c9a84c);font-weight:700;margin-bottom:3px;overflow-wrap:anywhere}',
      '.pk-rt{font-size:14px;line-height:1.7;color:var(--text2,#aab3c8);unicode-bidi:plaintext;overflow-wrap:anywhere}',
      '.pk-empty{padding:18px 4px;color:var(--text2,#aab3c8);font-size:14px;line-height:1.8}',
      '.pk-h{margin:14px 0 6px;font-size:14px;font-weight:700;color:var(--gold,#c9a84c)}',
      '#pk-q{width:100%;box-sizing:border-box;min-height:80px;padding:9px 10px;border:1px solid var(--border,#34415e);border-radius:10px;background:var(--bg3,#222c44);color:var(--text,#e6e9f0);font:15px/1.7 sans-serif;resize:vertical}',
      '.pk-chips{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0}.pk-chips button{min-height:38px;padding:4px 12px;border:1px solid var(--border,#34415e);border-radius:18px;background:var(--bg3,#222c44);color:var(--text,#e6e9f0);font:13px sans-serif}',
      '.pk-acts{display:flex;flex-wrap:wrap;gap:8px;margin-top:6px}.pk-acts .pk-b{flex:1 1 140px}',
      '.pk-plat{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:7px}.pk-plat button{min-height:44px;border:1px solid var(--border,#34415e);border-radius:11px;background:var(--bg3,#222c44);color:var(--blue,#6a8fc4);font:700 14px sans-serif}'
    ].join('\n');
    document.head.appendChild(st);
  }

  /* ---------- «نسخ لـ Claude.ai» القديمة تفتح مشاركة الهاتف أيضاً ---------- */
  function patchCopy(){
    if(typeof window.copyToClipboard !== 'function' || window.copyToClipboard.__pk) return;
    var orig = window.copyToClipboard;
    var wrapped = function(text, msg, ta){
      var r = orig.apply(this, arguments);
      try{
        if(window.ReaderCopyContext && typeof window.ReaderCopyContext.remember === 'function') window.ReaderCopyContext.remember(text);
        else window.dispatchEvent(new CustomEvent('reader:copy', { detail: { text: String(text), source: 'reader-copy-button' } }));
        if(/Claude|ChatGPT|Gemini|Grok|Perplexity|Consensus|الصق/i.test(String(msg || '')) && typeof navigator.share === 'function')
          navigator.share({ title: '«القراء العشرة»', text: String(text) }).catch(function(){});
      }catch(e){}
      return r;
    };
    wrapped.__pk = 1;
    window.copyToClipboard = wrapped;
  }

  /* ---------- التشغيل ---------- */
  var raf = 0;
  function schedule(){ if(raf) return; raf = requestAnimationFrame(function(){ raf = 0; decorateText(); decorateResults(); }); }

  /* بعض أنواع البحث ترسم النتائج لاحقاً أو تعيد محتوى الحاوية الموجودة؛ نطلب
     إعادة تزيين مباشرة بعد دوال الرسم، ولا نعتمد على MutationObserver وحده. */
  function hookSearchRenderers(){
    ['renderSP', 'doThemeSearch', 'runAdvancedSearch', 'runCompareSemantic', 'runBookCompare'].forEach(function(name){
      var original = window[name];
      if(typeof original !== 'function' || original.__pkDecorate) return;
      var wrapped = function(){
        var result = original.apply(this, arguments);
        schedule();
        setTimeout(schedule, 80); // يغطي النتائج غير المتزامنة التي تُرسم بعد الدالة
        return result;
      };
      wrapped.__pkDecorate = true;
      window[name] = wrapped;
    });
  }

  function install(){
    injectCss(); restore(); buildBar(); updateBar(); patchCopy(); hookSearchRenderers();
    // نقرة المربّعات: التقاط مبكر كي لا تُبدّل وضع ملء الشاشة ولا تنتقل النتيجة
    document.addEventListener('click', function(e){
      var b = e.target && e.target.closest ? e.target.closest('.pk-box') : null;
      if(!b) return;
      e.preventDefault(); e.stopPropagation();
      if(b.classList.contains('pk-r')) toggleResult(b); else toggleText(b);
    }, true);
    // نراقب الصفحة كلها (حاوية النص قد تُستبدل عند فتح كتاب)، ونُعيد الرسم فقط إذا أُضيفت شارات فقرات أو نتائج بحث
    var HIT = /(^|\s)(para-num|sr|adv-hit|cmp-hit)(\s|$)/;
    new MutationObserver(function(recs){
      for(var i = 0; i < recs.length; i++){
        var add = recs[i].addedNodes;
        for(var j = 0; j < add.length; j++){
          var n = add[j];
          if(n.nodeType !== 1) continue;
          if(HIT.test(n.className || '') || (n.querySelector && n.querySelector('.para-num,.sr,.adv-hit,.cmp-hit'))){ schedule(); return; }
        }
      }
    }).observe(document.body, { childList: true, subtree: true });
    schedule();
    window.ReaderPick = { items: function(){ return items.slice(); }, prompt: buildPrompt, refresh: schedule };
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
  else install();
})();
