/* reader-fixes.js v1 — تعديلات مشتركة على القارئات العشرة (تُحمَّل بعد كل سكربتات الصفحة).
   1) لوحة 🧠 التحليل العميق: قائمة أعلام أنظف (بلا كلمات بداية الجمل ولا "But Moses")،
      عدّ غير حسّاس لحالة الأحرف، دعم الحروف اللاتينية المشكّلة واليونانية،
      وزر النسخ يأخذ الفقرة الظاهرة أمامك (لا أول الكتاب) ما لم يكن هناك نص محدد.
   2) شارة رقم الصفحة: «الحالي / الإجمالي» بدل «الإجمالي / الحالي».
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

  var cache = new Map(); // bookId|length -> [[name,count],...]

  function atSentenceStart(t, i){
    var j = i - 1;
    while(j >= 0 && /[ \t"'“‘(\[«]/.test(t[j])) j--;
    return j < 0 || /[.!?\n:]/.test(t[j]);
  }

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
    var counts = Object.create(null), m;
    while((m = re.exec(text)) !== null){
      var words = m[0].split(/[ \t]+/);
      var start = atSentenceStart(text, m.index);
      // أسقط الكلمة الأولى إن كانت أداة/كلمة عادية (بداية جملة أو من قائمة الاستبعاد)
      while(words.length){
        var w = words[0], lw = w.toLowerCase();
        if(STOP.has(lw) || (start && lowerSet().has(lw))){ words.shift(); start = false; }
        else break;
      }
      if(!words.length) continue;
      var name = words.join(' ');
      if(name.length < 3) continue;
      counts[name] = (counts[name] || 0) + 1;
    }
    // نُبقي الأسماء كما وردت بحرف كبير فقط (الكلمات العادية تدخل مرة واحدة كاسم علم لا كمفهوم)
    return Object.keys(counts).map(function(n){ return [n, counts[n]]; })
      .sort(function(x, y){ return y[1] - x[1]; }).slice(0, 12);
  }

  function entitiesForBook(book){
    var key = (book.id || '') + '|' + (book.content || '').length;
    var r = cache.get(key);
    if(!r){ r = computeEntities(book.content || ''); cache.set(key, r); }
    return r;
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

  /* ---------- لوحة التحليل العميق ---------- */
  function renderAI2(selectedText){
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
    var top = book ? entitiesForBook(book) : [];

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
      sec.innerHTML = '<h4>الأعلام والكيانات الرئيسية (في الكتاب كله)</h4><div id="ent-tags"></div>';
      el.appendChild(sec);
      var box = sec.querySelector('#ent-tags');
      top.forEach(function(p){
        var t = document.createElement('span'); t.className = 'ai-tag';
        t.textContent = p[0] + ' ×' + p[1]; box.appendChild(t);
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
