/* reader-fixes.js v2 — تعديلات مشتركة على القارئات العشرة (تُحمَّل بعد كل سكربتات الصفحة).
   1) لوحة 🧠 التحليل العميق: قائمة أعلام أنظف (بلا كلمات بداية الجمل ولا "But Moses")،
      عدّ غير حسّاس لحالة الأحرف، دعم الحروف اللاتينية المشكّلة واليونانية،
      وزر النسخ يأخذ الفقرة الظاهرة أمامك (لا أول الكتاب) ما لم يكن هناك نص محدد.
   2) شارة رقم الصفحة: «الحالي / الإجمالي» بدل «الإجمالي / الحالي».
   3) (v2) كل علَم/كيان في اللوحة صار زراً تفاعلياً: الضغط عليه يفتح قائمة بكل مواضعه في الكتاب
      (رقم الفقرة + الصفحة التقريبية + القسم + مقتطف من السياق)، والضغط على أي موضع ينتقل إليه
      ويظلّله بنفس آلية البحث العام (jumpToGlobalHit)، فيمكن بعدها التنقل بين بقية المواضع بأزرار ▲▼.
   تُعيد تعريف renderAI وupdatePagePill بعد تحميل الصفحة، دون المساس بباقي الكود. */
(function(){
  'use strict';

  /* ---------- الأعلام ---------- */
  var STOP = new Set(('the and but now when then after before upon with from this that they for his her its our their was were '+
    'book chapter amen so as we he she it you i in on at by of to a an because who what where how why which while '+
    'accordingly again let since moreover therefore however thus yet also indeed if or nor not no yes there here these those '+
    'such some all any each every both either neither other another one two three first second third next last '+
    'for hence whence whereas although though unless until whether without within through against among between '+
    'wherefore furthermore besides further likewise similarly otherwise nevertheless nay lo behold').split(' '));

  var TOP_N = 12;      // عدد الأعلام المعروضة
  var PAGE_ROWS = 40;  // عدد المواضع المعروضة دفعة واحدة في القائمة
  var cache = new Map(); // bookId|length -> {top:[[name,count],...], occ:{name:[[start,end],...]}}

  function atSentenceStart(t, i){
    var j = i - 1;
    while(j >= 0 && /[ \t"'“‘(\[«]/.test(t[j])) j--;
    return j < 0 || /[.!?\n:]/.test(t[j]);
  }

  /* يعدّ الأعلام ويسجّل موضع كل ورود (بداية/نهاية داخل book.content) في مرور واحد؛
     بعد الفرز نُبقي مواضع الأعلام العليا فقط ونُسقط الباقي لتوفير الذاكرة. */
  function computeEntities(text){
    var lower = null;
    function lowerSet(){
      if(!lower){
        lower = new Set();
        var toks = text.match(/\p{Ll}[\p{Ll}\p{M}'ʿʾ]*/gu) || [];
        for(var k = 0; k < toks.length; k++) lower.add(toks[k]);
      }
      return lower;
    }
    var re = /\p{Lu}[\p{Ll}\p{M}'ʿʾ]{2,}(?:[ \t]+\p{Lu}[\p{Ll}\p{M}'ʿʾ]+)*/gu;
    var ids = Object.create(null), names = [], cnt = [], mId = [], mS = [], mE = [], m;
    while((m = re.exec(text)) !== null){
      var raw = m[0], words = raw.split(/[ \t]+/);
      var start = atSentenceStart(text, m.index);
      var off = 0; // موضع أول كلمة مُبقاة داخل raw
      // أسقط الكلمة الأولى إن كانت أداة/كلمة عادية (بداية جملة أو من قائمة الاستبعاد)
      while(words.length){
        var w = words[0], lw = w.toLowerCase();
        if(STOP.has(lw) || (start && lowerSet().has(lw))){
          words.shift(); start = false;
          off = raw.indexOf(w, off) + w.length;
          while(off < raw.length && (raw[off] === ' ' || raw[off] === '\t')) off++;
        } else break;
      }
      if(!words.length) continue;
      var name = words.join(' ');
      if(name.length < 3) continue;
      var id = ids[name];
      if(id === undefined){ id = names.length; ids[name] = id; names.push(name); cnt.push(0); }
      cnt[id]++;
      mId.push(id); mS.push(m.index + off); mE.push(m.index + raw.length);
    }
    // نُبقي الأسماء كما وردت بحرف كبير فقط (الكلمات العادية تدخل مرة واحدة كاسم علم لا كمفهوم)
    var order = names.map(function(n, i){ return i; })
      .sort(function(x, y){ return (cnt[y] - cnt[x]) || (x - y); }).slice(0, TOP_N);
    var want = Object.create(null);
    order.forEach(function(id){ want[id] = []; });
    for(var k = 0; k < mId.length; k++){
      var arr = want[mId[k]];
      if(arr) arr.push([mS[k], mE[k]]);
    }
    var top = [], occ = Object.create(null);
    order.forEach(function(id){ top.push([names[id], cnt[id]]); occ[names[id]] = want[id]; });
    return { top: top, occ: occ };
  }

  function entityDataForBook(book){
    var key = (book.id || '') + '|' + (book.content || '').length;
    var r = cache.get(key);
    if(!r){ r = computeEntities(book.content || ''); cache.set(key, r); }
    return r;
  }

  /* ---------- محدّد الموضع: إزاحة في book.content ← رقم الفقرة + القسم ---------- */
  var locCache = new Map();

  function ub(arr, x){ // عدد العناصر التي قيمتها <= x (مصفوفة مرتبة تصاعدياً)
    var lo = 0, hi = arr.length;
    while(lo < hi){ var mid = (lo + hi) >> 1; if(arr[mid] <= x) lo = mid + 1; else hi = mid; }
    return lo;
  }

  function buildLocator(book){
    var content = book.content || '';
    var L = {};
    try{
      var secs = (typeof extractSections === 'function') ? extractSections(content) : [];
      if(secs.length && typeof paragraphStartLines === 'function'){
        // كتاب بأقسام ====العنوان====: الفقرات بوحدة السطر (نفس منطق renderBookWithTOC)
        var lines = content.split('\n'), starts = paragraphStartLines(lines, secs);
        var lineOff = new Array(lines.length), o = 0, i;
        for(i = 0; i < lines.length; i++){ lineOff[i] = o; o += lines[i].length + 1; }
        var secLines = secs.map(function(s){ return s.lineIdx; });
        var hdr = new Set();
        secs.forEach(function(s){ hdr.add(s.lineIdx); hdr.add(s.lineIdx + 1); hdr.add(s.lineIdx + 2); });
        L.at = function(pos){
          var li = Math.max(0, ub(lineOff, pos) - 1);
          var si = ub(secLines, li) - 1;
          var isHdr = hdr.has(li);
          return { pid: isHdr ? null : Math.max(1, ub(starts, li)), sec: si >= 0 ? secs[si].title : '', hdr: isHdr };
        };
        return L;
      }
      if(typeof getPageMap === 'function' && typeof splitParagraphOffsets === 'function'){
        // كتاب مسطّح: الفقرات على displayContent (النص بعد إزالة علامات الصفحات)
        var map = getPageMap(book), disp = map.displayContent || content;
        var offs = splitParagraphOffsets(disp), items = [];
        if(disp !== content){
          if(map.mode === 'inline' && typeof detectInlinePageMarkers === 'function') items = detectInlinePageMarkers(content);
          else if(map.mode === 'isolated' && typeof detectIsolatedPageMarkers === 'function') items = detectIsolatedPageMarkers(content);
          items.sort(function(a, b){ return a.start - b.start; });
        }
        var ends = [], cum = [], rem = 0;
        items.forEach(function(it){ ends.push(it.end); rem += it.end - it.start; cum.push(rem); });
        L.at = function(pos){
          var k = ub(ends, pos);
          var d = pos - (k ? cum[k - 1] : 0);
          return { pid: Math.max(1, ub(offs, d)), sec: '', hdr: false };
        };
        return L;
      }
    }catch(e){}
    L.at = function(){ return { pid: null, sec: '', hdr: false }; };
    return L;
  }

  function locatorFor(book){
    var key = (book.id || '') + '|' + (book.content || '').length;
    var L = locCache.get(key);
    if(!L){ L = buildLocator(book); locCache.set(key, L); }
    return L;
  }

  /* ---------- مقتطف السياق ---------- */
  function contextParts(content, s, e){
    var a = Math.max(0, s - 70), b = Math.min(content.length, e + 90);
    var pre = content.slice(a, s), post = content.slice(e, b);
    if(a > 0){ var sp = pre.search(/\s/); if(sp >= 0 && sp < 25) pre = pre.slice(sp + 1); }
    if(b < content.length){ var lp = post.search(/\s\S*$/); if(lp > 40) post = post.slice(0, lp); }
    pre = pre.replace(/\s+/g, ' '); post = post.replace(/\s+/g, ' ');
    return { pre: (a > 0 ? '… ' : '') + pre, hit: content.slice(s, e).replace(/\s+/g, ' '), post: post + (b < content.length ? ' …' : '') };
  }

  /* ---------- الانتقال إلى موضع ---------- */
  var LETTERS = 'A-Za-z\\u00C0-\\u024F\\u0300-\\u036F\\u0370-\\u03FF\\u0400-\\u04FF\\u1E00-\\u1EFF\\u1F00-\\u1FFF';
  function escRe(s){ return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  /* نمط يطابق الاسم ككلمة كاملة (لا داخل كلمة أطول كـ Roman داخل Romans) */
  function wordSrc(name){
    return '(?<![' + LETTERS + '])' + name.split(/[ \t]+/).map(escRe).join('[ \\t]+') + '(?![' + LETTERS + '])';
  }

  function goToOccurrence(book, name, o){
    try{ if(typeof closePanel === 'function') closePanel('aip'); }catch(e){}
    var hit = { bookId: book.id, pos: o[0], len: o[1] - o[0] };
    try{
      jumpToGlobalHit(hit, name, false, wordSrc(name));
    }catch(e){
      // احتياط: بيئة لا تدعم lookbehind أو خطأ في النمط ← بحث حرفي عادي بنفس الاسم
      try{ jumpToGlobalHit(hit, name); }catch(e2){}
    }
  }

  /* ---------- قائمة مواضع علَم واحد ---------- */
  function renderOccurrences(box, book, name, list){
    box.innerHTML = '';
    box.className = 'ent-occ';
    var content = book.content || '';
    var loc = locatorFor(book);

    var head = document.createElement('div'); head.className = 'ent-oh';
    var ttl = document.createElement('span'); ttl.className = 'ent-ot';
    var nm = document.createElement('b'); nm.setAttribute('translate', 'no'); nm.textContent = name;
    ttl.appendChild(nm);
    ttl.appendChild(document.createTextNode(' — ' + list.length + ' موضعاً (اضغط موضعاً للانتقال إليه)'));
    var x = document.createElement('button'); x.type = 'button'; x.className = 'ent-ox'; x.textContent = '✕';
    x.setAttribute('aria-label', 'إغلاق القائمة');
    x.onclick = function(){ closeOccurrences(); };
    head.appendChild(ttl); head.appendChild(x);
    box.appendChild(head);

    var rowsBox = document.createElement('div'); rowsBox.className = 'ent-rows';
    box.appendChild(rowsBox);
    var moreBtn = null, shown = 0;

    function addRows(){
      var end = Math.min(list.length, shown + PAGE_ROWS);
      for(var i = shown; i < end; i++){
        (function(i){
          var o = list[i], info = loc.at(o[0]);
          var row = document.createElement('div'); row.className = 'ent-row';
          row.setAttribute('role', 'button'); row.tabIndex = 0;

          var meta = document.createElement('div'); meta.className = 'ent-meta';
          var no = document.createElement('span'); no.className = 'ent-no'; no.textContent = String(i + 1);
          meta.appendChild(no);
          var where = [];
          if(info.pid != null) where.push('فقرة ' + info.pid);
          else if(info.hdr) where.push('في عنوان القسم');
          try{
            if(typeof getPageForOffset === 'function'){
              var pg = getPageForOffset(book, o[0]);
              if(pg) where.push('ص ~' + pg);
            }
          }catch(e){}
          if(where.length){
            var w = document.createElement('span'); w.className = 'ent-loc'; w.textContent = where.join(' · ');
            meta.appendChild(w);
          }
          if(info.sec){
            var sc = document.createElement('span'); sc.className = 'ent-sec'; sc.textContent = info.sec;
            meta.appendChild(sc);
          }
          row.appendChild(meta);

          var cx = contextParts(content, o[0], o[1]);
          var ctx = document.createElement('div'); ctx.className = 'ent-ctx'; ctx.setAttribute('dir', 'ltr');
          ctx.appendChild(document.createTextNode(cx.pre));
          var mk = document.createElement('mark'); mk.textContent = cx.hit; ctx.appendChild(mk);
          ctx.appendChild(document.createTextNode(cx.post));
          row.appendChild(ctx);

          var act = function(ev){ if(ev) ev.preventDefault(); goToOccurrence(book, name, o); };
          row.onclick = act;
          row.onkeydown = function(ev){ if(ev.key === 'Enter' || ev.key === ' ') act(ev); };
          rowsBox.appendChild(row);
        })(i);
      }
      shown = end;
      if(shown < list.length){
        if(!moreBtn){
          moreBtn = document.createElement('button'); moreBtn.type = 'button'; moreBtn.className = 'ent-more';
          moreBtn.onclick = addRows;
        }
        moreBtn.textContent = '⬇ عرض المزيد (' + (list.length - shown) + ' موضعاً متبقياً)';
        box.appendChild(moreBtn); // نقله لآخر القائمة
      } else if(moreBtn && moreBtn.parentNode){
        moreBtn.parentNode.removeChild(moreBtn);
      }
    }
    addRows();
  }

  function closeOccurrences(){
    var box = document.getElementById('ent-occ');
    if(box){ box.innerHTML = ''; box.className = 'ent-occ ent-empty'; }
    var btns = document.querySelectorAll('#ent-tags .ent-btn.on');
    for(var i = 0; i < btns.length; i++){ btns[i].classList.remove('on'); btns[i].setAttribute('aria-expanded', 'false'); }
  }

  /* ---------- الفقرة الظاهرة ---------- */
  function visiblePassage(maxLen){
    try{
      var container = document.getElementById('bookText');
      var pid = getFirstVisibleParagraphPid();
      if(!container || pid == null) return null;
      var badge = container.querySelector('.para-num[data-pid="' + pid + '"]');
      if(!badge) return null;
      var walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null);
      walker.currentNode = badge;
      var out = '', n;
      while((n = walker.nextNode())){
        var p = n.parentNode;
        if(p && p.closest && p.closest('.para-num')) continue;
        out += n.nodeValue;
        if(out.length >= maxLen) break;
      }
      out = out.replace(/[ \t]+\n/g, '\n').trim();
      return out ? { pid: pid, text: out.slice(0, maxLen) } : null;
    }catch(e){ return null; }
  }

  /* ---------- تنسيق الأزرار والقائمة ---------- */
  function injectCss(){
    if(document.getElementById('rf-ent-css')) return;
    var st = document.createElement('style'); st.id = 'rf-ent-css';
    st.textContent = [
      '#aip .ent-hint{font-size:14px;color:var(--text2);font-family:sans-serif;line-height:1.7;margin:0 0 10px}',
      '#aip .ent-btn{cursor:pointer;-webkit-tap-highlight-color:transparent;touch-action:manipulation;font-family:sans-serif;color:var(--blue)}',
      '#aip .ent-btn::after{content:" ▾";font-size:.8em;opacity:.7}',
      '#aip .ent-btn.on{background:rgba(106,143,196,.38)!important;border-color:var(--blue)!important;color:var(--text)}',
      '#aip .ent-btn.on::after{content:" ▴"}',
      '#aip #ent-occ.ent-occ{margin-top:12px;border:1px solid var(--border);border-radius:10px;background:var(--bg3);overflow:hidden}',
      '#aip #ent-occ.ent-empty{display:none}',
      '#aip #ent-occ .ent-oh{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid var(--border);font-family:sans-serif;font-size:15px;line-height:1.6;color:var(--gold)}',
      '#aip #ent-occ .ent-ot{flex:1;min-width:0}',
      '#aip #ent-occ .ent-ot b{color:var(--text)}',
      '#aip #ent-occ .ent-ox{flex-shrink:0;min-width:40px;min-height:40px;border:1px solid var(--border);border-radius:8px;background:var(--bg2);color:var(--text2);font-size:16px;cursor:pointer}',
      '#aip #ent-occ .ent-row{padding:12px;border-bottom:1px solid var(--border);cursor:pointer;font-family:sans-serif;-webkit-tap-highlight-color:transparent;touch-action:manipulation}',
      '#aip #ent-occ .ent-row:last-child{border-bottom:0}',
      '#aip #ent-occ .ent-row:hover,#aip #ent-occ .ent-row:active,#aip #ent-occ .ent-row:focus{background:rgba(106,143,196,.16);outline:none}',
      '#aip #ent-occ .ent-meta{display:flex;flex-wrap:wrap;align-items:center;gap:4px 10px;font-size:13.5px;color:var(--text2);margin-bottom:6px}',
      '#aip #ent-occ .ent-no{background:var(--accent);color:#fff;border-radius:10px;padding:1px 9px;font-size:13px}',
      '#aip #ent-occ .ent-loc{color:var(--gold);font-weight:bold}',
      '#aip #ent-occ .ent-sec{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '#aip #ent-occ .ent-ctx{font-size:15.5px;line-height:1.75;direction:ltr;text-align:left;unicode-bidi:plaintext;color:var(--text);font-family:Georgia,"Times New Roman",serif}',
      '#aip #ent-occ .ent-ctx mark{background:rgba(220,160,60,.55);color:inherit;border-radius:3px;padding:0 2px}',
      '#aip #ent-occ .ent-more{display:block;width:100%;padding:13px;border:0;border-top:1px solid var(--border);background:var(--bg2);color:var(--blue);font-family:sans-serif;font-size:15px;cursor:pointer}'
    ].join('\n');
    document.head.appendChild(st);
  }

  /* ---------- لوحة التحليل العميق ---------- */
  function renderAI2(selectedText){
    injectCss();
    var el = document.getElementById('ai-body'); el.innerHTML = '';
    if(cur < 0 && !selectedText){ el.innerHTML = '<div class="empty-panel">لا يوجد مصدر مفتوح</div>'; return; }
    var book = cur >= 0 ? library[cur] : null;
    var bTitle = book ? book.title : '';
    var text, where = '';
    if(selectedText){ text = selectedText; where = 'النص المحدد'; }
    else {
      var vp = visiblePassage(2000);
      if(vp){ text = vp.text; where = 'من الفقرة ' + vp.pid + ' (الظاهرة أمامك)'; }
      else { text = book ? book.content.slice(0, 3000) : ''; where = 'من بداية الكتاب'; }
    }
    var ent = book ? entityDataForBook(book) : { top: [], occ: {} };
    var top = ent.top;

    var snip = document.createElement('div'); snip.className = 'ai-snippet';
    snip.textContent = where + ': "' + text.slice(0, 200) + '…"';
    el.appendChild(snip);
    if(bTitle){
      var h = document.createElement('div');
      h.style.cssText = 'font-size:13px;color:var(--gold);font-family:sans-serif;margin-bottom:12px;font-weight:bold';
      h.textContent = bTitle; el.appendChild(h);
    }
    if(top.length){
      var sec = document.createElement('div'); sec.className = 'ai-section';
      sec.innerHTML = '<h4>الأعلام والكيانات الرئيسية (في الكتاب كله)</h4>' +
        '<div id="ent-wrap"><div class="ent-hint">اضغط على أي اسم لتظهر قائمة مواضعه في الكتاب، ثم اضغط على موضع للانتقال إليه.</div>' +
        '<div id="ent-tags"></div><div id="ent-occ" class="ent-occ ent-empty"></div></div>';
      el.appendChild(sec);
      var box = sec.querySelector('#ent-tags'), occBox = sec.querySelector('#ent-occ');
      top.forEach(function(p){
        var t = document.createElement('button'); t.type = 'button';
        t.className = 'ai-tag ent-tag ent-btn';
        t.setAttribute('aria-expanded', 'false');
        t.textContent = p[0] + ' ×' + p[1];
        t.onclick = function(){
          if(t.classList.contains('on')){ closeOccurrences(); return; }
          closeOccurrences();
          t.classList.add('on'); t.setAttribute('aria-expanded', 'true');
          renderOccurrences(occBox, book, p[0], ent.occ[p[0]] || []);
          try{ occBox.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }catch(e){}
        };
        box.appendChild(t);
      });
    }
    var aiSec = document.createElement('div'); aiSec.className = 'ai-section';
    aiSec.innerHTML = '<h4>تحليل متقدم بالذكاء الاصطناعي</h4>';
    var btn = document.createElement('button'); btn.className = 'tbtn ai-btn';
    btn.style.cssText = 'width:100%;padding:10px;font-size:13px;margin-bottom:6px';
    btn.textContent = '📋 نسخ مقطع التحليل لـ Claude.ai';
    btn.onclick = function(){
      var prompt = 'أريد تحليلاً عميقاً للمقطع التالي من "' + bTitle + '" (' + where + '):\n\n' + text.slice(0, 2000) +
        '\n\nأرجو:\n1. ملخص المحتوى الرئيسي\n2. الأفكار والمفاهيم الجوهرية\n3. الشخصيات والأماكن والأحداث المذكورة\n4. السياق التاريخي والفكري\n5. أي ملاحظات نقدية أو تحليلية';
      copyToClipboard(prompt, '✓ تم النسخ — الصقه في Claude.ai');
    };
    var note = document.createElement('div');
    note.style.cssText = 'font-size:11px;color:var(--text2);font-family:sans-serif';
    note.textContent = 'النسخ يعمل دون إنترنت؛ اللصق في Claude.ai يحتاج اتصالاً';
    aiSec.appendChild(btn); aiSec.appendChild(note); el.appendChild(aiSec);
  }

  /* ---------- شارة الصفحة: الحالي / الإجمالي ---------- */
  function updatePagePill2(){
    var pill = document.getElementById('page-pill');
    if(!pill) return;
    if(cur < 0 || !library[cur]){ pill.classList.remove('show'); return; }
    var total = getTotalPages(library[cur]);
    if(total <= 1){ pill.classList.remove('show'); return; }
    if(!pill.classList.contains('show')) pill.classList.add('show');
    var el = document.getElementById('page-pill-txt');
    var txt = getCurrentPageEstimate() + ' / ' + total;
    if(el.textContent !== txt) el.textContent = txt;
  }

  function install(){
    if(typeof renderAI === 'function') window.renderAI = renderAI2;
    if(typeof updatePagePill === 'function'){
      window.updatePagePill = updatePagePill2;
      try{
        var el = document.getElementById('page-pill-txt');
        if(el){ el.style.direction = 'ltr'; el.style.unicodeBidi = 'isolate'; }
        updatePagePill2();
      }catch(e){}
    }
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
  else install();
})();
