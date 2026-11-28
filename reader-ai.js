/* ============================================================
   شريط الذكاء للقوارئ العشر — وحدة مشتركة (ملف واحد لكل القراء)
   ------------------------------------------------------------
   يضيف شريط أدوات مستقلاً بثلاثة أزرار تعمل على النص المحدد:
     💡 شرح          يشرح النص (معنى، مفردات، أعلام وسياق، التباسات)
     🔎 بحث          بحث على الويب مع المصادر
     🔬 بحث عميق    تخطيط ← عدة عمليات بحث متوازية ← تقرير بمصادر مرقّمة
   كلها تمرّ عبر دالة Supabase (research-assistant)، فمفتاح Gemini يبقى
   سراً في الدالة ولا يظهر هنا ولا في GitHub.
   الإعدادات (رابط الدالة وكلمة المرور) تُشارَك مع صفحة المحادثة الرئيسية
   لأن الصفحتين على الأصل نفسه، فتُدخَل مرة واحدة فقط.

   تحديث v4 (ثلاثة تعديلات):
     ١) زر «🏠 الرئيسية» في لوحة الأزرار العلوية يعيد إلى لوحة التحكم الرئيسية.
     ٢) محرك الذكاء قابل للاختيار: Gemini (بحث ويب حيّ ومصادر) أو «ذكاء مجاني»
        (نماذج مفتوحة عبر OpenRouter من الدالة نفسها، بلا بحث ويب).
     ٣) أزرار اللوحة العلوية (الصفان القديمان + شريط الذكاء) تُدمج في حاوية واحدة
        تتمدّد أزرارها لملء كل سطر تلقائياً، فلا تبقى خانات فارغة تزيد عدد الأسطر.
   ============================================================ */
(function(){
'use strict';

var K_URL='readers_grok_url', K_PASS='readers_grok_pass', K_MODEL='readers_gemini_model';
var K_PROV='readers_ai_provider';                 // 'gemini' (الأصل) | 'open' (ذكاء مجاني)
var K_CKEY='readers_claude_key', K_CMODEL='readers_claude_model', K_GMODEL='readers_grok_model';   // نفس مفاتيح صفحة المحادثة الرئيسية (نفس المتصفح)
var PROVS=['gemini','open','claude','grok'];
var PNAME={gemini:'🤖 Gemini',open:'🆓 الذكاء المجاني',claude:'🟠 Claude',grok:'⚫ Grok'};
var K_OMODEL='readers_open_model';                // نفس مفتاح صفحة المحادثة الرئيسية
var OPEN_DEFAULT='openrouter/free';
var OPEN_ALT=['google/gemma-4-31b-it:free','google/gemma-4-26b-a4b-it:free','nvidia/nemotron-3-ultra-550b-a55b:free'];
var HOME_URL='../index.html';                     // لوحة التحكم الرئيسية (القراء داخل مجلد readers/)
var CTX_CHARS=700;            // السياق المرسل قبل التحديد وبعده
var MAX_TEXT=6000;            // أقصى طول للنص المحدد
var SEL_KEEP_MS=3*60*1000;    // نحتفظ بآخر تحديد هذا الوقت (لأن لمس الزر قد يُلغي التحديد على الجوال)

function lsGet(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } }
function lsSet(k,v){ try{ localStorage.setItem(k,v); }catch(e){} }
function $(id){ return document.getElementById(id); }
function mk(tag,attrs,kids){
  var e=document.createElement(tag);
  if(attrs) Object.keys(attrs).forEach(function(k){
    if(k==='text') e.textContent=attrs[k];
    else if(k==='class') e.className=attrs[k];
    else if(k.slice(0,2)==='on') e.addEventListener(k.slice(2),attrs[k]);
    else e.setAttribute(k,attrs[k]);
  });
  (kids||[]).forEach(function(c){ if(c) e.appendChild(c); });
  return e;
}

/* ---------- الإعدادات ---------- */
function defaultUrl(){
  var u=String((window.READER_CLOUD_CONFIG||{}).url||'').replace(/\/+$/,'');
  return u?u+'/functions/v1/research-assistant':'';
}
function cfg(){
  return { url:(lsGet(K_URL)||defaultUrl()).trim(), pass:(lsGet(K_PASS)||'').trim(),
           key:(window.READER_CLOUD_CONFIG||{}).key||'' };
}

function getProv(){ var v=lsGet(K_PROV); return PROVS.indexOf(v)>=0?v:'gemini'; }
function syncProv(){
  var p=getProv();
  Array.prototype.forEach.call(document.querySelectorAll('select[data-rai-prov]'),function(x){ x.value=p; });
}
function setProv(v){ lsSet(K_PROV,PROVS.indexOf(v)>=0?v:'gemini'); syncProv(); }
function openModel(){
  var m=(lsGet(K_OMODEL)||'').trim();
  return /^[A-Za-z0-9._-]{1,40}\/[A-Za-z0-9._-]{1,80}(:[A-Za-z0-9._-]{1,20})?$/.test(m)?m:OPEN_DEFAULT;
}
// قائمة اختيار المحرك (تُستعمل في اللوحة العلوية وفي نافذة النتيجة، وتبقى متزامنة)
function provSelect(cls){
  var x=mk('select',{class:cls,'data-rai':'1','data-rai-prov':'1','aria-label':'الذكاء المدمج',translate:'no',
    title:'الذكاء المدمج — اختيار المحرك: Gemini (بحث ويب حيّ مع مصادر) أو الذكاء المجاني (OpenRouter) أو Claude (بمفتاحك) أو Grok (عبر الدالة) — الثلاثة الأخيرة تجيب من معرفتها بلا بحث ويب'},
    PROVS.map(function(k){ return mk('option',{value:k,text:PNAME[k]}); }));
  x.value=getProv();
  x.addEventListener('change',function(){ setProv(x.value); });
  return x;
}

/* ---------- التقاط التحديد ---------- */
var last=null; // {text, range, pid, bookId, container, ts}

function bookInfo(container){
  try{
    var idx=(container&&container.id==='bookText2')?cur2:cur;
    var b=library[idx];
    if(b) return { id:b.id, title:b.title||'', author:b.author||'' };
  }catch(e){}
  return { id:null, title:'', author:'' };
}
function pidOf(container,node){
  try{ if(typeof getParagraphIdForNode==='function') return getParagraphIdForNode(container,node); }catch(e){}
  return null;
}
function containerOf(node){
  if(!node) return null;
  var el=node.nodeType===1?node:node.parentElement;
  return el&&el.closest?el.closest('#bookText, #bookText2'):null;
}
function capture(){
  var sel=window.getSelection&&window.getSelection();
  if(!sel||sel.rangeCount===0) return;
  var txt=sel.toString().trim();
  if(txt.length<2) return; // الفارغ لا يمسح الأخير (انظر SEL_KEEP_MS)
  var r=sel.getRangeAt(0);
  var c=containerOf(r.startContainer);
  if(!c||c!==containerOf(r.endContainer)) return; // التحديد خارج نص الكتاب
  var info=bookInfo(c);
  last={ text:txt, range:r.cloneRange(), pid:pidOf(c,r.startContainer), bookId:info.id,
         container:c, info:info, ts:Date.now() };
}
var capTimer=null;
document.addEventListener('selectionchange',function(){ clearTimeout(capTimer); capTimer=setTimeout(capture,200); });

function contextAround(s){
  var before='', after='';
  try{
    var c=s.container, r=s.range;
    if(!c||!document.contains(c)) return {before:'',after:''};
    var pre=document.createRange(); pre.setStart(c,0); pre.setEnd(r.startContainer,r.startOffset);
    before=pre.toString().slice(-CTX_CHARS);
    var post=document.createRange(); post.setStart(r.endContainer,r.endOffset); post.setEnd(c,c.childNodes.length);
    after=post.toString().slice(0,CTX_CHARS);
  }catch(e){}
  return { before:before.trim(), after:after.trim() };
}

/* ---------- عرض Markdown مبسّط وآمن (بدون innerHTML) ---------- */
function inline(parent,text){
  // **غامق** و[نص](رابط) — الروابط http/https فقط
  var re=/\*\*([^*]+)\*\*|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, pos=0, m;
  while((m=re.exec(text))){
    if(m.index>pos) parent.appendChild(document.createTextNode(text.slice(pos,m.index)));
    if(m[1]!==undefined) parent.appendChild(mk('strong',{text:m[1]}));
    else parent.appendChild(mk('a',{href:m[3],target:'_blank',rel:'noopener noreferrer',text:m[2]}));
    pos=m.index+m[0].length;
  }
  if(pos<text.length) parent.appendChild(document.createTextNode(text.slice(pos)));
}
function renderMd(target,text){
  target.textContent='';
  var lines=text.replace(/\r/g,'').split('\n'), ul=null, p=null;
  function endList(){ ul=null; }
  lines.forEach(function(raw){
    var line=raw.replace(/\s+$/,'');
    var h=line.match(/^#{1,4}\s+(.*)$/), li=line.match(/^\s*(?:[-*•]|\d+[.)]|[٠-٩]+[.)-])\s+(.*)$/);
    if(!line.trim()){ endList(); p=null; return; }
    if(h){ endList(); p=null; var hh=mk('h4'); inline(hh,h[1]); target.appendChild(hh); return; }
    if(li){ if(!ul){ ul=mk('ul'); target.appendChild(ul); } var l=mk('li'); inline(l,li[1]); ul.appendChild(l); p=null; return; }
    endList();
    if(!p){ p=mk('p'); target.appendChild(p); } else p.appendChild(document.createElement('br'));
    inline(p,line);
  });
}

/* ---------- النافذة (طبقة كاملة الشاشة ثابتة) ---------- */
var CSS=[
/* --- اللوحة العلوية المدموجة: حاوية واحدة، كل زر يتمدّد ليملأ سطره فلا تبقى خانات فارغة --- */
'#tb2,#tb-ai{display:none!important}',
'#tb1.tb-merged{gap:4px;padding:4px 6px;align-items:stretch;align-content:flex-start}',
'#tb1.tb-merged>.tbtn,#tb1.tb-merged>.ai-sel{flex:1 1 auto;display:inline-flex;align-items:center;justify-content:center;',
'  text-align:center;min-height:28px;padding:3px 6px;font-size:12px;touch-action:manipulation;box-sizing:border-box}',
'#tb1.tb-merged>.tb-pair{flex:2 1 auto;display:flex;gap:4px}',
'#tb1.tb-merged>.tb-pair>.tbtn{flex:1 1 auto;display:inline-flex;align-items:center;justify-content:center;min-height:28px;padding:3px 6px;font-size:12px}',
'#tb1.tb-merged>#tb-title{flex:1 1 100%;min-width:0;align-self:center;text-align:center;order:-1;padding:1px 4px}',
'#tb1.tb-merged>input[type=file]{display:none}',
'#tb1.tb-merged>#tb-home{border-color:var(--gold,#c8a45a);color:var(--gold,#c8a45a);font-weight:700}',
'#tb1.tb-merged>.ai-sel,#rai-ft .ai-sel{appearance:auto;background:var(--bg2,#eee);color:var(--blue,#4a7a9a);border:1px solid var(--blue,#4a7a9a);border-radius:3px;font-family:sans-serif;cursor:pointer}',
'#tb1.tb-merged>.ai-sel{padding:2px 2px}',
'#rai-ft .ai-sel{min-height:40px;font-size:14px;padding:0 6px}',
'#tb1.tb-merged>.ai-b{border-color:var(--blue,#4a7a9a);color:var(--blue,#4a7a9a)}',
'#tb1.tb-merged>.ai-b:hover{background:rgba(74,122,154,.15)}',
'#rai-ov{position:fixed;inset:0;z-index:9998;display:none;flex-direction:column;background:var(--bg,#fff);color:var(--text,#111);',
'  height:100vh;height:100dvh;direction:rtl;font-family:inherit}',
'#rai-ov.show{display:flex}',
'#rai-hd{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid var(--border,#ccc);background:var(--bg2,#eee)}',
'#rai-ttl{flex:1;font-size:15px;font-weight:700;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
'#rai-hd .tbtn{min-height:38px;min-width:38px;font-size:14px}',
'#rai-bd{flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:12px 14px 18px;line-height:1.9;font-size:16px}',
'#rai-bd h4{margin:14px 0 4px;color:var(--gold,#a80);font-size:16px}',
'#rai-bd p{margin:6px 0}#rai-bd ul{margin:6px 0;padding-inline-start:22px}#rai-bd li{margin:3px 0}',
'#rai-bd a{color:var(--blue,#06c);word-break:break-all}',
'#rai-quote{border-inline-start:3px solid var(--gold,#a80);padding:6px 10px;margin:0 0 10px;color:var(--text2,#555);font-size:14px;max-height:5.6em;overflow:hidden;line-height:1.7}',
'#rai-status{font-family:sans-serif;font-size:13px;color:var(--text2,#555);padding:4px 0;min-height:1.4em}',
'#rai-plan{font-family:sans-serif;font-size:13px;color:var(--text2,#555);margin:4px 0 8px}',
'#rai-plan summary{cursor:pointer}',
'#rai-err{color:var(--red,#b33);font-family:sans-serif;font-size:14px;white-space:pre-wrap;margin:8px 0}',
'#rai-src{margin-top:14px;border-top:1px solid var(--border,#ccc);padding-top:8px;font-family:sans-serif;font-size:13px}',
'#rai-src ol{padding-inline-start:26px;margin:6px 0}#rai-src li{margin:4px 0}',
'#rai-ft{display:flex;gap:6px;padding:8px 10px;border-top:1px solid var(--border,#ccc);background:var(--bg2,#eee);align-items:center;flex-wrap:wrap}',
'#rai-q{flex:1 1 160px;min-width:0;padding:9px 10px;font-size:15px;border:1px solid var(--border,#ccc);border-radius:4px;background:var(--bg,#fff);color:var(--text,#111);font-family:inherit}',
'#rai-ft .tbtn{min-height:40px;font-size:14px}',
'#rai-set{position:fixed;inset:0;z-index:9999;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.55);direction:rtl}',
'#rai-set.show{display:flex}',
'#rai-set .box{background:var(--bg,#fff);color:var(--text,#111);border:1px solid var(--border,#ccc);border-radius:8px;padding:14px;width:min(92vw,440px);max-height:90vh;overflow:auto}',
'#rai-set label{display:block;margin:10px 0 3px;font-size:13px;font-family:sans-serif;color:var(--text2,#555)}',
'#rai-set input{width:100%;box-sizing:border-box;padding:9px;font-size:14px;border:1px solid var(--border,#ccc);border-radius:4px;background:var(--bg2,#eee);color:var(--text,#111);direction:ltr}',
'#rai-set .row{display:flex;gap:8px;margin-top:14px}#rai-set .row .tbtn{flex:1;min-height:40px}',
'#rai-set .hint{font-size:12px;color:var(--text2,#555);font-family:sans-serif;margin-top:8px;line-height:1.6}',
/* --- نافذة المشاركة من اللوحة العلوية: معاينة النص + سطر لسؤال إضافي --- */
'#rai-sh{position:fixed;inset:0;z-index:10000;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.55);direction:rtl}',
'#rai-sh.show{display:flex}',
'#rai-sh .box{background:var(--bg,#fff);color:var(--text,#111);border:1px solid var(--border,#ccc);border-radius:8px;padding:14px;width:min(92vw,440px);max-height:90vh;overflow:auto}',
'#rai-sh-q{-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;border-inline-start:3px solid var(--gold,#a80);padding:6px 10px;margin:10px 0;color:var(--text2,#555);font-size:14px;max-height:6.8em;overflow:hidden;line-height:1.7}',
'#rai-sh label{display:block;margin:10px 0 3px;font-size:13px;font-family:sans-serif;color:var(--text2,#555)}',
'#rai-sh-in{width:100%;box-sizing:border-box;padding:10px;font-size:16px;border:1px solid var(--border,#ccc);border-radius:4px;background:var(--bg2,#eee);color:var(--text,#111);font-family:inherit}',
'#rai-sh .row{display:flex;gap:8px;margin-top:14px}#rai-sh .row .tbtn{flex:1;min-height:42px;font-size:15px}',
'#rai-bq{position:fixed;inset:0;z-index:10001;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.55);direction:rtl}',
'#rai-bq.show{display:flex}',
'#rai-bq .box{background:var(--bg,#fff);color:var(--text,#111);border:1px solid var(--border,#ccc);border-radius:8px;padding:14px;width:min(94vw,520px);max-height:92vh;overflow:auto}',
'#rai-bq .hd{display:flex;align-items:center;justify-content:space-between;gap:8px}',
'#rai-bq .hint{font-size:12.5px;line-height:1.7;color:var(--text2,#555);font-family:sans-serif;margin-top:6px}',
'#rai-bq label{display:block;margin:10px 0 3px;font-size:13px;font-family:sans-serif;color:var(--text2,#555)}',
'#rai-bq textarea,#rai-bq input[type=text]{width:100%;box-sizing:border-box;padding:10px;font-size:16px;border:1px solid var(--border,#ccc);border-radius:4px;background:var(--bg2,#eee);color:var(--text,#111);font-family:inherit}',
'#rai-bq .seg{display:flex;gap:6px}#rai-bq .seg .tbtn{flex:1;min-height:42px;font-size:14px}#rai-bq .seg .tbtn.on{background:var(--gold,#a80);color:var(--bg,#fff)}',
'#rai-bq .row{display:flex;gap:8px;margin-top:12px;flex-wrap:wrap}#rai-bq .row .tbtn{flex:1 1 28%;min-height:44px;font-size:15px}',
'#rai-bq-st{font-size:13px;line-height:1.7;color:var(--text2,#555);font-family:sans-serif;margin-top:8px;white-space:pre-line}',
'#rai-bq-list{margin-top:6px;max-height:34vh;overflow:auto;border:1px solid var(--border,#ccc);border-radius:4px}',
'#rai-bq-list .it{display:flex;gap:6px;align-items:flex-start;padding:7px 9px;border-bottom:1px solid var(--border,#ddd);font-size:13px;line-height:1.6}',
'#rai-bq-list .it .tx{flex:1;min-width:0}#rai-bq-list .it .sn{direction:ltr;text-align:left;color:var(--text2,#555);overflow-wrap:anywhere}',
'#rai-bq-list .it .tbtn{min-width:40px;min-height:36px}',
/* --- نافذة تصدير نتائج البحث (Markdown) --- */
'#rai-ex{position:fixed;inset:0;z-index:10000;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.55);direction:rtl}',
'#rai-ex.show{display:flex}',
'#rai-ex .box{background:var(--bg,#fff);color:var(--text,#111);border:1px solid var(--border,#ccc);border-radius:8px;padding:14px;width:min(94vw,480px);max-height:92vh;overflow:auto}',
'#rai-ex-info{font-size:13px;line-height:1.7;color:var(--text2,#555);font-family:sans-serif;margin:8px 0}',
'#rai-ex label{display:block;margin:10px 0 3px;font-size:13px;font-family:sans-serif;color:var(--text2,#555)}',
'#rai-ex-pad,#rai-ex-q{width:100%;box-sizing:border-box;padding:10px;font-size:16px;border:1px solid var(--border,#ccc);border-radius:4px;background:var(--bg2,#eee);color:var(--text,#111);font-family:inherit}',
'#rai-ex-prev{width:100%;box-sizing:border-box;height:150px;margin-top:10px;padding:8px;font-size:12.5px;line-height:1.6;direction:rtl;border:1px solid var(--border,#ccc);border-radius:4px;background:var(--bg2,#eee);color:var(--text,#111);resize:vertical}',
'#rai-ex .row{display:flex;gap:8px;margin-top:12px;flex-wrap:wrap}#rai-ex .row .tbtn{flex:1 1 30%;min-height:42px;font-size:15px}'
].join('\n');

var ov, els={}, run=null; // run = {ac, mode, snap}
function injectCss(){
  if($('rai-style')) return;
  var st=mk('style',{id:'rai-style'}); st.textContent=CSS; document.head.appendChild(st);
}

function buildOverlay(){
  if(ov) return;
  injectCss();
  els.ttl=mk('div',{id:'rai-ttl'});
  els.stop=mk('button',{type:'button',class:'tbtn',text:'⏹ إيقاف',onclick:function(){ if(run&&run.ac) run.ac.abort(); }});
  els.stop.style.display='none';
  var close=mk('button',{type:'button',class:'tbtn',text:'✕','aria-label':'إغلاق',onclick:closeOv});
  els.quote=mk('div',{id:'rai-quote'});
  els.status=mk('div',{id:'rai-status'});
  els.plan=mk('details',{id:'rai-plan'}); els.plan.style.display='none';
  els.out=mk('div',{id:'rai-out'});
  els.err=mk('div',{id:'rai-err'});
  els.src=mk('div',{id:'rai-src'}); els.src.style.display='none';
  els.bd=mk('div',{id:'rai-bd'},[els.quote,els.status,els.plan,els.out,els.err,els.src]);
  els.q=mk('input',{id:'rai-q',type:'text',placeholder:'سؤال إضافي عن هذا النص (اختياري)…',enterkeyhint:'send',
    onkeydown:function(e){ if(e.key==='Enter'){ e.preventDefault(); rerun(run?run.mode:'explain'); } }});
  function fbtn(t,mode){ return mk('button',{type:'button',class:'tbtn',text:t,onclick:function(){ rerun(mode); }}); }
  els.copy=mk('button',{type:'button',class:'tbtn',text:'📋 نسخ',onclick:copyOut});
  els.share=mk('button',{type:'button',class:'tbtn',text:'📤 مشاركة',onclick:shareOut,
    title:'مشاركة النص والجواب والمصادر عبر أي تطبيق على الجهاز'});
  var ft=mk('div',{id:'rai-ft'},[els.q,provSelect('ai-sel'),fbtn('📖','book'),fbtn('💡','explain'),fbtn('🔎','search'),fbtn('🔬','deep'),els.share,els.copy]);
  var hd=mk('div',{id:'rai-hd'},[els.ttl,els.stop,close]);
  ov=mk('div',{id:'rai-ov',translate:'no',lang:'ar',dir:'rtl',role:'dialog','aria-modal':'true'},[hd,els.bd,ft]);
  document.body.appendChild(ov);
  buildSettings();
}
function closeOv(){ if(run&&run.ac) run.ac.abort(); ov.classList.remove('show'); }
function rememberSiteCopy(t){
  try{
    if(window.ReaderCopyContext&&typeof window.ReaderCopyContext.remember==='function') window.ReaderCopyContext.remember(t);
    else window.dispatchEvent(new CustomEvent('reader:copy',{detail:{text:t,source:'reader-ai'}}));
  }catch(e){}
}
function copyOut(){
  var t=(els.out.innerText||els.out.textContent||'').trim();
  if(els.src.style.display!=='none') t+='\n\nالمصادر:\n'+(els.src.innerText||'');
  rememberSiteCopy(t);
  function done(m){ els.status.textContent=m; }
  try{ navigator.clipboard.writeText(t).then(function(){ done('✓ نُسخ'); },function(){ fallbackCopy(t); done('✓ نُسخ'); }); }
  catch(e){ fallbackCopy(t); done('✓ نُسخ'); }
}
function fallbackCopy(t){
  rememberSiteCopy(t);
  var ta=mk('textarea'); ta.value=t; ta.style.cssText='position:fixed;opacity:0;top:0'; document.body.appendChild(ta);
  ta.select(); try{ document.execCommand('copy'); }catch(e){} ta.remove();
}

/* ---------- الإعدادات ---------- */
function buildSettings(){
  var c=cfg();
  els.sUrl=mk('input',{type:'text',autocomplete:'off',spellcheck:'false',placeholder:'https://…supabase.co/functions/v1/research-assistant'});
  els.sPass=mk('input',{type:'password',autocomplete:'off',spellcheck:'false',placeholder:'كلمة مرور المساعد (ASSISTANT_PASSPHRASE)'});
  els.sModel=mk('input',{type:'text',autocomplete:'off',spellcheck:'false',placeholder:'اتركه فارغاً = يبدأ من الأعلى ثم ينزل تلقائياً'});
  els.sOModel=mk('input',{type:'text',autocomplete:'off',spellcheck:'false',placeholder:'openrouter/free = يختار نموذجاً مجانياً متاحاً تلقائياً'});
  els.sMsg=mk('div',{class:'hint'});
  var save=mk('button',{type:'button',class:'tbtn',text:'حفظ',onclick:function(){
    var u=els.sUrl.value.trim(), p=els.sPass.value.trim(), m=els.sModel.value.trim();
    if(!/^https:\/\/\S+$/.test(u)){ els.sMsg.textContent='رابط الدالة غير صالح.'; return; }
    if(p.length<16){ els.sMsg.textContent='كلمة المرور أقصر من 16 حرفاً — هي نفسها المضبوطة في أسرار الدالة.'; return; }
    if(m&&!/^gemini-[A-Za-z0-9._-]+$/.test(m)){ els.sMsg.textContent='اسم النموذج يجب أن يبدأ بـ gemini-'; return; }
    var om=els.sOModel.value.trim();
    if(om&&!/^[A-Za-z0-9._-]{1,40}\/[A-Za-z0-9._-]{1,80}(:[A-Za-z0-9._-]{1,20})?$/.test(om)){ els.sMsg.textContent='صيغة النموذج المجاني غير صحيحة — مثال: openrouter/free أو google/gemma-4-31b-it:free'; return; }
    lsSet(K_URL,u); lsSet(K_PASS,p); lsSet(K_MODEL,m); /* فارغ = تبدأ الدالة من أعلى نموذج في السلسلة */
    lsSet(K_OMODEL,om);
    $('rai-set').classList.remove('show');
    if(settingsThen){ var f=settingsThen; settingsThen=null; f(); }
  }});
  var cancel=mk('button',{type:'button',class:'tbtn',text:'إلغاء',onclick:function(){ settingsThen=null; $('rai-set').classList.remove('show'); }});
  var ping=mk('button',{type:'button',class:'tbtn',text:'🩺 فحص Gemini',style:'width:100%;margin-top:10px;min-height:40px',onclick:function(){
    var u=els.sUrl.value.trim(), p=els.sPass.value.trim(), m=els.sModel.value.trim();
    if(!/^https:\/\/\S+$/.test(u)||p.length<16){ els.sMsg.textContent='أدخل الرابط وكلمة المرور أولاً.'; return; }
    els.sMsg.textContent='⏳ أفحص (قد يستغرق حتى 30 ثانية)…';
    var h={'content-type':'application/json','x-assistant-pass':p}, k=cfg().key; if(k) h.apikey=k;
    var b={provider:'gemini',mode:'ping'}; if(/^gemini-/.test(m)) b.model=m;
    fetch(u,{method:'POST',headers:h,body:JSON.stringify(b)}).then(function(r){ return r.text().then(function(t){ return {s:r.status,t:t}; }); })
    .then(function(x){
      var j; try{ j=JSON.parse(x.t); }catch(e){ els.sMsg.textContent='ردّ غير متوقع ('+x.s+'): '+x.t.slice(0,200); return; }
      if(x.s!==200){ els.sMsg.textContent=(j.error||('خطأ '+x.s)); return; }
      var L=['النموذج: '+j.model,
        'الاتصال بـ Google/المفتاح: '+(j.list_status===200?'✓ سليم ('+j.list_ms+'ms)':'✗ '+j.list_status+' '+(j.list_error||'')),
        'تجربة النموذج: '+(j.test_status===200?'✓ يردّ ('+j.test_ms+'ms)':'✗ '+j.test_status+' '+(j.test_error||''))];
      if(j.models&&j.models.length) L.push('النماذج المتاحة لمفتاحك: '+j.models.join(' ، '));
      els.sMsg.style.whiteSpace='pre-wrap'; els.sMsg.style.direction='ltr'; els.sMsg.textContent=L.join('\n');
    }).catch(function(e){ els.sMsg.textContent='تعذّر الوصول إلى الدالة: '+(e&&e.message||e); });
  }});
  var box=mk('div',{class:'box'},[
    mk('div',{text:'⚙ إعدادات شريط الذكاء',style:'font-weight:700;font-size:15px'}),
    mk('label',{text:'رابط الدالة'}),els.sUrl,
    mk('label',{text:'كلمة مرور المساعد'}),els.sPass,
    mk('label',{text:'نموذج Gemini (اختياري)'}),els.sModel,
    mk('label',{text:'النموذج المجاني (اختياري) — للمحرك «🆓 ذكاء مجاني»'}),els.sOModel,
    els.sMsg,
    ping,
    mk('div',{class:'row'},[save,cancel]),
    mk('div',{class:'hint',text:'تُحفَظ هذه القيم على هذا الجهاز فقط وتُشارَك مع صفحة المحادثة الرئيسية. مفتاح Gemini نفسه يبقى سراً في Supabase.'})
  ]);
  var wrap=mk('div',{id:'rai-set',translate:'no',dir:'rtl'},[box]);
  document.body.appendChild(wrap);
}
var settingsThen=null;
function openSettings(then){
  buildOverlay();
  var c=cfg();
  els.sUrl.value=c.url; els.sPass.value=c.pass; els.sModel.value=lsGet(K_MODEL)||''; els.sOModel.value=lsGet(K_OMODEL)||''; els.sMsg.textContent='';
  settingsThen=then||null;
  $('rai-set').classList.add('show');
}

/* ---------- المشاركة عبر التطبيقات (قائمة المشاركة في الجهاز) ---------- */
// نص جاهز للصق في أي تطبيق أو نموذج: بيانات المرجع + النص المحدد (+ الجواب والمصادر إن وُجدت)
function shareText(s,answer,sources,q){
  var L=[];
  var ref=[];
  if(s.book) ref.push('الكتاب: '+s.book);
  if(s.author) ref.push('المؤلف: '+s.author);
  if(s.pid) ref.push('الفقرة: '+s.pid);
  if(ref.length) L.push(ref.join(' — '));
  if(s.text) L.push('«'+s.text+'»');
  if(q) L.push('سؤالي: '+q);
  if(answer) L.push('— الجواب —\n'+answer);
  if(sources) L.push('المصادر:\n'+sources);
  L.push('(من القراء العشرة: https://alya71712-svg.github.io/readers/)');
  return L.join('\n\n');
}
function doShare(title,text){
  function fallback(){
    copyText(text);
    toast('✓ نُسخ النص — الصقه في أي تطبيق (المشاركة المباشرة غير متاحة في هذا المتصفح)');
  }
  if(typeof navigator.share!=='function'){ fallback(); return; }
  var p; try{ p=navigator.share({title:title,text:text}); }catch(e){ fallback(); return; }
  if(p&&p.catch) p.catch(function(e){ if(e&&e.name!=='AbortError') fallback(); });
}
function copyText(t){
  rememberSiteCopy(t);
  try{ navigator.clipboard.writeText(t).catch(function(){ fallbackCopy(t); }); }catch(e){ fallbackCopy(t); }
}
// من نافذة النتيجة: يشارك النص + الجواب + المصادر
function shareOut(){
  var s=snap||{text:'',book:'',author:'',pid:''};
  var ans=(els.out&&(els.out.innerText||els.out.textContent)||'').trim();
  var src='';
  if(els.src&&els.src.style.display!=='none'){
    src=Array.prototype.map.call(els.src.querySelectorAll('a'),function(a,i){ return (i+1)+'. '+a.textContent.trim()+' — '+a.href; }).join('\n');
  }
  var q=els.q?els.q.value.trim():'';
  doShare('من القراء العشرة'+(s.book?' — '+s.book:''),shareText(s,ans,src,q));
}
// من اللوحة العلوية: يشارك النص المحدد مع مرجعه مباشرة دون استدعاء أي نموذج
function shareSelection(){
  var s=takeSnapshot();
  if(!s){ toast('حدّد نصاً في الكتاب أولاً ثم اضغط الزر.'); return; }
  snap=s;
  openShareSheet(s);
}
// نافذة صغيرة: معاينة النص المحدد + سطر لسؤال إضافي (اختياري) يُلحَق بالنص المُشارَك
var sh=null, shEls={}, shSnap=null;
function buildShareSheet(){
  if(sh) return;
  injectCss();
  shEls.quote=mk('div',{id:'rai-sh-q'});
  shEls.q=mk('input',{id:'rai-sh-in',type:'text',placeholder:'اكتب سؤالك هنا (اختياري)…',enterkeyhint:'send',autocomplete:'off',
    onkeydown:function(e){ if(e.key==='Enter'){ e.preventDefault(); sendShareSheet(false); } }});
  var go=mk('button',{type:'button',class:'tbtn',text:'📤 مشاركة',onclick:function(){ sendShareSheet(false); }});
  var cp=mk('button',{type:'button',class:'tbtn',text:'📋 نسخ',onclick:function(){ sendShareSheet(true); }});
  var cancel=mk('button',{type:'button',class:'tbtn',text:'إلغاء',onclick:closeShareSheet});
  var box=mk('div',{class:'box'},[
    mk('div',{text:'📤 مشاركة النص المحدد',style:'font-weight:700;font-size:15px'}),
    shEls.quote,
    mk('label',{text:'سؤال إضافي (اختياري) — يُضاف إلى النص المُشارَك'}),shEls.q,
    mk('div',{class:'row'},[go,cp,cancel])
  ]);
  sh=mk('div',{id:'rai-sh',translate:'no',dir:'rtl',role:'dialog','aria-modal':'true',
    onclick:function(e){ if(e.target===sh) closeShareSheet(); }},[box]);
  document.body.appendChild(sh);
}
// تحديد النص ما زال حياً في الصفحة فيرسم كروم فوق النافذة قائمته الأصلية (نسخ/تحديد الكل…) ومقبضَي التحديد؛
// النص محفوظ في اللقطة s أصلاً، فنُلغي التحديد الحي (ونكرّر بعد لحظة لأن قائمة كروم تُرسم متأخرة)
function clearLiveSelection(){
  if(!sh||!sh.classList.contains('show')) return;            // أُغلقت النافذة: لا نلمس تحديداً جديداً للمستخدم
  if(document.activeElement&&document.activeElement.id==='rai-sh-in') return; // يكتب سؤاله: لا نقاطعه
  try{ var a=document.activeElement; if(a&&a!==document.body&&a.blur&&a.id!=='rai-sh-in') a.blur(); }catch(e){}
  try{ var g=window.getSelection&&window.getSelection(); if(g&&g.removeAllRanges) g.removeAllRanges(); }catch(e){}
}
function openShareSheet(s){
  buildShareSheet();
  shSnap=s;
  var t=(s.text||'').replace(/\s+/g,' ').trim();
  shEls.quote.textContent=(s.book?s.book+(s.pid?' — فقرة '+s.pid:'')+'\n':'')+(t.length>180?t.slice(0,180)+'…':t);
  shEls.quote.style.whiteSpace='pre-line';
  shEls.q.value='';
  sh.classList.add('show');
  clearLiveSelection(); setTimeout(clearLiveSelection,120); setTimeout(clearLiveSelection,400);
}
function closeShareSheet(){ if(sh) sh.classList.remove('show'); }
function sendShareSheet(copyOnly){
  var s=shSnap; if(!s){ closeShareSheet(); return; }
  var q=shEls.q.value.trim();
  var text=shareText(s,'','',q);
  closeShareSheet();
  if(copyOnly){ copyText(text); toast('✓ نُسخ النص — الصقه في أي تطبيق'); return; }
  doShare('من القراء العشرة'+(s.book?' — '+s.book:''),text);
}

/* ---------- التشغيل ---------- */
var LABEL={ book:'📖 من نصوص الكتاب', explain:'💡 شرح', search:'🔎 بحث', deep:'🔬 بحث عميق' };
var snap=null; // آخر لقطة نص/سياق تُعاد عليها الأوضاع

function takeSnapshot(){
  var live=null;
  var sel=window.getSelection&&window.getSelection();
  if(sel&&sel.rangeCount&&sel.toString().trim().length>=2){ capture(); }
  if(last&&Date.now()-last.ts<SEL_KEEP_MS){
    // لا نستعمل تحديداً لكتاب غير المفتوح الآن
    var info=bookInfo(last.container);
    if(last.bookId===null||info.id===last.bookId){
      var ctx=contextAround(last);
      live={ text:last.text.slice(0,MAX_TEXT), book:last.info.title, author:last.info.author,
             pid:last.pid==null?'':String(last.pid), before:ctx.before, after:ctx.after };
    }
  }
  return live;
}

function start(mode){
  buildOverlay();
  if(mode==='book'){ openAskBook(); return; }
  var s=takeSnapshot();
  if(!s){
    if(snap&&ov.classList.contains('show')){ s=snap; }
    else { toast('حدّد نصاً في الكتاب أولاً ثم اضغط الزر.'); return; }
  }
  snap=s;
  var c=cfg();
  if(getProv()!=='claude'&&(!c.url||c.pass.length<16)){ openSettings(function(){ start2(mode); }); return; }
  start2(mode);
}
// بعد ضبط الإعدادات لا نلتقط التحديد من جديد (قد ضاع) بل نستعمل اللقطة
function start2(mode){ if(snap) prepareBookAndGo(mode,snap,''); }
function rerun(mode){
  if(mode==='book'){ openAskBook(els.q?els.q.value.trim():''); return; }
  if(!snap) return;
  var q=els.q.value.trim();
  prepareBookAndGo(mode,snap,q);
}
// ترجمة سؤال الباحث إلى لغة الكتاب لتحسين الاسترجاع؛ تظل الإجابة باللغة العربية.
function translateBookQuery(c,question,sample){
  if(!question||!/[؀-ۿ]/.test(question)||!c.url||c.pass.length<16) return Promise.resolve('');
  var usr='Question (Arabic): '+question+'\nCorpus sample:\n'+String(sample||'').slice(0,1200);
  var headers={'content-type':'application/json','x-assistant-pass':c.pass}; if(c.key) headers.apikey=c.key;
  function clean(t){ return String(t||'').replace(/<think>[\s\S]*?<\/think>/g,'').trim(); }
  function sse(res,pick){
    return res.text().then(function(raw){
      var out='';
      raw.replace(/\r\n/g,'\n').split('\n').forEach(function(line){
        if(line.indexOf('data:')!==0) return;
        var d=line.slice(5).trim(); if(!d||d==='[DONE]') return;
        try{ out+=pick(JSON.parse(d))||''; }catch(e){}
      });
      return out;
    });
  }
  function viaGemini(){
    var body={provider:'gemini',native:{systemInstruction:{parts:[{text:TR_SYS}]},contents:[{role:'user',parts:[{text:usr}]}],generationConfig:{temperature:0.1,maxOutputTokens:1024}}};
    var m=(lsGet(K_MODEL)||'').trim(); if(/^gemini-/.test(m)) body.model=m;
    return fetchText(c.url,{method:'POST',headers:headers,body:JSON.stringify(body)},25000).then(function(res){
      if(!res.ok) throw new Error('translation '+res.status);
      return sse(res,function(ev){ var ps=(ev.candidates&&ev.candidates[0]&&ev.candidates[0].content&&ev.candidates[0].content.parts)||[]; return ps.map(function(p){ return p.text&&!p.thought?p.text:''; }).join(''); });
    });
  }
  // إن تعذّر Gemini (حدّ الطلبات مثلاً) نجرّب النموذج المجاني نفسه عبر الدالة
  function viaOpen(){
    var body={provider:'openrouter',model:OPEN_DEFAULT,messages:[{role:'system',content:TR_SYS},{role:'user',content:usr}],max_tokens:400};
    return fetchText(c.url,{method:'POST',headers:headers,body:JSON.stringify(body)},30000).then(function(res){
      if(!res.ok) throw new Error('translation '+res.status);
      return sse(res,function(ev){ var ch=ev.choices&&ev.choices[0]; return (ch&&((ch.delta&&ch.delta.content)||(ch.message&&ch.message.content)))||''; });
    });
  }
  return viaGemini().catch(function(){ return ''; }).then(function(t){
    t=clean(t); if(t) return t;
    return viaOpen().catch(function(){ return ''; }).then(clean);
  });
}
function prepareBookAndGo(mode,s,q){
  if(mode!=='book'){go(mode,s,q);return;}
  var c=cfg(), question=q||s.text||'';
  s.bookSearchTerms='';
  els.status.textContent='🌐 يترجم سؤال البحث تلقائياً إلى لغة الكتاب لتحسين العثور على الفقرات…';
  translateBookQuery(c,question,bookParagraphs().slice(0,3).map(function(p){return p.text;}).join(' ')).then(function(translated){
    if(translated) s.bookSearchTerms=translated;
    s.bookTranslationFailed=!!question&&/[\u0600-\u06FF]/.test(question)&&!translated;
    go(mode,s,q);
  });
}

function go(mode,s,q){
  if(run&&run.ac) run.ac.abort();
  var c=cfg();
  if(getProv()!=='claude'&&(!c.url||c.pass.length<16)){ openSettings(function(){ go(mode,s,q); }); return; }
  var prov=getProv(), openMode=prov==='open';
  els.ttl.textContent=LABEL[mode]+' · '+PNAME[prov]+(s.book?' — '+s.book:'');
  els.quote.textContent=s.text; els.quote.style.display=s.text?'':'none';
  els.status.textContent=mode==='deep'?'جارٍ التحضير…':'جارٍ الاتصال…';
  els.plan.style.display='none'; els.plan.textContent='';
  els.out.textContent=''; els.err.textContent=''; els.src.style.display='none'; els.src.textContent='';
  els.stop.style.display=''; els.bd.scrollTop=0;
  ov.classList.add('show');

  if(mode==='book'){
    var pin=parseInt(s.pid,10)||0;
    if(!(s.passages&&s.passages.length)) s=Object.assign({},s,{passages:retrieve((q||'')+' '+(s.bookSearchTerms||'')+' '+(s.text||''),pin),bookTranslationFailed:!!s.bookTranslationFailed});
    if(!s.passages.length){ els.stop.style.display='none'; els.status.textContent='';
      els.err.textContent='⚠ لم أجد فقرات مناسبة. '+(s.bookTranslationFailed?'تعذّرت الترجمة التلقائية هذه المرة؛ تحقق من اتصال الإنترنت وإعدادات المساعد ثم أعد المحاولة. ':'')+'يمكنك إعادة صياغة السؤال بالعربية؛ النظام يحاول ترجمة كلمات البحث إلى لغة الكتاب.'; return; }
    showPassages(s.passages);
  }
  var ac=new AbortController(); var me={ac:ac,mode:mode}; run=me;
  if(openMode) return goOpen(me,mode,s,q,c);
  if(prov==='claude'||prov==='grok') return goChat(me,mode,s,q,c,prov);
  if(mode==='book') return goBookGemini(me,s,q,c);
  var body={ provider:'gemini', mode:mode, text:s.text, q:q,
             ctx:{ book:s.book, author:s.author, pid:s.pid, before:s.before, after:s.after } };
  var m=(lsGet(K_MODEL)||'').trim(); if(/^gemini-/.test(m)) body.model=m;
  var headers={'content-type':'application/json','x-assistant-pass':c.pass};
  if(c.key) headers.apikey=c.key;

  var acc='', raf=0;
  function paint(){ raf=0; renderMd(els.out,acc); }
  function onEvent(ev){
    if(ev.t==='delta'){ acc+=ev.m; els.status.textContent=''; if(!raf) raf=requestAnimationFrame(paint); }
    else if(ev.t==='status'){ els.status.textContent=ev.m; }
    else if(ev.t==='plan'){
      els.plan.style.display=''; els.plan.textContent='';
      els.plan.appendChild(mk('summary',{text:'محاور البحث ('+ev.m.length+')'}));
      var ul=mk('ul'); ev.m.forEach(function(q){ ul.appendChild(mk('li',{text:q})); }); els.plan.appendChild(ul);
    }
    else if(ev.t==='sources'){ showSources(ev.m); }
    else if(ev.t==='error'){ els.err.textContent='⚠ '+ev.m; }
  }

  fetch(c.url,{method:'POST',headers:headers,body:JSON.stringify(body),signal:ac.signal}).then(function(res){
    if(!res.ok){
      return res.json().catch(function(){ return {}; }).then(function(j){
        var base=res.status===401?'كلمة مرور المساعد غير صحيحة — افتح ⚙ وصحّحها.'
          :res.status===404?'الدالة غير منشورة بهذا الرابط — راجع ⚙.'
          :'رفض الخادم الطلب ('+res.status+').';
        throw new Error((typeof j.error==='string'&&j.error)?j.error:base);
      });
    }
    var rd=res.body.getReader(), dec=new TextDecoder(), buf='';
    function pump(){
      return rd.read().then(function(r){
        if(r.done){ if(buf.trim()) feed(buf); return; }
        buf+=dec.decode(r.value,{stream:true}).replace(/\r\n/g,'\n');
        var i; while((i=buf.indexOf('\n\n'))>=0){ var blk=buf.slice(0,i); buf=buf.slice(i+2); feed(blk); }
        return pump();
      });
    }
    function feed(block){
      block.split('\n').forEach(function(line){
        if(line.indexOf('data:')!==0) return;
        var d=line.slice(5).trim(); if(!d) return;
        var ev; try{ ev=JSON.parse(d); }catch(e){ return; }
        onEvent(ev);
      });
    }
    return pump();
  }).catch(function(e){
    if(e&&e.name==='AbortError'){ els.status.textContent='أُوقف.'; return; }
    els.err.textContent='⚠ '+(e&&e.message?e.message:'تعذّر الاتصال بالدالة.')+
      (/Failed to fetch|NetworkError|Load failed/i.test(String(e&&e.message))?'\nتحقق من الاتصال بالإنترنت ومن نشر الدالة.':'');
  }).then(function(){
    if(raf){ cancelAnimationFrame(raf); paint(); }
    if(run===me){ els.stop.style.display='none'; if(els.status.textContent.indexOf('جارٍ')===0||/^[🧭🔎✍]/.test(els.status.textContent)) els.status.textContent=''; }
  });
}

function showPassages(list){
  if(!list||!list.length) return;
  els.src.style.display=''; els.src.textContent='';
  els.src.appendChild(mk('strong',{text:'الفقرات التي بُني عليها الجواب ('+list.length+')'}));
  var ol=mk('ul');
  list.forEach(function(p){
    var t=p.text;
    ol.appendChild(mk('li',{},[mk('b',{text:(p.lab||('فقرة '+p.pid))+': '}),document.createTextNode(t)]));
  });
  els.src.appendChild(ol);
}
function goBookGemini(me,s,q,c){
  els.status.textContent='📖 يجيب من '+s.passages.length+' فقرة مسترجعة من الكتاب…';
  var headers={'content-type':'application/json','x-assistant-pass':c.pass}; if(c.key) headers.apikey=c.key;
  var body={provider:'gemini',native:{systemInstruction:{parts:[{text:SYS_BOOK}]},
    contents:[{role:'user',parts:[{text:subjectText(s,q)}]}],generationConfig:{temperature:0.2,maxOutputTokens:4096}}};
  var m=(lsGet(K_MODEL)||'').trim(); if(/^gemini-/.test(m)) body.model=m;
  var acc='', raf=0;
  function paint(){ raf=0; renderMd(els.out,acc); }
  fetch(c.url,{method:'POST',headers:headers,body:JSON.stringify(body),signal:me.ac.signal}).then(function(res){
    if(!res.ok) return res.json().catch(function(){ return {}; }).then(function(j){
      throw new Error(res.status===401?'كلمة مرور المساعد غير صحيحة — افتح ⚙ وصحّحها.':((typeof j.error==='string'&&j.error)||(j.error&&j.error.message)||'رفض الخادم الطلب ('+res.status+').'));
    });
    var rd=res.body.getReader(), dec=new TextDecoder(), buf='';
    function feed(block){
      block.split('\n').forEach(function(line){
        if(line.indexOf('data:')!==0) return;
        var ev; try{ ev=JSON.parse(line.slice(5).trim()); }catch(e){ return; }
        if(ev.error) throw new Error(ev.error.message||'خطأ من Gemini.');
        var parts=(ev.candidates&&ev.candidates[0]&&ev.candidates[0].content&&ev.candidates[0].content.parts)||[];
        parts.forEach(function(p){ if(p.text&&!p.thought){ acc+=p.text; els.status.textContent=''; if(!raf) raf=requestAnimationFrame(paint); } });
      });
    }
    function pump(){ return rd.read().then(function(r){
      if(r.done){ if(buf.trim()) feed(buf); return; }
      buf+=dec.decode(r.value,{stream:true}).replace(/\r\n/g,'\n');
      var i; while((i=buf.indexOf('\n\n'))>=0){ var blk=buf.slice(0,i); buf=buf.slice(i+2); feed(blk); }
      return pump(); }); }
    return pump();
  }).catch(function(e){
    if(e&&e.name==='AbortError'){ els.status.textContent='أُوقف.'; return; }
    els.err.textContent='⚠ '+(e&&e.message?e.message:'تعذّر الاتصال بالدالة.');
  }).then(function(){
    if(raf){ cancelAnimationFrame(raf); paint(); }
    if(run===me){ els.stop.style.display='none';
      if(acc&&!els.err.textContent) els.status.textContent='الجواب مبني على فقرات الكتاب المعروضة أدناه — تحقّق من أرقام الفقرات.';
      else if(!acc&&!els.err.textContent) els.status.textContent='لم يصل ردّ من النموذج — أعد المحاولة.'; }
  });
}

function showSources(list){
  if(!list||!list.length) return;
  els.src.style.display=''; els.src.textContent='';
  els.src.appendChild(mk('strong',{text:'المصادر'}));
  var ol=mk('ol');
  list.forEach(function(s){
    var u=String(s.uri||''); if(!/^https?:\/\//.test(u)) return;
    ol.appendChild(mk('li',{},[mk('a',{href:u,target:'_blank',rel:'noopener noreferrer',text:s.title||u})]));
  });
  els.src.appendChild(ol);
}


/* ---------- المحرك المجاني (نماذج مفتوحة عبر OpenRouter من الدالة نفسها) ---------- */
// لا يملك بحث ويب: يجيب من معرفة النموذج. لذلك نُصرّح بذلك في الواجهة وفي التعليمات.
var PERSONA_O='أنت مساعد بحثي لباحث عربي مستقل يعمل في التاريخ المقارن والدراسات الدينية: التاريخ الروماني والبيزنطي والمسيحية المبكرة '+
  'والفكر الإسكندري واليهودية الهلنستية والتقاليد الإسلامية والقانونية، على مصادر أولية بالعربية واليونانية والسريانية والفرنسية والإيطالية. '+
  'اكتب بالعربية الفصحى الواضحة، وأبقِ المصطلحات الفنية والأعلام بلغتها الأصلية بين قوسين عند أول ذكر. '+
  'ميّز دائماً بين ما يقوله النص نفسه وما تضيفه أنت من خارجه، وبين المتفق عليه والمختلف فيه بين الباحثين. '+
  'لا تخترع اقتباسات ولا مراجع ولا أرقام صفحات؛ وإن لم تكن متأكداً فقل ذلك صراحة. '+
  'لا تنقل مقاطع طويلة من المصادر حرفياً؛ لخّص بصياغتك.';
var SYS_BOOK=PERSONA_O.replace('لا تنقل مقاطع طويلة من المصادر حرفياً؛ لخّص بصياغتك.','')+
  '\n\nالمهمة: أجب عن سؤال الباحث اعتماداً حصرياً على الفقرات المسترجعة من الكتاب المرفقة، لا من معرفتك العامة. '+
  'القواعد: (١) كل ادعاء في جوابك يُسند إلى فقرة بذكر وسمها كما ورد بين قوسين معقوفين، مثل [فقرة 12] أو [فقرة 12 — عنوان الكتاب]. '+
  '(٢) استشهد بعبارات قصيرة منقولة حرفياً بين «» من الفقرات نفسها كما وردت، ولا تغيّر حرفاً داخل علامات الاقتباس. '+
  '(٣) إن لم تجب الفقرات عن السؤال أو أجابت عن جزء منه فقل صراحة: «لا يجيب النص المتاح عن هذا» وبيّن ما ينقص، ولا تكمل من عندك. '+
  '(٤) إن أضفت توضيحاً من خارج النص فضعه في فقرة أخيرة مستقلة بعنوان «من خارج النص» وصرّح بأنه غير مستند إلى الكتاب. '+
  'البنية: الجواب المباشر في سطرين، ثم الشواهد من النص مرتبة، ثم «من خارج النص» إن لزم. اجعله موجزاً يُقرأ على الهاتف.';
var SYS_O={
  book:SYS_BOOK,
  explain:PERSONA_O+'\n\nالمهمة: شرح النص المحدد. رتّب الجواب هكذا بعناوين قصيرة: '+
    '١) المعنى باختصار، ٢) شرح المفردات والعبارات الغامضة، ٣) الأعلام والأحداث والسياق التاريخي، '+
    '٤) نقاط الالتباس أو الاحتمالات في الفهم أو الترجمة. اجعل الجواب مركّزاً يُقرأ بسهولة على شاشة هاتف.',
  search:PERSONA_O+'\n\nالمهمة: أنت لا تتصفح الويب الآن؛ أجب من معرفتك فقط. قدّم خلاصة مركّزة عمّا يخص هذا النص أو سؤال الباحث: '+
    'ما تعرفه، ومن قاله (مصدر أولي أم دراسة أم موسوعة) وما الخلاف القائم إن وُجد. '+
    'اذكر أسماء مصادر أو دراسات فقط إن كنت واثقاً أنها موجودة، وصرّح بما لا تعرفه. '+
    'ابدأ الجواب بسطر: «ملاحظة: هذا من معرفة النموذج دون بحث ويب — تحقق من المصادر.» ثم اجعل الجواب موجزاً بعناوين قصيرة.',
  deep:PERSONA_O+'\n\nالمهمة: أنت لا تتصفح الويب الآن؛ اكتب تقريراً بحثياً مركّزاً من معرفتك فقط عمّا يخص هذا النص أو سؤال الباحث. '+
    'البنية: ملخص في سطرين، أهم النتائج، مواضع الخلاف أو عدم اليقين بين الباحثين، المصادر الأولية والدراسات التي ينبغي مراجعتها '+
    '(سمّها فقط إن كنت واثقاً من وجودها)، ما يلزم التحقق منه، ثم خلاصة. '+
    'ابدأ التقرير بسطر: «ملاحظة: هذا من معرفة النموذج دون بحث ويب — تحقق من المصادر.»'
};
/* ---------- إجابات من نص الكتاب: استرجاع الفقرات الأقرب إلى السؤال ---------- */
var BOOK_MAX_CHARS=16000, BOOK_MAX_PARAS=14, BOOK_PARA_CAP=1800;
var AR_STOP={'في':1,'من':1,'على':1,'إلى':1,'الى':1,'عن':1,'أن':1,'ان':1,'إن':1,'ما':1,'ماذا':1,'هل':1,'هو':1,'هي':1,'هذا':1,'هذه':1,'ذلك':1,'التي':1,'الذي':1,'الذين':1,'كان':1,'كانت':1,'مع':1,'او':1,'أو':1,'ثم':1,'قد':1,'لا':1,'لم':1,'كيف':1,'لماذا':1,'متى':1,'اين':1,'أين':1,'كل':1,'بين':1,'عند':1,'يقول':1,'النص':1,'الكتاب':1,'the':1,'and':1,'of':1,'to':1,'in':1,'is':1,'a':1};
function normAr(t){
  return String(t||'').toLowerCase().replace(/[\u064B-\u065F\u0670\u0640]/g,'')
    .replace(/[إأآٱ]/g,'ا').replace(/ى/g,'ي').replace(/ة/g,'ه').replace(/ؤ/g,'و').replace(/ئ/g,'ي');
}
function stemAr(w){
  if(w.length>4) w=w.replace(/^(وال|بال|فال|كال|لل|ال)/,'');
  if(w.length>4) w=w.replace(/(ات|ون|ين|ها|هم|يه|ه|ي)$/,'');
  return w;
}
var LAT_STOP={};
('the of and to in an is are was were be been being that this these those it its as at by for from on or with his her their he she they we you not but if so no nor than then there what which who whom whose how why when where does did do has have had will would can could should may might shall must into out up about over also only very such more most other some any each both between through during under after before own same too '+
 'le la les un une des du de et en dans que qui est sont etait ete pour par sur avec ce cette ces se sa son ses leur leurs il elle ils elles nous vous ne pas plus mais ou donc car au aux ni si comme quand dont '+
 'lo gli uno di del della dei delle che per con su da non piu ma come el los las por para es fue et ad est ut cum quod').split(' ').forEach(function(w){ if(w) LAT_STOP[w]=1; });
// تطبيع شامل: العربية (كما كان) ثم إزالة علامات التشكيل اللاتينية/اليونانية (é → e) ليتطابق Héraclius مع Heraclius
function normAny(t){
  var s=normAr(t);
  try{ s=s.normalize('NFD').replace(/[\u0300-\u036f]/g,''); }catch(e){}
  return s;
}
// الجذر: العربية بالدالة السابقة؛ اللاتينية بحذف s الجمع ثم اقتطاع أول 6 أحرف (salvation/salvations → salvat)
function stemAny(w){
  var c=w.charCodeAt(0);
  if(c>=1536&&c<=1791) return stemAr(w);
  if(w.length>4&&w.charAt(w.length-1)==='s') w=w.slice(0,-1);
  return w.length>6?w.slice(0,6):w;
}
function tokens(t){
  return normAny(t).split(RE_SPLIT).filter(function(w){ return w.length>1&&!AR_STOP[w]&&!LAT_STOP[w]; }).map(stemAny);
}
function bookParagraphs(){ return paragraphsOf(library[cur]); }
function paragraphsOf(b){
  try{
    if(!b||!b.content) return [];
    var plan=sxPlan(b), offs=plan.offs, txt=b.content;
    if(plan.items){ var pm=getPageMap(b); if(pm&&pm.displayContent) txt=pm.displayContent; }
    if(!offs.length) offs=[0];
    var out=[];
    for(var i=0;i<offs.length;i++){
      var t=txt.slice(offs[i],i+1<offs.length?offs[i+1]:txt.length).replace(/={3,}\s*([^=\n]*?)\s*={3,}/g,' ⟨$1⟩ ').replace(/\s+/g,' ').trim();
      if(t) out.push({pid:i+1,text:t});
    }
    return out;
  }catch(e){ return []; }
}
function retrieve(query,pinPid){
  var paras=bookParagraphs(); if(!paras.length) return [];
  var qt=tokens(query), uniq={}; qt.forEach(function(w){ uniq[w]=1; });
  var terms=Object.keys(uniq); if(!terms.length&&!pinPid) return [];
  var N=paras.length, df={};
  var toks=paras.map(function(p){ var m={}; tokens(p.text).forEach(function(w){ m[w]=(m[w]||0)+1; }); return m; });
  terms.forEach(function(w){ var n=0; toks.forEach(function(m){ if(m[w]) n++; }); df[w]=n; });
  var scored=paras.map(function(p,i){
    var m=toks[i], sc=0, hit=0;
    terms.forEach(function(w){ if(m[w]){ hit++; sc+=Math.log(1+N/(df[w]||1))*(1+Math.log(m[w])); } });
    sc*=1+hit/terms.length;                                  // مكافأة تغطية كلمات السؤال
    if(pinPid&&Math.abs(p.pid-pinPid)<=1) sc+=1e6-Math.abs(p.pid-pinPid); // فقرة التحديد وجارتاها
    return {p:p,sc:sc};
  }).filter(function(x){ return x.sc>0; }).sort(function(a,b){ return b.sc-a.sc; });
  var pick=[], used=0;
  for(var k=0;k<scored.length&&pick.length<BOOK_MAX_PARAS;k++){
    var t=scored[k].p.text.slice(0,BOOK_PARA_CAP);
    if(used+t.length>BOOK_MAX_CHARS) continue;
    used+=t.length; pick.push({pid:scored[k].p.pid,text:t});
  }
  return pick.sort(function(a,b){ return a.pid-b.pid; });
}
/* ---------- اسأل الكتاب (ask book): سؤال عربي ← نصوص بلغات أخرى ---------- */
// نصوص القارئات لاتينية (إنجليزية/فرنسية/إيطالية…) وسؤال الباحث عربي، فيلزم جسر لغوي:
// ١) يُترجَم السؤال إلى كلمات بحث بلغة الكتاب (وتظهر في حقل يعدّله الباحث بنفسه إن أخفقت الترجمة).
// ٢) يُمسح الكتاب (أو كل كتب القارئ) على دفعات بلا تجميد للشاشة، ويُرتَّب بصيغة TF-IDF.
// ٣) تُعرض الفقرات المسترجعة ليراجعها الباحث، ثم يجيب هنا أو يشارك الطلب مع تطبيق خارجي بنص سليم.
var K_BQSCOPE='readers_bq_scope';
var RE_SPLIT=/[^\p{L}\p{N}]+/u;
var TR_SYS='You help a researcher search a corpus. The researcher asks a question in Arabic; the corpus text is in the language(s) shown in the sample. '+
  'Output exactly two lines. Line 1: the question translated into the corpus language (if the sample mixes languages use the dominant one). '+
  'Line 2: 8-14 search keywords in the corpus language, comma-separated, base forms, with key synonyms and proper names in the alternative spellings used in scholarly translations '+
  '(for example: Origen, Origène, Origenes). No explanations, no labels.';
var bq=null, bqEls={}, bqSel=null, bqPass=[], bqScope='book', bqToken=0, bqQ='';

function arabicShare(t){
  var a=(String(t||'').match(/[؀-ۿ]/g)||[]).length, l=(String(t||'').match(/[A-Za-zÀ-ɏͰ-Ͽ؀-ۿ]/g)||[]).length;
  return l?a/l:0;
}
// عيّنة من نص الكتاب (أو من أربعة كتب موزّعة في القارئ) لمعرفة لغة النصوص
function bqSample(scope){
  var idx=[], i;
  if(scope==='all'&&library.length>1){ var n=Math.min(4,library.length); for(i=0;i<n;i++) idx.push(Math.floor(i*library.length/n)); } else idx.push(cur);
  return idx.map(function(j){
    var c=(library[j]&&library[j].content)||'', at=Math.min(1500,Math.max(0,c.length-400));
    return c.slice(at,at+350).replace(/\s+/g,' ');
  }).join('\n---\n');
}
function fetchText(url,opts,ms){
  var ac=new AbortController(), t=setTimeout(function(){ ac.abort(); },ms||25000);
  opts.signal=ac.signal;
  return fetch(url,opts).then(function(res){ clearTimeout(t); return res; },function(e){ clearTimeout(t); throw e; });
}

// مسح غير متزامن: يقرأ فقرات كل كتاب في النطاق ويحفظ المطابِقة فقط (ذاكرة قليلة حتى مع قارئ 14 ميغابايت)
function askSearch(o,progress,done){
  var books=[], i;
  if(o.scope==='all') for(i=0;i<library.length;i++) books.push(i); else books.push(cur);
  var terms=[], seen=Object.create(null);
  tokens(o.question+' '+o.kw+' '+String(o.sel||'').slice(0,400)).forEach(function(w){ if(!seen[w]){ seen[w]=1; terms.push(w); } });
  terms=terms.slice(0,60);
  var qi=Object.create(null); terms.forEach(function(w,k){ qi[w]=k; });
  var df=terms.map(function(){ return 0; }), hits=[], N=0, bi=0, paras=null, pi=0, token=++bqToken;
  function step(){
    if(token!==bqToken) return;                                  // أُلغي البحث (أُغلقت النافذة أو بدأ بحث جديد)
    var t0=Date.now();
    while(Date.now()-t0<30){
      if(!paras){
        if(bi>=books.length) return finish();
        paras=paragraphsOf(library[books[bi]]); pi=0;
        if(progress) progress(bi+1,books.length);
      }
      if(pi>=paras.length){ paras=null; bi++; continue; }
      var p=paras[pi++]; N++;
      var cnt=null, tk=normAny(p.text).split(RE_SPLIT);
      for(var k=0;k<tk.length;k++){
        var w=tk[k]; if(w.length<2) continue;
        var ix=qi[stemAny(w)]; if(ix===undefined) continue;
        if(!cnt) cnt={}; cnt[ix]=(cnt[ix]||0)+1;
      }
      if(cnt){ Object.keys(cnt).forEach(function(x){ df[x]++; }); hits.push({bi:books[bi],pid:p.pid,text:p.text,cnt:cnt}); }
    }
    setTimeout(step,0);
  }
  function finish(){
    var alive=[]; terms.forEach(function(w,k){ if(df[k]>0) alive.push(k); });
    var multi=books.length>1, pick=[], used=0, taken=Object.create(null);
    function add(b,pid,text,sc){
      var key=b+':'+pid; if(taken[key]) return false;
      text=text.slice(0,BOOK_PARA_CAP); if(used+text.length>BOOK_MAX_CHARS) return false;
      taken[key]=1; used+=text.length; pick.push({bi:b,pid:pid,text:text,sc:sc}); return true;
    }
    // فقرة التحديد وجارتاها دائماً (كالسلوك السابق)
    if(o.pin) paragraphsOf(library[cur]).forEach(function(p){ if(Math.abs(p.pid-o.pin)<=1) add(cur,p.pid,p.text,1e6); });
    var scored=hits.map(function(h){
      var sc=0, hit=0;
      alive.forEach(function(k){ var tf=h.cnt[k]; if(tf){ hit++; sc+=Math.log(1+N/df[k])*(1+Math.log(tf)); } });
      return {h:h,hit:hit,sc:sc*(1+hit/alive.length)};                    // مكافأة تغطية كلمات السؤال الموجودة فعلاً في النصوص
    }).sort(function(a,b){ return b.sc-a.sc; });
    // اسم العلم وحده (Origen ×3 في فهرس المحتويات) لا يكفي: نفضّل الفقرات التي تجمع كلمتين مختلفتين على الأقل متى كان ذلك ممكناً
    var strongN=0;
    if(alive.length>=3){ var strong=scored.filter(function(x){ return x.hit>=2; }); strongN=strong.length; if(strong.length>=3) scored=strong; }
    var perBook=Object.create(null), cap=multi?4:BOOK_MAX_PARAS, main=BOOK_MAX_PARAS-4, tops=[];
    for(var k=0;k<scored.length&&pick.length<main;k++){
      var h=scored[k].h; if((perBook[h.bi]||0)>=cap) continue;
      if(add(h.bi,h.pid,h.text,scored[k].sc)){ perBook[h.bi]=(perBook[h.bi]||0)+1; if(tops.length<2) tops.push(h); }
    }
    // جارتا أقوى نتيجتين: الفقرة التالية ثم السابقة، فالجواب كثيراً ما يمتد خارج الفقرة المطابقة
    tops.forEach(function(h){
      var by={}; paragraphsOf(library[h.bi]).forEach(function(p){ by[p.pid]=p; });
      [h.pid+1,h.pid-1].forEach(function(pid){ if(by[pid]&&pick.length<BOOK_MAX_PARAS) add(h.bi,pid,by[pid].text,0); });
    });
    pick.sort(function(a,b){ return a.bi-b.bi||a.pid-b.pid; });
    done({passages:pick.map(function(p){
      var ttl=String((library[p.bi]&&library[p.bi].title)||'').trim();
      return {pid:p.pid,book:ttl,text:p.text,lab:'فقرة '+p.pid+(multi&&ttl?' — '+ttl:'')};
    }),alive:alive.length,total:terms.length,scanned:N,strong:strongN});
  }
  step();
}

function buildAskBook(){
  if(bq) return;
  injectCss();
  bqEls.ctx=mk('div',{class:'hint'});
  bqEls.q=mk('textarea',{id:'rai-bq-q',rows:'3',placeholder:'اكتب سؤالك بالعربية، مثال: ما موقف أوريجانوس من الخلاص الشامل؟'});
  bqEls.selNote=mk('div',{class:'hint'});
  bqEls.s1=mk('button',{type:'button',class:'tbtn',text:'📖 هذا الكتاب',onclick:function(){ setBqScope('book'); }});
  bqEls.s2=mk('button',{type:'button',class:'tbtn',text:'📚 كل كتب القارئ',onclick:function(){ setBqScope('all'); }});
  bqEls.seg=mk('div',{class:'seg'},[bqEls.s1,bqEls.s2]);
  bqEls.kw=mk('input',{id:'rai-bq-kw',type:'text',dir:'ltr',autocomplete:'off',autocapitalize:'off',spellcheck:'false',
    placeholder:'Origen, salvation, restoration…',onkeydown:function(e){ if(e.key==='Enter'){ e.preventDefault(); bqRun(); } }});
  bqEls.go=mk('button',{type:'button',class:'tbtn',text:'🔍 ابحث عن الفقرات',onclick:bqRun});
  bqEls.st=mk('div',{id:'rai-bq-st'});
  bqEls.cnt=mk('div',{class:'hint'});
  bqEls.list=mk('div',{id:'rai-bq-list'});
  bqEls.listWrap=mk('div',{},[bqEls.cnt,bqEls.list]); bqEls.listWrap.style.display='none';
  bqEls.ans=mk('button',{type:'button',class:'tbtn',text:'💬 أجب هنا',onclick:bqAnswer,title:'يجيب القارئ نفسه بالمحرك المختار في شريط الذكاء'});
  bqEls.shr=mk('button',{type:'button',class:'tbtn',text:'📤 مشاركة',onclick:function(){
    var info=bookInfo($('bookText')); doShare('سؤال عن الكتاب'+(info.title?' — '+info.title:''),bqPayload()); }});
  bqEls.cpy=mk('button',{type:'button',class:'tbtn',text:'📋 نسخ',onclick:function(){
    copyText(bqPayload()); toast('✓ نُسخ السؤال مع الفقرات — الصقه في تطبيق الذكاء'); }});
  bqEls.acts=mk('div',{class:'row'},[bqEls.ans,bqEls.shr,bqEls.cpy]); bqEls.acts.style.display='none';
  var x=mk('button',{type:'button',class:'tbtn',text:'✕','aria-label':'إغلاق',onclick:closeAskBook});
  var box=mk('div',{class:'box'},[
    mk('div',{class:'hd'},[mk('strong',{text:'📖 اسأل الكتاب',style:'font-size:16px'}),x]),
    bqEls.ctx,
    mk('label',{text:'سؤالك'}),bqEls.q,bqEls.selNote,
    mk('label',{text:'نطاق البحث'}),bqEls.seg,
    mk('label',{text:'كلمات البحث بلغة الكتاب — تُملأ بالترجمة تلقائياً، ويمكنك كتابتها أو تعديلها'}),bqEls.kw,
    mk('div',{class:'row'},[bqEls.go]),
    bqEls.st,bqEls.listWrap,bqEls.acts
  ]);
  bq=mk('div',{id:'rai-bq',translate:'no',dir:'rtl',role:'dialog','aria-modal':'true',
    onclick:function(e){ if(e.target===bq) closeAskBook(); }},[box]);
  document.body.appendChild(bq);
}
function setBqScope(s){
  bqScope=(s==='all'&&library.length>1)?'all':'book'; lsSet(K_BQSCOPE,bqScope);
  bqEls.s1.classList.toggle('on',bqScope==='book'); bqEls.s2.classList.toggle('on',bqScope==='all');
}
function openAskBook(prefill){
  buildAskBook();
  var info=bookInfo($('bookText')), sel=null;
  try{ sel=takeSnapshot(); }catch(e){}
  bqSel=sel&&sel.text?sel:null;
  bqEls.ctx.textContent='الكتاب المفتوح: '+(info.title||'—')+(info.author?' — '+info.author:'')+(library.length>1?'  ·  في القارئ '+library.length+' كتاباً':'');
  bqEls.s2.textContent='📚 كل كتب القارئ ('+library.length+')';
  bqEls.seg.style.display=library.length>1?'':'none';
  setBqScope(lsGet(K_BQSCOPE)==='all'?'all':'book');
  if(typeof prefill==='string'&&prefill) bqEls.q.value=prefill;
  bqRenderSel();
  bqEls.st.textContent=''; bqPass=[]; bqRender();
  bq.classList.add('show');
  try{ bqEls.q.focus({preventScroll:true}); }catch(e){}
}
function closeAskBook(){ bqToken++; if(bq) bq.classList.remove('show'); }
function bqRenderSel(){
  bqEls.selNote.textContent='';
  if(!bqSel) return;
  var t=bqSel.text.replace(/\s+/g,' ').trim();
  bqEls.selNote.appendChild(document.createTextNode('النص المحدد'+(bqSel.pid?' (فقرة '+bqSel.pid+')':'')+' يُستعمل سياقاً للبحث: «'+(t.length>90?t.slice(0,90)+'…':t)+'» '));
  bqEls.selNote.appendChild(mk('button',{type:'button',class:'tbtn',text:'إزالة',style:'min-height:30px;padding:2px 10px;font-size:12px',onclick:function(){ bqSel=null; bqRenderSel(); }}));
}
function bqRender(){
  var L=bqEls.list; L.textContent='';
  bqPass.forEach(function(p,i){
    var snip=p.text.length>220?p.text.slice(0,220)+'…':p.text;
    var rm=mk('button',{type:'button',class:'tbtn',text:'✕','aria-label':'استبعاد هذه الفقرة',onclick:function(){ bqPass.splice(i,1); bqRender(); }});
    L.appendChild(mk('div',{class:'it'},[mk('div',{class:'tx'},[mk('b',{text:p.lab}),mk('div',{class:'sn',dir:'ltr',text:snip})]),rm]));
  });
  var has=bqPass.length>0;
  bqEls.listWrap.style.display=has?'':'none'; bqEls.acts.style.display=has?'':'none';
  bqEls.cnt.textContent=has?('الفقرات المختارة: '+bqPass.length+' — اضغط ✕ لاستبعاد ما لا يلزم'):'';
}
function bqRun(){
  var q=bqEls.q.value.trim(), kw=bqEls.kw.value.trim();
  if(!q&&!kw&&!bqSel){ bqEls.st.textContent='اكتب سؤالك أولاً.'; return; }
  bqQ=q; bqPass=[]; bqRender(); bqEls.go.disabled=true;
  var sample=bqSample(bqScope), needTr=!kw&&/[؀-ۿ]/.test(q)&&arabicShare(sample)<0.3, token=bqToken+1;
  function fin(){ bqEls.go.disabled=false; }
  var pr=Promise.resolve('');
  if(needTr){
    bqEls.st.textContent='🌐 أترجم سؤالك إلى لغة الكتاب…';
    pr=translateBookQuery(cfg(),q,sample);
  }
  pr.then(function(tr){
    if(tr){ kw=tr.replace(/\s*\n+\s*/g,' | '); bqEls.kw.value=kw; }
    var failedTr=needTr&&!tr;
    bqEls.st.textContent='🔎 أبحث في '+(bqScope==='all'?'كل كتب القارئ…':'الكتاب…');
    askSearch({question:q,kw:kw,sel:bqSel&&bqSel.text,scope:bqScope,pin:bqSel&&parseInt(bqSel.pid,10)||0},
      function(a,b){ if(b>1) bqEls.st.textContent='🔎 أبحث… كتاب '+a+' من '+b; },
      function(r){
        fin(); if(!bq||!bq.classList.contains('show')) return;
        bqPass=r.passages; bqRender();
        if(!r.passages.length){
          bqEls.st.textContent=(failedTr
            ?'تعذّرت الترجمة التلقائية، والكتاب بلغة غير العربية. اكتب كلمات البحث بلغة الكتاب في الحقل أعلاه (مثل: Origen, salvation) ثم اضغط «ابحث».'
            :'لم أجد فقرات تطابق كلمات البحث ('+r.scanned+' فقرة ممسوحة). جرّب كلمات أخرى في الحقل أعلاه'+(bqScope==='book'&&library.length>1?'، أو اختر «كل كتب القارئ».':'.'));
          return;
        }
        bqEls.st.textContent='وجدتُ '+r.passages.length+' فقرة (مسحتُ '+r.scanned+' فقرة).'
          +(bqScope==='book'&&library.length>1&&r.alive>=3&&r.strong<3?'\n⚠ المطابقة ضعيفة في هذا الكتاب؛ جرّب «كل كتب القارئ».':'')
          +(failedTr?'\n⚠ تعذّرت الترجمة التلقائية فبحثتُ بكلمات سؤالك كما هي؛ إن بدت النتائج ضعيفة فاكتب كلمات بلغة الكتاب في الحقل.':'')
          +'\nراجعها ثم اختر: أجب هنا، أو شارك الطلب مع تطبيق خارجي.';
      });
  });
}
// نص الطلب لتطبيق خارجي: سطور حقيقية (لا \n حرفية) ووسم كل فقرة يحمل اسم كتابها عند البحث في عدة كتب
function bqPayload(){
  var info=bookInfo($('bookText')), L=[];
  L.push('أجب عن سؤال الباحث اعتماداً على الفقرات المرفقة من الكتاب فقط، واكتب الجواب بالعربية. عند الاستشهاد اذكر الوسم نفسه بين قوسين معقوفين (مثل [فقرة 12])، وانقل العبارات القصيرة التي تستشهد بها بلغتها الأصلية بين «» دون تغيير. ميّز بين ما يقوله النص وما تستنتجه أنت. إن لم تكفِ الفقرات للإجابة فقل ذلك صراحة ولا تكمل من معرفتك العامة.');
  if(bqScope==='all') L.push('المصدر: فقرات من عدة كتب في القارئ (وسم كل فقرة يتضمن عنوان كتابها).');
  else if(info.title) L.push('الكتاب: '+info.title+(info.author?' — المؤلف: '+info.author:''));
  L.push('سؤال الباحث: '+(bqQ||bqEls.q.value.trim()));
  if(bqSel&&bqSel.text) L.push('النص الذي حدّده الباحث'+(bqSel.pid?' (فقرة '+bqSel.pid+')':'')+':\n'+bqSel.text.slice(0,1500));
  L.push('الفقرات المسترجعة من الكتاب:\n\n'+bqPass.map(function(p){ return '['+p.lab+'] '+p.text; }).join('\n\n'));
  return L.join('\n\n');
}
function bqAnswer(){
  if(!bqPass.length) return;
  var info=bookInfo($('bookText')), q=(bqQ||bqEls.q.value.trim());
  var s={text:bqSel?bqSel.text:'',book:info.title,author:info.author,pid:bqSel?String(bqSel.pid||''):'',before:'',after:'',passages:bqPass.slice()};
  snap=s; closeAskBook(); buildOverlay(); els.q.value=q;
  go('book',s,q);
}

function subjectText(s,q){
  var L=[];
  if(s.passages){
    if(s.book) L.push('الكتاب: '+s.book+(s.author?' — '+s.author:''));
    if(q) L.push('سؤال الباحث:\n'+q);
    if(s.text) L.push('النص الذي حدّده الباحث'+(s.pid?' (الفقرة '+s.pid+')':'')+':\n'+s.text);
    L.push('الفقرات المسترجعة من الكتاب (أجب منها وحدها):\n\n'+s.passages.map(function(p){ return '['+(p.lab||('فقرة '+p.pid))+'] '+p.text; }).join('\n\n'));
    return L.join('\n\n');
  }
  if(s.book) L.push('الكتاب: '+s.book);
  if(s.author) L.push('المؤلف: '+s.author);
  if(s.pid) L.push('رقم الفقرة: '+s.pid);
  if(s.text) L.push('النص المحدد:\n'+s.text);
  if(s.before) L.push('السياق قبله:\n'+s.before);
  if(s.after) L.push('السياق بعده:\n'+s.after);
  if(q) L.push('سؤال الباحث:\n'+q);
  return L.join('\n\n');
}
// النماذج المفتوحة قد تُخرج <think>…</think>: نخفيها أثناء البثّ
function thinkStrip(emit){
  var inT=false, buf='';
  return function(d){
    buf+=d;
    for(;;){
      if(inT){
        var e=buf.indexOf('</think>');
        if(e<0){ buf=buf.slice(-8); return; }
        buf=buf.slice(e+8); inT=false;
      }else{
        var b=buf.indexOf('<think>');
        if(b>=0){ if(b>0) emit(buf.slice(0,b)); buf=buf.slice(b+7); inT=true; continue; }
        var keep=0, tag='<think>';
        for(var k=Math.min(6,buf.length);k>0;k--){ if(tag.indexOf(buf.slice(-k))===0){ keep=k; break; } }
        if(buf.length>keep) emit(buf.slice(0,buf.length-keep));
        buf=buf.slice(buf.length-keep); return;
      }
    }
  };
}
function goOpen(me,mode,s,q,c){
  if(mode==='book') els.status.textContent='📖 يجيب من '+s.passages.length+' فقرة مسترجعة من الكتاب…'; else els.status.textContent='🆓 النموذج المجاني يجيب من معرفته — لا بحث ويب في هذا المحرك'+(mode==='explain'?'':' (للبحث الحيّ بمصادر اختر 🤖 Gemini)');
  var messages=[{role:'system',content:SYS_O[mode]||SYS_O.explain},{role:'user',content:subjectText(s,q)}];
  var headers={'content-type':'application/json','x-assistant-pass':c.pass};
  if(c.key) headers.apikey=c.key;
  var acc='', raf=0, usedModel='', tried={}, tries=0;
  var emit=function(d){ acc+=d; els.status.textContent=''; if(!raf) raf=requestAnimationFrame(paint); };
  function paint(){ raf=0; renderMd(els.out,acc); }
  function attempt(model){
    tried[model]=1; tries++;
    var out=thinkStrip(emit);
    return fetch(c.url,{method:'POST',headers:headers,signal:me.ac.signal,
      body:JSON.stringify({provider:'openrouter',model:model,messages:messages,max_tokens:4096})}).then(function(res){
      if(!res.ok){
        return res.json().catch(function(){ return {}; }).then(function(j){
          var m=''; try{ m=typeof j.error==='string'?j.error:((j.error&&j.error.message)||j.message||''); }catch(e){}
          var base=res.status===401?'كلمة مرور المساعد أو مفتاح OpenRouter غير صحيح — راجع ⚙ وأسرار الدالة.'
            :res.status===402?'رصيد OpenRouter لا يكفي لهذا النموذج — اختر نموذجاً مجانياً (ينتهي بـ :free).'
            :res.status===403?'هذا النموذج غير مسموح به في الدالة (المسموح: :free أو openrouter/free).'
            :res.status===404?'الدالة أو النموذج غير موجود — راجع ⚙.'
            :res.status===429?'بلغ النموذج (أو مزوّده) حدّ الطلبات أو كان مشغولاً — انتظر قليلاً أو بدّل النموذج.'
            :res.status>=500?'تعذّر الإتمام من جهة الدالة أو OpenRouter ('+res.status+').'
            :'رفض الخادم الطلب ('+res.status+').';
          var err=new Error(base+(m?'\n'+m:''));
          err.retryable=[408,429,502,503,504].indexOf(res.status)>=0;
          throw err;
        });
      }
      var rd=res.body.getReader(), dec=new TextDecoder(), buf='';
      function feed(block){
        block.split('\n').forEach(function(line){
          if(line.indexOf('data:')!==0) return;
          var d=line.slice(5).trim(); if(!d||d==='[DONE]') return;
          var ev; try{ ev=JSON.parse(d); }catch(e){ return; }
          if(ev.error) throw new Error(typeof ev.error==='string'?ev.error:(ev.error.message||'خطأ من الخادم أثناء البث.'));
          if(ev.model&&typeof ev.model==='string') usedModel=ev.model;
          var ch=ev.choices&&ev.choices[0]; if(!ch) return;
          var dl=ch.delta||{}; if(dl.content) out(dl.content);
        });
      }
      function pump(){
        return rd.read().then(function(r){
          if(r.done){ if(buf.trim()) feed(buf); return; }
          buf+=dec.decode(r.value,{stream:true}).replace(/\r\n/g,'\n');
          var i; while((i=buf.indexOf('\n\n'))>=0){ var blk=buf.slice(0,i); buf=buf.slice(i+2); feed(blk); }
          return pump();
        });
      }
      return pump();
    });
  }
  function nextModel(){
    for(var i=0;i<OPEN_ALT.length;i++){ if(!tried[OPEN_ALT[i]]) return OPEN_ALT[i]; }
    return null;
  }
  function run1(model){
    return attempt(model).catch(function(e){
      var free=model===OPEN_DEFAULT||/:free$/.test(model);
      var nm=nextModel();
      // عطل مؤقت (حدّ أو انشغال) في مجاني: نجرّب نموذجاً مجانياً آخر تلقائياً حتى مرتين
      if(e&&e.name!=='AbortError'&&e.retryable&&free&&tries<3&&nm&&!acc&&!me.ac.signal.aborted){
        els.status.textContent='النموذج مشغول — أجرّب نموذجاً مجانياً آخر…';
        return run1(nm);
      }
      throw e;
    });
  }
  run1(openModel()).catch(function(e){
    if(e&&e.name==='AbortError'){ els.status.textContent='أُوقف.'; return; }
    els.err.textContent='⚠ '+(e&&e.message?e.message:'تعذّر الاتصال بالدالة.')+
      (/Failed to fetch|NetworkError|Load failed/i.test(String(e&&e.message))?'\nتحقق من الاتصال بالإنترنت ومن نشر الدالة.':'');
  }).then(function(){
    if(raf){ cancelAnimationFrame(raf); paint(); }
    if(run===me){
      els.stop.style.display='none';
      if(acc&&!els.err.textContent) els.status.textContent='النموذج: '+(usedModel||openModel())+' — من معرفته دون بحث ويب';
      else if(!acc&&!els.err.textContent) els.status.textContent='لم يصل ردّ من النموذج — أعد المحاولة أو بدّل النموذج.';
    }
  });
}


/* ---------- Claude وGrok: جواب من معرفة النموذج (بلا بحث ويب) ---------- */
function goChat(me,mode,s,q,c,kind){
  var name=kind==='claude'?'Claude':'Grok';
  if(mode==='book') els.status.textContent='📖 يجيب من '+s.passages.length+' فقرة مسترجعة من الكتاب…'; else els.status.textContent='النموذج '+name+' يجيب من معرفته — لا بحث ويب في هذا المحرك'+(mode==='explain'?'':' (للبحث الحيّ بمصادر اختر 🤖 Gemini)');
  var sys=SYS_O[mode]||SYS_O.explain, subj=subjectText(s,q);
  var acc='', raf=0, usedModel='';
  var emit=function(d){ acc+=d; els.status.textContent=''; if(!raf) raf=requestAnimationFrame(paint); };
  function paint(){ raf=0; renderMd(els.out,acc); }
  var req;
  if(kind==='claude'){
    var key=(lsGet(K_CKEY)||'').trim();
    if(!key){
      els.err.textContent='⚠ لا يوجد مفتاح Claude على هذا الجهاز.\nافتح الصفحة الرئيسية (🏠) ← 💬 محادثة مع Claude ← ⚙ وأدخل مفتاح Anthropic مرة واحدة، ثم ارجع هنا.';
      els.stop.style.display='none'; els.status.textContent=''; return;
    }
    usedModel=(lsGet(K_CMODEL)||'').trim()||'claude-sonnet-5-5';
    req=fetch('https://api.anthropic.com/v1/messages',{method:'POST',signal:me.ac.signal,
      headers:{'content-type':'application/json','x-api-key':key,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},
      body:JSON.stringify({model:usedModel,max_tokens:4096,system:sys,messages:[{role:'user',content:subj}],stream:true})});
  }else{
    var headers={'content-type':'application/json','x-assistant-pass':c.pass}; if(c.key) headers.apikey=c.key;
    var gm=(lsGet(K_GMODEL)||'').trim(); var body={provider:'xai',messages:[{role:'system',content:sys},{role:'user',content:subj}],max_tokens:4096};
    if(/^grok-[A-Za-z0-9._-]{1,48}$/.test(gm)) body.model=gm;
    req=fetch(c.url,{method:'POST',headers:headers,signal:me.ac.signal,body:JSON.stringify(body)});
  }
  req.then(function(res){
    if(!res.ok){
      return res.json().catch(function(){ return {}; }).then(function(j){
        var m=''; try{ m=typeof j.error==='string'?j.error:((j.error&&j.error.message)||j.message||''); }catch(e){}
        var base=kind==='claude'
          ?(res.status===401?'مفتاح Claude غير صالح أو ملغى — حدّثه من الصفحة الرئيسية ← محادثة ← ⚙.'
            :res.status===429?'تجاوزت حدّ الطلبات — أعد المحاولة بعد قليل.'
            :res.status===402||res.status===400&&/credit|balance/i.test(m)?'رصيد حساب Anthropic لا يكفي.'
            :res.status>=500?'خدمة Anthropic مشغولة — أعد المحاولة.':'رفض الخادم الطلب ('+res.status+').')
          :(res.status===401?'كلمة مرور المساعد غير صحيحة — افتح ⚙ وصحّحها.'
            :res.status===402||res.status===403&&/credit|spending/i.test(m)?'حساب xAI بلا رصيد — Grok مدفوع؛ اشحن الرصيد أو اختر محركاً آخر.'
            :res.status===404?'الدالة غير منشورة بهذا الرابط — راجع ⚙.'
            :res.status===429?'تجاوزت حدّ الطلبات — أعد المحاولة بعد قليل.'
            :res.status>=500?'تعذّر الإتمام من الدالة أو xAI ('+res.status+').':'رفض الخادم الطلب ('+res.status+').');
        throw new Error(base+(m?'\n'+m:''));
      });
    }
    var rd=res.body.getReader(), dec=new TextDecoder(), buf='';
    function feed(block){
      block.split('\n').forEach(function(line){
        if(line.indexOf('data:')!==0) return;
        var d=line.slice(5).trim(); if(!d||d==='[DONE]') return;
        var ev; try{ ev=JSON.parse(d); }catch(e){ return; }
        if(ev.type==='error') throw new Error((ev.error&&ev.error.message)||'خطأ من الخادم أثناء البث.');
        if(ev.error&&kind!=='claude') throw new Error(typeof ev.error==='string'?ev.error:(ev.error.message||'خطأ من الخادم أثناء البث.'));
        if(kind==='claude'){
          if(ev.type==='content_block_delta'&&ev.delta&&ev.delta.type==='text_delta') emit(ev.delta.text);
        }else{
          if(ev.model&&typeof ev.model==='string') usedModel=ev.model;
          var ch=ev.choices&&ev.choices[0]; if(ch&&ch.delta&&ch.delta.content) emit(ch.delta.content);
        }
      });
    }
    function pump(){
      return rd.read().then(function(r){
        if(r.done){ if(buf.trim()) feed(buf); return; }
        buf+=dec.decode(r.value,{stream:true}).replace(/\r\n/g,'\n');
        var i; while((i=buf.indexOf('\n\n'))>=0){ var blk=buf.slice(0,i); buf=buf.slice(i+2); feed(blk); }
        return pump();
      });
    }
    return pump();
  }).catch(function(e){
    if(e&&e.name==='AbortError'){ els.status.textContent='أُوقف.'; return; }
    els.err.textContent='⚠ '+(e&&e.message?e.message:'تعذّر الاتصال.')+
      (/Failed to fetch|NetworkError|Load failed/i.test(String(e&&e.message))?'\nتحقق من الاتصال بالإنترنت'+(kind==='grok'?' ومن نشر الدالة.':'.'):'');
  }).then(function(){
    if(raf){ cancelAnimationFrame(raf); paint(); }
    if(run===me){
      els.stop.style.display='none';
      if(acc&&!els.err.textContent) els.status.textContent='النموذج: '+(usedModel||name)+(mode==='book'?' — من نص الكتاب':' — من معرفته دون بحث ويب');
      else if(!acc&&!els.err.textContent) els.status.textContent='لم يصل ردّ من النموذج — أعد المحاولة أو بدّل المحرك.';
    }
  });
}

/* ---------- رسالة قصيرة ---------- */
var toastEl=null, toastT=null;
function toast(msg){
  if(!toastEl){
    toastEl=mk('div',{translate:'no'});
    toastEl.style.cssText='position:fixed;left:50%;bottom:80px;transform:translateX(-50%);z-index:10000;background:#222;color:#fff;'+
      'padding:10px 14px;border-radius:8px;font:14px sans-serif;max-width:90vw;text-align:center;display:none;direction:rtl';
    document.body.appendChild(toastEl);
  }
  toastEl.textContent=msg; toastEl.style.display='block';
  clearTimeout(toastT); toastT=setTimeout(function(){ toastEl.style.display='none'; },3200);
}

/* ---------- اللوحة العلوية: دمج + زر الرئيسية + أزرار الذكاء ---------- */
function installBar(){
  var wrap=$('sticky-tb-wrap'), tb1=$('tb1'), tb2=$('tb2');
  if(!wrap||!tb1) return false;
  // نسخة قارئ محفوظة قد تحمل عناصر حقنتها نسخة سابقة (بلا مستمعين): نحذفها ونبنيها من جديد
  Array.prototype.forEach.call(document.querySelectorAll('#sticky-tb-wrap [data-rai], #tb-ai'),function(el){
    if(el.parentNode) el.parentNode.removeChild(el);
  });
  // منع إلغاء التحديد عند لمس الأزرار (سطح المكتب) — على الجوال نعتمد على اللقطة المحفوظة
  function noBlur(e){ e.preventDefault(); }
  function b(txt,title,fn,extra){
    var x=mk('button',{type:'button',class:'tbtn ai-b',text:txt,title:title,'data-rai':'1',translate:'no',onclick:fn});
    x.addEventListener('mousedown',noBlur); return x;
  }

  // ١) دمج أزرار الصف الثاني في الصف الأول: حاوية واحدة تتمدّد أزرارها فتملأ كل سطر
  if(!tb1.classList.contains('tb-merged')){
    if(tb2){
      while(tb2.firstChild) tb1.appendChild(tb2.firstChild); // تبقى المعرّفات والمستمعون كما هي
    }
    tb1.classList.add('tb-merged');
  }

  // ٢) زر الرجوع إلى لوحة التحكم الرئيسية (بعد زر ☰ مباشرة)
  var home=mk('button',{type:'button',class:'tbtn',id:'tb-home','data-rai':'1',translate:'no',
    title:'العودة إلى لوحة التحكم الرئيسية (القراء العشرة)',text:'🏠 الرئيسية',
    onclick:function(){ try{ if(window.ReaderCloud&&ReaderCloud.schedulePush) ReaderCloud.schedulePush(); }catch(e){} location.href=HOME_URL; }});
  var first=null;
  for(var n=tb1.firstChild;n;n=n.nextSibling){ if(n.nodeType===1){ first=n; break; } }
  if(first&&first.nextSibling) tb1.insertBefore(home,first.nextSibling); else tb1.appendChild(home);
  // ٣) أزرار الذكاء في نفس الحاوية (آخرها): اختيار المحرك ثم شرح/بحث/بحث عميق/إعدادات
  tb1.appendChild(provSelect('ai-sel'));
  tb1.appendChild(b('📤 مشاركة','مشاركة النص المحدد مع مرجعه (الكتاب والفقرة) وسؤال إضافي اختياري عبر أي تطبيق أو نموذج على جهازك',function(){ shareSelection(); }));
  tb1.appendChild(b('⚙','إعدادات شريط الذكاء (رابط الدالة وكلمة المرور والنماذج)',function(){ openSettings(); }));
  tb1.appendChild(b('📖 من الكتاب','اسأل الكتاب بالعربية: يُترجم سؤالك إلى لغة النصوص ويُبحث في الكتاب أو في كل كتب القارئ، ثم تجيب هنا أو تشارك الطلب لتطبيق خارجي',function(){ start('book'); }));
  tb1.appendChild(b('💡 شرح','يشرح النص المحدد',function(){ start('explain'); }));
  tb1.appendChild(b('🔎 بحث','بحث بالنص المحدد (Gemini: على الويب مع مصادر — المجاني: من معرفة النموذج)',function(){ start('search'); }));
  tb1.appendChild(b('🔬 بحث عميق','Gemini: تخطيط وعدة عمليات بحث ثم تقرير بمصادر (نحو دقيقة) — المجاني: تقرير من معرفة النموذج',function(){ start('deep'); }));
  syncProv();
  return true;
}

/* ---------- تصدير نتائج البحث إلى ملف Markdown (العالمي / الموضوعي / ابحث هنا) ---------- */
// رقم الفقرة يُحسب من الإزاحة في نص الكتاب الخام بدوال الترقيم نفسها التي يرسم بها القارئ شارات الفقرات
var SX_CAP=2000, sxOv=null, sxEls={}, sxData=null, sxBase='', lastGlobalQ=null, sxOffCache={};
// عناوين الأقسام في نص الكتاب (==== العنوان ====) لا تدخل المقتطفات كما هي: نحوّلها إلى ⟨العنوان⟩
function sxFlat(s){ return String(s==null?'':s).replace(/={3,}\s*([^=\n]*?)\s*={3,}/g,' ⟨$1⟩ ').replace(/\s+/g,' ').replace(/\*/g,'\\*'); }
// القارئ يرقّم الفقرات: في كتب الأقسام (====) على النص الخام، وفي غيرها على «النص المعروض» أي بعد حذف علامات الصفحات
// (inline أو isolated). لذلك نحوّل موضع النتيجة من الخام إلى المعروض قبل البحث عن فقرته.
function sxPlan(book){
  var key=book.id+':'+(book.content||'').length;
  if(sxOffCache[key]) return sxOffCache[key];
  var c=book.content||'', plan={offs:[],items:null};
  try{
    var sections=extractSections(c);
    if(sections.length){
      var lines=c.split('\n'), starts=paragraphStartLines(lines,sections), lineOff=new Array(lines.length+1), o=0, i;
      for(i=0;i<lines.length;i++){ lineOff[i]=o; o+=lines[i].length+1; }
      plan.offs=starts.map(function(li){ return lineOff[li]; });
    }else{
      var pm=getPageMap(book), disp=c;
      if(pm&&(pm.mode==='inline'||pm.mode==='isolated')){
        plan.items=(pm.mode==='inline'?detectInlinePageMarkers(c):detectIsolatedPageMarkers(c)).slice().sort(function(a,b){ return a.start-b.start; });
        disp=pm.displayContent;
      }
      plan.offs=splitParagraphOffsets(disp);
    }
  }catch(e){ plan={offs:[],items:null}; }
  sxOffCache[key]=plan; return plan;
}
function sxToDisplayPos(items,pos){
  var removed=0;
  for(var i=0;i<items.length;i++){
    var it=items[i];
    if(it.end<=pos) removed+=it.end-it.start;
    else{ if(it.start<pos) return it.start-removed; break; }   // داخل علامة صفحة محذوفة: نقف عند بدايتها
  }
  return pos-removed;
}
function sxPid(book,pos){
  var plan=sxPlan(book), offs=plan.offs;
  if(plan.items) pos=sxToDisplayPos(plan.items,pos);
  if(!offs.length||pos<offs[0]) return null;
  var lo=0, hi=offs.length-1;
  while(lo<hi){ var mid=(lo+hi+1)>>1; if(offs[mid]<=pos) lo=mid; else hi=mid-1; }
  return lo+1;
}
function sxPage(book,pos){ try{ return getPageForOffset(book,pos); }catch(e){ return null; } }
function sxHtmlToMd(html){
  // نحوّل <mark> إلى علامات مؤقتة، نفكّ الكيانات ونهرّب النجوم الأصلية، ثم نحوّل العلامات إلى ** (بلا فراغات داخلها)
  return String(html||'').replace(/<mark>([\s\S]*?)<\/mark>/g,function(_,m){ m=m.trim(); return m?'\u0001'+m+'\u0002':''; })
    .replace(/<[^>]+>/g,'').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#0?39;/g,"'").replace(/&amp;/g,'&')
    .replace(/={3,}\s*([^=\n]*?)\s*={3,}/g,' ⟨$1⟩ ').replace(/\s+/g,' ').replace(/\*/g,'\\*').replace(/\u0001/g,'**').replace(/\u0002/g,'**').trim();
}
function sxRecord(book,h,pad){
  var pos=(typeof h.pos==='number')?h.pos:null, text;
  if(h.isTwoWord||pos===null||!(h.len>0)){
    text=typeof renderHitSnippetHtml==='function'?sxHtmlToMd(renderHitSnippetHtml(h)):'…'+sxFlat(h.snip)+'…';
  }else{
    var c=book.content||'', s=Math.max(0,pos-pad), e=Math.min(c.length,pos+h.len+pad);
    var m=sxFlat(c.slice(pos,pos+h.len)).trim();
    text='…'+sxFlat(c.slice(s,pos))+(m?'**'+m+'**':'')+sxFlat(c.slice(pos+h.len,e))+'…';
  }
  return { pid:pos===null?null:sxPid(book,pos), page:h.page!=null?h.page:(pos===null?null:sxPage(book,pos)), text:text };
}
function sxMarkdown(d,pad){
  var L=['# نتائج بحث: «'+sxFlat(d.q)+(d.q2?' + '+sxFlat(d.q2):'')+'»','',
    '- القارئ: '+(document.title||'القراء العشرة'),'- نوع البحث: '+d.label];
  if(d.opts.length) L.push('- الخيارات: '+d.opts.join(' · '));
  L.push('- العدد: '+d.total+(d.q2?' صفحة':' نتيجة')+' في '+d.groups.length+' كتاب','- تاريخ التصدير: '+new Date().toISOString().slice(0,10));
  if(d.note) L.push('- ملاحظة: '+d.note);
  L.push('','> «فقرة N» رقمها كما يظهر في القارئ، و«ص» رقم الصفحة، والكلمة المطابقة بخط عريض. المقتطفات من نص الكتاب كما هو (قد يحوي أخطاء مسح ضوئي).');
  d.groups.forEach(function(g){
    L.push('','## '+sxFlat(g.book.title)+' ('+g.hits.length+(g.truncated?'+':'')+')','');
    g.hits.forEach(function(h,i){
      var r=sxRecord(g.book,h,pad);
      L.push((i+1)+'. **'+(r.pid!=null?'فقرة '+r.pid:'بلا رقم فقرة')+(r.page!=null?' · ص '+r.page:'')+'** — '+r.text);
    });
  });
  return L.join('\n');
}
function sxGlobal(){
  if(typeof spGlobalHits==='undefined'||!spGlobalHits||!spGlobalHits.length) return {error:'لا نتائج للتصدير. ابدأ بحثاً أولاً.'};
  var q=(lastGlobalQ&&lastGlobalQ.q)||($('sp-inp')?$('sp-inp').value.trim():''), q2=(lastGlobalQ&&lastGlobalQ.q2)||'';
  var map={}, order=[], tb=(typeof spTruncBooks!=='undefined'&&spTruncBooks)||[];
  spGlobalHits.forEach(function(h){
    var b=getBookById(h.bookId); if(!b) return;
    if(!map[h.bookId]){ map[h.bookId]={book:b,hits:[],truncated:tb.indexOf(b.title)>=0}; order.push(map[h.bookId]); }
    map[h.bookId].hits.push(h);
  });
  var opts=[]; if(typeof spFuzzyRun!=='undefined'&&spFuzzyRun) opts.push('بحث ضبابي'); if(q2) opts.push('كلمتان معاً في الصفحة (AND)');
  return { label:'البحث العالمي', q:q, q2:q2, opts:opts, groups:order, total:spGlobalHits.length,
    note:(typeof spTruncated!=='undefined'&&spTruncated)?'اقتُطعت نتائج بعض الكتب عند السقف ('+sxCapBook()+' للكتاب) فقد توجد نتائج أخرى.':'' };
}
function sxCapBook(){ return typeof SP_MAX_HITS_PER_BOOK!=='undefined'?SP_MAX_HITS_PER_BOOK:200; }
function sxTheme(){
  var t=window.__lastThemeSearch;
  if(!t||!t.byBook||!t.byBook.length) return {error:'لا نتائج للتصدير. ابدأ بحثاً موضوعياً أولاً.'};
  var opts=[]; if(t.fuzzy) opts.push('بحث ضبابي'); if(t.rootMode) opts.push('بالجذر (وصيغه المشتقة)'); if(t.q2) opts.push('كلمتان معاً في الصفحة (AND)');
  var total=0, anyTr=false;
  var groups=t.byBook.map(function(x){ total+=x.hits.length; if(x.truncated) anyTr=true; return {book:x.book,hits:x.hits,truncated:!!x.truncated}; });
  return { label:'البحث الموضوعي', q:t.q, q2:t.q2||'', opts:opts, groups:groups, total:total,
    note:anyTr?'اقتُطعت نتائج بعض الكتب عند السقف ('+sxCapBook()+' للكتاب) فقد توجد نتائج أخرى.':'' };
}
function sxFind(){
  var inp=$('find-inp'), q=inp?inp.value.trim():'';
  if(!q) return {error:'اكتب كلمة في «ابحث هنا» أولاً.'};
  if(typeof cur==='undefined'||cur<0||!library[cur]) return {error:'افتح كتاباً أولاً.'};
  var book=library[cur], fuzzy=fuzzyEnabled('find-fuzzy'), ms;
  try{ fuzzyCapHit=false; }catch(e){}
  try{ ms=matchesInCleanText(book.content||'',q,{fuzzy:fuzzy}); }catch(e){ return {error:'تعذّر تجهيز النتائج: '+(e&&e.message||e)}; }
  if(!ms.length) return {error:'لا نتائج لهذه الكلمة في الكتاب المفتوح.'};
  var capped=ms.length>SX_CAP||(fuzzy&&typeof fuzzyCapHit!=='undefined'&&fuzzyCapHit);
  var hits=ms.slice(0,SX_CAP).map(function(m){ return {bookId:book.id,pos:m.pos,len:m.len}; });
  return { label:'ابحث هنا (داخل كتاب واحد)', q:q, q2:'', opts:fuzzy?['بحث ضبابي']:[], groups:[{book:book,hits:hits,truncated:capped}], total:hits.length,
    note:capped?'اقتُصر الملف على أول '+SX_CAP+' نتيجة (أو بلغ البحث الضبابي سقفه) فقد توجد نتائج أخرى.':'' };
}
function sxSlug(s){ return String(s||'').replace(/[^\p{L}\p{N}]+/gu,'-').replace(/^-+|-+$/g,'').slice(0,30)||'بحث'; }
function sxFull(){
  var qv=sxEls.q?sxEls.q.value.trim():'';
  return sxBase+(qv?'\n\n## سؤالي\n'+qv+'\n':'\n');
}
function sxRefresh(){
  if(!sxData) return;
  var pad=parseInt(sxEls.pad.value,10)||150;
  sxBase=sxMarkdown(sxData,pad);
  var kb=Math.max(1,Math.round(new Blob([sxBase]).size/1024));
  sxEls.info.textContent=sxData.label+' · «'+sxData.q+(sxData.q2?' + '+sxData.q2:'')+'» — '+sxData.total+(sxData.q2?' صفحة':' نتيجة')+' في '+sxData.groups.length+' كتاب · نحو '+kb+' ك.ب'+(sxData.note?' · '+sxData.note:'');
  sxEls.prev.value=sxBase.length>4000?sxBase.slice(0,4000)+'\n\n… (المعاينة مقتطعة؛ الملف الكامل أطول)':sxBase;
}
function sxFilename(){ return 'readers-search-'+sxSlug(sxData.q)+'-'+new Date().toISOString().slice(0,10)+'.md'; }
function sxDownload(){
  var a=mk('a',{href:URL.createObjectURL(new Blob(['﻿'+sxFull()],{type:'text/markdown;charset=utf-8'})),download:sxFilename()});
  document.body.appendChild(a); a.click();
  setTimeout(function(){ try{ URL.revokeObjectURL(a.href); }catch(e){} a.remove(); },1500);
  toast('⬇ نُزّل الملف: '+sxFilename());
}
function sxShare(){
  var text=sxFull(), name=sxFilename(), title='نتائج بحث من القراء العشرة';
  try{
    var f=new File([text],name,{type:'text/markdown'});
    if(navigator.canShare&&navigator.canShare({files:[f]})){
      navigator.share({files:[f],title:title}).catch(function(e){ if(e&&e.name!=='AbortError') doShare(title,text); });
      return;
    }
  }catch(e){}
  doShare(title,text); // الجهاز لا يشارك ملفات: نشارك النص نفسه (أو ننسخه إن لم تتوفر المشاركة)
}
function buildSx(){
  if(sxOv) return;
  injectCss();
  sxEls.info=mk('div',{id:'rai-ex-info'});
  sxEls.pad=mk('select',{id:'rai-ex-pad',onchange:sxRefresh},[['60','قصير (نحو 60 حرفاً حول الكلمة)'],['150','متوسط (نحو 150 حرفاً)'],['300','طويل (نحو 300 حرف)']].map(function(o){
    var op=mk('option',{value:o[0],text:o[1]}); if(o[0]==='150') op.selected=true; return op; }));
  sxEls.q=mk('input',{id:'rai-ex-q',type:'text',placeholder:'اكتب سؤالك هنا (اختياري)…',autocomplete:'off',enterkeyhint:'done'});
  sxEls.prev=mk('textarea',{id:'rai-ex-prev',readonly:'readonly','aria-label':'معاينة الملف'});
  var row=mk('div',{class:'row'},[
    mk('button',{type:'button',class:'tbtn',text:'⬇ تنزيل',onclick:sxDownload}),
    mk('button',{type:'button',class:'tbtn',text:'📤 مشاركة',onclick:sxShare}),
    mk('button',{type:'button',class:'tbtn',text:'📋 نسخ',onclick:function(){ copyText(sxFull()); toast('✓ نُسخ النص (Markdown)'); }}),
    mk('button',{type:'button',class:'tbtn',text:'إلغاء',onclick:function(){ sxOv.classList.remove('show'); }})
  ]);
  var box=mk('div',{class:'box'},[
    mk('div',{text:'📄 تصدير نتائج البحث (Markdown)',style:'font-weight:700;font-size:15px'}),
    sxEls.info,
    mk('label',{text:'طول السياق حول كل نتيجة'}),sxEls.pad,
    mk('label',{text:'سؤال إضافي (اختياري) — يُلحَق بنهاية الملف'}),sxEls.q,
    sxEls.prev,row
  ]);
  sxOv=mk('div',{id:'rai-ex',translate:'no',dir:'rtl',role:'dialog','aria-modal':'true',onclick:function(e){ if(e.target===sxOv) sxOv.classList.remove('show'); }},[box]);
  document.body.appendChild(sxOv);
}
function openSx(kind){
  var d=kind==='theme'?sxTheme():kind==='find'?sxFind():sxGlobal();
  if(d.error){ toast(d.error); return; }
  buildSx(); sxData=d; sxEls.q.value=''; sxRefresh(); sxOv.classList.add('show');
}
function sxButton(kind){
  return mk('button',{type:'button',class:'tbtn','data-rai-sx':kind,translate:'no',style:'width:100%;margin:0 0 8px;padding:9px',
    text:'📄 تصدير النتائج (Markdown)',onclick:function(){ openSx(kind); }});
}
function sxWrap(name,before,after){
  var f=window[name];
  if(typeof f!=='function') return false;
  if(f.__sx) return true;
  var g=function(){
    if(before){ try{ before(); }catch(e){} }
    var r=f.apply(this,arguments);
    try{ after(); }catch(e){}
    return r;
  };
  g.__sx=1; window[name]=g; return true;
}
function sxPlace(resId,kind){
  var res=$(resId); if(!res) return;
  Array.prototype.forEach.call(res.querySelectorAll('[data-rai-sx]'),function(x){ x.remove(); });
  res.insertBefore(sxButton(kind),res.firstChild);
}
function installSearchExport(){
  var okSP=sxWrap('doSP',function(){ lastGlobalQ={q:$('sp-inp').value.trim(),q2:($('sp-inp2')?$('sp-inp2').value.trim():'')}; },function(){});
  var okR=sxWrap('renderSP',null,function(){ if(typeof spGlobalHits!=='undefined'&&spGlobalHits&&spGlobalHits.length) sxPlace('sp-res','global'); });
  var okT=sxWrap('doThemeSearch',null,function(){
    var t=window.__lastThemeSearch, res=$('theme-res');
    if(t&&t.byBook&&t.byBook.length&&res&&res.firstChild) sxPlace('theme-res','theme');
  });
  var fb=$('find-bar');
  if(fb&&!fb.querySelector('[data-rai-sx]')){
    var b=mk('button',{type:'button',class:'tbtn','data-rai-sx':'find',translate:'no',title:'تصدير نتائج هذا البحث (Markdown) للمشاركة والدراسة',text:'📄',onclick:function(){ openSx('find'); }});
    var ai=fb.querySelector('[onclick*="renderFindHereAIBox"]');
    if(ai&&ai.parentNode) ai.parentNode.insertBefore(b,ai.nextSibling); else fb.appendChild(b);
  }
  return okSP&&okR&&okT&&!!fb;
}

function init(){
  // نسخة قارئ محفوظة قد تحمل نافذة/أنماط نسخة سابقة بلا مستمعين: نحذفها فتُبنى من جديد
  Array.prototype.forEach.call(document.querySelectorAll('#rai-ov, #rai-set, #rai-sh, #rai-ex, #rai-bq, #rai-style'),function(el){ if(el.parentNode) el.parentNode.removeChild(el); });
  injectCss();
  if(!installSearchExport()){
    var sn=0, st=setInterval(function(){ if(installSearchExport()||++sn>40) clearInterval(st); },250);
  }
  if(!installBar()){
    // القارئ يبني الشريط عند التحميل؛ نعيد المحاولة قليلاً
    var n=0, t=setInterval(function(){ if(installBar()||++n>40) clearInterval(t); },250);
  }
}
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init); else init();

window.ReaderAI={ run:start, openSettings:openSettings, setProvider:setProv, provider:getProv };
})();
