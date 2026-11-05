/* ============================================================
   شريط الذكاء للقوارئ العشر — وحدة مشتركة (ملف واحد لكل القوارئ)
   ------------------------------------------------------------
   يضيف شريط أدوات مستقلاً بثلاثة أزرار تعمل على النص المحدد:
     💡 شرح          يشرح النص (معنى، مفردات، أعلام وسياق، التباسات)
     🔎 بحث          بحث على الويب مع المصادر
     🔬 بحث عميق    تخطيط ← عدة عمليات بحث متوازية ← تقرير بمصادر مرقّمة
   كلها تمرّ عبر دالة Supabase (research-assistant)، فمفتاح Gemini يبقى
   سراً في الدالة ولا يظهر هنا ولا في GitHub.
   الإعدادات (رابط الدالة وكلمة المرور) تُشارَك مع صفحة المحادثة الرئيسية
   لأن الصفحتين على الأصل نفسه، فتُدخَل مرة واحدة فقط.
   ============================================================ */
(function(){
'use strict';

var K_URL='readers_grok_url', K_PASS='readers_grok_pass', K_MODEL='readers_gemini_model';
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
'#tb-ai{gap:5px;padding:5px 9px}',
'#tb-ai .tbtn{padding:6px 9px;font-size:13px;min-height:34px;touch-action:manipulation}',
'#tb-ai .ai-lab{font-size:12px;color:var(--text2);font-family:sans-serif}',
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
'#rai-set .hint{font-size:12px;color:var(--text2,#555);font-family:sans-serif;margin-top:8px;line-height:1.6}'
].join('\n');

var ov, els={}, run=null; // run = {ac, mode, snap}

function buildOverlay(){
  if(ov) return;
  var st=mk('style'); st.textContent=CSS; document.head.appendChild(st);
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
  var ft=mk('div',{id:'rai-ft'},[els.q,fbtn('💡','explain'),fbtn('🔎','search'),fbtn('🔬','deep'),els.copy]);
  var hd=mk('div',{id:'rai-hd'},[els.ttl,els.stop,close]);
  ov=mk('div',{id:'rai-ov',translate:'no',lang:'ar',dir:'rtl',role:'dialog','aria-modal':'true'},[hd,els.bd,ft]);
  document.body.appendChild(ov);
  buildSettings();
}
function closeOv(){ if(run&&run.ac) run.ac.abort(); ov.classList.remove('show'); }
function copyOut(){
  var t=(els.out.innerText||els.out.textContent||'').trim();
  if(els.src.style.display!=='none') t+='\n\nالمصادر:\n'+(els.src.innerText||'');
  function done(m){ els.status.textContent=m; }
  try{ navigator.clipboard.writeText(t).then(function(){ done('✓ نُسخ'); },function(){ fallbackCopy(t); done('✓ نُسخ'); }); }
  catch(e){ fallbackCopy(t); done('✓ نُسخ'); }
}
function fallbackCopy(t){
  var ta=mk('textarea'); ta.value=t; ta.style.cssText='position:fixed;opacity:0;top:0'; document.body.appendChild(ta);
  ta.select(); try{ document.execCommand('copy'); }catch(e){} ta.remove();
}

/* ---------- الإعدادات ---------- */
function buildSettings(){
  var c=cfg();
  els.sUrl=mk('input',{type:'text',autocomplete:'off',spellcheck:'false',placeholder:'https://…supabase.co/functions/v1/research-assistant'});
  els.sPass=mk('input',{type:'password',autocomplete:'off',spellcheck:'false',placeholder:'كلمة مرور المساعد (ASSISTANT_PASSPHRASE)'});
  els.sModel=mk('input',{type:'text',autocomplete:'off',spellcheck:'false',placeholder:'اختياري — مثل gemini-3.8-flash'});
  els.sMsg=mk('div',{class:'hint'});
  var save=mk('button',{type:'button',class:'tbtn',text:'حفظ',onclick:function(){
    var u=els.sUrl.value.trim(), p=els.sPass.value.trim(), m=els.sModel.value.trim();
    if(!/^https:\/\/\S+$/.test(u)){ els.sMsg.textContent='رابط الدالة غير صالح.'; return; }
    if(p.length<16){ els.sMsg.textContent='كلمة المرور أقصر من 16 حرفاً — هي نفسها المضبوطة في أسرار الدالة.'; return; }
    if(m&&!/^gemini-[A-Za-z0-9._-]+$/.test(m)){ els.sMsg.textContent='اسم النموذج يجب أن يبدأ بـ gemini-'; return; }
    lsSet(K_URL,u); lsSet(K_PASS,p); if(m) lsSet(K_MODEL,m);
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
  els.sUrl.value=c.url; els.sPass.value=c.pass; els.sModel.value=lsGet(K_MODEL)||''; els.sMsg.textContent='';
  settingsThen=then||null;
  $('rai-set').classList.add('show');
}

/* ---------- التشغيل ---------- */
var LABEL={ explain:'💡 شرح', search:'🔎 بحث', deep:'🔬 بحث عميق' };
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
  var s=takeSnapshot();
  if(!s){
    if(snap&&ov.classList.contains('show')){ s=snap; }
    else { toast('حدّد نصاً في الكتاب أولاً ثم اضغط الزر.'); return; }
  }
  snap=s;
  var c=cfg();
  if(!c.url||c.pass.length<16){ openSettings(function(){ start2(mode); }); return; }
  start2(mode);
}
// بعد ضبط الإعدادات لا نلتقط التحديد من جديد (قد ضاع) بل نستعمل اللقطة
function start2(mode){ if(snap) go(mode,snap,''); }
function rerun(mode){
  if(!snap) return;
  var q=els.q.value.trim();
  go(mode,snap,q);
}

function go(mode,s,q){
  if(run&&run.ac) run.ac.abort();
  var c=cfg();
  if(!c.url||c.pass.length<16){ openSettings(function(){ go(mode,s,q); }); return; }
  els.ttl.textContent=LABEL[mode]+(s.book?' — '+s.book:'');
  els.quote.textContent=s.text; els.quote.style.display=s.text?'':'none';
  els.status.textContent=mode==='deep'?'جارٍ التحضير…':'جارٍ الاتصال…';
  els.plan.style.display='none'; els.plan.textContent='';
  els.out.textContent=''; els.err.textContent=''; els.src.style.display='none'; els.src.textContent='';
  els.stop.style.display=''; els.bd.scrollTop=0;
  ov.classList.add('show');

  var ac=new AbortController(); var me={ac:ac,mode:mode}; run=me;
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

/* ---------- الشريط ---------- */
function installBar(){
  if($('tb-ai')) return true;
  var wrap=$('sticky-tb-wrap'); if(!wrap) return false;
  // منع إلغاء التحديد عند لمس الأزرار (سطح المكتب) — على الجوال نعتمد على اللقطة المحفوظة
  function noBlur(e){ e.preventDefault(); }
  function b(txt,title,fn){
    var x=mk('button',{type:'button',class:'tbtn',text:txt,title:title,onclick:fn});
    x.addEventListener('mousedown',noBlur); return x;
  }
  var bar=mk('div',{class:'tb',id:'tb-ai',translate:'no'},[
    mk('span',{class:'ai-lab',text:'🤖 ذكاء:'}),
    b('💡 شرح','يشرح النص المحدد',function(){ start('explain'); }),
    b('🔎 بحث','بحث على الويب بالنص المحدد مع المصادر',function(){ start('search'); }),
    b('🔬 بحث عميق','تخطيط وعدة عمليات بحث متوازية ثم تقرير بمصادر مرقّمة (أبطأ: نحو دقيقة)',function(){ start('deep'); }),
    b('⚙','إعدادات شريط الذكاء',function(){ openSettings(); })
  ]);
  var anchor=$('find-bar');
  if(anchor&&anchor.parentNode===wrap) wrap.insertBefore(bar,anchor); else wrap.appendChild(bar);
  return true;
}

function init(){
  if(!installBar()){
    // القارئ يبني الشريط عند التحميل؛ نعيد المحاولة قليلاً
    var n=0, t=setInterval(function(){ if(installBar()||++n>40) clearInterval(t); },250);
  }
}
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init); else init();

window.ReaderAI={ run:start, openSettings:openSettings };
})();
