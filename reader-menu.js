/* reader-menu.js v1 — القائمة الجانبية المنسدلة للوحة الأدوات العلوية (مشتركة بين القوارئ العشر)
 *
 * الفكرة: اللوحة العلوية صارت شريطاً نحيفاً فيه الأهم فقط (☰ + بحث عالمي + ابحث هنا + زر «🧰 الأدوات»)،
 * وبقية الأزرار تنتقل — هي نفسها بمعرّفاتها ومستمعيها — إلى درج جانبي مقسَّم إلى مجموعات مطويّة بسهم صغير.
 * لا نعيد بناء أي زر ولا نغيّر نصّه، فكل ما تضيفه السكربتات الأخرى (reader-ai / reader-academic) أو
 * يغيّره القارئ لاحقاً (مثل «☀ نهار» ↔ «🌙 ليل») يبقى يعمل كما هو. ما يُضاف للشريط بعد البناء يُصنَّف تلقائياً.
 */
(function(){
'use strict';
if(window.__readerMenuLoaded) return; window.__readerMenuLoaded=true;

var STORE_KEY='rm_open_groups_v1';
function $(id){ return document.getElementById(id); }
function mk(tag,attrs,kids){
  var e=document.createElement(tag), k;
  for(k in (attrs||{})){
    if(k==='text') e.textContent=attrs[k];
    else if(k==='class') e.className=attrs[k];
    else e.setAttribute(k,attrs[k]);
  }
  (kids||[]).forEach(function(c){ if(c) e.appendChild(c); });
  return e;
}
function lsGet(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } }
function lsSet(k,v){ try{ localStorage.setItem(k,v); }catch(e){} }

/* ---------- المجموعات (الترتيب = ترتيب الظهور) ---------- */
var GROUPS=[
  {id:'search', ico:'🔍', title:'البحث والفهارس'},
  {id:'read',   ico:'🔖', title:'القراءة والإشارات'},
  {id:'view',   ico:'🎨', title:'العرض والخط', keep:true},   // أزرار تُضغط مراراً (حجم الخط…) فلا يُغلق الدرج بعدها
  {id:'ai',     ico:'🧠', title:'الذكاء الاصطناعي', keep:true},
  {id:'cmp',    ico:'⚡', title:'المقارنة'},
  {id:'share',  ico:'📤', title:'المشاركة والحفظ'},
  {id:'lib',    ico:'📚', title:'المكتبة'},
  {id:'other',  ico:'⋯',  title:'أخرى'}
];
function oc(n){ return n.getAttribute&&n.getAttribute('onclick')||''; }
function txt(n){ return (n.textContent||'').trim(); }
function has(n,re){ return re.test(oc(n)); }

/* يعيد: {g:'مجموعة', pair:'مفتاح زوج'?} أو null إن كان العنصر يبقى في الشريط العلوي */
function classify(n){
  if(n.nodeType!==1) return null;
  if(n.id==='rm-open'||n.id==='tb-title'||n.id==='tb-home') return null;   // يبقى في الشريط: ☰ و🏠 الرئيسية و🧰 الأدوات
  if(n.tagName==='INPUT'||n.tagName==='SCRIPT'||n.tagName==='STYLE') return null;
  if(n.tagName==='BUTTON'&&txt(n)==='☰') return null;            // مفتاح قائمة الكتب الجانبية: يبقى
  if(has(n,/\b(openSP|toggleFind)\(/)) return {g:'search'};
  if(n.id==='reader-research-wrap') return {g:'ai'};   // منصات البحث العلمي ضمن الذكاء الاصطناعي
  if(has(n,/\b(openSearch2|openBookToc|openEntities)\(/)) return {g:'search'};
  if(has(n,/\b(toggleBM|addBM|openNotes|openTimeline|openStats)\(/)) return {g:'read'};
  if(has(n,/\bnav\(-?1\)/)) return {g:'read',pair:'nav'};
  if(has(n,/\bchFS\(/)) return {g:'view',pair:'fs'};
  if(n.id==='theme-btn'||n.id==='contrast-btn'||n.id==='chunk-size-btn'||has(n,/\bfixTranslateDir\(/)) return {g:'view'};
  if(has(n,/\bopenAI\(/)||n.classList.contains('ai-sel')) return {g:'ai'};
  if(n.hasAttribute('data-rai')){
    var t=txt(n);
    if(/^📤/.test(t)) return {g:'share'};
    if(t==='⚙'||/^(💡|🔎|🔬)/.test(t)) return {g:'ai'};
  }
  if(n.id==='split-btn'||n.id==='close-compare-btn') return {g:'cmp'};
  if(has(n,/\b(exportCurrentBook|exportUserData)\(/)||n.classList.contains('tb-pair')||n.id==='save-reader-btn') return {g:'share'};
  if(has(n,/\bopenAddBook\(/)) return {g:'lib'};
  return {g:'other'};
}

/* ---------- الأنماط ---------- */
function injectCss(){
  if($('rm-style')) return;
  var css=[
  /* الشريط النحيف: أزرار أكبر وأوضح من السابق */
  '#tb1.tb-merged.rm-bar{gap:6px;padding:4px 8px 6px;align-items:stretch}',
  '#tb1.tb-merged.rm-bar>.tbtn{flex:1 1 auto;min-height:42px;font-size:14px;padding:6px 8px;display:inline-flex;align-items:center;justify-content:center}',
  '#tb1.tb-merged.rm-bar>#rm-open{flex:1.25 1 auto;border-color:var(--gold,#c8a45a);color:var(--gold,#c8a45a);font-weight:700}',
  '#rm-open[aria-expanded=true]{background:rgba(200,164,90,.15)}',
  /* الدرج */
  '#rm-back{position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:700;opacity:0;visibility:hidden;transition:opacity .22s,visibility .22s}',
  '#rm-back.show{opacity:1;visibility:visible}',
  '#rm-drawer{position:fixed;top:0;bottom:0;right:0;width:min(88vw,350px);z-index:710;display:flex;flex-direction:column;direction:rtl;',
  '  background:var(--bg2,#1b2330);color:var(--text,#eee);border-left:1px solid var(--border,#444);box-shadow:-6px 0 28px rgba(0,0,0,.5);',
  '  height:100vh;height:100dvh;transform:translateX(104%);visibility:hidden;transition:transform .24s ease,visibility .24s;font-family:sans-serif}',
  '#rm-drawer.show{transform:none;visibility:visible}',
  '#rm-head{display:flex;align-items:center;gap:8px;padding:12px 14px;border-bottom:1px solid var(--border,#444);flex-shrink:0}',
  '#rm-head strong{flex:1;font-size:16px;color:var(--gold,#c8a45a)}',
  '#rm-close{min-width:42px;min-height:42px;font-size:18px;background:none;color:inherit;border:1px solid var(--border,#444);border-radius:6px;cursor:pointer}',
  '#rm-body{flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;padding:6px 0 24px}',
  '.rm-g{border-bottom:1px solid var(--border,#444)}',
  '.rm-gh{display:flex;align-items:center;gap:10px;width:100%;min-height:52px;padding:10px 14px;background:none;border:0;color:inherit;',
  '  font:inherit;font-size:16px;text-align:right;cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent}',
  '.rm-gh:active{background:rgba(200,164,90,.1)}',
  '.rm-gi{font-size:20px;width:26px;text-align:center}',
  '.rm-gt{flex:1}',
  '.rm-gc{font-size:12px;color:var(--text2,#9aa);background:var(--bg3,#2a3444);border-radius:10px;padding:1px 8px}',
  '.rm-ar{font-size:15px;color:var(--text2,#9aa);transition:transform .2s}',
  '.rm-g.open>.rm-gh .rm-ar{transform:rotate(180deg)}',
  '.rm-g.open>.rm-gh{color:var(--gold,#c8a45a)}',
  '.rm-gb{display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:4px 12px 14px}',
  '.rm-gb[hidden]{display:none}',
  '.rm-gb .tbtn,.rm-gb .reader-research-trigger{flex:none!important;width:100%;min-height:46px;padding:8px 6px;font-size:14px;white-space:normal;line-height:1.35;',
  '  display:flex;align-items:center;justify-content:center;text-align:center;box-sizing:border-box;touch-action:manipulation}',
  '.rm-gb .ai-sel{grid-column:1/-1;width:100%;min-height:46px;font-size:14px;padding:0 8px;box-sizing:border-box;appearance:auto;',
  '  background:var(--bg3,#2a3444);color:var(--blue,#7aa6c6);border:1px solid var(--blue,#7aa6c6);border-radius:4px;font-family:sans-serif}',
  '.rm-gb [onclick*="openAI("]{grid-column:1/-1}',
  '.rm-pair[data-rm-pair=fs] .tbtn{direction:ltr}',
  '.rm-gb .ai-b{border-color:var(--blue,#7aa6c6);color:var(--blue,#7aa6c6)}',
  '.rm-gb .reader-research-wrap{grid-column:1/-1;display:block}',
  '.rm-pair,.rm-gb .tb-pair{grid-column:1/-1;display:grid;grid-template-columns:1fr 1fr;gap:8px}',
  '.rm-gb>.tbtn:last-child:nth-child(odd){grid-column:1/-1}',
  '.rm-gb #save-reader-btn,.rm-gb .tb-pair .tbtn{min-width:0}',
  '@media (prefers-reduced-motion:reduce){#rm-drawer,#rm-back,.rm-ar{transition:none}}'
  ].join('\n');
  var st=mk('style',{id:'rm-style'}); st.textContent=css; document.head.appendChild(st);
}

/* ---------- البناء ---------- */
var tb1=null, drawer=null, back=null, openBtn=null, bodyEl=null, groupEls={}, lastFocus=null, built=false;

function openSet(){ try{ return JSON.parse(lsGet(STORE_KEY)||'[]')||[]; }catch(e){ return []; } }
function saveOpenSet(){
  var a=[]; Object.keys(groupEls).forEach(function(id){ if(groupEls[id].sec.classList.contains('open')) a.push(id); });
  lsSet(STORE_KEY,JSON.stringify(a));
}
function setGroupOpen(id,open){
  var g=groupEls[id]; if(!g) return;
  g.sec.classList.toggle('open',open);
  g.hd.setAttribute('aria-expanded',open?'true':'false');
  if(open) g.bd.removeAttribute('hidden'); else g.bd.setAttribute('hidden','');
}
function updateCounts(){
  Object.keys(groupEls).forEach(function(id){
    var g=groupEls[id], n=g.bd.querySelectorAll('button,select').length;
    g.cnt.textContent=n; g.sec.style.display=n?'':'none';
  });
}
function ensureGroup(id){
  if(groupEls[id]) return groupEls[id];
  var def=GROUPS.filter(function(x){ return x.id===id; })[0]; if(!def) return null;
  var bd=mk('div',{class:'rm-gb',hidden:'','data-rm-g':id,id:'rm-gb-'+id});
  var cnt=mk('span',{class:'rm-gc',text:'0'});
  var hd=mk('button',{type:'button',class:'rm-gh','aria-expanded':'false','aria-controls':'rm-gb-'+id},[
    mk('span',{class:'rm-gi',text:def.ico}),mk('span',{class:'rm-gt',text:def.title}),cnt,mk('span',{class:'rm-ar',text:'▾'})]);
  var sec=mk('section',{class:'rm-g','data-rm-sec':id},[hd,bd]);
  hd.addEventListener('click',function(){
    setGroupOpen(id,!sec.classList.contains('open')); saveOpenSet();
  });
  groupEls[id]={sec:sec,hd:hd,bd:bd,cnt:cnt,def:def};
  // ترتيب ثابت حسب GROUPS
  var order=GROUPS.map(function(x){ return x.id; }), idx=order.indexOf(id), ref=null;
  for(var i=idx+1;i<order.length&&!ref;i++){ if(groupEls[order[i]]) ref=groupEls[order[i]].sec; }
  bodyEl.insertBefore(sec,ref);
  return groupEls[id];
}
function place(n){
  var c=classify(n); if(!c) return false;
  var g=ensureGroup(c.g); if(!g) return false;
  if(n.tagName==='BUTTON'&&txt(n)==='⚙') n.textContent='⚙ إعدادات الذكاء';
  if(n.tagName==='BUTTON'&&c.pair==='nav'){   // ◀ ▶ وحدهما غير مفهومتين: هما تنقّل بين الكتب
    if(has(n,/nav\(-1\)/)){ n.textContent='◀ الكتاب السابق'; n.title='الكتاب السابق في المكتبة'; }
    else{ n.textContent='الكتاب التالي ▶'; n.title='الكتاب التالي في المكتبة'; }
  }
  if(c.pair){
    var pid='rm-pair-'+c.pair, pr=g.bd.querySelector('[data-rm-pair="'+c.pair+'"]');
    if(!pr){ pr=mk('div',{class:'rm-pair','data-rm-pair':c.pair,id:pid}); g.bd.appendChild(pr); }
    pr.appendChild(n);
  }else g.bd.appendChild(n);
  return true;
}
function sweep(){
  if(!tb1) return;
  Array.prototype.slice.call(tb1.children).forEach(function(n){ place(n); });
  var rw=$('reader-research-wrap');   // عنصر بعرض كامل: في آخر مجموعة الذكاء كي تتوازن بقية الأزرار في صفوف مزدوجة
  if(rw&&groupEls.ai&&rw.parentNode===groupEls.ai.bd&&rw!==groupEls.ai.bd.lastChild) groupEls.ai.bd.appendChild(rw);
  updateCounts();
}

function openDrawer(){
  if(!built) return;
  lastFocus=document.activeElement;
  drawer.classList.add('show'); back.classList.add('show');
  openBtn.setAttribute('aria-expanded','true');
  try{ $('rm-close').focus({preventScroll:true}); }catch(e){}
}
function closeDrawer(noFocus){
  if(!built||!drawer.classList.contains('show')) return;
  drawer.classList.remove('show'); back.classList.remove('show');
  openBtn.setAttribute('aria-expanded','false');
  if(!noFocus){ try{ (lastFocus&&lastFocus.focus)?lastFocus.focus({preventScroll:true}):openBtn.focus({preventScroll:true}); }catch(e){} }
}

function build(){
  if(built) return;
  tb1=$('tb1'); if(!tb1||!document.body) return;
  injectCss();
  tb1.classList.add('rm-bar');
  var closeBtn=mk('button',{type:'button',id:'rm-close','aria-label':'إغلاق القائمة',text:'✕'});
  bodyEl=mk('div',{id:'rm-body'});
  drawer=mk('aside',{id:'rm-drawer',role:'dialog','aria-label':'أدوات القارئ',translate:'no'},[
    mk('div',{id:'rm-head'},[mk('strong',{text:'🧰 أدوات القارئ'}),closeBtn]),bodyEl]);
  back=mk('div',{id:'rm-back',translate:'no'});
  document.body.appendChild(back); document.body.appendChild(drawer);

  openBtn=mk('button',{type:'button',class:'tbtn',id:'rm-open',translate:'no','aria-haspopup':'dialog','aria-expanded':'false',
    'aria-controls':'rm-drawer',title:'فتح قائمة الأدوات',text:'🧰 الأدوات'});
  openBtn.addEventListener('click',function(e){ e.stopPropagation(); if(drawer.classList.contains('show')) closeDrawer(); else openDrawer(); });
  tb1.appendChild(openBtn);

  sweep();
  var saved=openSet();
  Object.keys(groupEls).forEach(function(id){ setGroupOpen(id,saved.indexOf(id)>=0); });

  closeBtn.addEventListener('click',function(){ closeDrawer(); });
  back.addEventListener('click',function(){ closeDrawer(); });
  document.addEventListener('keydown',function(e){ if(e.key==='Escape') closeDrawer(); });

  // بعد ضغط أي زر إجراء يُغلق الدرج ليظهر ما فتحه — إلا مجموعات «تبقى» (الخط/الذكاء) ومنصات البحث العلمي (نافذتها تُثبَّت على زرّها)
  drawer.addEventListener('click',function(e){
    var b=e.target.closest&&e.target.closest('button'); if(!b||b.classList.contains('rm-gh')||b.id==='rm-close') return;
    if(b.closest('#reader-research-wrap')) return;
    var gb=b.closest('.rm-gb'), id=gb&&gb.getAttribute('data-rm-g');
    if(id&&groupEls[id]&&groupEls[id].def.keep) return;
    setTimeout(function(){ closeDrawer(true); },0);
  });
  // سحبة نحو اليمين (خارج الشاشة) تُغلق الدرج
  var sx=0, sy=0, tr=false;
  drawer.addEventListener('touchstart',function(e){ var t=e.touches[0]; sx=t.clientX; sy=t.clientY; tr=true; },{passive:true});
  drawer.addEventListener('touchend',function(e){
    if(!tr) return; tr=false; var t=e.changedTouches[0], dx=t.clientX-sx, dy=t.clientY-sy;
    if(dx>70&&Math.abs(dy)<45) closeDrawer(true);
  },{passive:true});

  // أي زر يُضاف إلى الشريط لاحقاً من سكربت آخر يُصنَّف تلقائياً بدل أن يعود الشريط للازدحام
  try{
    new MutationObserver(function(muts){
      var add=false;
      muts.forEach(function(m){ Array.prototype.forEach.call(m.addedNodes,function(n){ if(n.parentNode===tb1&&classify(n)) add=true; }); });
      if(add) sweep();
    }).observe(tb1,{childList:true});
  }catch(e){}
  built=true;
}

/* ننتظر حتى تنتهي السكربتات الأخرى من حقن أزرارها (الذكاء: #tb-home وأزرار الشرح/البحث، والأكاديمي: منصات البحث العلمي) */
function ready(){
  var t=$('tb1'); if(!t) return false;
  return !!($('tb-home')&&$('reader-research-wrap')&&t.querySelector('.ai-sel'));
}
function init(){
  var n=0, t=setInterval(function(){
    n++;
    if(ready()||n>50){ clearInterval(t); build(); }   // 50×120ms ≈ 6 ثوانٍ كحدٍّ أقصى ثم نبني بما هو موجود
  },120);
}
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init); else init();

window.ReaderMenu={ open:function(){ openDrawer(); }, close:function(){ closeDrawer(); }, sweep:sweep };
})();
